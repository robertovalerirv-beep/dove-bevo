#!/usr/bin/env python3
"""One-off, fail-closed app-menu refresh. Audit is read-only; apply needs its receipt.

Only a single guarded UPDATE changes public visibility. Earlier independent INSERTs
stage an immutable source and five offers with status=review (invisible to users).
Neither a REST multi-statement batch nor a lost HTTP response is treated as atomic.
"""
import argparse
import datetime as dt
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import sys
from urllib.parse import urlencode
import xml.etree.ElementTree as ET

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
IMPORTER = ROOT / "mobile-apps/tools/mobile-menu-v2-import/import_v2.py"
_spec = importlib.util.spec_from_file_location("dovebevo_v2_import", IMPORTER)
core = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(core)
legacy = core.legacy

OFFER_FIELDS = core.FIELDS["offer"]
SOURCE_FIELDS = core.FIELDS["source"]
VENUE = "n3631760159"
CELL = "sr2y5"
SOURCE_URL = "https://www.birrifugiotrastevere.com/menu/"
PRIOR_SHA = "60bf65995177d7d00b098833518a6280b2089041ae9711bde6056979e91d14b7"
PRIOR_ID = "src-birrifugio-trastevere-041684462ee8"
RETIRE_PRODUCTS = {3406,3411,3423,3604,3730,3849,3850}
NEW_FACTS = {
    "birrifugio-roma-20261120-3419":(3419,"MOSQUITO KILLER","beer_draft","PINTA 0,4",600),
    "birrifugio-roma-20261120-3448":(3448,"KING OF FOOLS","beer_draft","CALICE 0,33",600),
    "birrifugio-roma-20261120-3893":(3893,"WODAN","beer_draft","WILLY 0,5",600),
    "birrifugio-roma-20261120-3615-calice":(3615,"PECORINO DOC BIOLOGICO","wine_glass","Calice",600),
    "birrifugio-roma-20261120-3615-bottiglia":(3615,"PECORINO DOC BIOLOGICO",None,"Bottiglia",2000),
}
EXPECTED_BINDING = {"domain":"www.dovebevo.com","worker":"dovebevo-staging",
                    "database":legacy.DATABASE,"binding":"DB","name":"dovebevo-staging",
                    "environment":"production","verified":True}
GUARD_TABLES = (*core.TABLES,"mobile_price_reports","mobile_menu_v2_customer_entries",
                "mobile_menu_v2_customer_reports")
MAX_RECEIPT_AGE = dt.timedelta(hours=24)


class Error(Exception):
    pass


def canonical(value):
    return json.dumps(value,sort_keys=True,separators=(",",":"),ensure_ascii=False)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def exact_row(found,expected,fields):
    return isinstance(found,dict) and all(found.get(k)==expected[k] for k in fields)


def read_plan(raw,repo=ROOT):
    if type(raw) is not bytes or len(raw)>1024*1024: raise Error("invalid refresh size")
    try: plan=legacy.strict_json(raw)
    except legacy.Error as exc: raise Error("invalid refresh JSON") from exc
    if not isinstance(plan,dict) or set(plan)!={"schema_version","kind","review_status",
        "batch_id","checked_on","venue","source","preconditions","retire_offers",
        "new_offers","preservation"} or plan["schema_version"]!=1 or \
        plan["kind"]!="source_only_app_menu_refresh_candidate" or \
        plan["review_status"]!="independent_review_required":
        raise Error("unexpected refresh contract")
    if plan["batch_id"]!="birrifugio-roma-current-menu-refresh-20261120":
        raise Error("unexpected batch")
    core.day(plan["checked_on"])
    if plan["checked_on"]>dt.date.today().isoformat(): raise Error("future source check")
    venue=plan["venue"];src=plan["source"];before=plan["preconditions"]
    if (not isinstance(venue,dict) or venue.get("venue_key")!=VENUE or venue.get("cell")!=CELL
        or venue.get("name")!="Birrifugio" or venue.get("city")!="Roma"
        or venue.get("country")!="IT" or venue.get("identity_url")!=core.osm_identity_url(VENUE)
        or venue.get("osm_version")!=3 or type(venue.get("lat")) not in (int,float)
        or type(venue.get("lon")) not in (int,float)
        or abs(venue["lat"]-41.8775735)>1e-7 or abs(venue["lon"]-12.4660827)>1e-7):
        raise Error("unexpected venue identity")
    if (not isinstance(src,dict) or src.get("venue_key")!=VENUE or src.get("cell")!=CELL
        or src.get("url")!=SOURCE_URL or src.get("format")!="html_text_v1"
        or src.get("checked_on")!=plan["checked_on"] or
        src.get("id")!="src-birrifugio-trastevere-"+str(src.get("normalized_sha256",""))[:12]
        or not isinstance(src.get("normalized_sha256"),str)
        or not core.HEX.fullmatch(src["normalized_sha256"])
        or not isinstance(src.get("captured_raw_sha256"),str)
        or not core.HEX.fullmatch(src["captured_raw_sha256"])
        or src.get("captured_twice_identical") is not True):
        raise Error("unexpected source pin")
    if (not isinstance(before,dict) or before.get("prior_manifest_sha256")!=PRIOR_SHA
        or before.get("prior_source_id")!=PRIOR_ID
        or [before.get(k) for k in ("expected_active_offers","expected_retained_unchanged_offers",
            "expected_removed_offers","expected_new_offers","expected_active_after")]
            !=[266,259,7,5,264]
        or before.get("expected_active_offer_ids_sha256_algorithm")!=
            "SHA-256 of UTF-8 sorted offer IDs joined by LF with a final LF"
        or not isinstance(before.get("expected_active_offer_ids_sha256"),str)
        or not core.HEX.fullmatch(before["expected_active_offer_ids_sha256"])):
        raise Error("unexpected baseline contract")
    old_raw=(repo/"mobile-apps/data/mobile-menu-v2-seeds"/(PRIOR_SHA+".json")).read_bytes()
    if sha(old_raw)!=PRIOR_SHA: raise Error("prior manifest hash mismatch")
    try: old=core.validate(old_raw)
    except core.Error as exc: raise Error("prior manifest invalid") from exc
    old_venues=[x for x in old["venues"] if x["venue_key"]==VENUE]
    old_sources=[x for x in old["sources"] if x["id"]==PRIOR_ID]
    old_offers=[{**{k:x[k] for k in OFFER_FIELDS if k!="status"},"status":"active"}
                for x in old["offers"] if x["venue_key"]==VENUE]
    if (len(old_venues)!=1 or len(old_sources)!=1 or len(old_offers)!=266
        or len({x["id"] for x in old_offers})!=266
        or any(x["source_id"]!=PRIOR_ID or x["cell"]!=CELL for x in old_offers)):
        raise Error("prior seed differs from expected baseline")
    active_ids=sorted(x["id"] for x in old_offers)
    ids_sha=sha(("\n".join(active_ids)+"\n").encode("utf-8"))
    if ids_sha!=before["expected_active_offer_ids_sha256"]:
        raise Error("prior active ID digest mismatch")
    if not isinstance(plan["retire_offers"],list) or len(plan["retire_offers"])!=7 or \
       not isinstance(plan["new_offers"],list) or len(plan["new_offers"])!=5:
        raise Error("unexpected delta size")
    old_by_id={x["id"]:x for x in old_offers}
    retire=[]
    for item in plan["retire_offers"]:
        if not isinstance(item,dict) or item.get("id") not in old_by_id:
            raise Error("unrecognized retirement")
        row=old_by_id[item["id"]]
        if any(item.get(k)!=row[v] for k,v in (("expected_status","status"),
            ("expected_name","name"),("expected_amount_minor","amount_minor"),
            ("expected_currency","currency"),("expected_source_id","source_id"))):
            raise Error("retirement changed")
        # The reviewed product ID must agree with the stable offer ID suffix.
        if str(item.get("owner_product_id"))!=item["id"].rsplit("-",1)[-1]:
            raise Error("retirement product mismatch")
        retire.append(row)
    if len({x["id"] for x in retire})!=7: raise Error("duplicate retirement")
    if {x["owner_product_id"] for x in plan["retire_offers"]}!=RETIRE_PRODUCTS:
        raise Error("retirement set differs from reviewed delta")
    additions=[]
    for item in plan["new_offers"]:
        if not isinstance(item,dict) or any(k not in item for k in OFFER_FIELDS if k!="status"):
            raise Error("invalid new offer")
        row={k:item[k] for k in OFFER_FIELDS if k!="status"}
        row["status"]="review"
        if (row["id"] in old_by_id or row["venue_key"]!=VENUE or row["cell"]!=CELL
            or row["source_id"]!=src["id"] or row["currency"]!="EUR"
            or type(row["amount_minor"]) is not int or row["amount_minor"]<=0
            or row["category"] not in core.CATEGORIES and row["category"] is not None
            or row["price_context"]!="regular" or row["condition_text"] is not None
            or row["currency_exponent"]!=2 or not core.ID.fullmatch(row["id"])):
            raise Error("unreviewed new offer")
        if (row["id"] not in NEW_FACTS or
            (item.get("owner_product_id"),row["name"],row["category"],
             row["serving_label"],row["amount_minor"])!=NEW_FACTS[row["id"]]
            or row["serving_ml"] is not None):
            raise Error("new offer differs from reviewed delta")
        additions.append(row)
    if len({x["id"] for x in additions})!=5 or \
       set(x["id"] for x in additions)&set(active_ids):
        raise Error("duplicate new offer")
    new_source={"id":src["id"],"venue_key":VENUE,"cell":CELL,"source_url":SOURCE_URL,
                "source_text_sha256":src["normalized_sha256"],
                "source_checked_on":src["checked_on"],"use_review_status":"approved",
                "use_review_basis":("Repository-reviewed current owner HTML menu for Birrifugio "
                    "Trastevere; the exact source and OSM identity are rechecked before apply."),
                "use_review_reference":SOURCE_URL,"use_reviewed_on":src["checked_on"]}
    return {"plan":plan,"manifest_sha256":sha(raw),"prior":old,"venue":old_venues[0],
            "prior_source":{k:old_sources[0][k] for k in SOURCE_FIELDS},
            "old_offers":old_offers,"active_ids":active_ids,"active_ids_sha256":ids_sha,
            "retire":retire,"add":additions,"new_source":new_source}


def public_checks(doc,transport):
    health=legacy.strict_json(core.public_fetch(transport,core.SITE+"/api/health",65536))
    if not isinstance(health,dict) or health.get("status")!="ok":
        raise Error("public site unhealthy")
    version=health.get("data_version")
    if not isinstance(version,str) or not re.fullmatch(r"[0-9]{8}",version):
        raise Error("invalid public catalogue version")
    if version<doc["prior"]["data_version"]:
        raise Error("public catalogue predates seed")
    core.public_identity(doc["venue"],transport,version,{})
    xml=core.public_fetch(transport,
        "https://api.openstreetmap.org/api/0.6/node/3631760159",65536,"xml")
    _,ident,lat,lon,tags=core.osm_node_v1(xml)
    node=ET.fromstring(xml)[0]
    if (ident!="3631760159" or node.attrib.get("version")!="3"
        or core.distance_m(lat,lon,doc["plan"]["venue"]["lat"],
                           doc["plan"]["venue"]["lon"])>10
        or tags.get("name")!="Birrifugio" or tags.get("addr:street")!="Via Federico Rosazza"
        or tags.get("addr:housenumber")!="4"):
        raise Error("OSM identity changed")
    raw=core.public_fetch(transport,SOURCE_URL,core.MAX_SOURCE,"html")
    if (sha(raw)!=doc["plan"]["source"]["captured_raw_sha256"] or
        legacy.source_digest(raw,"html_text_v1")!=doc["plan"]["source"]["normalized_sha256"]):
        raise Error("owner menu changed")
    parser=legacy.HTMLTextV1()
    parser.feed(raw.decode("utf-8"));parser.close()
    normalized=re.sub(r"\s+"," "," ".join(parser.parts)).lower()
    if "via federico rosazza 4-6" not in normalized or \
       "trastevere@birrifugio.com" not in normalized:
        raise Error("owner menu contact changed")
    return {"public_data_version":version,"osm_version":3,
            "source_raw_sha256":sha(raw),
            "source_text_sha256":doc["plan"]["source"]["normalized_sha256"]}


def public_readback(doc,transport):
    """Verify the live app endpoint, not just D1, exposes precisely the 264 expected facts."""
    retired={x["id"] for x in doc["retire"]}
    expected={x["id"]:x for x in doc["old_offers"] if x["id"] not in retired}
    expected.update({x["id"]:x for x in doc["add"]})
    if len(expected)!=264: raise Error("invalid expected public set")
    seen={}
    after=None
    for _ in range(3):
        params={"cell":CELL,"limit":"100","minimum_spend":"1"}
        if after is not None: params["after"]=after
        address=(core.SITE+"/api/mobile/v2/menu/venues/"+VENUE+"?"+urlencode(params))
        page=legacy.strict_json(core.public_fetch(transport,address,1024*1024))
        if (not isinstance(page,dict) or page.get("schema_version")!=2
            or page.get("stored_offer_count")!=264 or not isinstance(page.get("venue"),dict)
            or page["venue"].get("key")!=VENUE or page["venue"].get("cell")!=CELL
            or not isinstance(page.get("offers"),list) or len(page["offers"])>100):
            raise Error("invalid public menu page")
        offers=page["offers"]
        if not offers: raise Error("empty public page")
        for item in offers:
            if not isinstance(item,dict) or item.get("id") not in expected:
                raise Error("unexpected public menu offer")
            row=expected[item["id"]]
            source=doc["new_source"] if row["source_id"]==doc["new_source"]["id"] else doc["prior_source"]
            expected_public={"id":row["id"],"name":row["name"],"category":row["category"],
                "serving":{"label":row["serving_label"],"ml":row["serving_ml"]},
                "amount_minor":row["amount_minor"],"currency":row["currency"],
                "currency_exponent":row["currency_exponent"],
                "context":{"kind":row["price_context"],"condition":row["condition_text"]},
                "source":{"id":source["id"],"url":source["source_url"],
                  "text_sha256":source["source_text_sha256"],
                  "checked_on":source["source_checked_on"]}}
            if item!=expected_public or item["id"] in seen:
                raise Error("public menu fact differs from pinned source")
            seen[item["id"]]=True
        following=page.get("next_after")
        if following is None:
            if len(seen)!=264 or set(seen)!=set(expected):
                raise Error("public menu is incomplete")
            return {"public_offer_count":264,
                    "public_offer_ids_sha256":sha(("\n".join(sorted(seen))+"\n").encode())}
        if following!=offers[-1]["id"] or following==after:
            raise Error("invalid public pagination")
        after=following
    raise Error("public menu has unexpected extra page")


def query_one(transport,sql,params):
    try: return core.one(transport,sql,params)
    except core.Error as exc: raise Error(str(exc)) from exc


def query(transport,sql,params):
    try: return transport.query(sql,params)
    except legacy.Error as exc: raise Error("D1 query failed") from exc


def private_state(doc,transport):
    marks=",".join("?" for _ in GUARD_TABLES)
    found=query(transport,
        f"SELECT name FROM sqlite_master WHERE type='table' AND name IN ({marks})",
        list(GUARD_TABLES))
    if {x.get("name") for x in found if isinstance(x,dict)}!=set(GUARD_TABLES):
        raise Error("guard schema absent")
    if transport.attest_binding()!=EXPECTED_BINDING:
        raise Error("production binding mismatch")
    old_source=query(transport,
        "SELECT "+",".join(SOURCE_FIELDS)+" FROM mobile_menu_v2_sources WHERE id=?",
        [PRIOR_ID])
    if len(old_source)!=1 or not exact_row(old_source[0],doc["prior_source"],SOURCE_FIELDS):
        raise Error("old approved source changed")
    source=query(transport,
        "SELECT "+",".join(SOURCE_FIELDS)+" FROM mobile_menu_v2_sources WHERE id=?",
        [doc["new_source"]["id"]])
    if source and (len(source)!=1 or not exact_row(source[0],doc["new_source"],SOURCE_FIELDS)):
        raise Error("new source conflicts")
    guard=query_one(transport,"""SELECT
      (SELECT COUNT(*) FROM venues_hidden WHERE venue_key=?1) AS hidden,
      (SELECT COUNT(*) FROM mobile_venues_moderation WHERE venue_key=?1) AS moderated,
      (SELECT COUNT(*) FROM reports WHERE venue_key=?1) AS reports,
      (SELECT COUNT(*) FROM mobile_price_reports WHERE venue_key=?1) AS mobile_reports,
      (SELECT COUNT(*) FROM mobile_menu_v2_customer_reports r JOIN mobile_menu_v2_customer_entries e
       ON e.id=r.entry_id WHERE e.venue_key=?1) AS customer_reports,
      (SELECT COUNT(*) FROM mobile_menu_v2_customer_entries WHERE venue_key=?1) AS customer_entries,
      (SELECT COUNT(*) FROM prices_current WHERE venue_key=?1) AS legacy_current,
      (SELECT COUNT(*) FROM price_obs WHERE venue_key=?1) AS legacy_history""",[VENUE])
    if any(type(guard.get(k)) is not int or guard[k]<0 for k in guard):
        raise Error("invalid moderation/customer read")
    if any(guard[k] for k in ("hidden","moderated","reports","mobile_reports",
                              "customer_reports")):
        raise Error("venue report or moderation guard")
    target_ids=[x["id"] for x in doc["retire"]+doc["add"]]
    linked=query_one(transport,"SELECT COUNT(*) AS n FROM mobile_menu_v2_customer_entries "
        "WHERE offer_id IN (SELECT value FROM json_each(?))",[canonical(target_ids)])
    if linked.get("n")!=0: raise Error("customer observation references changed offer")
    rows=query(transport,"SELECT "+",".join(OFFER_FIELDS)+
               " FROM mobile_menu_v2_offers WHERE venue_key=? AND cell=? ORDER BY id",
               [VENUE,CELL])
    if any(not isinstance(x,dict) for x in rows): raise Error("invalid offer read")
    by_id={x.get("id"):x for x in rows}
    if len(by_id)!=len(rows): raise Error("duplicate offer ID read")
    old_by_id={x["id"]:x for x in doc["old_offers"]}
    new_by_id={x["id"]:x for x in doc["add"]}
    retired={x["id"] for x in doc["retire"]}
    active_ids=sorted(x["id"] for x in rows if x.get("status")=="active")
    before=active_ids==doc["active_ids"] and all(
        exact_row(by_id.get(i),row,OFFER_FIELDS) for i,row in old_by_id.items()) and all(
        i not in by_id or exact_row(by_id[i],row,OFFER_FIELDS)
        for i,row in new_by_id.items())
    after_ids=sorted((set(doc["active_ids"])-retired)|set(new_by_id))
    after=active_ids==after_ids and all(
        exact_row(by_id.get(i),{**row,"status":"removed"} if i in retired else row,
                  OFFER_FIELDS) for i,row in old_by_id.items()) and all(
        exact_row(by_id.get(i),{**row,"status":"active"},OFFER_FIELDS)
        for i,row in new_by_id.items())
    if not before and not after: raise Error("unrecognized partial or changed offer state")
    if after and not source: raise Error("published offers without pinned source")
    if before and not source and any(i in by_id for i in new_by_id):
        raise Error("staged offers without pinned source")
    return {"state":"pre" if before else "post", "source_staged":bool(source),
            "new_review_count":sum(i in by_id for i in new_by_id) if before else 0,
            "active_count":len(active_ids),
            "active_ids_sha256":sha(("\n".join(active_ids)+"\n").encode()),
            "guards":guard}


def stage_source(doc,transport):
    row=doc["new_source"]
    cols=SOURCE_FIELDS
    sql=("INSERT INTO mobile_menu_v2_sources ("+",".join(cols)+") SELECT "+
         ",".join("?" for _ in cols)+" WHERE EXISTS (SELECT 1 FROM mobile_menu_v2_sources "
         "WHERE id=? AND use_review_status='approved' AND venue_key=? AND cell=?) "
         "AND NOT EXISTS (SELECT 1 FROM venues_hidden WHERE venue_key=?) "
         "AND NOT EXISTS (SELECT 1 FROM mobile_venues_moderation WHERE venue_key=?) "
         "AND NOT EXISTS (SELECT 1 FROM reports WHERE venue_key=?) "
         "AND NOT EXISTS (SELECT 1 FROM mobile_price_reports WHERE venue_key=?) "
         "AND NOT EXISTS (SELECT 1 FROM mobile_menu_v2_sources WHERE id=?) RETURNING id")
    result=query(transport,sql,[row[k] for k in cols]+[PRIOR_ID,VENUE,CELL,
                          VENUE,VENUE,VENUE,VENUE,row["id"]])
    if len(result)>1: raise Error("source insert response invalid")
    found=query(transport,"SELECT "+",".join(cols)+
                " FROM mobile_menu_v2_sources WHERE id=?",[row["id"]])
    if len(found)!=1 or not exact_row(found[0],row,cols):
        raise Error("source staging incomplete")


def stage_offers(doc,transport):
    for row in doc["add"]:
        cols=OFFER_FIELDS
        sql=("INSERT INTO mobile_menu_v2_offers ("+",".join(cols)+") SELECT "+
             ",".join("?" for _ in cols)+" WHERE EXISTS (SELECT 1 FROM mobile_menu_v2_sources "
             "WHERE id=? AND venue_key=? AND cell=? AND use_review_status='approved') "
             "AND NOT EXISTS (SELECT 1 FROM venues_hidden WHERE venue_key=?) "
             "AND NOT EXISTS (SELECT 1 FROM mobile_venues_moderation WHERE venue_key=?) "
             "AND NOT EXISTS (SELECT 1 FROM reports WHERE venue_key=?) "
             "AND NOT EXISTS (SELECT 1 FROM mobile_price_reports WHERE venue_key=?) "
             "AND NOT EXISTS (SELECT 1 FROM mobile_menu_v2_offers WHERE id=?) RETURNING id")
        result=query(transport,sql,[row[k] for k in cols]+[row["source_id"],VENUE,CELL,
                                     VENUE,VENUE,VENUE,VENUE,row["id"]])
        if len(result)>1: raise Error("offer insert response invalid")
        found=query(transport,"SELECT "+",".join(cols)+
                    " FROM mobile_menu_v2_offers WHERE id=?",[row["id"]])
        if len(found)!=1 or not exact_row(found[0],row,cols):
            raise Error("offer staging incomplete")


def final_sql():
    comparisons=" OR ".join(
        f"o.{field} IS NOT json_extract(e.value,'$.{field}')" for field in OFFER_FIELDS)
    baseline_comparisons=" OR ".join(
        f"o.{field} IS NOT json_extract(b.value,'$[{index}]')"
        for index,field in enumerate(OFFER_FIELDS))
    source_comparisons=" OR ".join(
        f"s.{field} IS NOT json_extract(x.value,'$[{index}]')"
        for index,field in enumerate(SOURCE_FIELDS))
    return """WITH expected_ids AS MATERIALIZED (
      SELECT value AS id FROM json_each(?1)
    ), targets AS MATERIALIZED (
      SELECT value FROM json_each(?2)
    ), baseline AS MATERIALIZED (
      SELECT value FROM json_each(?7)
    ), source_snapshots AS MATERIALIZED (
      SELECT value FROM json_each(?8)
    ), guard AS MATERIALIZED (
      SELECT (
        (SELECT COUNT(*) FROM expected_ids)=266
        AND (SELECT COUNT(DISTINCT id) FROM expected_ids)=266
        AND (SELECT COUNT(*) FROM targets)=12
        AND (SELECT COUNT(*) FROM baseline)=266
        AND (SELECT COUNT(DISTINCT json_extract(value,'$[0]')) FROM baseline)=266
        AND (SELECT COUNT(*) FROM source_snapshots)=2
        AND (SELECT COUNT(DISTINCT json_extract(value,'$[0]')) FROM source_snapshots)=2
        AND (SELECT COUNT(*) FROM mobile_menu_v2_offers
             WHERE venue_key=?3 AND cell=?4 AND status='active')=266
        AND NOT EXISTS (SELECT id FROM mobile_menu_v2_offers
          WHERE venue_key=?3 AND cell=?4 AND status='active'
          EXCEPT SELECT id FROM expected_ids)
        AND NOT EXISTS (SELECT id FROM expected_ids EXCEPT SELECT id FROM
          mobile_menu_v2_offers WHERE venue_key=?3 AND cell=?4 AND status='active')
        AND NOT EXISTS (SELECT 1 FROM targets e LEFT JOIN mobile_menu_v2_offers o
          ON o.id=json_extract(e.value,'$.id') WHERE o.id IS NULL OR """+comparisons+""")
        AND NOT EXISTS (SELECT 1 FROM baseline b LEFT JOIN mobile_menu_v2_offers o
          ON o.id=json_extract(b.value,'$[0]') WHERE o.id IS NULL OR """+baseline_comparisons+""")
        AND NOT EXISTS (SELECT 1 FROM source_snapshots x LEFT JOIN mobile_menu_v2_sources s
          ON s.id=json_extract(x.value,'$[0]') WHERE s.id IS NULL OR """+source_comparisons+""")
        AND NOT EXISTS (SELECT 1 FROM venues_hidden WHERE venue_key=?3)
        AND NOT EXISTS (SELECT 1 FROM mobile_venues_moderation WHERE venue_key=?3)
        AND NOT EXISTS (SELECT 1 FROM reports WHERE venue_key=?3)
        AND NOT EXISTS (SELECT 1 FROM mobile_price_reports WHERE venue_key=?3)
        AND NOT EXISTS (SELECT 1 FROM mobile_menu_v2_customer_reports r
          JOIN mobile_menu_v2_customer_entries e ON e.id=r.entry_id
          WHERE e.venue_key=?3)
        AND NOT EXISTS (SELECT 1 FROM mobile_menu_v2_customer_entries
          WHERE offer_id IN (SELECT json_extract(value,'$.id') FROM targets))
        AND (SELECT COUNT(*) FROM mobile_menu_v2_customer_entries
             WHERE venue_key=?3)=?5
      ) AS ok
    )
    UPDATE mobile_menu_v2_offers SET status=CASE
      WHEN id IN (SELECT value FROM json_each(?6)) THEN 'removed' ELSE 'active' END
    WHERE id IN (SELECT json_extract(value,'$.id') FROM targets)
      AND (SELECT ok FROM guard)=1
    RETURNING id,status"""


def final_params(doc,state):
    old={x["id"]:x for x in doc["retire"]}
    targets=[old[x["id"]] for x in doc["retire"]]+doc["add"]
    baseline=[[row[field] for field in OFFER_FIELDS]
              for row in sorted(doc["old_offers"],key=lambda row:row["id"])]
    sources=[[row[field] for field in SOURCE_FIELDS]
             for row in (doc["prior_source"],doc["new_source"])]
    return [canonical(doc["active_ids"]),canonical(targets),VENUE,CELL,
            state["guards"]["customer_entries"],canonical(list(old)),
            canonical(baseline),canonical(sources)]


def validate_audit_receipt(receipt,doc):
    if (not isinstance(receipt,dict) or receipt.get("complete") is not True
        or receipt.get("mode")!="audit" or receipt.get("state")!="pre"
        or receipt.get("manifest_sha256")!=doc["manifest_sha256"]
        or receipt.get("prior_manifest_sha256")!=PRIOR_SHA
        or receipt.get("active_ids_sha256")!=doc["active_ids_sha256"]
        or receipt.get("source_text_sha256")!=doc["new_source"]["source_text_sha256"]
        or receipt.get("binding_attestation")!=EXPECTED_BINDING):
        raise Error("successful exact audit receipt required")
    try: audited=dt.datetime.fromisoformat(receipt["audited_at_utc"])
    except (ValueError,TypeError,KeyError): raise Error("invalid audit time") from None
    now=dt.datetime.now(dt.timezone.utc)
    if audited.tzinfo is None or audited>now or now-audited>MAX_RECEIPT_AGE:
        raise Error("audit receipt expired")


def execute(raw,transport,apply=False,audit_receipt=None,repo=ROOT,verify_post=False):
    if apply and verify_post: raise Error("conflicting modes")
    receipt={"schema_version":1,"mode":"apply" if apply else
             ("verify_post" if verify_post else "audit"),
             "manifest_sha256":sha(raw),"prior_manifest_sha256":PRIOR_SHA,
             "complete":False,"state":None,"phase":"plan","errors":[],
             "audited_at_utc":dt.datetime.now(dt.timezone.utc).isoformat()}
    try:
        doc=read_plan(raw,repo)
        if apply: validate_audit_receipt(audit_receipt,doc)
        if not verify_post:
            receipt["phase"]="public"
            public=public_checks(doc,transport)
            receipt.update(public)
        receipt["phase"]="private"
        state=private_state(doc,transport)
        receipt.update({"state":state["state"],"active_count":state["active_count"],
                        "active_ids_sha256":state["active_ids_sha256"],
                        "customer_counts":{k:state["guards"][k] for k in
                          ("customer_entries","legacy_current","legacy_history")},
                        "binding_attestation":EXPECTED_BINDING,
                        "source_staged":state["source_staged"],
                        "new_review_count":state["new_review_count"]})
        if verify_post:
            if state["state"]!="post" or state["active_count"]!=264:
                raise Error("post state not present")
            receipt["phase"]="public_readback"
            receipt.update(public_readback(doc,transport))
            receipt["complete"]=True
            receipt["phase"]="done"
            return receipt
        if not apply:
            if state["state"]!="pre": raise Error("refresh already published")
            receipt["complete"]=True
            receipt["phase"]="done"
            return receipt
        if state["state"]=="post":
            receipt.update({"state":"post","active_count":264,
                            "active_ids_sha256":state["active_ids_sha256"]})
            receipt["phase"]="public_readback"
            receipt.update(public_readback(doc,transport))
            receipt["complete"]=True
            receipt["phase"]="done"
            receipt["outcome"]="already_published"
            return receipt
        receipt["phase"]="stage_source"
        stage_source(doc,transport)
        receipt["phase"]="stage_offers"
        stage_offers(doc,transport)
        # Recheck public evidence immediately before the sole publication write.
        receipt["phase"]="pre_publish"
        public_checks(doc,transport)
        pre=private_state(doc,transport)
        if pre["state"]!="pre" or pre["new_review_count"]!=5 or not pre["source_staged"]:
            raise Error("staging or baseline changed")
        receipt["phase"]="publish"
        try:
            changed=query(transport,final_sql(),final_params(doc,pre))
        except Error:
            # A transport failure can happen after commit. Never issue another write here.
            changed=None
        receipt["phase"]="readback"
        post=private_state(doc,transport)
        if post["state"]!="post" or post["active_count"]!=264:
            raise Error("publication not proven; no automatic retry")
        expected=({(x["id"],"removed") for x in doc["retire"]} |
                  {(x["id"],"active") for x in doc["add"]})
        if changed is not None and (
            len(changed)!=12 or {(x.get("id"),x.get("status")) for x in changed}!=expected):
            raise Error("unexpected publication response")
        receipt.update({"state":"post","active_count":264,
                        "active_ids_sha256":post["active_ids_sha256"],
                        "source_staged":True,"new_review_count":0,
                        "changed_rows":len(changed) if changed is not None else None,
                        "outcome":"published" if changed is not None else "recovered_after_response_loss"})
        receipt["phase"]="public_readback"
        receipt.update(public_readback(doc,transport))
        receipt["phase"]="done"
        receipt["complete"]=True
    except (Error,core.Error,legacy.Error,OSError,UnicodeError,ValueError) as exc:
        receipt["errors"].append({"phase":receipt["phase"],"code":str(exc)})
    except Exception:
        receipt["errors"].append({"phase":receipt["phase"],"code":"unexpected_failure"})
    return receipt


def main(argv=None):
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--manifest",required=True)
    ap.add_argument("--receipt",required=True)
    modes=ap.add_mutually_exclusive_group()
    modes.add_argument("--apply",action="store_true")
    modes.add_argument("--verify-post",action="store_true")
    ap.add_argument("--audit-receipt")
    args=ap.parse_args(argv)
    try:
        if args.apply != bool(args.audit_receipt): raise Error("apply requires audit receipt")
        raw=Path(args.manifest).read_bytes()
        audit=legacy.strict_json(Path(args.audit_receipt).read_bytes()) if args.apply else None
        transport=legacy.Transport(os.environ.get("CLOUDFLARE_ACCOUNT_ID"),
                                   os.environ.get("CLOUDFLARE_API_TOKEN"))
        result=execute(raw,transport,args.apply,audit,verify_post=args.verify_post)
        with Path(args.receipt).open("x",encoding="utf-8") as stream:
            json.dump(result,stream,sort_keys=True,indent=2,ensure_ascii=True)
            stream.write("\n")
        print(json.dumps({"complete":result["complete"],"mode":result["mode"],
                          "state":result["state"],"phase":result["phase"],
                          "errors":result["errors"]},sort_keys=True))
        return 0 if result["complete"] else 2
    except (Error,legacy.Error,OSError,ValueError):
        print("refresh: validation, transport or receipt failure",file=sys.stderr)
        return 2


if __name__=="__main__": sys.exit(main())
