import copy
import hashlib
import json
from datetime import date, datetime, timezone
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("catalogue", Path(__file__).with_name("build_catalogue.py"))
catalogue = importlib.util.module_from_spec(spec)
spec.loader.exec_module(catalogue)

class CatalogueIdentityTests(unittest.TestCase):
    def setUp(self):
        self.day = date(2026, 11, 1)
        stamp = int(datetime(2026, 11, 1, tzinfo=timezone.utc).timestamp() * 1000)
        self.provider = {"provider": "firecrawl-maps", "capability": "businesses/search", "city": "London", "country": "GB", "currency": "GBP", "observed_at_ms": stamp, "venues": [{"name": "Owned Test Bar", "review_count": 101, "latitude": 51.5074, "longitude": -.1278, "feature_id": "0x1:0xabc", "website": "https://owned.example/bar"}]}
        self.osm = {"osm3s": {"timestamp_osm_base": "2026-11-01T00:00:00Z"}, "elements": [{"type": "node", "id": 123, "lat": 51.5074, "lon": -.1278, "tags": {"name": "Owned Test Bar", "amenity": "bar"}}]}

    def join(self):
        return catalogue.join_city("london", self.provider, self.osm, self.day)

    def test_exact_identity_preserves_osm_name_coordinates_currency_and_review_proof(self):
        accepted, held = self.join()
        self.assertFalse(held)
        venue, proof = accepted[0]
        self.assertEqual(venue["key"], "n123")
        self.assertEqual(venue["currency"], "GBP")
        self.assertEqual(venue["google"]["url"], "https://www.google.com/maps?cid=2748")
        self.assertEqual(venue["google"]["checked_on"], "2026-11-01")
        self.assertEqual(venue["cell"], "gcpvj")
        self.assertEqual(proof["distance_m"], 0)

    def test_review_threshold_is_strict_and_never_coerces_booleans(self):
        for count in [100, 0, True, "150"]:
            self.provider["venues"][0]["review_count"] = count
            self.assertFalse(self.join()[0])

    def test_same_name_far_away_or_without_coordinates_is_held(self):
        self.osm["elements"][0]["lat"] += .001
        self.assertFalse(self.join()[0])
        del self.osm["elements"][0]["lat"]
        self.assertFalse(self.join()[0])

    def test_ambiguous_osm_and_duplicate_google_listings_do_not_create_duplicate_venues(self):
        self.osm["elements"].append({**copy.deepcopy(self.osm["elements"][0]), "id": 456})
        self.assertFalse(self.join()[0])
        self.osm["elements"].pop()
        self.provider["venues"].append(copy.deepcopy(self.provider["venues"][0]))
        self.assertFalse(self.join()[0])

    def test_website_corroboration_requires_similar_name_and_exact_location_page(self):
        self.osm["elements"][0]["tags"].update(name="Owned Test Bars", website="http://www.owned.example/bar/")
        self.assertEqual(len(self.join()[0]), 1)
        self.osm["elements"][0]["tags"]["website"] = "https://owned.example/another-branch"
        self.assertFalse(self.join()[0])

    def test_stale_future_wrong_currency_and_partial_sources_fail_closed(self):
        for field, value in [("currency", "EUR"), ("country", "FR"), ("observed_at_ms", 0), ("observed_at_ms", 1993575553000)]:
            source = copy.deepcopy(self.provider)
            source[field] = value
            with self.assertRaises(ValueError):
                catalogue.join_city("london", source, self.osm, self.day)
        self.osm["remark"] = "timeout"
        with self.assertRaises(ValueError): self.join()

    def test_unsupported_controls_and_social_domains_are_not_identity_evidence(self):
        self.osm["elements"][0]["tags"]["name"] = "Owned Test Bar\n"
        self.assertFalse(self.join()[0])
        self.assertIsNone(catalogue.website("https://instagram.com/owned"))
        self.assertIsNone(catalogue.website("https://user@owned.example/"))
        self.assertIsNone(catalogue.website("https://owned.example/#private"))

    def test_utf16_bound_matches_mobile_contract_and_rejects_lone_surrogates(self):
        for name, allowed in [("A" * 120, True), ("A" * 121, False), ("\U0001f37a" * 60, True), ("A" + "\U0001f37a" * 60, False), ("Bar\ud800", False)]:
            self.assertEqual(catalogue.supported_name(name), allowed)

    def test_other_amenities_are_held_instead_of_relabelled_as_bars(self):
        for kind in ["cafe", "restaurant", "hotel"]:
            self.osm["elements"][0]["tags"]["amenity"] = kind
            self.assertFalse(self.join()[0])

    def test_committed_cohort_reproduces_exact_catalogue_and_source_evidence(self):
        root = Path(__file__).resolve().parents[3]
        inputs = root / "mobile-apps/data/europe-catalogue-inputs-20261101"
        catalog = json.loads((root / "public/mobile-data/catalog.json").read_bytes())
        proof = json.loads((root / "mobile-apps/data/europe-catalogue-evidence-20261101.json").read_bytes())
        rows = []
        for city in ["london", "paris", "madrid"]:
            provider, osm = inputs / (city + ".json"), inputs / (city + "-osm.json")
            accepted, _ = catalogue.join_city(city, json.loads(provider.read_bytes()), json.loads(osm.read_bytes()), date(2026, 11, 2))
            rows.extend(venue for venue, _ in accepted)
            for venue, _ in accepted:
                evidence = next(item for item in proof["accepted"] if item["key"] == venue["key"])
                self.assertEqual(evidence["provider_sha256"], hashlib.sha256(provider.read_bytes()).hexdigest())
                self.assertEqual(evidence["osm_sha256"], hashlib.sha256(osm.read_bytes()).hexdigest())
        rows.sort(key=lambda row: (row["country"], row["city"], row["key"]))
        self.assertEqual(rows, catalog["venues"])
        self.assertEqual(len(rows), 24)
        self.assertEqual(catalog["version"], hashlib.sha256(json.dumps(rows, sort_keys=True, separators=(",", ":")).encode()).hexdigest()[:16])

if __name__ == "__main__": unittest.main()
