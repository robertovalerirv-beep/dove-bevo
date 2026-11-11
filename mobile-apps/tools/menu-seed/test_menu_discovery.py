"""Offline tests for bounded, read-only one-off menu discovery."""
import copy
from datetime import date
import io
import json
import unittest
from unittest.mock import patch
import discover_menu_links as d
import crawl_owner_menu_candidates as crawler

class DiscoveryTests(unittest.TestCase):
    def row(self, key="n1", city=62505581):
        return dict(key=key, name="Bar Uno", kind=1, lat=45.45, lon=9.18, address="Via Uno 1", cell="u0nd9", cityID=city, city="Milano")
    def node(self, **kw):
        return dict(type="node", id=1, lat=45.450004, lon=9.180004, tags={"name": "BAR  Uno", "website": "https://bar.example/menu"}, **kw)
    def test_link_guards(self):
        for value in ["file:///menu", "javascript:alert(1)", "https://u:p@bar.example/", "https://127.0.0.1/", "http://169.254.169.254/", "https://localhost/", "https://bar.internal/", "https://bar.example:444/", "https://2130706433/", "https://0177.0.0.1/", "https://bar.example/a b", "https://bar.example/\\evil", "https://bar.example/\n"]:
            with self.subTest(value=value), self.assertRaises(ValueError): d.safe_link(value)
        self.assertEqual(d.safe_link("https://bar.example/menu?lang=it#drink"), "https://bar.example/menu?lang=it#drink")
    def test_request_routes(self):
        self.assertTrue(d.request_allowed(d.ORIGIN + "/api/health"))
        self.assertTrue(d.request_allowed(d.ORIGIN + "/data/20261101/v/u0nd9.json"))
        self.assertTrue(d.request_allowed(d.CORE + "/api/0.6/nodes.json?nodes=" + ",".join(str(n) for n in range(1, 101))))
        self.assertTrue(d.request_allowed(d.CORE + "/api/0.6/ways.json?ways=23,24"))
        self.assertTrue(d.request_allowed(d.CORE + "/api/0.6/relations.json?relations=42"))
        self.assertTrue(d.request_allowed(d.ORIGIN + "/data/20261101/places.json"))
        for value in [d.ORIGIN + "/api/health?x=1", d.ORIGIN + "/data/20261101/v/u0nd9.json#x", d.CORE + "/api/0.6/nodes.json?nodes=1&x=1", d.CORE + "/api/0.6/nodes.json?nodes=" + ",".join(str(n) for n in range(1, 102)), d.CORE + "/api/0.6/ways.json?nodes=1", "https://evil.example/api/health", "http://www.dovebevo.com/api/health", "https://www.dovebevo.com:443/api/health", "https://www.dovebevo.com:bad/api/health"]:
            self.assertFalse(d.request_allowed(value), value)
    def test_sampling(self):
        rows = [self.row("n" + str(n)) for n in range(1, 1001)] + [self.row("w9999"), self.row("r8888")]
        got = d.select_rows(rows, 250)
        self.assertEqual(len(got), 250)
        self.assertEqual(len({r["key"] for r in got}), 250)
        self.assertEqual({row["key"] for row in got if row["key"][0] in "wr"}, {"w9999", "r8888"})
        for maximum in [0, 1001, True, 1.5]:
            with self.assertRaises(d.Invalid): d.select_rows(rows, maximum)
        self.assertEqual(d.select_rows([], 25), [])
    def test_catalogue_and_unknown_city(self):
        doc = {"c": [[62505581, "Milano"]], "v": [["n1", "Bar Uno", 1, 45.45, 9.18, "Via Uno 1", 0], ["n2", "Unknown", 0, 45, 9, "", -1]]}
        rows = d.catalogue_rows(doc, "u0nd9")
        self.assertIsNone(rows[1]["cityID"])
        for field, value in [(0, "n0"), (2, True), (2, 5), (3, float("nan")), (4, 181), (6, 1), (6, -2)]:
            bad = copy.deepcopy(doc); bad["v"][0][field] = value
            with self.assertRaises(d.Invalid): d.catalogue_rows(bad, "u0nd9")
        bad = copy.deepcopy(doc); bad["v"].append(bad["v"][0])
        with self.assertRaises(d.Invalid): d.catalogue_rows(bad, "u0nd9")
    def test_identity_and_stripping(self):
        item = self.node(user="editor", uid=123)
        item["tags"].update(phone="private", email="private", menu="yes")
        result = d.joined([self.row()], {"elements": [item]})[0]
        self.assertEqual(result["state"], "candidate")
        self.assertEqual(result["rejected_url_tags"], ["menu"])
        self.assertEqual(set(result["url_tags"]), {"website"})
        packed = json.dumps(result)
        for term in ["editor", "private", "uid", "phone", "email"]:
            self.assertNotIn(term, packed)
    def test_changed_names_and_coordinates(self):
        for change, reason in [({"tags": {"name": "Other"}}, "changed_osm_name"), ({"lat": 45.46}, "changed_osm_coordinates"), ({"lat": None}, "missing_osm_coordinates"), ({"tags": {}}, "missing_osm_name"), ({"visible": False}, "deleted_osm_element")]:
            item = self.node(); item.update(change)
            self.assertEqual(d.joined([self.row()], {"elements": [item]})[0]["reason"], reason)
        self.assertEqual(d.joined([self.row()], {"elements": []})[0]["reason"], "missing_osm_element")
    def test_unexpected_and_duplicate_ids(self):
        for doc in [{"elements": [self.node(), self.node()]}, {"elements": [dict(self.node(), id=2)]}, {"elements": [dict(self.node(), type="way")]}]:
            with self.assertRaises(d.Invalid): d.joined([self.row()], doc)
        with self.assertRaises(d.Invalid): d.joined([self.row(), self.row()], {"elements": []})
    def test_way_and_relation_are_leads_without_verified_geometry(self):
        for prefix, kind in (("w", "way"), ("r", "relation")):
            row = self.row(prefix + "45")
            result = d.joined([row], {"elements": [{"type": kind, "id": 45,
                "tags": {"name": "Bar Uno", "website": "https://bar.example/menu"}}]})[0]
            self.assertEqual(result["state"], "candidate")
            self.assertEqual(result["geometry_state"], "way_or_relation_geometry_not_checked")
            self.assertNotIn("nodes", result)
        self.assertEqual(d.joined([self.row("w45")], {"elements": [{"type": "way", "id": 45,
            "tags": {"name": "Other", "website": "https://bar.example/"}}]})[0]["reason"], "changed_osm_name")
    def fixture(self):
        cell = next(iter(d.CELLS)); cid = d.CELLS[cell]
        return {"c": [[cid, "Milano"], [1, "Neighbour"]], "v": [["n" + str(n), "Bar Uno", 1, 45.45, 9.18, "", 0] for n in range(1, 152)] + [["n999", "Neighbour", 1, 45, 9, "", 1], ["n998", "Unknown", 1, 45, 9, "", -1]]}
    def fake_fetch(self, log, failure=False, turn=False):
        health_calls = []
        def fetch(url):
            log.append(url)
            if url.endswith("/api/health"):
                health_calls.append(1)
                return {"status": "ok", "data_version": "20261102" if turn and len(health_calls) > 1 else "20261101"}
            if "/data/" in url:
                return self.fixture() if "/u0nd9." in url else {"c": [], "v": []}
            if failure: raise TimeoutError("SECRET BODY NEVER OUTPUT")
            ids = url.split("nodes=")[1].split(",")
            return {"elements": [dict(self.node(), id=int(n)) for n in ids]}
        return fetch
    def test_collection_filters_bounds_and_never_fetches_leads(self):
        log, sleeps = [], []
        result = d.collect(151, fetch=self.fake_fetch(log), sleep=sleeps.append)
        self.assertEqual((result["requested"], result["candidates"]), (151, 151))
        self.assertEqual(sleeps, [1.1])
        self.assertTrue(all(d.request_allowed(url) for url in log))
        self.assertFalse(any("bar.example" in url for url in log))
        self.assertEqual(len([url for url in log if "nodes=" in url]), 2)
    def test_failure_stops_requests(self):
        log = []
        result = d.collect(151, fetch=self.fake_fetch(log, failure=True), sleep=lambda _: self.fail("No second batch"))
        self.assertEqual(result["held"], 151)
        self.assertEqual(len([url for url in log if "nodes=" in url]), 1)
        self.assertEqual(result["records"][-1]["reason"], "not_requested_after_batch_failure")
        self.assertNotIn("SECRET", json.dumps(result))
    def test_version_turnover(self):
        with self.assertRaisesRegex(d.Invalid, "catalogue_version_changed"):
            d.collect(1, fetch=self.fake_fetch([], turn=True), sleep=lambda _: None)
    def test_full_city_queue_includes_osm_ways_and_relations(self):
        log = []
        def fetch(url):
            log.append(url)
            if url.endswith("/api/health"):
                return {"status": "ok", "data_version": "20261108"}
            if url.endswith("/places.json"):
                return [[cid, "City", 45.45, 9.18, 3 if cid == d.CELLS["u0nd9"] else 0]
                        for cid in d.CELLS.values()]
            if "/v/" in url:
                cell = url.rsplit("/", 1)[-1][:-5]
                if cell == "u0nd9":
                    return {"c": [[d.CELLS["u0nd9"], "Milano"]], "v": [
                        ["n1", "Bar Uno", 1, 45.45, 9.18, "", 0],
                        ["w2", "Bar Uno", 1, 45.45, 9.18, "", 0],
                        ["r3", "Bar Uno", 1, 45.45, 9.18, "", 0]]}
                return {"c": [], "v": []}
            plural = url.split("/api/0.6/")[1].split(".")[0]
            prefix, kind = {"nodes": ("n", "node"), "ways": ("w", "way"), "relations": ("r", "relation")}[plural]
            return {"elements": [{"type": kind, "id": int(ident), "tags": {
                "name": "Bar Uno", "website": "https://bar.example/menu"},
                **({"lat": 45.45, "lon": 9.18} if prefix == "n" else {})}
                for ident in url.split("=")[1].split(",")]}
        with patch.object(d, "city_cells", return_value=({}, ["u0nd9", "u0nd8"])):
            report = d.collect(1000, fetch=fetch, sleep=lambda _: None, full_city=True)
        self.assertEqual((report["requested"], report["candidates"]), (3, 3))
        self.assertTrue(report["inventory_complete"])
        self.assertEqual(len([url for url in log if "/api/0.6/" in url]), 3)
        raw = json.dumps(d.crawler_queue(report, date(2026, 11, 11))).encode()
        _, candidates = crawler.queue_rows(raw)
        self.assertEqual({row["key"] for row in candidates}, {"n1", "w2", "r3"})
        self.assertTrue(all(row["state"] == "candidate" for row in candidates))
    def test_json_transport(self):
        class Response(io.BytesIO):
            status = 200
            headers = {"Content-Type": "application/json"}
        class Opener:
            def __init__(self, response): self.response = response
            def open(self, request, timeout):
                self.request, self.timeout = request, timeout
                return self.response
        for raw in [b'{"a":1,"a":2}', b'{"a":NaN}']:
            with patch.object(d, "build_opener", return_value=Opener(Response(raw))), self.assertRaises(d.Invalid):
                d.get_json(d.ORIGIN + "/api/health")
        response = Response(b"{}"); response.headers = {"Content-Type": "application/json", "Content-Length": str(d.LIMIT + 1)}
        with patch.object(d, "build_opener", return_value=Opener(response)), self.assertRaises(d.Invalid): d.get_json(d.ORIGIN + "/api/health")
        response = Response(b" " * (d.LIMIT + 1))
        with patch.object(d, "build_opener", return_value=Opener(response)), self.assertRaises(d.Invalid): d.get_json(d.ORIGIN + "/api/health")
        response = Response(b'<!doctype html>\n<html lang="it"><title>Dove bevo</title></html>')
        response.headers = {"Content-Type": "text/html"}
        with patch.object(d, "build_opener", return_value=Opener(response)):
            self.assertEqual(d.get_json(d.ORIGIN + "/data/20261108/v/u0nd9.json"), {"c": [], "v": []})
        response = Response(b"<html><title>Service Error</title></html>")
        response.headers = {"Content-Type": "text/html"}
        with patch.object(d, "build_opener", return_value=Opener(response)), self.assertRaisesRegex(d.Invalid, "not_json"):
            d.get_json(d.ORIGIN + "/data/20261108/v/u0nd9.json")
        self.assertIsNone(d.NoRedirect().redirect_request(None, None, 302, "", {}, "https://evil.example/"))

if __name__ == "__main__": unittest.main()
