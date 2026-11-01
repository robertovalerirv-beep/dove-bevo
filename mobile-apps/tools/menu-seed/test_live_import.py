import copy
import datetime
import hashlib
import importlib.util
import json
from pathlib import Path
import sqlite3
import unittest

SPEC = importlib.util.spec_from_file_location("live_import", Path(__file__).with_name("live_import.py"))
m = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(m)

class Fake:
    def __init__(self):
        self.db = sqlite3.connect(":memory:")
        self.db.row_factory = sqlite3.Row
        self.db.executescript("""
        CREATE TABLE prices_current(venue_key TEXT, drink TEXT, hh INTEGER, cell TEXT, city INTEGER, price_cents INTEGER, observed_on TEXT, confirmations INTEGER, status TEXT, source TEXT, PRIMARY KEY(venue_key,drink,hh));
        CREATE TABLE price_obs(venue_key TEXT,drink TEXT,hh INTEGER,price_cents INTEGER,observed_on TEXT,source TEXT,status TEXT);
        CREATE TABLE reports(venue_key TEXT,drink TEXT,hh INTEGER);
        CREATE TABLE venues_hidden(venue_key TEXT PRIMARY KEY);
        CREATE TABLE cell_snapshot(cell TEXT PRIMARY KEY,v INTEGER,at INTEGER,body TEXT);
        """)
        self.menu = b"synthetic menu"
        self.cell = m.geo(41.9, 12.5)
        self.fail_cache = False
        self.race = False
        self.queries = []
        self.version = "20261024"
    def fetch(self, url, maximum=0):
        if url == m.SITE + "/api/health": return json.dumps({"status": "ok", "data_version": self.version}).encode()
        if url.startswith(m.SITE + "/data/"): return json.dumps({"c": [[123, "Roma"]], "v": [["n123", "Example", 1, 41.9, 12.5, "", 0]]}).encode()
        return self.menu
    def query(self, sql, params):
        self.queries.append(sql)
        if sql == m.INVALIDATE and self.fail_cache: raise m.Error("injected")
        if sql == m.INSERT and self.race:
            self.db.execute("INSERT INTO prices_current VALUES ('n123','spritz',0,?,123,999,'2026-10-20',7,'review','manual')", [self.cell])
        cur = self.db.execute(sql, params)
        return [dict(row) for row in cur.fetchall()]

class Tests(unittest.TestCase):
    def setUp(self):
        self.f = Fake()
        self.record = {"venue_key":"n123", "name":"Example", "cell":self.f.cell, "city":123, "lat":41.9,"lon":12.5, "drink":"spritz", "hh":0, "cents":800, "source_url":"https://example.com/menu", "source_sha256":hashlib.sha256(self.f.menu).hexdigest(), "google_reviews":101, "google_url":"https://www.google.com/maps/place/example", "identity_note":"Official site and primary Google location reviewed"}
        self.doc = {"schema_version":1,"batch_id":"synthetic", "checked_on":datetime.date.today().isoformat(), "data_version":"20261024", "records":[self.record]}
    def tearDown(self): self.f.db.close()
    def raw(self): return json.dumps(self.doc).encode()
    def run_import(self, apply=False):
        raw = self.raw()
        return m.run(raw, self.f, apply, hashlib.sha256(raw).hexdigest() if apply else None)
    def test_dry_run_is_read_only(self):
        result = self.run_import()
        self.assertEqual(result["records"][0]["outcome"], "eligible_at_read")
        self.assertTrue(all(q in (m.CURRENT, m.PRESENCE) for q in self.f.queries))
    def test_insert_idempotent_and_cache_retry(self):
        first = self.run_import(True)
        self.assertEqual(first["records"][0]["outcome"], "inserted")
        row = self.f.db.execute("SELECT * FROM prices_current").fetchone()
        self.assertEqual((row["confirmations"], row["source"], row["status"]), (0, "manual", "active"))
        second = self.run_import(True)
        self.assertEqual(second["records"][0]["outcome"], "skipped_existing_or_guarded")
        self.assertEqual(second["cache_invalidated"], [self.f.cell])
        self.assertEqual(self.f.db.execute("SELECT v FROM cell_snapshot").fetchone()[0], 2)
        self.assertEqual(self.f.db.execute("SELECT COUNT(*) FROM price_obs").fetchone()[0], 0)
    def test_all_existing_statuses_history_reports_and_hidden_block(self):
        for condition in ("active", "quarantined", "review", "removed", "history", "reports", "hidden"):
            with self.subTest(condition=condition):
                self.f.db.close()
                self.setUp()
                if condition in ("active", "quarantined", "review", "removed"):
                    self.f.db.execute("INSERT INTO prices_current VALUES ('n123','spritz',0,?,123,999,'2026-10-20',7,?,'manual')", [self.f.cell, condition])
                elif condition == "history": self.f.db.execute("INSERT INTO price_obs VALUES ('n123','spritz',0,999,'2026-10-20','manual','removed')")
                elif condition == "reports": self.f.db.execute("INSERT INTO reports VALUES ('n123',NULL,NULL)")
                else: self.f.db.execute("INSERT INTO venues_hidden VALUES ('n123')")
                result = self.run_import(True)
                self.assertEqual(result["records"][0]["outcome"], "skipped_existing_or_guarded")
                self.assertEqual(result["cache_invalidated"], [])
                rows = self.f.db.execute("SELECT confirmations,status,price_cents FROM prices_current").fetchall()
                if rows: self.assertEqual(tuple(rows[0]), (7, condition, 999))
    def test_race_guard_preserves_customer(self):
        self.f.race = True
        result = self.run_import(True)
        self.assertEqual(result["records"][0]["outcome"], "skipped_existing_or_guarded")
        self.assertEqual(tuple(self.f.db.execute("SELECT confirmations,status FROM prices_current").fetchone()), (7,"review"))
    def test_cache_failure_incomplete_then_retry(self):
        self.f.fail_cache = True
        self.assertFalse(self.run_import(True)["complete"])
        self.f.fail_cache = False
        retry = self.run_import(True)
        self.assertTrue(retry["complete"])
        self.assertEqual(retry["cache_invalidated"], [self.f.cell])
        self.assertEqual(retry["records"][0]["outcome"], "skipped_existing_or_guarded")
    def test_invalid_and_duplicate_records_rejected(self):
        for field, value in (("venue_key","n001"),("cents",True),("hh",2),("google_reviews",100),("source_sha256","bad"),("cell","abcde"),("lat",float('nan')),("source_url","http://example.com")):
            with self.subTest(field=field):
                old = self.record[field]
                self.record[field] = value
                with self.assertRaises(m.Error): self.run_import()
                self.record[field] = old
        self.doc["records"] = [self.record] * 201
        with self.assertRaises(m.Error): self.run_import()
        self.doc["records"] = [self.record, copy.deepcopy(self.record)]
        with self.assertRaises(m.Error): self.run_import()
    def test_version_hash_and_approval_block_before_database(self):
        self.f.version = "20261025"
        with self.assertRaises(m.Error): self.run_import(True)
        self.f.version = "20261024"
        self.record["source_sha256"] = "0" * 64
        with self.assertRaises(m.Error): self.run_import(True)
        with self.assertRaises(m.Error): m.run(self.raw(), self.f, True, "0" * 64)
        self.assertEqual(self.f.queries, [])
    def test_only_allowed_mutations_and_schema_unchanged(self):
        before = self.f.db.execute("SELECT sql FROM sqlite_master WHERE type='table' ORDER BY name").fetchall()
        self.run_import(True)
        after = self.f.db.execute("SELECT sql FROM sqlite_master WHERE type='table' ORDER BY name").fetchall()
        self.assertEqual([tuple(x) for x in before], [tuple(x) for x in after])
        self.assertTrue(all(q in (m.PRESENCE,m.CURRENT,m.INSERT,m.INVALIDATE) for q in self.f.queries))

if __name__ == "__main__": unittest.main()
