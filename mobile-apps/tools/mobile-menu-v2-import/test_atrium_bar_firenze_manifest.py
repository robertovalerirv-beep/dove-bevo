"""Guard Atrium Bar Firenze's first-party, app-only cocktail candidate."""
import hashlib
from pathlib import Path
import unittest

import import_v2 as core


ROOT = Path(__file__).resolve().parents[3]
MANIFEST = (ROOT / "mobile-apps" / "data" / "mobile-menu-v2-seeds"
            / "6acf64cdda83cf51f5bd2aedd0bdcafacf28c08c8a6eae5b97f01d3d28fc12cd.json")


class AtriumBarFirenzeManifestTests(unittest.TestCase):
    def test_exact_verified_owner_drink_prices(self):
        raw = MANIFEST.read_bytes()
        self.assertEqual(hashlib.sha256(raw).hexdigest(), MANIFEST.stem)
        doc = core.validate(raw)
        self.assertEqual(doc["data_version"], "20261108")
        self.assertEqual(len(doc["venues"]), 1)
        self.assertEqual(doc["venues"][0]["venue_key"], "n12912861901")
        self.assertEqual(doc["venues"][0]["cell"], "srb10")
        self.assertEqual(doc["venues"][0]["address"], None)
        self.assertEqual(doc["venues"][0]["identity_kind"], "osm_static")

        source = doc["sources"][0]
        self.assertEqual(source["source_url"],
                         "https://www.fourseasons.com/it/florence/dining/lounges/atrium_bar/cocktails/")
        self.assertEqual(source["source_format"], "html_text_v1")
        self.assertEqual(source["source_sha256"],
                         "5723288594c32a2f718bfa2f9d2f184660a6c870b5f611cf29486851543722cb")
        self.assertEqual(source["source_sha256"], source["source_text_sha256"])
        self.assertEqual(source["use_review_status"], "approved")

        self.assertEqual(len(doc["offers"]), 10)
        self.assertEqual(len({row["id"] for row in doc["offers"]}), 10)
        self.assertEqual({(row["name"], row["amount_minor"], row["category"])
                          for row in doc["offers"]}, {
            ("Anolini in Brodo", 2500, None),
            ("Spaghetti Fritti al Pomodoro", 2500, None),
            ("Buffalo Wing", 2500, None),
            ("Bagel & Lox", 2500, None),
            ("Crêpe Suzette", 2500, None),
            ("Huître Bretonne", 2500, None),
            ("Brigadeiro", 2500, None),
            ("Moqueca", 2500, None),
            ("Yuja", 1800, "alcohol_free"),
            ("Strawberry Timur Sorbet", 1800, "alcohol_free"),
        })
        self.assertFalse(any("Vintage" in row["name"] for row in doc["offers"]))
        self.assertTrue(all(row["currency"] == "EUR"
                            and row["currency_exponent"] == 2
                            and row["serving_label"] is None
                            and row["serving_ml"] is None
                            and row["price_context"] == "regular"
                            and row["condition_text"] is None
                            and row["evidence_ref"].endswith(
                                f"EUR {row['amount_minor'] // 100}")
                            for row in doc["offers"]))
        self.assertEqual(doc["fees"], [])
        self.assertEqual(doc["fee_coverage"], [])


if __name__ == "__main__":
    unittest.main()
