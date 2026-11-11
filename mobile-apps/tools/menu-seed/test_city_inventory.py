"""No-network tests for the bounded public city inventory."""
import copy
from email.message import Message
import io
import json
import threading
import time
import unittest
from unittest.mock import patch

import inventory_city_prices as core


CITY = 62505581
LAT, LON = 45.46419, 9.18963
CENTRAL = "u0nd9"
VENUE = ["n123", "Example pub", 2, LAT, LON, "Via Example 1", 0]


class Fake:
    def __init__(self, expected=1):
        self.calls = []
        self.lock = threading.Lock()
        self.running = self.peak = 0
        self.version_calls = 0
        self.end_version = "20261101"
        self.files = {f"/data/20261101/v/{c}.json": {"c": [], "v": []}
                      for c in core.city_cells(LAT, LON)[1]}
        self.files["/data/20261101/places.json"] = [[CITY, "Milano", LAT, LON, expected]]
        self.files[f"/data/20261101/v/{CENTRAL}.json"] = {"c": [[CITY, "Milano"]], "v": [VENUE]}
        self.files[f"/api/prices/{CENTRAL}"] = {"p": [["n123", "spritz", 0, 600, "2026-11-02", 0, 0]],
                                               "h": [], "u": [], "pend": []}

    def __call__(self, url):
        if not core.allowed_url(url):
            raise AssertionError("unsafe request")
        path = url[len(core.ORIGIN):]
        with self.lock:
            self.calls.append(path)
            self.running += 1
            self.peak = max(self.peak, self.running)
        try:
            time.sleep(.001)
            if path == "/api/health":
                self.version_calls += 1
                return {"data_version": "20261101" if self.version_calls == 1 else self.end_version}
            value = self.files[path]
            if isinstance(value, Exception):
                raise value
            return copy.deepcopy(value)
        finally:
            with self.lock:
                self.running -= 1


class InventoryTests(unittest.TestCase):
    def run_inventory(self, fake):
        return core.inventory([CITY], fetch=fake)

    def test_full_city_reconciliation_and_request_bounds(self):
        fake = Fake()
        result = self.run_inventory(fake)
        self.assertTrue(result["complete"])
        city = result["cities"][0]
        self.assertEqual((city["valid_static_venues"], city["current_priced_venues"], city["current_price_rows"]), (1, 1, 1))
        self.assertEqual(city["current_priced_venues_by_drink"]["spritz"], 1)
        self.assertIsNone(result["remaining_menu_eligible"])
        self.assertLessEqual(fake.peak, 3)
        self.assertEqual(len(fake.calls), 74)  # health twice, places, 70 cells, one prices
        self.assertEqual(len(set(fake.calls)), len(fake.calls)-1)

    def test_geohash_and_all_bbox_corners_are_covered(self):
        examples = [(45.46419, 9.18963, "u0nd9", 70),
                    (41.89332, 12.48293, "sr2yk", 70),
                    (45.06776, 7.68249, "u0j2q", 70),
                    (40.83588, 14.24877, "sr60k", 63)]
        for lat, lon, cell, count in examples:
            with self.subTest(cell=cell):
                self.assertEqual(core.geohash(lat, lon), cell)
                bounds, cells = core.city_cells(lat, lon)
                self.assertEqual(len(cells), count)
                self.assertEqual(len(set(cells)), count)
                for y in (bounds["south"], bounds["north"]):
                    for x in (bounds["west"], bounds["east"]):
                        self.assertIn(core.geohash(y, x), cells)
        with patch.object(core, "MAX_CELLS", 1), self.assertRaises(core.Invalid):
            core.city_cells(LAT, LON)

    def test_hidden_quarantined_user_pending_and_foreign_prices_are_excluded(self):
        fake = Fake(expected=3)
        doc = fake.files[f"/data/20261101/v/{CENTRAL}.json"]
        doc["v"] += [["n124", "Hidden", 1, LAT, LON, "", 0],
                      ["n125", "Quarantined", 1, LAT, LON, "", 0]]
        prices = fake.files[f"/api/prices/{CENTRAL}"]
        prices["h"] = ["n124"]
        prices["p"] += [["n124", "spritz", 0, 500, "2026-11-02", 0, 0],
                        ["n125", "negroni", 0, 700, "2026-11-02", 0, 1],
                        ["u12", "spritz", 0, 500, "2026-11-02", 0, 0],
                        ["n999", "spritz", 0, 500, "2026-11-02", 0, 0],
                        ["n123", "spritz", 1, 500, "2026-11-02", 0, 0]]
        prices["u"] = [["u12", "User", 1, LAT, LON]]
        prices["pend"] = [["u13", "Pending", 1, LAT, LON, 2]]
        result = self.run_inventory(fake)
        self.assertTrue(result["complete"])
        city = result["cities"][0]
        self.assertEqual((city["hidden_venues"], city["current_priced_venues"], city["current_price_rows"]), (1, 1, 2))
        self.assertEqual(city["current_priced_venues_by_drink"]["spritz"], 1)
        self.assertEqual(city["current_priced_venues_by_drink"]["negroni"], 0)
        self.assertEqual({v["key"] for v in city["venues"]}, {"n123", "n124", "n125"})

    def test_static_row_city_assignment_not_cell_center_controls_membership(self):
        fake = Fake()
        doc = fake.files[f"/data/20261101/v/{CENTRAL}.json"]
        doc["c"].append([2, "Other town"])
        doc["v"].append(["n124", "Other town pub", 1, LAT, LON, "", 1])
        result = self.run_inventory(fake)
        self.assertTrue(result["complete"])
        self.assertEqual(result["cities"][0]["valid_static_venues"], 1)

    def test_bad_and_duplicate_venue_rows_retain_valid_partial_results(self):
        for bad in (["n124"], ["n124", "Wrong cell", 1, 40.8, 14.2, "", 0],
                    ["n124", "Boolean kind", True, LAT, LON, "", 0], VENUE):
            with self.subTest(bad=bad):
                fake = Fake()
                fake.files[f"/data/20261101/v/{CENTRAL}.json"]["v"].append(bad)
                result = self.run_inventory(fake)
                self.assertFalse(result["complete"])
                self.assertEqual(result["cities"][0]["valid_static_venues"], 1)
                self.assertEqual(result["cities"][0]["current_price_rows"], 1)

    def test_count_mismatch_is_never_complete(self):
        result = self.run_inventory(Fake(expected=2))
        self.assertFalse(result["complete"])
        self.assertFalse(result["cities"][0]["count_matches_places"])

    def test_same_key_in_two_cells_is_incomplete_and_retained_once(self):
        fake = Fake()
        lat = LAT + core.STEP
        cell = core.geohash(lat, LON)
        fake.files[f"/data/20261101/v/{cell}.json"] = {
            "c": [[CITY, "Milano"]], "v": [["n123", "Conflicting pub", 1, lat, LON, "", 0]]}
        fake.files[f"/api/prices/{cell}"] = {"p": [], "h": []}
        result = self.run_inventory(fake)
        self.assertFalse(result["complete"])
        self.assertEqual(result["cities"][0]["valid_static_venues"], 1)
        self.assertTrue(any("duplicate_cross_cell_key" in e["error"] for e in result["cities"][0]["errors"]))

    def test_html_or_failed_cell_is_not_absence_evidence_even_when_count_matches(self):
        for failed in ("<html>app shell</html>", OSError("private detail must not be printed")):
            fake = Fake()
            cell = next(c for c in core.city_cells(LAT, LON)[1] if c != CENTRAL)
            fake.files[f"/data/20261101/v/{cell}.json"] = failed
            result = self.run_inventory(fake)
            self.assertFalse(result["complete"])
            self.assertTrue(result["cities"][0]["count_matches_places"])
            self.assertEqual(result["cities"][0]["current_price_rows"], 1)
            self.assertNotIn("private detail", json.dumps(result))

    def test_price_failure_retains_catalogue_without_claiming_complete(self):
        fake = Fake()
        fake.files[f"/api/prices/{CENTRAL}"] = OSError("failed")
        result = self.run_inventory(fake)
        self.assertFalse(result["complete"])
        self.assertEqual(result["cities"][0]["valid_static_venues"], 1)
        self.assertEqual(result["cities"][0]["current_price_rows"], 0)
        self.assertIsNone(result["cities"][0]["venues"][0]["hidden"])
        self.assertFalse(result["cities"][0]["venues"][0]["price_read_complete"])

    def test_bad_price_row_and_duplicate_price_retain_other_valid_rows(self):
        for row in (["n124"], ["n124", "spritz", 0, 600, "2026-02-30", 0, 0],
                    ["n123", "spritz", 0, 600, "2026-11-02", 0, 0]):
            fake = Fake()
            fake.files[f"/api/prices/{CENTRAL}"]["p"].append(row)
            result = self.run_inventory(fake)
            self.assertFalse(result["complete"])
            self.assertEqual(result["cities"][0]["current_price_rows"], 1)

    def test_version_drift_or_invalid_final_health_retains_partial_counts(self):
        for end in ("20261102", "bad", None):
            fake = Fake()
            fake.end_version = end
            result = self.run_inventory(fake)
            self.assertFalse(result["complete"])
            self.assertFalse(result["cities"][0]["complete"])
            self.assertEqual(result["cities"][0]["current_priced_venues"], 1)

    def test_bad_initial_health_or_places_fails_closed(self):
        fake = Fake()
        fake.files["/data/20261101/places.json"] = [[CITY, "Bad", float("nan"), LON, 1]]
        self.assertFalse(self.run_inventory(fake)["complete"])
        self.assertFalse(core.inventory([CITY], lambda _: {"data_version": "../../x"})["complete"])
        for ids in ([], [CITY, CITY], [True], [1, 2, 3, 4, 5]):
            with self.assertRaises(core.Invalid):
                core.inventory(ids, lambda _: self.fail("must not fetch"))


class TransportTests(unittest.TestCase):
    def test_cli_json_survives_a_windows_legacy_stdout_encoding(self):
        payload = {"complete": False, "cities": [{"name": "Bār 🍸"}]}
        raw = io.BytesIO()
        output = io.TextIOWrapper(raw, encoding="cp1252")
        with patch.object(core, "inventory", return_value=payload), \
                patch("sys.argv", ["inventory_city_prices.py"]), patch("sys.stdout", output):
            self.assertEqual(core.main(), 1)
        output.flush()
        self.assertEqual(json.loads(raw.getvalue().decode("ascii")), payload)

    def test_allowlist_and_redirect_refusal(self):
        self.assertTrue(core.allowed_url(core.ORIGIN + "/api/health"))
        self.assertIsNone(core.NoRedirect().redirect_request(None, None, None, None, None, None))
        for url in ("http://www.dovebevo.com/api/health", "https://dovebevo.com/api/health",
                    "https://www.dovebevo.com:443/api/health", "https://u:p@www.dovebevo.com/api/health",
                    core.ORIGIN + "/api/admin/coverage", core.ORIGIN + "/api/health?auth=x",
                    core.ORIGIN + "/api/health#x", "https://127.0.0.1/api/health"):
            with self.subTest(url=url), self.assertRaises(core.Invalid):
                core.public_json(url)
        for url in ("\n" + core.ORIGIN + "/api/health", core.ORIGIN + "/api/hea\tlth"):
            self.assertFalse(core.allowed_url(url))

    def test_body_content_type_redirect_and_json_limits(self):
        class Response:
            status = 200
            body = b'{"data_version":"20261101"}'
            mime = "application/json"
            url = core.ORIGIN + "/api/health"

            def __enter__(self):
                return self

            def __exit__(self, *args):
                pass

            def geturl(self):
                return self.url

            @property
            def headers(self):
                header = Message()
                header["Content-Type"] = self.mime
                return header

            def read(self, maximum):
                self.requested_limit = maximum
                return self.body[:maximum]

        response = Response()
        class Opener:
            def open(self, request, timeout):
                self.request = request
                self.timeout = timeout
                return response
        opener = Opener()
        with patch.object(core, "build_opener", return_value=opener):
            self.assertEqual(core.public_json(response.url), {"data_version": "20261101"})
            self.assertEqual(opener.request.get_method(), "GET")
            self.assertEqual(opener.request.get_header("User-agent"), "DoveBevoMenuAudit/1")
            self.assertEqual(opener.timeout, core.TIMEOUT)
            self.assertEqual(response.requested_limit, core.LIMIT + 1)
            self.assertNotIn("Authorization", opener.request.headers)
            for attr, value in (("mime", "text/html"), ("status", 302),
                                ("url", "https://example.com/"), ("body", b"x" * (core.LIMIT + 1)),
                                ("body", b'{"x":1,"x":2}'), ("body", b'{"x":NaN}')):
                old = getattr(response, attr)
                setattr(response, attr, value)
                with self.subTest(attr=attr, value=str(value)[:40]), self.assertRaises((core.Invalid, ValueError)):
                    core.public_json(core.ORIGIN + "/api/health")
                setattr(response, attr, old)

    def test_only_exact_published_empty_cell_shell_means_no_venues(self):
        shell = (b'<!doctype html>\n<html lang="it"><head><title>Dove bevo</title>'
                 b'<script type="module" crossorigin src="/assets/index-test.js"></script>'
                 b'</head><body><div id="app"></div></body></html>')
        cell = core.ORIGIN + "/data/20261108/v/u0n6j.json"

        class Response:
            status = 200

            def __init__(self, url, body):
                self.url = url
                self.body = body

            def __enter__(self): return self
            def __exit__(self, *args): pass
            def geturl(self): return self.url
            def read(self, maximum): return self.body[:maximum]

            @property
            def headers(self):
                header = Message()
                header["Content-Type"] = "text/html; charset=utf-8"
                return header

        class Opener:
            body = shell
            control = shell

            def open(self, request, timeout):
                body = self.control if request.full_url.endswith("/v/zzzzz.json") else self.body
                return Response(request.full_url, body)

        opener = Opener()
        core.empty_cell_shell.cache_clear()
        with patch.object(core, "build_opener", return_value=opener):
            self.assertEqual(core.public_json(cell), {"c": [], "v": []})
            for path in ("/api/health", "/api/prices/u0n6j",
                         "/data/20261108/places.json"):
                with self.subTest(path=path), self.assertRaisesRegex(core.Invalid, "non_json_response"):
                    core.public_json(core.ORIGIN + path)
            for body in (b'<html lang="it"><title>Dove bevo</title></html>',
                         b'<!doctype html><html lang="it"><title>Service error</title></html>',
                         b'<!doctype html><html lang="en"><title>Dove bevo</title></html>',
                         shell.replace(b'</body>', b'<p>Service error</p></body>')):
                opener.body = body
                with self.subTest(body=body), self.assertRaisesRegex(core.Invalid, "non_json_response"):
                    core.public_json(cell)
            opener.body = shell + b" " * (core.LIMIT + 1)
            with self.assertRaisesRegex(core.Invalid, "body_limit"):
                core.public_json(cell)
            opener.body = shell
            opener.control = shell.replace(b'</body>', b'<p>Service error</p></body>')
            core.empty_cell_shell.cache_clear()
            with self.assertRaisesRegex(core.Invalid, "non_json_response"):
                core.public_json(cell)
        core.empty_cell_shell.cache_clear()


if __name__ == "__main__":
    unittest.main()
