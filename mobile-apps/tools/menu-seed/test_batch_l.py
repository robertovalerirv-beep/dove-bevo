import hashlib
from pathlib import Path
import unittest
import live_import as core
MANIFEST = Path(__file__).resolve().parents[2] / "data/italy-menu-seed-20261102-l.json"
class BatchLTests(unittest.TestCase):
    def test_exact_reviewed_batch_preserves_major_city_scope(self):
        raw=MANIFEST.read_bytes()
        self.assertEqual(hashlib.sha256(raw).hexdigest(), "0a5d9a8767253595eaefc579b189427ddee83c6df3ca8ab3a3694c8a1ea57a04")
        doc=core.validate(raw)
        self.assertEqual(doc["schema_version"], 4)
        self.assertEqual(len(doc["records"]), 7)
        self.assertEqual(len({r["venue_key"] for r in doc["records"]}), 1)
        cities={r["city"] for r in doc["records"]}
        self.assertEqual(len(cities), 1)
        self.assertTrue(cities == {62505581})
    def test_no_google_evidence_or_customer_payment_claim_is_present(self):
        doc=core.validate(MANIFEST.read_bytes())
        for record in doc["records"]:
            self.assertFalse({"google_reviews","google_url","paid_on","observed_on"} & set(record))
            self.assertEqual((record["currency"],record["hh"],record["conditions"]), ("EUR",0,"none"))

class ReceiptBindingTests(unittest.TestCase):
    def make_receipt(self):
        import json
        raw=MANIFEST.read_bytes()
        doc=core.validate(raw)
        receipt={"complete":True,"mode":"apply","manifest_sha256":hashlib.sha256(raw).hexdigest(),"batch_id":doc["batch_id"],"errors":[],"records":[{"venue_key":r["venue_key"],"drink":r["drink"],"hh":r["hh"],"outcome":"skipped_existing_or_guarded"} for r in doc["records"]]}
        return doc,raw,receipt
    def test_exact_completed_apply_is_required(self):
        import verify_batch_d as verifier
        doc,raw,receipt=self.make_receipt()
        self.assertEqual(verifier.validate_receipt(doc,raw,receipt), [])
        for field,value in (("mode","dry_run"),("complete",False),("manifest_sha256","0"*64),("batch_id","other"),("errors",["partial"])):
            with self.subTest(field=field):
                changed=dict(receipt);changed[field]=value
                with self.assertRaises(ValueError): verifier.validate_receipt(doc,raw,changed)
    def test_incomplete_duplicate_or_foreign_receipt_keys_are_rejected(self):
        import copy
        import verify_batch_d as verifier
        doc,raw,receipt=self.make_receipt()
        for mode in ("missing","duplicate","foreign"):
            changed=copy.deepcopy(receipt)
            if mode=="missing":changed["records"].pop()
            elif mode=="duplicate":changed["records"][1]=changed["records"][0]
            else:changed["records"][0]["venue_key"]="n999999999"
            with self.subTest(mode=mode),self.assertRaises(ValueError):verifier.validate_receipt(doc,raw,changed)
    def test_indeterminate_or_unattempted_outcomes_cannot_count_as_success(self):
        import verify_batch_d as verifier
        doc,raw,receipt=self.make_receipt()
        for outcome in ("eligible_at_read","indeterminate","not_attempted"):
            receipt["records"][0]["outcome"]=outcome
            with self.subTest(outcome=outcome),self.assertRaises(ValueError):verifier.validate_receipt(doc,raw,receipt)

class WorkflowLockTests(unittest.TestCase):
    def test_protected_writer_uses_shared_import_lock(self):
        workflow = (Path(__file__).resolve().parents[3] / ".github/workflows/mobile-italy-menu-l.yml").read_text(encoding="utf-8")
        protected = workflow.split("\n  reviewed-import:\n", 1)[1]
        self.assertIn("\n    concurrency:\n      group: dovebevo-one-off-menu-import\n      cancel-in-progress: false\n", protected)
