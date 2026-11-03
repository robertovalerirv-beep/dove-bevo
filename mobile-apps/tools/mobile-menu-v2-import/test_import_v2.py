import copy
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import sqlite3
import unittest
from unittest import mock

import import_v2 as core

ROOT=Path(__file__).resolve().parents[3]
MIGRATION=ROOT/"migrations"/"0011_mobile_menu_v2.sql"
DAY=dt.date.today().isoformat()
VENUE={
    "venue_key":"n2361866569","cell":"srb0b","name":"Kikuya","kind":1,
    "lat":43.76857,"lon":11.26012,"address":"Via dei Benci 43 R","city":"Firenze","country":"IT",
    "identity_kind":"osm_static","identity_url":"https://www.openstreetmap.org/node/2361866569",
    "identity_checked_on":DAY,"identity_fingerprint":None,
    "owner_page_sha256":None,"geo_reference_url":None,
    "geo_reference_sha256":None,"geo_reference_hash_basis":None,
    "static_city_id":61753360,
}
PAGE=b"<html><body>Classic Spritz EUR 7.50</body></html>"
PAGE_SHA=core.legacy.source_digest(PAGE,"html_text_v1")
SOURCE={
    "id":"src-test-1","venue_key":VENUE["venue_key"],"cell":VENUE["cell"],
    "source_url":"https://example.org/menu","source_format":"html_text_v1",
    "source_sha256":PAGE_SHA,"source_text_sha256":PAGE_SHA,
    "source_checked_on":DAY,"use_review_status":"approved",
    "use_review_basis":"Small factual price review on venue-owned menu",
    "use_review_reference":"https://example.org/rights","use_reviewed_on":DAY,
}
OFFER={
    "id":"offer-test-1","venue_key":VENUE["venue_key"],"cell":VENUE["cell"],
    "source_id":SOURCE["id"],"name":"Classic Spritz","category":"spritz",
    "serving_label":None,"serving_ml":None,"amount_minor":750,
    "currency":"EUR","currency_exponent":2,"price_context":"regular",
    "condition_text":None,"evidence_ref":"Owner menu Classic Spritz",
}

def manifest():
    return {
        "schema_version":1,"batch_id":"test-menu-seed-20261102",
        "checked_on":DAY,"data_version":"20261101",
        "venues":[copy.deepcopy(VENUE)],"sources":[copy.deepcopy(SOURCE)],
        "offers":[copy.deepcopy(OFFER)],"fees":[],"fee_coverage":[],
    }

def raw(doc):
    return (json.dumps(doc,ensure_ascii=False,sort_keys=True)+"\n").encode()

class Fake:
    def __init__(self,public=None,post_osm_node_migration=False):
        self.db=sqlite3.connect(":memory:")
        self.db.row_factory=sqlite3.Row
        self.db.execute("PRAGMA foreign_keys=ON")
        schema=MIGRATION.read_text(encoding="utf-8")
        if post_osm_node_migration:
            needle="identity_geo_hash_basis IN ('raw_utf8','html_text_v1')"
            if schema.count(needle)!=1: raise AssertionError("expected v2 registry CHECK")
            schema=schema.replace(needle,"identity_geo_hash_basis IN ('raw_utf8','html_text_v1','osm_node_v1')")
        self.db.executescript(
            "CREATE TABLE venues_hidden(venue_key TEXT);"
            "CREATE TABLE mobile_venues_moderation(venue_key TEXT);"
            "CREATE TABLE reports(venue_key TEXT);"
            "CREATE TABLE prices_current(venue_key TEXT,price_cents INTEGER);"
            "CREATE TABLE price_obs(venue_key TEXT);"
            "CREATE TABLE venues_user(id INTEGER,name TEXT,kind INTEGER,lat REAL,lon REAL,cell TEXT,status TEXT);"
            +schema
        )
        self.public=public or {
            core.SITE+"/api/health":json.dumps({"status":"ok","data_version":"20261101"}).encode(),
            core.SITE+"/data/20261101/v/srb0b.json":
                json.dumps({"v":[["n2361866569","Kikuya",1,43.76857,11.26012,"Via dei Benci 43 R",0]],
                            "c":[[61753360,"Firenze"]]}).encode(),
            "https://example.org/menu":PAGE,
        }
    def fetch(self,url,maximum=None):
        if url not in self.public: raise core.Error("unexpected public URL")
        body=self.public[url]
        if maximum is not None and len(body)>maximum: raise core.Error("oversized response")
        return body
    def attest_binding(self):
        return {"domain":"www.dovebevo.com","worker":"dovebevo-staging",
                "database":core.legacy.DATABASE,"binding":"DB",
                "name":"dovebevo-staging","environment":"production","verified":True}
    def query(self,sql,params):
        return [dict(row) for row in self.db.execute(sql,params).fetchall()]

class ImportTests(unittest.TestCase):
    def test_dry_run_apply_retry_and_legacy_preservation(self):
        doc=manifest();payload=raw(doc);transport=Fake()
        transport.db.execute("INSERT INTO prices_current VALUES (?,?)",(VENUE["venue_key"],900))
        before=transport.db.execute("SELECT * FROM prices_current").fetchall()
        audit=core.execute(payload,transport)
        self.assertTrue(audit["complete"],audit["errors"])
        self.assertEqual([r["outcome"] for r in audit["rows"]],["eligible_at_read"]*2)
        self.assertEqual(audit["customer_presence"][VENUE["venue_key"]]["customer_current"],1)
        self.assertEqual(audit["customer_price_digests"][VENUE["venue_key"]]["count"],1)
        self.assertRegex(audit["customer_price_digests"][VENUE["venue_key"]]["sha256"],r"^[0-9a-f]{64}$")
        self.assertEqual(transport.db.execute("SELECT COUNT(*) FROM mobile_menu_v2_offers").fetchone()[0],0)
        approved=hashlib.sha256(payload).hexdigest()
        done=core.execute(payload,transport,True,approved)
        self.assertTrue(done["complete"],done["errors"])
        self.assertEqual([r["outcome"] for r in done["rows"]],["inserted","inserted"])
        self.assertEqual(transport.db.execute("SELECT * FROM prices_current").fetchall(),before)
        self.assertEqual(done["customer_price_digests"],audit["customer_price_digests"])
        repeated=core.execute(payload,transport,True,approved)
        self.assertTrue(repeated["complete"],repeated["errors"])
        self.assertEqual([r["outcome"] for r in repeated["rows"]],["existing_identical"]*2)

    def test_newer_live_catalogue_uses_current_static_without_old_url(self):
        doc=manifest();payload=raw(doc);transport=Fake()
        old=core.SITE+"/data/20261101/v/srb0b.json"
        current=core.SITE+"/data/20261103/v/srb0b.json"
        transport.public[current]=transport.public.pop(old)
        transport.public[core.SITE+"/api/health"]=json.dumps(
            {"status":"ok","data_version":"20261103"}).encode()
        audit=core.execute(payload,transport)
        self.assertTrue(audit["complete"],audit["errors"])
        self.assertEqual(audit["public_data_version"],"20261103")
        applied=core.execute(payload,transport,True,hashlib.sha256(payload).hexdigest())
        self.assertTrue(applied["complete"],applied["errors"])
        self.assertFalse(applied["legacy_prices_modified"])

    def test_newer_live_catalogue_changed_missing_or_ambiguous_holds(self):
        old=core.SITE+"/data/20261101/v/srb0b.json"
        current=core.SITE+"/data/20261103/v/srb0b.json"
        original=json.loads(Fake().public[old])
        for case in ("missing","renamed","moved","address","city","duplicated"):
            with self.subTest(case=case):
                doc=manifest();transport=Fake()
                payload=raw(doc)
                del transport.public[old]
                changed=copy.deepcopy(original)
                if case=="missing": changed["v"]=[]
                elif case=="renamed": changed["v"][0][1]="Other Bar"
                elif case=="moved": changed["v"][0][3]=43.76858
                elif case=="address": changed["v"][0][5]="Via dei Benci 45 R"
                elif case=="city": changed["c"][0][1]="Pisa"
                elif case=="duplicated": changed["v"].append(copy.deepcopy(changed["v"][0]))
                transport.public[current]=json.dumps(changed).encode()
                transport.public[core.SITE+"/api/health"]=json.dumps(
                    {"status":"ok","data_version":"20261103"}).encode()
                result=core.execute(payload,transport,True,hashlib.sha256(payload).hexdigest())
                self.assertFalse(result["complete"])
                self.assertEqual(result["rows"],[])
                self.assertEqual(transport.db.execute(
                    "SELECT COUNT(*) FROM mobile_menu_v2_offers").fetchone()[0],0)

    def test_older_or_unparseable_catalogue_version_holds(self):
        for value in ("20261031","invalid",None,20261103):
            with self.subTest(value=value):
                transport=Fake();transport.public[core.SITE+"/api/health"]=json.dumps(
                    {"status":"ok","data_version":value}).encode()
                result=core.execute(raw(manifest()),transport)
                self.assertFalse(result["complete"])
                self.assertEqual(result["rows"],[])

    def test_external_identity_requires_new_review_after_version_drift(self):
        doc=manifest();venue=doc["venues"][0]
        venue.update({"venue_key":"n1234567890","cell":core.legacy.geo(51.5,-0.1),
                      "name":"London Test Bar","kind":1,"lat":51.5,"lon":-0.1,
                      "address":None,"city":"London","country":"GB",
                      "identity_kind":"osm_external",
                      "identity_url":"https://www.openstreetmap.org/node/1234567890",
                      "static_city_id":None})
        for kind in ("sources","offers"):
            doc[kind][0]["venue_key"]=venue["venue_key"]
            doc[kind][0]["cell"]=venue["cell"]
        payload=raw(doc);transport=Fake()
        transport.public[core.SITE+"/api/health"]=json.dumps(
            {"status":"ok","data_version":"20261103"}).encode()
        result=core.execute(payload,transport)
        self.assertFalse(result["complete"])
        self.assertEqual(result["errors"][0]["code"],"external venue needs current-version review")

    def test_protected_audit_and_seed_tag_revisions(self):
        workflow=(ROOT/".github"/"workflows"/"mobile-menu-v2-import.yml").read_text(encoding="utf-8")
        start=workflow.index('          audit_revision=""')
        end=workflow.index('          manifest="mobile-apps/data/mobile-menu-v2-seeds/',start)
        parse=workflow[start:end]
        digest="a"*64
        cases={
            f"mobile-menu-v2-audit/{digest}":("audit",digest,"",""),
            f"mobile-menu-v2-audit/{digest}-r2":("audit",digest,"2",""),
            f"mobile-menu-v2-seed/{digest}-123":("seed",digest,"","123"),
            f"mobile-menu-v2-seed/{digest}-r2-123":("seed",digest,"2","123"),
        }
        with tempfile.TemporaryDirectory() as temp:
            script="set -euo pipefail\n"+parse+"printf '%s|%s|%s|%s\n' \"$mode\" \"$manifest_sha\" \"$audit_revision\" \"${audit_run:-}\"\n"
            for tag,expected in cases.items():
                with self.subTest(tag=tag):
                    env=dict(os.environ,GITHUB_REF_NAME=tag,RUNNER_TEMP=temp)
                    run=subprocess.run(["bash","-c",script],env=env,text=True,capture_output=True,check=False)
                    self.assertEqual(run.returncode,0,run.stderr)
                    self.assertEqual(tuple(run.stdout.strip().split("|")),expected)
            for tag in (f"mobile-menu-v2-audit/{digest}-r0",f"mobile-menu-v2-seed/{digest}-r2-0",
                        f"mobile-menu-v2-seed/{digest}-r02-123",f"mobile-menu-v2-audit/{digest}x"):
                with self.subTest(tag=tag):
                    env=dict(os.environ,GITHUB_REF_NAME=tag,RUNNER_TEMP=temp)
                    run=subprocess.run(["bash","-c",script],env=env,text=True,capture_output=True,check=False)
                    self.assertNotEqual(run.returncode,0)

    def test_moderation_and_source_hash_fail_closed(self):
        doc=manifest();payload=raw(doc);transport=Fake()
        transport.db.execute("INSERT INTO venues_hidden VALUES (?)",(VENUE["venue_key"],))
        blocked=core.execute(payload,transport,True,hashlib.sha256(payload).hexdigest())
        self.assertFalse(blocked["complete"])
        self.assertEqual(blocked["errors"][0]["code"],"reported or hidden venue")
        self.assertEqual(transport.db.execute("SELECT COUNT(*) FROM mobile_menu_v2_sources").fetchone()[0],0)
        changed=Fake();changed.public["https://example.org/menu"]=b"<html>changed</html>"
        stale=core.execute(payload,changed)
        self.assertFalse(stale["complete"])
        self.assertEqual(stale["errors"][0]["code"],"source hash mismatch")

    def test_pdf_hash_mismatch_reports_only_bounded_evidence_and_no_writes(self):
        doc=manifest()
        doc["sources"][0]["source_format"]="pdf_text_v1"
        doc["sources"][0]["source_sha256"]="a"*64
        doc["sources"][0]["source_text_sha256"]="b"*64
        payload=raw(doc)
        transport=Fake()
        transport.public["https://example.org/menu"]=b"%PDF-synthetic"
        transport.last_fetch_content_type="application/pdf; charset=binary"
        with mock.patch.object(core,"source_digests",return_value=("a"*64,"c"*64)), \
             mock.patch.object(core.subprocess,"run",return_value=subprocess.CompletedProcess(
                 ["pdftotext","-v"],0,b"",b"pdftotext version 24.02.0\n")):
            receipt=core.execute(payload,transport)
        self.assertFalse(receipt["complete"])
        self.assertEqual(receipt["errors"],[{"phase":"source","code":"source hash mismatch"}])
        self.assertEqual(receipt["rows"],[])
        self.assertEqual(receipt["source_diagnostics"],[{
            "source_id":"src-test-1","bytes":len(b"%PDF-synthetic"),
            "content_type":"application/pdf","raw_sha256":"a"*64,
            "pdf_magic":True,"extractor_version":"24.02.0",
            "text_sha256":"c"*64,"raw_matches_manifest":True,
            "text_matches_manifest":False,
        }])
        self.assertEqual(transport.db.execute(
            "SELECT COUNT(*) FROM mobile_menu_v2_sources").fetchone()[0],0)

    def test_transport_captures_content_type_without_response_body(self):
        class Response:
            headers={"Content-Type":"application/pdf"}
            def __enter__(self): return self
            def __exit__(self,*args): return False
            def read(self,limit): return b"%PDF-small"
        class Opener:
            def open(self,request,timeout): return Response()
        transport=core.legacy.Transport("0"*32,"unused-token")
        transport.opener=Opener()
        self.assertEqual(transport.fetch("https://example.org/menu"),b"%PDF-small")
        self.assertEqual(transport.last_fetch_content_type,"application/pdf")

    def test_manifest_source_use_currency_and_fee_guards(self):
        doc=manifest()
        doc["sources"][0]["use_review_status"]="held"
        with self.assertRaises(core.Error):core.validate(raw(doc))
        doc=manifest();doc["sources"][0]["source_url"]="https://www.leggimenu.it/menu/demo"
        with self.assertRaises(core.Error):core.validate(raw(doc))
        doc=manifest();doc["sources"][0]["source_url"]="https://127.0.0.1/menu"
        with self.assertRaises(core.Error):core.validate(raw(doc))
        doc=manifest();doc["offers"][0]["id"]="unsafe/id"
        with self.assertRaises(core.Error):core.validate(raw(doc))
        doc=manifest();doc["offers"][0]["currency"]="GBP"
        self.assertEqual(core.validate(raw(doc))["offers"][0]["currency"],"GBP")
        doc["offers"][0]["currency"]="EURO"
        with self.assertRaises(core.Error):core.validate(raw(doc))
        doc=manifest()
        doc["fees"]=[{
            "id":"fee-test-1","venue_key":VENUE["venue_key"],"cell":VENUE["cell"],
            "source_id":SOURCE["id"],"label":"Service charge",
            "fee_kind":"percent","basis":"bill","amount_minor":None,
            "currency":None,"currency_exponent":None,"rate_bps":1000,
            "applicability":"unknown","condition_text":None,
            "evidence_ref":"Owner menu states ten percent service",
        }]
        doc["fee_coverage"]=[{"venue_key":VENUE["venue_key"],"cell":VENUE["cell"],
                              "source_id":SOURCE["id"],"status":"documented_partial",
                              "evidence_ref":"Source names service fee"}]
        transport=Fake();payload=raw(doc)
        result=core.execute(payload,transport,True,hashlib.sha256(payload).hexdigest())
        self.assertTrue(result["complete"],result["errors"])
        fee=transport.db.execute("SELECT fee_kind,basis,rate_bps,currency FROM mobile_menu_v2_fees").fetchone()
        self.assertEqual(tuple(fee),("percent","bill",1000,None))
        self.assertEqual(transport.db.execute("SELECT status FROM mobile_menu_v2_fee_coverage").fetchone()[0],
                         "documented_partial")
        doc["fee_coverage"][0]["status"]="explicit_no_fee"
        with self.assertRaises(core.Error):core.validate(raw(doc))

    def test_reviewed_source_retries_only_timeout_and_keeps_hash_guard(self):
        class TimeoutOnce(Fake):
            def __init__(self):
                super().__init__()
                self.source_attempts=0
            def fetch(self,url,maximum=None):
                if url=="https://example.org/menu":
                    self.source_attempts+=1
                    if self.source_attempts==1:
                        raise core.legacy.Error("public source timeout")
                return super().fetch(url,maximum)
        recovered=TimeoutOnce()
        audit=core.execute(raw(manifest()),recovered)
        self.assertTrue(audit["complete"],audit["errors"])
        self.assertEqual(recovered.source_attempts,2)
        self.assertEqual([row["outcome"] for row in audit["rows"]],
                         ["eligible_at_read"]*2)
        self.assertEqual(recovered.db.execute(
            "SELECT COUNT(*) FROM mobile_menu_v2_offers").fetchone()[0],0)

        class AlwaysTimeout(TimeoutOnce):
            def fetch(self,url,maximum=None):
                if url=="https://example.org/menu":
                    self.source_attempts+=1
                    raise core.legacy.Error("public source timeout")
                return Fake.fetch(self,url,maximum)
        stopped=AlwaysTimeout()
        failed=core.execute(raw(manifest()),stopped)
        self.assertFalse(failed["complete"])
        self.assertEqual(failed["errors"],[{"phase":"source","code":"public source timeout"}])
        self.assertEqual(stopped.source_attempts,2)
        self.assertEqual(failed["rows"],[])

        class ChangedAfterTimeout(TimeoutOnce):
            def fetch(self,url,maximum=None):
                if url=="https://example.org/menu" and self.source_attempts:
                    self.source_attempts+=1
                    return b"<html>changed menu</html>"
                return super().fetch(url,maximum)
        changed=ChangedAfterTimeout()
        mismatch=core.execute(raw(manifest()),changed)
        self.assertFalse(mismatch["complete"])
        self.assertEqual(mismatch["errors"][0]["code"],"source hash mismatch")
        self.assertEqual(changed.source_attempts,2)
        self.assertEqual(mismatch["rows"],[])

    def test_transport_timeout_diagnostic_is_bounded(self):
        class TimedOpener:
            def open(self,request,timeout):
                self.timeout=timeout
                raise TimeoutError()
        transport=core.legacy.Transport("0"*32,"unused-token")
        transport.opener=TimedOpener()
        with self.assertRaisesRegex(core.legacy.Error,"^public source timeout$"):
            transport.fetch("https://example.org/menu")
        self.assertEqual(transport.opener.timeout,45)

    def test_private_dns_redirect_and_unexpected_html_fail_closed(self):
        fake=Fake()
        def private_answers(host,port,type=None):
            return [(None,None,None,None,("127.0.0.1",443))]
        with self.assertRaises(core.Error):
            core.public_fetch(fake,"https://example.org/menu",core.MAX_SOURCE,"html",private_answers)
        fake.public["https://example.org/menu"]=b'{"price":"7.50"}'
        with self.assertRaises(core.Error):
            core.public_fetch(fake,"https://example.org/menu",core.MAX_SOURCE,"html")
        self.assertIsNone(core.legacy.NoRedirect().redirect_request(
            None,None,302,"Found",{},"https://127.0.0.1/private"))

    def test_conflicting_existing_offer_is_not_replaced(self):
        doc=manifest();payload=raw(doc);transport=Fake()
        self.assertTrue(core.execute(payload,transport,True,hashlib.sha256(payload).hexdigest())["complete"])
        transport.db.execute("UPDATE mobile_menu_v2_offers SET amount_minor=999 WHERE id='offer-test-1'")
        conflict=core.execute(payload,transport,True,hashlib.sha256(payload).hexdigest())
        self.assertFalse(conflict["complete"])
        self.assertEqual(conflict["errors"][0]["code"],"conflicting existing v2 row")
        self.assertEqual(transport.db.execute("SELECT amount_minor FROM mobile_menu_v2_offers").fetchone()[0],999)

    def test_osm_node_v1_ignores_generator_and_xml_order_but_not_semantic_changes(self):
        base=(b'<osm version="0.6" generator="host-a"><node id="5263850434" version="3" '
              b'lat="40.8395536" lon="14.2515693"><tag k="name" v="Dambo Beef And Grill"/>'
              b'<tag k="addr:street" v="Piazza Municipio"/></node></osm>')
        equivalent=(b'<osm generator="host-b" version="0.6"><node lon="14.25156930" '
                    b'lat="40.83955360" version="3" id="5263850434">'
                    b'<tag v="Piazza Municipio" k="addr:street"/>'
                    b'<tag v="Dambo Beef And Grill" k="name"/></node></osm>')
        first=core.osm_node_v1(base)[0]
        self.assertEqual(first,core.osm_node_v1(equivalent)[0])
        for changed in (base.replace(b'40.8395536',b'40.8395537'),
                        base.replace(b'version="3"',b'version="4"'),
                        base.replace(b'Dambo Beef And Grill',b'Other Venue')):
            self.assertNotEqual(first,core.osm_node_v1(changed)[0])
        with self.assertRaises(core.Error):
            core.osm_node_v1(base.replace(b'</node>',b'<tag k="name" v="Other"/></node>'))
        with self.assertRaises(core.Error):
            core.osm_node_v1(base.replace(b'lat="40.8395536"',b'lat="1e-1000000000"'))
        with self.assertRaises(core.Error):
            core.osm_node_v1(b'<!DOCTYPE osm><osm><node id="1" version="1" lat="1" lon="1"/></osm>')

    def test_owner_key_and_nearby_duplicate_hold(self):
        owner_url="https://example.org/locations/perosa/"
        address="Via Perosa 32/A"
        fingerprint=core.owner_fingerprint(owner_url,address)
        key="m"+fingerprint[:24]
        lat,lon=45.0673001,7.6490370
        cell=core.legacy.geo(lat,lon)
        page=b"<html><body>Birrificio La Piazza Perosa, Via Perosa 32/A Torino</body></html>"
        xml=(b'<osm><node id="4734734625" version="1" lat="45.0673001" lon="7.6490370">'
             b'<tag k="addr:street" v="Via Perosa"/>'
             b'<tag k="addr:housenumber" v="32/A"/></node></osm>')
        venue={
            "venue_key":key,"cell":cell,"name":"Birrificio La Piazza Perosa",
            "kind":2,"lat":lat,"lon":lon,"address":address,"city":"Torino",
            "country":"IT","identity_kind":"owner_verified","identity_url":owner_url,
            "identity_checked_on":DAY,"identity_fingerprint":fingerprint,
            "owner_page_sha256":core.legacy.source_digest(page,"html_text_v1"),
            "geo_reference_url":"https://www.openstreetmap.org/node/4734734625",
            "geo_reference_sha256":core.osm_node_v1(xml)[0],
            "geo_reference_hash_basis":"osm_node_v1","static_city_id":None,
        }
        core.validate_venue(venue,DAY)
        public={
            owner_url:page,
            "https://api.openstreetmap.org/api/0.6/node/4734734625":xml,
            core.SITE+"/data/20261101/v/"+cell+".json":json.dumps({"v":[],"c":[]}).encode(),
        }
        core.public_identity(venue,Fake(public),"20261101",{})
        fake=Fake(public,post_osm_node_migration=True)
        fake.db.execute("INSERT INTO venues_user VALUES (?,?,?,?,?,?,?)",
                        (1,"Birrificio La Piazza Perosa",2,lat+0.0001,lon,cell,"approved"))
        with self.assertRaises(core.Error):core.private_owner_duplicate(venue,fake)
        fake.db.execute("DELETE FROM venues_user")
        fake.public[core.SITE+"/api/health"]=json.dumps({"status":"ok","data_version":"20261101"}).encode()
        fake.public["https://example.org/menu"]=PAGE
        doc=manifest()
        doc["venues"]=[venue]
        for table in ("sources","offers"):
            doc[table][0]["venue_key"]=key
            doc[table][0]["cell"]=cell
        payload=raw(doc)
        unready=core.execute(payload,Fake(public),False)
        self.assertFalse(unready["complete"])
        self.assertEqual(unready["errors"][0]["code"],"OSM node hash basis migration absent")
        ready=core.execute(payload,fake,False)
        self.assertTrue(ready["complete"],ready["errors"])
        old_cell=core.SITE+"/data/20261101/v/"+cell+".json"
        new_cell=core.SITE+"/data/20261103/v/"+cell+".json"
        fake.public[new_cell]=fake.public.pop(old_cell)
        fake.public[core.SITE+"/api/health"]=json.dumps(
            {"status":"ok","data_version":"20261103"}).encode()
        current=core.execute(payload,fake,False)
        self.assertTrue(current["complete"],current["errors"])
        self.assertEqual(current["public_data_version"],"20261103")
        applied=core.execute(payload,fake,True,hashlib.sha256(payload).hexdigest())
        self.assertTrue(applied["complete"],applied["errors"])
        registered=fake.db.execute("SELECT venue_key,identity_kind,identity_geo_hash_basis FROM mobile_menu_v2_venues").fetchone()
        self.assertEqual(tuple(registered),(key,"owner_verified","osm_node_v1"))
        self.assertEqual(fake.db.execute("SELECT COUNT(*) FROM mobile_menu_v2_offers").fetchone()[0],1)
        fake.public[new_cell]=json.dumps({"v":[["n9999999999","Nearby",1,lat,lon,"",0]],
                                          "c":[]}).encode()
        blocked=core.execute(payload,fake,False)
        self.assertFalse(blocked["complete"])
        self.assertEqual(blocked["errors"][0]["code"],"possible duplicate static venue")

    def test_owner_address_visible_accepts_only_comma_before_same_civic(self):
        address="Via Alfonso Bonafous 2"
        self.assertTrue(core.owner_address_visible(address,"via alfonso bonafous 2, 10123 torino"))
        self.assertTrue(core.owner_address_visible(address,"via alfonso bonafous, 2, 10123 torino"))
        for wrong in (
            "via alfonso bonafous, 20, 10123 torino",
            "via alfonso bonafous 20, 10123 torino",
            "via alfonso bonafous 2/a, 10123 torino",
            "via alfonso bonafous 2-4, 10123 torino",
            "via alfonso bonafous 2 - 4, 10123 torino",
            "via alfonso bonafous, 2/a, 10123 torino",
            "via alfonso bonafusi, 2, 10123 torino",
            "via alfonso bonafous. 2, 10123 torino",
        ):
            self.assertFalse(core.owner_address_visible(address,wrong),wrong)
        # The m-key and exact OSM address normalization remain unchanged.
        self.assertEqual(core.normalized_address(address),"via alfonso bonafous 2")
        self.assertNotEqual(core.normalized_address(address),core.normalized_address("Via Alfonso Bonafous, 2"))

if __name__=="__main__":
    unittest.main()
