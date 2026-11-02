import hashlib
from pathlib import Path
import unittest
import live_import as core
MANIFEST = Path(__file__).resolve().parents[2] / "data/italy-menu-seed-20261102-d.json"
class BatchDTests(unittest.TestCase):
    def test_exact_reviewed_batch_preserves_major_city_scope(self):
        raw=MANIFEST.read_bytes()
        self.assertEqual(hashlib.sha256(raw).hexdigest(), "189db1e198ec6c984358cff25b91cb4f1c464a0050a106f616c7804b4680a1dc")
        doc=core.validate(raw)
        self.assertEqual(doc["schema_version"], 4)
        self.assertEqual(len(doc["records"]), 38)
        self.assertEqual(len({r["venue_key"] for r in doc["records"]}), 12)
        cities={r["city"] for r in doc["records"]}
        self.assertEqual(len(cities), 6)
        self.assertTrue({62505581,72959652,63621589,428339558}.issubset(cities))
    def test_no_google_evidence_or_customer_payment_claim_is_present(self):
        doc=core.validate(MANIFEST.read_bytes())
        for record in doc["records"]:
            self.assertFalse({"google_reviews","google_url","paid_on","observed_on"} & set(record))
            self.assertEqual((record["currency"],record["hh"],record["conditions"]), ("EUR",0,"none"))
