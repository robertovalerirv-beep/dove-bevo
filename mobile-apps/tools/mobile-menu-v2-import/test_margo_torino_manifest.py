"""Guard the source-backed Margò Torino app-only menu seed."""
import hashlib
from pathlib import Path
import unittest

import import_v2 as core


ROOT = Path(__file__).resolve().parents[3]
MANIFEST = (ROOT / "mobile-apps" / "data" / "mobile-menu-v2-seeds"
            / "f6ed6aa5bef8372c25b1fca99b20b71b7d4f9100f20b94ef5ef515e0e4641f63.json")


class MargoTorinoManifestTests(unittest.TestCase):
    def test_reviewed_source_and_exact_requested_prices(self):
        raw = MANIFEST.read_bytes()
        self.assertEqual(hashlib.sha256(raw).hexdigest(), MANIFEST.stem)
        doc = core.validate(raw)
        self.assertEqual(doc["batch_id"], "margo-torino-owner-menu-20261103")
        self.assertEqual([v["venue_key"] for v in doc["venues"]], ["n306553710"])
        self.assertEqual(doc["venues"][0]["identity_kind"], "osm_static")
        self.assertEqual(doc["sources"][0]["source_url"],
                         "https://margotorino.com/menu-2/")
        self.assertEqual(doc["sources"][0]["use_review_status"], "approved")
        self.assertEqual(len(doc["offers"]), 114)
        self.assertEqual(doc["fees"], [])
        self.assertEqual(doc["fee_coverage"], [])
        expected = {
            ("Heineken", 400, "Media"), ("Heineken", 300, "Piccola"),
            ("Ichnusa non filtrata", 600, "Media"),
            ("Ichnusa non filtrata", 400, "Piccola"),
            ("MOJITO", 800, None), ("DAIQUIRI", 700, None),
            ("Negroni zero", 700, None),
        }
        actual = {(o["name"], o["amount_minor"], o["serving_label"])
                  for o in doc["offers"] if o["name"] in
                  {"Heineken", "Ichnusa non filtrata", "MOJITO", "DAIQUIRI", "Negroni zero"}}
        self.assertEqual(actual, expected)
        zero = next(o for o in doc["offers"] if o["name"] == "Negroni zero")
        self.assertEqual(zero["category"], "alcohol_free")
        self.assertTrue(all(o["serving_ml"] is None for o in doc["offers"]))


if __name__ == "__main__":
    unittest.main()
