"""Guard the owner-linked, unseeded Magick Bar Roma menu candidate."""
import hashlib
from pathlib import Path
import unittest

import import_v2 as core


ROOT = Path(__file__).resolve().parents[3]
MANIFEST = (ROOT / "mobile-apps" / "data" / "mobile-menu-v2-seeds"
            / "5f5e91a762bce9a56c526a312997fdc27bb0bc0c0877ce617af12d7b76120fb7.json")


class MagickBarRomaManifestTests(unittest.TestCase):
    def test_owner_menu_includes_named_drinks_and_wine_servings(self):
        raw = MANIFEST.read_bytes()
        self.assertEqual(hashlib.sha256(raw).hexdigest(), MANIFEST.stem)
        doc = core.validate(raw)
        self.assertEqual(doc["schema_version"], 1)
        self.assertEqual([(v["venue_key"], v["cell"], v["identity_kind"])
                          for v in doc["venues"]],
                         [("n4798279234", "sr2y7", "osm_static")])
        source = doc["sources"][0]
        self.assertEqual(source["source_url"],
                         "https://themagickbar.com/wp-content/uploads/2026/05/2026-MENU-BAR.pdf.pdf")
        self.assertEqual(source["source_format"], "pdf_text_v1")
        self.assertEqual(source["source_sha256"],
                         "d05a5c572ca7a0ffb717c6861094b0a0cbfb7322a810d52c5377b34788b45638")
        self.assertIn("EUR is inferred from Roma, not claimed printed", source["use_review_basis"])

        offers = doc["offers"]
        self.assertEqual(len(offers), 51)
        self.assertEqual(len({row["id"] for row in offers}), 51)
        self.assertTrue(all(row["currency"] == "EUR"
                            and row["currency_exponent"] == 2
                            and row["price_context"] == "regular"
                            and row["condition_text"] is None
                            and row["serving_ml"] is None for row in offers))
        self.assertEqual({(row["name"], row["amount_minor"]) for row in offers[:8]}, {
            ("Ade e Persefone", 1500), ("L’ Estate di Demetra", 1500),
            ("Venere in Bikini", 1500), ("Scilla e Cariddi", 1500),
            ("The Magick Bar", 1500), ("Il Secondo Sole", 1500),
            ("Apollo e il Sole", 1200), ("The Morning Star", 1200),
        })
        self.assertIn(("Nastro Azzuro Capri", None, 700),
                      {(row["name"], row["serving_label"], row["amount_minor"])
                       for row in offers})
        self.assertIn(("Acqua", None, 300, "water"),
                      {(row["name"], row["serving_label"], row["amount_minor"], row["category"])
                       for row in offers})

        # The printed two-column wine prices are bound to the page-3 serving
        # categories, with a single bottle-column figure for each Champagne.
        wine_prices = {
            "Rosso Conero DOC San Lorenzo": (7, 35), "Capolemole": (8, 35),
            "Negroamaro Masseria Maìme": (8, 40), "Lagrein Rosé": (7, 30),
            "Calafuria IGT": (8, 40),
            "Valdobbiadene Prosecco Superiore Brut DOCG": (7, 30),
            "Prosecco Rosé DOC": (7, 32), "Franciacorta Brut DOCG": (10, 50),
            "Franciacorta Rosé DOCG": (10, 52),
            "Champagne Pol Roger Reserve": (None, 180),
            "Champagne William Saintot Rosé": (None, 180),
            "Ribolla Gialla Nina Nunic": (8, 33),
            "Sauvignon Blanc Baloc": (7, 28), "Chardonnay Puglia IGT": (7, 30),
            "Riesling Pavia IGP": (7, 27), "Capolemole bianco BIO": (8, 38),
        }
        actual = {(row["name"], row["serving_label"]): row["amount_minor"]
                  for row in offers[20:50]}
        expected = {}
        for name, (glass, bottle) in wine_prices.items():
            if glass is not None:
                expected[(name, "Calice")] = glass * 100
            expected[(name, "Bottiglia")] = bottle * 100
        self.assertEqual(actual, expected)
        self.assertEqual(sum(1 for row in offers[20:50] if row["category"] == "wine_glass"), 14)
        self.assertEqual(doc["fees"], [])
        self.assertEqual(doc["fee_coverage"], [])


if __name__ == "__main__":
    unittest.main()
