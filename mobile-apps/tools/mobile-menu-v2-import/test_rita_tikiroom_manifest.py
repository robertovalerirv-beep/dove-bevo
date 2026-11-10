"""Guard the independently reviewable Rita's Tikiroom menu seed."""
import hashlib
from pathlib import Path
import unittest

import import_v2 as core


ROOT = Path(__file__).resolve().parents[3]
MANIFEST = (ROOT / "mobile-apps" / "data" / "mobile-menu-v2-seeds"
            / "0119a8331e65a2240dc9f431f2a59c8a8150676c8220fb78a744cd79f2d9b65f.json")


class RitaTikiroomManifestTests(unittest.TestCase):
    def test_factual_drinks_and_unstated_fee_scope(self):
        raw = MANIFEST.read_bytes()
        self.assertEqual(hashlib.sha256(raw).hexdigest(), MANIFEST.stem)
        doc = core.validate(raw)
        self.assertEqual([v["venue_key"] for v in doc["venues"]], ["n1853370614"])
        self.assertEqual(doc["venues"][0]["identity_kind"], "osm_static")
        self.assertEqual(doc["sources"][0]["source_url"],
                         "https://www.ritastikiroom.com/qr-menu-new/")
        self.assertEqual(len(doc["offers"]), 58)
        self.assertEqual(len({o["id"] for o in doc["offers"]}), 58)
        self.assertEqual(doc["fees"], [])
        self.assertEqual(doc["fee_coverage"], [])
        self.assertTrue(all(o["currency"] == "EUR" and
                            o["currency_exponent"] == 2 and
                            o["serving_ml"] is None and
                            o["price_context"] == "regular"
                            for o in doc["offers"]))
        selected = {(o["name"], o["amount_minor"], o["serving_label"],
                     o["category"]) for o in doc["offers"] if o["name"] in {
                         "Pago Pago Negroni", "ABK, Aktien Spezial",
                         "Malbec", "Cava Brut “Reserva”",
                         "Champagne Le Reserve Billecart-Salmon"}}
        self.assertEqual(selected, {
            ("Pago Pago Negroni", 1100, None, "negroni"),
            ("ABK, Aktien Spezial", 600, "Draft beer", "beer_draft"),
            ("Malbec", 900, "Glass", "wine_glass"),
            ("Malbec", 3600, "Bottle", None),
            ("Cava Brut “Reserva”", 700, "Glass", "wine_glass"),
            ("Cava Brut “Reserva”", 2900, "Bottle", None),
            ("Champagne Le Reserve Billecart-Salmon", 11000, "Bottle", None),
        })


if __name__ == "__main__":
    unittest.main()
