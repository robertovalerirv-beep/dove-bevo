import copy
import hashlib
import io
import json
import unittest
from unittest.mock import patch
import test_live_import as base
import run_source_cohort as runner

class SourceCohortTests(unittest.TestCase):
    def setUp(self):
        fixture=base.Tests();fixture.setUp()
        self.fake,self.doc=fixture.f,fixture.doc
        self.doc["schema_version"]=4
        first=self.doc["records"][0]
        first.pop("google_reviews");first.pop("google_url")
        first.update(source_format="raw",currency="EUR",menu_item="Spritz",serving_note="Per drink; volume unstated",conditions="none")
        first["source_url"]="https://menu.example/one"
        second=copy.deepcopy(first);second.update(drink="negroni",cents=800,source_url="https://menu.example/two",menu_item="Negroni")
        self.doc["records"].append(second)
        self.events=[]
    def tearDown(self):self.fake.db.close()
    def raw(self):return json.dumps(self.doc).encode()
    def sink(self,index,raw,receipt):self.events.append((index,json.loads(raw),receipt))
    def test_split_preserves_every_fact_and_exact_group_pin(self):
        groups=runner.split(self.raw())
        self.assertEqual(len(groups),2)
        for index,raw in enumerate(groups):
            group=json.loads(raw)
            self.assertEqual(group["records"],[self.doc["records"][index]])
            self.assertEqual(group["batch_id"],self.doc["batch_id"]+"-g"+str(index))
            self.assertEqual(group["checked_on"],self.doc["checked_on"])
            runner.core.validate(raw)
    def test_conflicting_same_url_hash_is_rejected(self):
        self.doc["records"][1]["source_url"]=self.doc["records"][0]["source_url"]
        self.doc["records"][1]["source_sha256"]="0"*64
        with self.assertRaises(runner.core.Error):runner.split(self.raw())
    def test_source_failure_isolated_and_audit_never_writes(self):
        original=self.fake.fetch
        def fetch(url,maximum=0):
            if url=="https://menu.example/one":raise runner.core.Error("SECRET BODY")
            return original(url,maximum)
        self.fake.fetch=fetch
        summary=runner.execute(self.raw(),lambda _:self.fake,self.sink,sleep=lambda _:None)
        self.assertFalse(summary["complete"])
        self.assertFalse(self.events[0][2]["complete"])
        self.assertEqual(self.events[0][2]["errors"],["preflight_or_binding_failed"])
        self.assertTrue(self.events[1][2]["complete"])
        self.assertEqual(self.events[1][2]["records"][0]["outcome"],"eligible_at_read")
        self.assertEqual(self.fake.db.execute("SELECT COUNT(*) FROM prices_current").fetchone()[0],0)
        self.assertNotIn("SECRET",json.dumps(self.events))
    def test_wrong_approval_fails_before_factory(self):
        calls=[]
        for approved,indexes in [("0"*64,{0}),(hashlib.sha256(self.raw()).hexdigest(),set()),(hashlib.sha256(self.raw()).hexdigest(),{2}),(hashlib.sha256(self.raw()).hexdigest(),{True})]:
            with self.assertRaises(runner.core.Error):
                runner.execute(self.raw(),lambda i:calls.append(i),self.sink,True,approved,indexes,sleep=lambda _:None)
        self.assertEqual(calls,[])
    def test_unapproved_source_has_no_transport_or_public_write(self):
        calls=[]
        def factory(index):calls.append(index);return self.fake
        summary=runner.execute(self.raw(),factory,self.sink,True,hashlib.sha256(self.raw()).hexdigest(),{1},sleep=lambda _:None)
        self.assertTrue(summary["complete"])
        self.assertEqual(calls,[1])
        self.assertEqual(summary["groups"][0]["outcome"],"not_approved")
        self.assertFalse(summary["groups"][0]["selected"])
        rows=self.fake.db.execute("SELECT drink,price_cents FROM prices_current").fetchall()
        self.assertEqual([tuple(r) for r in rows],[("negroni",800)])
    def test_apply_preserves_existing_customer_record(self):
        record=self.doc["records"][0]
        self.fake.db.execute("INSERT INTO prices_current VALUES(?,?,?,?,?,?,?,? ,?,?)",(record["venue_key"],"spritz",0,record["cell"],record["city"],450,"2026-10-01",3,"active","community"))
        summary=runner.execute(self.raw(),lambda _:self.fake,self.sink,True,hashlib.sha256(self.raw()).hexdigest(),{0,1},sleep=lambda _:None)
        self.assertTrue(summary["complete"])
        row=self.fake.db.execute("SELECT price_cents,observed_on,confirmations,source FROM prices_current WHERE drink='spritz'").fetchone()
        self.assertEqual(tuple(row),(450,"2026-10-01",3,"community"))
        self.assertEqual(self.events[0][2]["records"][0]["outcome"],"skipped_existing_or_guarded")
        self.assertEqual(self.events[1][2]["records"][0]["outcome"],"inserted")
    def test_index_parser_and_audit_selection_guards(self):
        self.assertEqual(runner.approved_indexes("0,2",3),{0,2})
        for value in ["","-1","01","0,0","3"," 1","1.0","١"]:
            with self.assertRaises(runner.core.Error):runner.approved_indexes(value,3)
        with self.assertRaises(runner.core.Error):runner.execute(self.raw(),lambda _:self.fake,self.sink,indexes={0},sleep=lambda _:None)
    def test_existing_output_blocks_before_any_transport(self):
        with patch.object(runner.Path,"open",return_value=io.BytesIO(self.raw())),patch.object(runner.Path,"mkdir",side_effect=FileExistsError()),patch.object(runner.core,"Transport") as factory:
            self.assertEqual(runner.main(["--manifest","example.json","--output-dir","existing"]),2)
            factory.assert_not_called()

if __name__=="__main__":unittest.main()
