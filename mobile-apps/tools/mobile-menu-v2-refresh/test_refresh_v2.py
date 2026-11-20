"""Local SQLite contract tests for the one-statement public visibility switch."""
import datetime as dt
import importlib.util
import json
from pathlib import Path
import sqlite3
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs,urlsplit

SCRIPT=Path(__file__).with_name("refresh_v2.py")
spec=importlib.util.spec_from_file_location("refresh_v2",SCRIPT)
r=importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)
PUBLIC_READBACK=r.public_readback


def candidate():
    seed=json.loads((r.ROOT/"mobile-apps/data/mobile-menu-v2-seeds"/(r.PRIOR_SHA+".json")).read_text(encoding="utf-8"))
    by_id={x["id"]:x for x in seed["offers"] if x["venue_key"]==r.VENUE}
    prior_ids=sorted(by_id)
    retire=[]
    for product in (3406,3411,3423,3604,3730,3849,3850):
        row=by_id[f"birrifugio-roma-20261111-{product}"]
        retire.append({"id":row["id"],"owner_product_id":product,"expected_status":"active",
                       "expected_name":row["name"],"expected_amount_minor":row["amount_minor"],
                       "expected_currency":row["currency"],"expected_source_id":row["source_id"],
                       "reason":"removed from current owner menu"})
    source_text="155daaa3c0ef8c99a909d21cdd2903eccb9d11a8729ffba195d0fc9e88011e31"
    source_id="src-birrifugio-trastevere-"+source_text[:12]
    new=[]
    for id_suffix,product,name,category,serving,amount in (
        ("3419",3419,"MOSQUITO KILLER","beer_draft","PINTA 0,4",600),
        ("3448",3448,"KING OF FOOLS","beer_draft","CALICE 0,33",600),
        ("3893",3893,"WODAN","beer_draft","WILLY 0,5",600),
        ("3615-calice",3615,"PECORINO DOC BIOLOGICO","wine_glass","Calice",600),
        ("3615-bottiglia",3615,"PECORINO DOC BIOLOGICO",None,"Bottiglia",2000)):
        new.append({"id":"birrifugio-roma-20261120-"+id_suffix,"owner_product_id":product,
                    "venue_key":r.VENUE,"cell":r.CELL,"source_id":source_id,"name":name,
                    "category":category,"serving_label":serving,"serving_ml":None,
                    "amount_minor":amount,"currency":"EUR","currency_exponent":2,
                    "price_context":"regular","condition_text":None,
                    "evidence_ref":"reviewed current owner product"})
    return {"schema_version":1,"kind":"source_only_app_menu_refresh_candidate",
      "review_status":"independent_review_required",
      "batch_id":"birrifugio-roma-current-menu-refresh-20261120","checked_on":"2026-11-20",
      "venue":{"venue_key":r.VENUE,"cell":r.CELL,"name":"Birrifugio",
               "city":"Roma","country":"IT","identity_url":r.core.osm_identity_url(r.VENUE),
               "osm_version":3,"lat":41.8775735,"lon":12.4660827},
      "source":{"id":source_id,"venue_key":r.VENUE,"cell":r.CELL,"url":r.SOURCE_URL,
                "format":"html_text_v1","normalized_sha256":source_text,
                "captured_raw_sha256":"db3ac9bfb2ce633da6a6c10866ffa9269543ed6d7dc33b5f2ab199d1c46e1045",
                "checked_on":"2026-11-20","captured_twice_identical":True},
      "preconditions":{"prior_manifest_sha256":r.PRIOR_SHA,
         "prior_source_id":r.PRIOR_ID,"expected_active_offers":266,
         "expected_active_offer_ids_sha256":r.sha(("\n".join(prior_ids)+"\n").encode()),
         "expected_active_offer_ids_sha256_algorithm":
            "SHA-256 of UTF-8 sorted offer IDs joined by LF with a final LF",
         "expected_retained_unchanged_offers":259,"expected_removed_offers":7,
         "expected_new_offers":5,"expected_active_after":264},
      "retire_offers":retire,"new_offers":new,"preservation":{}}


class SQLiteTransport:
    def __init__(self,doc):
        self.db=sqlite3.connect(":memory:")
        self.db.row_factory=sqlite3.Row
        self.db.execute("PRAGMA foreign_keys=ON")
        self.db.executescript((r.ROOT/"migrations/0011_mobile_menu_v2.sql").read_text(encoding="utf-8"))
        self.db.executescript((r.ROOT/"migrations/0017_mobile_menu_v2_minimum_spends.sql").read_text(encoding="utf-8"))
        for table,cols in (
            ("venues_hidden","venue_key TEXT"),
            ("mobile_venues_moderation","venue_key TEXT"),
            ("reports","venue_key TEXT"),
            ("mobile_price_reports","venue_key TEXT"),
            ("mobile_menu_v2_customer_entries","seq INTEGER PRIMARY KEY, id TEXT, venue_key TEXT, offer_id TEXT"),
            ("mobile_menu_v2_customer_reports","id INTEGER PRIMARY KEY, entry_id TEXT"),
            ("prices_current","venue_key TEXT"),
            ("price_obs","venue_key TEXT"),
            ("venues_user","id INTEGER")):
            self.db.execute(f"CREATE TABLE {table} ({cols})")
        cols=r.SOURCE_FIELDS
        self.db.execute("INSERT INTO mobile_menu_v2_sources ("+",".join(cols)+") VALUES ("+
                        ",".join("?" for _ in cols)+")",
                        [doc["prior_source"][k] for k in cols])
        cols=r.OFFER_FIELDS
        sql=("INSERT INTO mobile_menu_v2_offers ("+",".join(cols)+") VALUES ("+
             ",".join("?" for _ in cols)+")")
        self.db.executemany(sql,[[x[k] for k in cols] for x in doc["old_offers"]])
        self.db.commit()
        self.fail_once_sql=None
        self.fail_after_commit_sql=None

    def attest_binding(self):
        return r.EXPECTED_BINDING

    def query(self,sql,params):
        if self.fail_once_sql and self.fail_once_sql in sql:
            self.fail_once_sql=None
            raise r.legacy.Error("simulated transport loss")
        try:
            cursor=self.db.execute(sql,params)
            result=[dict(row) for row in cursor.fetchall()]
            self.db.commit()
        except sqlite3.Error as exc:
            self.db.rollback()
            raise r.legacy.Error(str(exc)) from exc
        if self.fail_after_commit_sql and self.fail_after_commit_sql in sql:
            self.fail_after_commit_sql=None
            raise r.legacy.Error("response lost after commit")
        return result


class PublicPages:
    def __init__(self,rows,drop=None):
        self.rows=[row for row in rows if row["id"]!=drop]

    def fetch(self,address,maximum):
        args=parse_qs(urlsplit(address).query)
        after=args.get("after",[""])[0]
        filtered=[row for row in self.rows if row["id"]>after]
        page=filtered[:100]
        return json.dumps({"schema_version":2,"stored_offer_count":264,
            "venue":{"key":r.VENUE,"cell":r.CELL},"offers":page,
            "next_after":page[-1]["id"] if len(filtered)>100 else None}).encode()


def public_rows(doc):
    retired={x["id"] for x in doc["retire"]}
    rows=[x for x in doc["old_offers"] if x["id"] not in retired]+doc["add"]
    result=[]
    for x in rows:
        src=doc["new_source"] if x["source_id"]==doc["new_source"]["id"] else doc["prior_source"]
        result.append({"id":x["id"],"name":x["name"],"category":x["category"],
            "serving":{"label":x["serving_label"],"ml":x["serving_ml"]},
            "amount_minor":x["amount_minor"],"currency":x["currency"],
            "currency_exponent":x["currency_exponent"],
            "context":{"kind":x["price_context"],"condition":x["condition_text"]},
            "source":{"id":src["id"],"url":src["source_url"],
              "text_sha256":src["source_text_sha256"],"checked_on":src["source_checked_on"]}})
    return sorted(result,key=lambda x:x["id"])


class RefreshTest(unittest.TestCase):
    def setUp(self):
        self.raw=r.canonical(candidate()).encode("utf-8")
        self.doc=r.read_plan(self.raw)
        self.t=SQLiteTransport(self.doc)
        self.addCleanup(self.t.db.close)
        self.public=patch.object(r,"public_checks",return_value={"public_data_version":"20261108",
            "osm_version":3,"source_raw_sha256":candidate()["source"]["captured_raw_sha256"],
            "source_text_sha256":self.doc["new_source"]["source_text_sha256"]})
        self.public.start()
        self.addCleanup(self.public.stop)
        self.public_pages=patch.object(r,"public_readback",return_value={"public_offer_count":264,
            "public_offer_ids_sha256":"test-readback"})
        self.public_pages.start()
        self.addCleanup(self.public_pages.stop)

    def staged(self):
        r.stage_source(self.doc,self.t)
        r.stage_offers(self.doc,self.t)
        state=r.private_state(self.doc,self.t)
        self.assertEqual((state["state"],state["new_review_count"]),("pre",5))
        return state

    def audit(self):
        receipt=r.execute(self.raw,self.t)
        self.assertTrue(receipt["complete"],receipt["errors"])
        self.assertEqual(receipt["state"],"pre")
        return receipt

    def switch(self,state):
        return self.t.query(r.final_sql(),r.final_params(self.doc,state))

    def test_audit_is_read_only_and_staging_is_invisible(self):
        self.audit()
        self.assertEqual(self.t.db.execute("SELECT COUNT(*) FROM mobile_menu_v2_sources").fetchone()[0],1)
        self.staged()
        self.assertEqual(self.t.db.execute("SELECT COUNT(*) FROM mobile_menu_v2_offers WHERE status='active'").fetchone()[0],266)
        self.assertEqual(self.t.db.execute("SELECT COUNT(*) FROM mobile_menu_v2_offers WHERE status='review'").fetchone()[0],5)

    def test_exact_twelve_row_atomic_publish_and_idempotent_readback(self):
        audit=self.audit()
        done=r.execute(self.raw,self.t,True,audit)
        self.assertTrue(done["complete"],done["errors"])
        self.assertEqual((done["state"],done["active_count"],done["changed_rows"]),("post",264,12))
        again=r.execute(self.raw,self.t,True,audit)
        self.assertEqual((again["complete"],again["outcome"]),(True,"already_published"))
        self.assertEqual(self.t.db.execute("SELECT COUNT(*) FROM mobile_menu_v2_offers WHERE status='removed'").fetchone()[0],7)

    def test_active_id_race_blocks_every_status_change(self):
        state=self.staged()
        extra={**self.doc["old_offers"][0],"id":"concurrent-extra"}
        cols=r.OFFER_FIELDS
        self.t.db.execute("INSERT INTO mobile_menu_v2_offers ("+",".join(cols)+") VALUES ("+
                          ",".join("?" for _ in cols)+")",[extra[k] for k in cols])
        self.t.db.commit()
        self.assertEqual(self.switch(state),[])
        self.assertEqual(self.t.db.execute("SELECT COUNT(*) FROM mobile_menu_v2_offers WHERE status='removed'").fetchone()[0],0)

    def test_target_field_and_moderation_races_block_switch(self):
        for change in ("target","moderation"):
            with self.subTest(change=change):
                t=SQLiteTransport(self.doc)
                self.addCleanup(t.db.close)
                r.stage_source(self.doc,t);r.stage_offers(self.doc,t)
                state=r.private_state(self.doc,t)
                if change=="target":
                    t.db.execute("UPDATE mobile_menu_v2_offers SET amount_minor=999 WHERE id=?",
                                 (self.doc["retire"][0]["id"],))
                else:
                    t.db.execute("INSERT INTO mobile_venues_moderation VALUES (?)",(r.VENUE,))
                t.db.commit()
                self.assertEqual(t.query(r.final_sql(),r.final_params(self.doc,state)),[])
                self.assertEqual(t.db.execute("SELECT COUNT(*) FROM mobile_menu_v2_offers WHERE status='removed'").fetchone()[0],0)

    def test_retained_offer_field_race_blocks_atomic_switch(self):
        state=self.staged()
        retained="birrifugio-roma-20261111-3407"
        self.assertNotIn(retained,{x["id"] for x in self.doc["retire"]})
        self.t.db.execute("UPDATE mobile_menu_v2_offers SET amount_minor=amount_minor+1 WHERE id=?",
                          (retained,))
        self.t.db.commit()
        self.assertEqual(self.switch(state),[])
        self.assertEqual(self.t.db.execute("SELECT COUNT(*) FROM mobile_menu_v2_offers WHERE status='active'").fetchone()[0],266)
        self.assertEqual(self.t.db.execute("SELECT COUNT(*) FROM mobile_menu_v2_offers WHERE status='review'").fetchone()[0],5)

    def test_full_source_field_race_blocks_atomic_switch(self):
        for source_id,field,value in ((r.PRIOR_ID,"source_checked_on","2026-11-12"),
                                      (self.doc["new_source"]["id"],"use_review_basis","changed review")):
            with self.subTest(source=source_id):
                t=SQLiteTransport(self.doc)
                self.addCleanup(t.db.close)
                r.stage_source(self.doc,t);r.stage_offers(self.doc,t)
                state=r.private_state(self.doc,t)
                # The real source table has an immutability trigger. Remove it only
                # in this race test to prove the final SQL guard is independently sound.
                t.db.execute("DROP TRIGGER mobile_menu_v2_source_immutable_update")
                t.db.execute(f"UPDATE mobile_menu_v2_sources SET {field}=? WHERE id=?",
                             (value,source_id))
                t.db.commit()
                self.assertEqual(t.query(r.final_sql(),r.final_params(self.doc,state)),[])
                self.assertEqual(t.db.execute("SELECT COUNT(*) FROM mobile_menu_v2_offers WHERE status='removed'").fetchone()[0],0)

    def test_customer_entry_race_blocks_switch_without_deleting_entry(self):
        state=self.staged()
        self.t.db.execute("INSERT INTO mobile_menu_v2_customer_entries (id,venue_key,offer_id) VALUES (?,?,?)",
                          ("customer-one",r.VENUE,self.doc["retire"][0]["id"]))
        self.t.db.commit()
        self.assertEqual(self.switch(state),[])
        self.assertEqual(self.t.db.execute("SELECT COUNT(*) FROM mobile_menu_v2_customer_entries").fetchone()[0],1)

    def test_sql_abort_rolls_back_all_twelve_rows(self):
        state=self.staged()
        self.t.db.execute("CREATE TRIGGER reject_second BEFORE UPDATE ON mobile_menu_v2_offers "
            "WHEN NEW.id='birrifugio-roma-20261120-3615-calice' "
            "BEGIN SELECT RAISE(ABORT,'test abort'); END")
        self.t.db.commit()
        with self.assertRaises(r.legacy.Error): self.switch(state)
        self.assertEqual(self.t.db.execute("SELECT COUNT(*) FROM mobile_menu_v2_offers WHERE status='removed'").fetchone()[0],0)
        self.assertEqual(self.t.db.execute("SELECT COUNT(*) FROM mobile_menu_v2_offers WHERE status='review'").fetchone()[0],5)

    def test_staging_interruption_is_hidden_and_recoverable(self):
        audit=self.audit()
        r.stage_source(self.doc,self.t)
        r.stage_offers({**self.doc,"add":self.doc["add"][:2]},self.t)
        self.assertEqual(self.t.db.execute("SELECT COUNT(*) FROM mobile_menu_v2_offers WHERE status='review'").fetchone()[0],2)
        self.t.fail_once_sql="INSERT INTO mobile_menu_v2_offers"
        with self.assertRaises(r.Error): r.stage_offers(self.doc,self.t)
        self.assertEqual(self.t.db.execute("SELECT COUNT(*) FROM mobile_menu_v2_offers WHERE status='active'").fetchone()[0],266)
        done=r.execute(self.raw,self.t,True,audit)
        self.assertTrue(done["complete"],done["errors"])
        self.assertEqual(done["active_count"],264)

    def test_lost_update_response_recovers_by_exact_readback(self):
        audit=self.audit()
        self.t.fail_after_commit_sql="UPDATE mobile_menu_v2_offers SET status=CASE"
        done=r.execute(self.raw,self.t,True,audit)
        self.assertTrue(done["complete"],done["errors"])
        self.assertEqual(done["outcome"],"recovered_after_response_loss")
        self.assertIsNone(done["changed_rows"])

    def test_expired_or_mismatched_audit_never_stages(self):
        audit=self.audit()
        audit["audited_at_utc"]=(dt.datetime.now(dt.timezone.utc)-dt.timedelta(days=2)).isoformat()
        done=r.execute(self.raw,self.t,True,audit)
        self.assertFalse(done["complete"])
        self.assertEqual(self.t.db.execute("SELECT COUNT(*) FROM mobile_menu_v2_sources").fetchone()[0],1)

    def test_late_read_only_recovery_after_source_moves_on(self):
        audit=self.audit()
        self.assertTrue(r.execute(self.raw,self.t,True,audit)["complete"])
        with patch.object(r,"public_checks",side_effect=r.Error("source changed")):
            verified=r.execute(self.raw,self.t,verify_post=True)
        self.assertEqual((verified["complete"],verified["state"],verified["mode"]),
                         (True,"post","verify_post"))

    def test_public_readback_checks_all_pages_and_facts(self):
        rows=public_rows(self.doc)
        self.assertEqual(PUBLIC_READBACK(self.doc,PublicPages(rows))["public_offer_count"],264)
        with self.assertRaises(r.Error):
            PUBLIC_READBACK(self.doc,PublicPages(rows,drop=rows[150]["id"]))
        changed=[dict(row) for row in rows]
        changed[120]={**changed[120],"amount_minor":9999}
        with self.assertRaises(r.Error):
            PUBLIC_READBACK(self.doc,PublicPages(changed))

    def test_final_statement_stays_within_documented_d1_limits(self):
        state=self.staged()
        self.assertLess(len(r.final_sql().encode("utf-8")),100_000)
        params=r.final_params(self.doc,state)
        self.assertLessEqual(len(params),100)
        self.assertLess(max(len(x.encode("utf-8")) for x in params if isinstance(x,str)),2_000_000)


if __name__=="__main__": unittest.main()
