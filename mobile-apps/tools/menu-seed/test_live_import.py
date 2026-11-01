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
        self.lost_insert_response = False
        self.queries = []
        self.version = "20261024"
    def fetch(self, url, maximum=0):
        if url == m.SITE + "/api/health": return json.dumps({"status": "ok", "data_version": self.version}).encode()
        if url.startswith(m.SITE + "/data/"): return json.dumps({"c": [[123, "Roma"]], "v": [["n123", "Example", 1, 41.9, 12.5, "", 0]]}).encode()
        return self.menu
    def attest_binding(self):
        return {"domain":"www.dovebevo.com", "worker":"dovebevo-staging", "database":m.DATABASE, "binding":"DB", "name":"dovebevo-staging", "environment":"production", "verified":True}
    def query(self, sql, params):
        self.queries.append(sql)
        if sql == m.INVALIDATE and self.fail_cache: raise m.Error("injected")
        if sql == m.INSERT and self.race:
            self.db.execute("INSERT INTO prices_current VALUES ('n123','spritz',0,?,123,999,'2026-10-20',7,'review','manual')", [self.cell])
        cur = self.db.execute(sql, params)
        rows = [dict(row) for row in cur.fetchall()]
        if sql == m.INSERT and self.lost_insert_response:
            self.db.commit()
            raise m.Error("response lost after commit")
        return rows

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
    def test_insert_response_lost_is_indeterminate_and_cache_attempted(self):
        for cache_fails in (False, True):
            with self.subTest(cache_fails=cache_fails):
                self.f.db.close()
                self.setUp()
                self.f.lost_insert_response = True
                self.f.fail_cache = cache_fails
                receipt = self.run_import(True)
                self.assertFalse(receipt["complete"])
                self.assertEqual(receipt["records"][0]["outcome"], "indeterminate")
                self.assertEqual(self.f.db.execute("SELECT COUNT(*) FROM prices_current").fetchone()[0], 1)
                self.assertEqual(receipt["cache_invalidated"], [] if cache_fails else [self.f.cell])
                self.assertEqual("cache_invalidation_failed" in receipt["errors"], cache_fails)

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

    def use_text_source(self, source):
        self.doc["schema_version"] = 2
        self.record["source_format"] = "html_text_v1"
        self.f.menu = source
        self.record["source_sha256"] = hashlib.sha256(b"Negroni EUR 8 & soda").hexdigest()

    def test_html_text_pin_ignores_only_nontext_wrapper_changes(self):
        self.use_text_source(b'<html><style>.menu{color:red}</style><body><p class="old">Negroni EUR 8 &amp; soda</p><!-- nonce1 --><script>nonce1</script></body></html>')
        self.f.menu = b'<html><style>.menu{color:blue}</style><body data-request="nonce2"><p id="new">  Negroni\nEUR 8 &#38; soda </p><!-- nonce2 --><script>nonce2</script></body></html>'
        self.assertTrue(self.run_import()["complete"])
        self.assertTrue(all(q in (m.CURRENT, m.PRESENCE) for q in self.f.queries))

    def test_html_text_price_change_rejects_before_provider_or_database(self):
        self.use_text_source(b"<p>Negroni EUR 8 &amp; soda</p>")
        self.f.menu = b"<p>Negroni EUR 9 &amp; soda</p>"
        def unexpected_attestation(): self.fail("Source pin must precede provider access")
        self.f.attest_binding = unexpected_attestation
        with self.assertRaises(m.Error): self.run_import(True)
        self.assertEqual(self.f.queries, [])

    def test_source_formats_are_explicit_and_version_one_stays_raw(self):
        self.f.menu = b"<p>Negroni EUR 8 &amp; soda</p>"
        self.record["source_sha256"] = hashlib.sha256(b"Negroni EUR 8 & soda").hexdigest()
        with self.assertRaises(m.Error): self.run_import()
        self.record["source_format"] = "html_text_v1"
        with self.assertRaises(m.Error): self.run_import()  # Extra field is invalid in version1.
        self.doc["schema_version"] = 2
        for value in (None, "html", "RAW", True):
            self.record["source_format"] = value
            with self.assertRaises(m.Error): self.run_import()
        del self.record["source_format"]
        with self.assertRaises(m.Error): self.run_import()
        self.record["source_format"] = "raw"
        self.record["source_sha256"] = hashlib.sha256(self.f.menu).hexdigest()
        self.assertTrue(self.run_import()["complete"])

    def test_html_text_rejects_empty_bad_encoding_and_size_limits(self):
        for source in (b"<style>x</style><script>x</script><!-- no text -->", b"\xff<p>bad</p>",
                       b"x" * (8 * 1024 * 1024 + 1),
                       ("<p>" + "x" * (1024 * 1024 + 1) + "</p>").encode(),
                       ("<p>" + "\u20ac" * (400 * 1024) + "</p>").encode()):
            with self.subTest(length=len(source)):
                self.use_text_source(source)
                with self.assertRaises(m.Error): self.run_import()
                self.assertEqual(self.f.queries, [])

    def test_same_source_url_with_distinct_formats_checks_each_digest(self):
        self.use_text_source(b"<p>Negroni EUR 8 &amp; soda</p>")
        raw_record = copy.deepcopy(self.record)
        raw_record.update(drink="negroni", source_format="raw",
                          source_sha256=hashlib.sha256(self.f.menu).hexdigest())
        self.doc["records"].append(raw_record)
        self.assertEqual(len(self.run_import()["records"]), 2)
        self.f.queries.clear()
        raw_record["source_sha256"] = self.record["source_sha256"]
        with self.assertRaises(m.Error): self.run_import()
        self.assertEqual(self.f.queries, [])
    def test_provider_binding_fails_closed_and_excludes_secret_fields(self):
        settings = {"bindings": [{"name":"DB", "type":"d1", "id":m.DATABASE}, {"name":"SECRET", "value":"must-not-appear"}]}
        domains = [{"hostname":"www.dovebevo.com", "service":"dovebevo-staging", "environment":"production"}]
        database = {"uuid":m.DATABASE, "name":"dovebevo-staging"}
        def make_transport(settings_value, domains_value, database_value):
            t = m.Transport("a" * 32, "synthetic-token")
            values = iter((settings_value, domains_value, database_value))
            t.provider_get = lambda path: next(values)
            return t
        expected = make_transport(settings, domains, database).attest_binding()
        self.assertTrue(expected["verified"])
        self.assertNotIn("must-not-appear", json.dumps(expected))
        bad_settings = {"bindings": [{"name":"DB", "type":"d1", "id":"wrong"}]}
        bad_domains = [{"hostname":"www.dovebevo.com", "service":"wrong"}]
        disabled = [{"hostname":"www.dovebevo.com", "service":"dovebevo-staging", "environment":"production", "enabled":False}]
        bad_database = {"uuid":m.DATABASE, "name":"wrong"}
        preview = [{"hostname":"www.dovebevo.com", "service":"dovebevo-staging", "environment":"preview"}]
        missing_environment = [{"hostname":"www.dovebevo.com", "service":"dovebevo-staging"}]
        for s, d, b in ((bad_settings, domains, database), (settings, bad_domains, database),
                        (settings, disabled, database), (settings, preview, database), (settings, missing_environment, database), (settings, domains, bad_database)):
            with self.subTest(settings=s, domains=d, database=b):
                self.f.attest_binding = make_transport(s,d,b).attest_binding
                with self.assertRaises(m.Error): self.run_import(True)
                self.assertEqual(self.f.queries, [])
        self.f.attest_binding = lambda: {"verified": False}
        with self.assertRaises(m.Error): self.run_import(True)
        self.assertEqual(self.f.queries, [])

    def test_real_provider_http_json_path_is_bounded_and_redacted(self):
        class Response:
            def __init__(self, value): self.value = json.dumps(value).encode()
            def __enter__(self): return self
            def __exit__(self, *_): pass
            def read(self, limit): return self.value[:limit]
        class Opener:
            def __init__(self, values): self.values, self.urls = iter(values), []
            def open(self, request, timeout):
                self.urls.append(request.full_url)
                return Response(next(self.values))
        entries = [
            {"success": True, "result": {"bindings":[{"name":"DB", "type":"d1", "id":m.DATABASE}, {"name":"SECRET", "value":"private-value"}]}},
            {"success": True, "result": [{"hostname":"www.dovebevo.com", "service":"dovebevo-staging", "environment":"production"}]},
            {"success": True, "result": {"uuid":m.DATABASE, "name":"dovebevo-staging"}},
        ]
        transport = m.Transport("a" * 32, "token-value")
        transport.opener = Opener(entries)
        attestation = transport.attest_binding()
        self.assertNotIn("private-value", json.dumps(attestation))
        self.assertNotIn("token-value", json.dumps(attestation))
        self.assertTrue(transport.opener.urls[0].endswith("/workers/scripts/dovebevo-staging/settings"))
        self.assertTrue(transport.opener.urls[1].endswith("/workers/domains?hostname=www.dovebevo.com&service=dovebevo-staging"))
        self.assertTrue(transport.opener.urls[2].endswith("/d1/database/" + m.DATABASE + "?fields=uuid,name"))
        transport.opener = Opener([{"success":False, "errors":[{"message":"private-value"}]}])
        with self.assertRaises(m.Error) as error: transport.attest_binding()
        self.assertNotIn("private-value", str(error.exception))

    def test_denied_binding_read_blocks_all_database_queries(self):
        def denied(): raise m.Error("denied")
        self.f.attest_binding = denied
        with self.assertRaises(m.Error): self.run_import(True)
        self.assertEqual(self.f.queries, [])

    def test_only_allowed_mutations_and_schema_unchanged(self):
        before = self.f.db.execute("SELECT sql FROM sqlite_master WHERE type='table' ORDER BY name").fetchall()
        self.run_import(True)
        after = self.f.db.execute("SELECT sql FROM sqlite_master WHERE type='table' ORDER BY name").fetchall()
        self.assertEqual([tuple(x) for x in before], [tuple(x) for x in after])
        self.assertTrue(all(q in (m.PRESENCE,m.CURRENT,m.INSERT,m.INVALIDATE) for q in self.f.queries))

if __name__ == "__main__": unittest.main()
