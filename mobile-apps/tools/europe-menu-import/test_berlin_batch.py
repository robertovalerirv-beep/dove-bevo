"""Offline guards for the two exact Berlin menu variants; no provider/DB calls."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[3]
SPEC = importlib.util.spec_from_file_location("berlin_import_guard", Path(__file__).with_name("import_menu.py"))
m = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(m)
MANIFEST = ROOT / "mobile-apps/data/europe-menu-seed-berlin-20261102.json"
SOURCE_HASH = "af0fd673aec3f701d627726795ed070242a0e3d45b6affc86b403978f6116637"
MANIFEST_HASH = "e8276f8c35738d5fafa580ea19e0c1332718857f52077ddcefcd897e8a5f07be"


class BerlinBatchTests(unittest.TestCase):
    def setUp(self):
        self.raw = MANIFEST.read_bytes()
        self.doc = m.validate(self.raw)
        self.provenance = json.loads((ROOT / "mobile-apps/data/europe-catalogue-inputs-20261102-berlin/source-provenance.json").read_bytes())

    def test_exact_two_rows_no_inferred_minimum_or_silent_serving_change(self):
        self.assertEqual(hashlib.sha256(self.raw).hexdigest(), MANIFEST_HASH)
        self.assertNotIn(b"\r", self.raw)
        rows = self.doc["records"]
        self.assertEqual(len(rows), 2)
        self.assertEqual([(r["venue"], r["cell"], r["drink"], r["hh"], r["currency"], m.serving_key(r["drink"], r["serving"]), r["amount_minor"]) for r in rows], [
            ("n2727229961", "u336x", "spritz", 0, "EUR", "drink:", 1200),
            ("n2727229961", "u336x", "water", 0, "EUR", "ml:500", 300)])
        self.assertEqual([r["menu_item"] for r in rows], ["Aperol Spritz", "Soda Water [still/sparkling]"])
        self.assertEqual(m.EUR["spritz"], (250, 1500))
        self.assertEqual(m.EUR["water"], (50, 600))

    def test_source_pins_and_current_catalogue_membership_match_exact_bytes(self):
        source, = self.doc["sources"]
        self.assertEqual(source["sha256"], SOURCE_HASH)
        self.assertEqual(source["raw_evidence_sha256"], SOURCE_HASH)
        self.assertEqual(source["checked_on"], "2026-11-02")
        self.assertEqual(source["format"], "pdf_raw_v1")
        self.assertEqual(source["index_url"], "https://monkeybarberlin.de/drinks/")
        self.assertEqual(source["url"], source["fetch_url"])
        self.assertEqual(self.provenance["menu_source"]["raw_bytes"], 1883886)
        raw = (ROOT / "public/mobile-data/catalog.json").read_bytes()
        catalog = m.validate_catalog(raw, self.doc["catalog"])
        self.assertEqual(len(catalog), 34)
        venue = catalog["n2727229961"]
        self.assertEqual((venue["name"], venue["city"], venue["country"], venue["currency"], venue["cell"]), ("Monkey Bar", "Berlin", "DE", "EUR", "u336x"))
        self.assertEqual(venue["google"]["review_count"], 7592)
        self.assertEqual(venue["google"]["checked_on"], "2026-11-01")

    def test_only_ten_reviewed_identities_and_minimized_business_sources_are_added(self):
        catalog = m.validate_catalog((ROOT / "public/mobile-data/catalog.json").read_bytes(), self.doc["catalog"])
        berlin = {key for key, venue in catalog.items() if venue["country"] == "DE"}
        self.assertEqual(berlin, {"n2720667492", "n332554291", "n86005430", "n1391604297", "n12604740501",
                                 "n1161567853", "n652877991", "n3419393693", "n4948140228", "n2727229961"})
        inputs = ROOT / "mobile-apps/data/europe-catalogue-inputs-20261102-berlin"
        for name, expected in self.provenance["new_filtered_inputs_sha256"].items():
            self.assertEqual(hashlib.sha256((inputs / name).read_bytes()).hexdigest(), expected)
        provider = json.loads((inputs / "berlin.json").read_bytes())
        self.assertEqual(provider["raw_source_sha256"], "53c590ce0baa0887636b41ef66f24ed7a643765729970a39adffe1e10b9dc416")
        self.assertEqual(len(provider["venues"]), 10)
        self.assertEqual(set(provider), {"schema_version", "city", "country", "currency", "observed_at_ms", "provider", "capability", "raw_source_sha256", "venues"})
        for business in provider["venues"]:
            self.assertEqual(set(business), {"name", "address", "latitude", "longitude", "review_count", "website", "feature_id"})
        osm = json.loads((inputs / "berlin-osm.json").read_bytes())
        self.assertEqual(osm["raw_source_sha256"], "de62d7668560ea56f59559b5f3664f0f81434e57d3bbfd1c6734f7bf011724f8")
        self.assertEqual(len(osm["elements"]), 24)
        for element in osm["elements"]:
            self.assertTrue(set(element["tags"]) <= {"name", "amenity", "website", "contact:website", "addr:street", "addr:housenumber", "addr:city", "addr:postcode"})

    def test_six_research_facts_remain_held_under_unchanged_bounds_and_identity(self):
        held = self.provenance["held_menu_facts"]
        self.assertEqual(len(held), 6)
        nonalc = [r for r in held if r["drink"] == "alcohol_free"]
        wines = [r for r in held if r["drink"] == "wine_glass"]
        self.assertEqual(len(nonalc), 3)
        self.assertEqual(m.EUR["alcohol_free"], (200, 1200))
        self.assertTrue(all(r["amount_minor"] == 1300 > m.EUR["alcohol_free"][1] for r in nonalc))
        self.assertEqual([r["amount_minor"] for r in wines], [1100, 950, 950])
        self.assertEqual({m.serving_key("wine_glass", r["serving"]) for r in wines}, {"glass:125"})
        with self.assertRaises(m.Error): m.serving_key("wine_glass", {"unit": "ml", "ml": 125})
        for fact in nonalc:
            doc = copy.deepcopy(self.doc)
            doc["records"].append({**doc["records"][0], "drink": "alcohol_free", "amount_minor": fact["amount_minor"]})
            with self.assertRaisesRegex(m.Error, "invalid native currency amount"): m.validate(json.dumps(doc).encode())
        doc = copy.deepcopy(self.doc)
        for fact in wines[:2]:
            doc["records"].append({**doc["records"][0], "drink": "wine_glass", "serving": fact["serving"], "amount_minor": fact["amount_minor"], "menu_item": fact["menu_item"]})
        with self.assertRaisesRegex(m.Error, "duplicate price variant"): m.validate(json.dumps(doc).encode())

    def test_historical_source_pins_and_new_workflow_are_independent(self):
        historical = (ROOT / "mobile-apps/data/europe-menu-seed-20261101.json").read_bytes()
        self.assertEqual(hashlib.sha256(historical).hexdigest(), "1598bbf6def55b58fd168e58ee448b0d214ae56bf53abe704ddf1491c6336e97")
        baseline = (ROOT / "mobile-apps/data/europe-catalogue-baseline-20261101.json").read_bytes()
        self.assertEqual(hashlib.sha256(baseline).hexdigest(), "3e7bcc7f44ed3a52d22c666db5febb433ddb343379b96a4085d191f5c811c497")
        workflow = (ROOT / ".github/workflows/mobile-berlin-menu-import.yml").read_text()
        self.assertIn("MANIFEST_SHA256: " + MANIFEST_HASH, workflow)
        self.assertIn("refs/tags/mobile-berlin-menu-audit/20261102-v1", workflow)
        self.assertIn("refs/tags/mobile-berlin-menu-seed/20261102-v1", workflow)
        self.assertIn("--apply --approved-sha256", workflow)
        self.assertNotIn("workflow_dispatch", workflow)


if __name__ == "__main__": unittest.main()
