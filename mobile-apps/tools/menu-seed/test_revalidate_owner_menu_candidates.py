"""Offline tests for read-only candidate revalidation."""

import hashlib
import json
from pathlib import Path
import tempfile
import unittest

import inventory_city_prices as inventory
import revalidate_owner_menu_candidates as review


CITY = 62505581
LAT = 45.47266
LON = 9.14297
CELL = inventory.geohash(LAT, LON)


def fixture():
    rows = []
    records = []
    for key, name in (("n11", "Bar Uno"), ("n12", "Bar Due"), ("n13", "Bar Tre")):
        rows.append({"key": key, "name": name, "kind": 2, "lat": LAT, "lon": LON,
                     "address": "Via Uno 1", "cell": CELL, "cityID": CITY,
                     "city": "Milano", "state": "candidate",
                     "url_tags": {"website": f"https://{key}.it/"}})
        records.append({"venue_key": key, "venue_name": name, "city": "Milano", "cell": CELL,
                        "status": "candidate", "identity_state": "historical_queue_only",
                        "sources": [{"url": f"https://{key}.it/menu/", "review_state": "candidate_only",
                                     "first_party_basis": "same_host_and_venue_name_on_landing",
                                     "raw_sha256": "a" * 64,
                                     "price_candidates": [{"kind_guess": "drink"}] * 2}]})
    queue = json.dumps({"schema_version": 1, "checked_on": "2026-11-02",
                        "catalogue_version": "20261101", "inventory_complete": False,
                        "source_candidates": len(rows), "candidates": rows}).encode()
    report = {"schema_version": 1, "purpose": "review_only_existing_italian_venues",
              "queue_sha256": hashlib.sha256(queue).hexdigest(),
              "queue_inventory_complete": False, "selected_venues": len(records),
              "publication_blocked": True, "public_imports": 0, "records": records}
    static = {"c": [[CITY, "Milano"]],
              "v": [[r["key"], r["name"], 2, LAT, LON, "Via Uno 1", 0] for r in rows]}
    return queue, report, static


class RevalidatorTests(unittest.TestCase):
    def fetch(self, static, *, hidden=None, version_change=False):
        calls = 0
        def read(url):
            nonlocal calls
            if url.endswith("/api/health"):
                calls += 1
                return {"data_version": "20261103" if version_change and calls > 1 else "20261102"}
            if url.endswith(f"/data/20261102/v/{CELL}.json"):
                return static
            if url.endswith(f"/api/prices/{CELL}"):
                return {"p": [], "h": hidden or []}
            raise AssertionError(url)
        return read

    def test_rank_uses_current_identity_and_excludes_seeded_and_hidden(self):
        queue, report, static = fixture()
        result = review.rank(queue, [report], {"n12"}, "f" * 64,
                             fetch=self.fetch(static, hidden=["n13"]))
        self.assertTrue(result["complete"])
        self.assertTrue(result["cohort_complete"])
        self.assertFalse(result["queue_inventory_complete"])
        self.assertEqual(result["excluded_seeded_candidates"], 1)
        self.assertEqual(result["held_candidate_reasons"], {"venue_hidden": 1})
        self.assertEqual([c["venue_key"] for c in result["candidates"]], ["n11"])
        self.assertEqual(result["candidates"][0]["heuristic_drink_price_lines"], 2)
        self.assertEqual(result["approved_prices"], 0)
        self.assertTrue(result["publication_blocked"])
        self.assertNotIn("amount_minor", json.dumps(result))

    def test_name_mismatch_is_held_for_human_review(self):
        queue, report, static = fixture()
        static["v"][0][1] = "Another bar"
        result = review.rank(queue, [report], set(), "f" * 64, fetch=self.fetch(static))
        self.assertEqual(result["held_candidate_reasons"], {"current_catalogue_identity_mismatch": 1})
        self.assertNotIn("n11", [row["venue_key"] for row in result["candidates"]])

    def test_version_change_fails_closed(self):
        queue, report, static = fixture()
        result = review.rank(queue, [report], set(), "f" * 64,
                             fetch=self.fetch(static, version_change=True))
        self.assertFalse(result["complete"])
        self.assertEqual(result["candidates"], [])
        self.assertIn("catalogue_version_changed", result["errors"])

    def test_report_mismatch_duplicate_and_missing_coverage(self):
        queue, report, static = fixture()
        with self.assertRaisesRegex(review.Held, "report_queue_identity_mismatch"):
            review.rank(queue, [report, report], set(), "f" * 64, fetch=self.fetch(static))
        report["records"][0]["venue_key"] = []
        with self.assertRaisesRegex(review.Held, "invalid_report_venue_key"):
            review.rank(queue, [report], set(), "f" * 64, fetch=self.fetch(static))
        report["records"][0]["venue_key"] = "n11"
        report["records"] = report["records"][:-1]
        report["selected_venues"] = 2
        result = review.rank(queue, [report], set(), "f" * 64, fetch=self.fetch(static))
        self.assertFalse(result["complete"])
        self.assertEqual(result["candidates"], [])
        self.assertIn("queue_report_coverage_incomplete", result["errors"])

    def test_deterministic_read_only_result_and_seed_integrity(self):
        queue, report, static = fixture()
        one = review.rank(queue, [report], set(), "f" * 64, fetch=self.fetch(static))
        two = review.rank(queue, [report], set(), "f" * 64, fetch=self.fetch(static))
        self.assertEqual(json.dumps(one, sort_keys=True), json.dumps(two, sort_keys=True))
        with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parents[3]) as temp:
            directory = Path(temp)
            content = b'{"venues":[{"venue_key":"n12"}]}'
            (directory / (hashlib.sha256(content).hexdigest() + ".json")).write_bytes(content)
            keys, fingerprint, count = review.seed_keys(directory)
            self.assertEqual((keys, count), ({"n12"}, 1))
            self.assertEqual(len(fingerprint), 64)
            (directory / ("0" * 64 + ".json")).write_bytes(content)
            with self.assertRaisesRegex(review.Held, "invalid_seed_digest"):
                review.seed_keys(directory)


if __name__ == "__main__":
    unittest.main()
