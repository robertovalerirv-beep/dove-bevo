"""Guard the Blended Padova owner-linked drink-list candidate."""
import hashlib
from pathlib import Path
import unittest

import import_v2 as core


ROOT = Path(__file__).resolve().parents[3]
MANIFEST = (ROOT / "mobile-apps" / "data" / "mobile-menu-v2-seeds"
            / "f61e9b32ca195b53c062a7234f9c2b809f004f2ec8f5dcda5da8b493164aa4c9.json")


class BlendedPadovaManifestTests(unittest.TestCase):
    def test_current_owner_list_and_distinct_serve_prices(self):
        raw = MANIFEST.read_bytes()
        self.assertEqual(hashlib.sha256(raw).hexdigest(), MANIFEST.stem)
        doc = core.validate(raw)
        self.assertEqual([v["venue_key"] for v in doc["venues"]], ["n13144971801"])
        self.assertEqual(doc["venues"][0]["identity_kind"], "osm_static")
        self.assertEqual(doc["venues"][0]["city"], "Padova")
        source = doc["sources"][0]
        self.assertEqual(source["source_url"],
                         "https://blended-padova.it/i-nostri-cocktails/")
        self.assertEqual(source["use_review_reference"],
                         "https://blended-padova.it/")
        self.assertEqual(source["source_format"], "html_text_v1")
        self.assertEqual(source["source_sha256"],
                         "e0eb3c5acf5d0ea2319c6227cd4f0f18d2f5d46c6cbcd09e21aaf4c8a8f86698")
        offers = doc["offers"]
        self.assertEqual(len(offers), 54)
        self.assertEqual(len({offer["id"] for offer in offers}), 54)
        self.assertEqual(len({(offer["name"], offer["amount_minor"],
                              offer["serving_label"]) for offer in offers}), 54)
        self.assertEqual(doc["fees"], [])
        self.assertEqual(doc["fee_coverage"], [])
        self.assertTrue(all(offer["currency"] == "EUR" and
                            offer["currency_exponent"] == 2 and
                            offer["price_context"] == "regular" and
                            offer["serving_ml"] is None and
                            offer["venue_key"] == "n13144971801"
                            for offer in offers))
        selected = {(offer["name"], offer["amount_minor"],
                     offer["category"], offer["serving_label"])
                    for offer in offers if offer["name"] in {
                        "GIN TONIC", "NEGRONI", "SPRITZ", "NEGRONI ANALCOLICO",
                        "PARK EXPORT 5,2 vol", "PROSECCO", "Malvasia"}}
        self.assertEqual(selected, {
            ("GIN TONIC", 800, "gin_tonic", None),
            ("NEGRONI", 900, "negroni", None),
            ("SPRITZ", 500, "spritz", None),
            ("NEGRONI ANALCOLICO", 800, "alcohol_free", None),
            ("PARK EXPORT 5,2 vol", 500, None, "Media"),
            ("PARK EXPORT 5,2 vol", 250, None, "Piccola"),
            ("PROSECCO", 400, "wine_glass", "Calice"),
            ("Malvasia", 450, "wine_glass", "Calice"),
        })


if __name__ == "__main__":
    unittest.main()
