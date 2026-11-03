import hashlib
from pathlib import Path
import unittest

import import_v2 as core

ROOT=Path(__file__).resolve().parents[3]
PATH=ROOT/"mobile-apps"/"data"/"mobile-menu-v2-seeds"/"e107cf1f84ed00a1b9270d6a5cd41e25649a823a4de39a1e9b03777d591edac8.json"

class CandidateSeedTests(unittest.TestCase):
    def test_reviewed_file_identity_and_scope(self):
        raw=PATH.read_bytes()
        self.assertEqual(hashlib.sha256(raw).hexdigest(),PATH.stem)
        doc=core.validate(raw)
        self.assertEqual(doc["batch_id"],"kikuya-firenze-owner-menu-20261102")
        self.assertEqual([v["venue_key"] for v in doc["venues"]],["n2361866569"])
        self.assertEqual(len(doc["offers"]),49)
        self.assertEqual({s["use_review_status"] for s in doc["sources"]},{"approved"})
        self.assertEqual(doc["fees"],[])
        self.assertEqual(doc["fee_coverage"],[])
        self.assertTrue(all(o["currency"]=="EUR" and o["currency_exponent"]==2 for o in doc["offers"]))
        self.assertEqual(len({o["id"] for o in doc["offers"]}),49)

if __name__=="__main__":
    unittest.main()
