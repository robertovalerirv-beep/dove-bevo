import copy
import datetime as dt
import hashlib
import json
from pathlib import Path
import sqlite3
import unittest

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
    def __init__(self,public=None):
        self.db=sqlite3.connect(":memory:")
        self.db.row_factory=sqlite3.Row
        self.db.execute("PRAGMA foreign_keys=ON")
        self.db.executescript(
            "CREATE TABLE venues_hidden(venue_key TEXT);"
            "CREATE TABLE mobile_venues_moderation(venue_key TEXT);"
            "CREATE TABLE reports(venue_key TEXT);"
            "CREATE TABLE prices_current(venue_key TEXT,price_cents INTEGER);"
            "CREATE TABLE price_obs(venue_key TEXT);"
            "CREATE TABLE venues_user(id INTEGER,name TEXT,kind INTEGER,lat REAL,lon REAL,cell TEXT,status TEXT);"
            +MIGRATION.read_text(encoding="utf-8")
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
        self.assertEqual(transport.db.execute("SELECT COUNT(*) FROM mobile_menu_v2_offers").fetchone()[0],0)
        approved=hashlib.sha256(payload).hexdigest()
        done=core.execute(payload,transport,True,approved)
        self.assertTrue(done["complete"],done["errors"])
        self.assertEqual([r["outcome"] for r in done["rows"]],["inserted","inserted"])
        self.assertEqual(transport.db.execute("SELECT * FROM prices_current").fetchall(),before)
        repeated=core.execute(payload,transport,True,approved)
        self.assertTrue(repeated["complete"],repeated["errors"])
        self.assertEqual([r["outcome"] for r in repeated["rows"]],["existing_identical"]*2)

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

    def test_manifest_source_use_currency_and_fee_guards(self):
        doc=manifest()
        doc["sources"][0]["use_review_status"]="held"
        with self.assertRaises(core.Error):core.validate(raw(doc))
        doc=manifest();doc["sources"][0]["source_url"]="https://www.leggimenu.it/menu/demo"
        with self.assertRaises(core.Error):core.validate(raw(doc))
        doc=manifest();doc["sources"][0]["source_url"]="https://127.0.0.1/menu"
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

    def test_conflicting_existing_offer_is_not_replaced(self):
        doc=manifest();payload=raw(doc);transport=Fake()
        self.assertTrue(core.execute(payload,transport,True,hashlib.sha256(payload).hexdigest())["complete"])
        transport.db.execute("UPDATE mobile_menu_v2_offers SET amount_minor=999 WHERE id='offer-test-1'")
        conflict=core.execute(payload,transport,True,hashlib.sha256(payload).hexdigest())
        self.assertFalse(conflict["complete"])
        self.assertEqual(conflict["errors"][0]["code"],"conflicting existing v2 row")
        self.assertEqual(transport.db.execute("SELECT amount_minor FROM mobile_menu_v2_offers").fetchone()[0],999)

    def test_owner_key_and_nearby_duplicate_hold(self):
        owner_url="https://example.org/locations/perosa/"
        address="Via Perosa 32/A"
        fingerprint=core.owner_fingerprint(owner_url,address)
        key="m"+fingerprint[:24]
        lat,lon=45.0673001,7.6490370
        cell=core.legacy.geo(lat,lon)
        page=b"<html><body>Birrificio La Piazza Perosa, Via Perosa 32/A Torino</body></html>"
        xml=(b'<osm><node id="4734734625" lat="45.0673001" lon="7.6490370">'
             b'<tag k="addr:street" v="Via Perosa"/>'
             b'<tag k="addr:housenumber" v="32/A"/></node></osm>')
        venue={
            "venue_key":key,"cell":cell,"name":"Birrificio La Piazza Perosa",
            "kind":2,"lat":lat,"lon":lon,"address":address,"city":"Torino",
            "country":"IT","identity_kind":"owner_verified","identity_url":owner_url,
            "identity_checked_on":DAY,"identity_fingerprint":fingerprint,
            "owner_page_sha256":core.legacy.source_digest(page,"html_text_v1"),
            "geo_reference_url":"https://www.openstreetmap.org/node/4734734625",
            "geo_reference_sha256":hashlib.sha256(xml).hexdigest(),
            "geo_reference_hash_basis":"raw_utf8","static_city_id":None,
        }
        core.validate_venue(venue,DAY)
        public={
            owner_url:page,
            "https://api.openstreetmap.org/api/0.6/node/4734734625":xml,
            core.SITE+"/data/20261101/v/"+cell+".json":json.dumps({"v":[],"c":[]}).encode(),
        }
        core.public_identity(venue,Fake(public),"20261101",{})
        fake=Fake(public)
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
        applied=core.execute(payload,fake,True,hashlib.sha256(payload).hexdigest())
        self.assertTrue(applied["complete"],applied["errors"])
        registered=fake.db.execute("SELECT venue_key,identity_kind,identity_geo_hash_basis FROM mobile_menu_v2_venues").fetchone()
        self.assertEqual(tuple(registered),(key,"owner_verified","raw_utf8"))
        self.assertEqual(fake.db.execute("SELECT COUNT(*) FROM mobile_menu_v2_offers").fetchone()[0],1)

if __name__=="__main__":
    unittest.main()
