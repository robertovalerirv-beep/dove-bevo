"""Guard the unseeded Vecchia Orsa Moline candidate's identity and scope."""

import hashlib
from pathlib import Path
import unittest

import import_v2 as core


ROOT = Path(__file__).resolve().parents[3]
PATH = ROOT / "mobile-apps" / "data" / "mobile-menu-v2-seeds" / "8fdc33975eb8af60de0b09a0a11ce31be9762099497659b5841ed3edf8f55748.json"


class VecchiaOrsaMolineCandidateTests(unittest.TestCase):
    def test_exact_manifest_and_existing_venue(self):
        raw = PATH.read_bytes()
        self.assertEqual(hashlib.sha256(raw).hexdigest(), PATH.stem)
        doc = core.validate(raw)
        self.assertEqual(doc["data_version"], "20261108")
        self.assertEqual(doc["batch_id"], "vecchia-orsa-moline-bologna-owner-menu-20261110")
        self.assertEqual(len(doc["venues"]), 1)
        venue = doc["venues"][0]
        self.assertEqual((venue["venue_key"], venue["cell"], venue["name"]),
                         ("n4047745888", "srbj4", "Vecchia Orsa"))
        self.assertEqual(venue["identity_kind"], "osm_static")

    def test_source_and_printed_prices_keep_servings_and_fee_separate(self):
        doc = core.validate(PATH.read_bytes())
        self.assertEqual(len(doc["sources"]), 1)
        source = doc["sources"][0]
        self.assertEqual(source["source_format"], "pdf_text_v1")
        self.assertEqual(source["source_sha256"],
                         "f9ee7282adb2eb53df32b6c899c970839d0d87ad658c9e4829faf588a75d4a6e")
        self.assertEqual(len(doc["offers"]), 20)
        self.assertEqual(len({offer["id"] for offer in doc["offers"]}), 20)
        self.assertTrue(all(offer["currency"] == "EUR" and offer["currency_exponent"] == 2
                            for offer in doc["offers"]))

        values = {(offer["name"], offer["serving_label"]): offer["amount_minor"]
                  for offer in doc["offers"]}
        self.assertEqual(values[("Negroni", None)], 800)
        self.assertEqual(values[("Spritz", None)], 500)
        self.assertEqual(values[("Chardonnay", "calice")], 500)
        self.assertEqual(values[("Chardonnay", "bottiglia")], 2000)
        self.assertEqual(values[("Esel Kellerbier", "0,4 L")], 600)
        self.assertEqual(sum(offer["name"] == "Esel Kellerbier" for offer in doc["offers"]), 3)

        self.assertEqual(len(doc["fees"]), 1)
        fee = doc["fees"][0]
        self.assertEqual((fee["amount_minor"], fee["basis"], fee["applicability"]),
                         (100, "person", "unknown"))
        self.assertEqual(doc["fee_coverage"][0]["status"], "documented_partial")


if __name__ == "__main__":
    unittest.main()
