"""Guard the Ceresio 7 owner-linked American Bar menu candidate."""
import hashlib
from pathlib import Path
import unittest

import import_v2 as core


ROOT = Path(__file__).resolve().parents[3]
MANIFEST = (ROOT / "mobile-apps" / "data" / "mobile-menu-v2-seeds"
            / "5072462a135abe78549d555ef242ab0fb1416aaedde19b4d11e3bbdbeb4be739.json")


class Ceresio7ManifestTests(unittest.TestCase):
    def test_owner_linked_milano_cocktails_and_unknown_fees(self):
        raw = MANIFEST.read_bytes()
        self.assertEqual(hashlib.sha256(raw).hexdigest(), MANIFEST.stem)
        doc = core.validate(raw)
        self.assertEqual([v["venue_key"] for v in doc["venues"]], ["n3049190340"])
        self.assertEqual(doc["venues"][0]["identity_kind"], "osm_static")
        self.assertEqual(doc["sources"][0]["source_url"],
                         "https://ceresio7.com/milano/bar/")
        self.assertEqual(doc["sources"][0]["use_review_reference"],
                         "https://ceresio7.com/")
        self.assertEqual(len(doc["offers"]), 22)
        self.assertEqual(len({o["id"] for o in doc["offers"]}), 22)
        self.assertEqual(doc["fees"], [])
        self.assertEqual(doc["fee_coverage"], [])
        self.assertTrue(all(o["currency"] == "EUR" and
                            o["currency_exponent"] == 2 and
                            o["serving_label"] is None and
                            o["serving_ml"] is None and
                            o["price_context"] == "regular"
                            for o in doc["offers"]))
        selected = {(o["name"], o["amount_minor"], o["category"])
                    for o in doc["offers"] if o["name"] in {
                        "TOMACCO", "MOKA MARTINI", "NEGRONCELLO",
                        "SPRITZ REDUX", "BONSEKI", "MACAO", "VIRGIN PALOMA"}}
        self.assertEqual(selected, {
            ("TOMACCO", 2200, None),
            ("MOKA MARTINI", 2100, None),
            ("NEGRONCELLO", 2100, "negroni"),
            ("SPRITZ REDUX", 2100, "spritz"),
            ("BONSEKI", 1800, "alcohol_free"),
            ("MACAO", 1800, "alcohol_free"),
            ("VIRGIN PALOMA", 1800, "alcohol_free"),
        })


if __name__ == "__main__":
    unittest.main()
