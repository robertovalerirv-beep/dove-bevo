"""Guard REEB's owner-linked, app-only Milano drink menu candidate."""
import hashlib
from pathlib import Path
import unittest

import import_v2 as core


ROOT = Path(__file__).resolve().parents[3]
MANIFEST = (ROOT / "mobile-apps" / "data" / "mobile-menu-v2-seeds"
            / "0c522adb83e85d223a979dca8db8233a3d08ca919de69b561a0c2863a3ddccba.json")


class ReebManifestTests(unittest.TestCase):
    def test_owner_menu_offers_preserve_servings_and_separate_fee(self):
        raw = MANIFEST.read_bytes()
        self.assertEqual(hashlib.sha256(raw).hexdigest(), MANIFEST.stem)
        doc = core.validate(raw)
        self.assertEqual([(v["venue_key"], v["cell"], v["identity_kind"])
                          for v in doc["venues"]],
                         [("n14066139394", "u0nd9", "osm_static")])
        self.assertEqual(doc["sources"][0]["source_url"], "https://reeb.pub/menu/")
        self.assertEqual(doc["sources"][0]["use_review_reference"], "https://reeb.pub/")
        self.assertEqual(doc["sources"][0]["source_format"], "html_text_v1")
        self.assertEqual(len(doc["offers"]), 55)
        self.assertEqual(len({offer["id"] for offer in doc["offers"]}), 55)
        self.assertTrue(all(offer["currency"] == "EUR"
                            and offer["currency_exponent"] == 2
                            and offer["price_context"] == "regular"
                            and offer["condition_text"] is None
                            for offer in doc["offers"]))

        actual = {(offer["name"], offer["serving_label"],
                   offer["amount_minor"], offer["category"])
                  for offer in doc["offers"]}
        self.assertTrue({
            ("Reepa", "Piccola 25cl", 500, "beer_draft"),
            ("Reepa", "Media 40cl", 700, "beer_draft"),
            ("Guinness", "Media 40cl", 700, "beer_draft"),
            ("Jupiler", "Piccola 25cl", 400, "beer_draft"),
            ("Jupiler", "Media 40cl", 600, "beer_draft"),
            ("Don Papaloma", None, 1500, None),
            ("Gin Tonic Monkey", None, 1500, "gin_tonic"),
            ("Issima Tonic", None, 1500, "gin_tonic"),
            ("Negroni", None, 800, "negroni"),
            ("Negroni Sbagliato", None, 800, "sbagliato"),
            ("Aperol Spritz", None, 800, "spritz"),
            ("Calice di Prosecco", "Calice", 700, "wine_glass"),
            ("Acqua Naturale / Gas 50cl", "50cl", 300, "water"),
        }.issubset(actual))
        self.assertFalse({"Hot Trouble", "Nettuno", "The Deer God"}
                         & {offer["name"] for offer in doc["offers"]})
        self.assertFalse({"Whisky", "Champagne Bollinger"}
                         & {offer["name"] for offer in doc["offers"]})
        number = lambda offer: int(offer["id"].rsplit("-", 1)[1])
        self.assertEqual({(offer["name"], offer["amount_minor"])
                          for offer in doc["offers"] if 27 <= number(offer) <= 36}, {
            ("Cuba Libre", 1000),
            ("London / Moscow Mule", 1000),
            ("Paloma", 1000),
            ("Amaro Cola", 1000),
            ("Long Island", 1000),
            ("Jack / Monte Cola", 1000),
            ("Vodka Redbull", 1000),
            ("Amari Redbull", 1000),
            ("Americano", 800),
            ("Vodka Tonic", 800),
        })
        self.assertEqual({offer["name"] for offer in doc["offers"]
                          if 37 <= number(offer) <= 47}, {
            "Sidro del Bosco", "Lava Lamp", "French Cider Lamponi",
            "French Cider Lime e Zenzero", "French Galipette Rosé",
            "French Galipette Non Alcolico", "French Cider Analcolico",
            "French Cider Pera", "Pecado del Paraiso Natural",
            "Stonewell Dry Irish Craft Cider", "Melegnan",
        })
        self.assertTrue(all(offer["amount_minor"] == 700
                            for offer in doc["offers"]
                            if 37 <= number(offer) <= 47))
        self.assertEqual({offer["name"] for offer in doc["offers"]
                          if 37 <= number(offer) <= 47
                          and offer["category"] == "alcohol_free"}, {
            "French Galipette Non Alcolico", "French Cider Analcolico",
        })
        self.assertEqual({(offer["name"], offer["amount_minor"])
                          for offer in doc["offers"]
                          if 48 <= number(offer) <= 50}, {
            ("Jefferson", 700), ("Grappa", 500), ("Amari", 500),
        })
        self.assertEqual({offer["name"] for offer in doc["offers"]
                          if 51 <= number(offer) <= 55}, {
            "Coca Cola / Coca Zero", "Estathè Limone / Pesca",
            "Fanta / Sprite", "Redbull",
            "Acqua Tonica / Lemon Soda / Ginger Beer",
        })
        self.assertTrue(all(offer["amount_minor"] == 500
                            and offer["category"] == "alcohol_free"
                            for offer in doc["offers"]
                            if 51 <= number(offer) <= 55))
        self.assertEqual(doc["fees"], [{
            "id": "reeb-milano-20261110-coperto", "venue_key": "n14066139394",
            "cell": "u0nd9", "source_id": "src-reeb-milano-20f0b8a27280",
            "label": "Coperto", "fee_kind": "fixed", "basis": "unspecified",
            "amount_minor": 200, "currency": "EUR", "currency_exponent": 2,
            "rate_bps": None, "applicability": "unknown", "condition_text": None,
            "evidence_ref": "Informazioni extra > Coperto +2",
        }])
        self.assertEqual(doc["fee_coverage"][0]["status"],
                         "documented_partial")


if __name__ == "__main__":
    unittest.main()
