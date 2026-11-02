import copy
import hashlib
import json
import unittest
import test_live_import as base

m = base.m

class NoGoogleTests(unittest.TestCase):
    def setUp(self):
        helper = base.Tests()
        helper.setUp()
        self.f, self.record, self.doc = helper.f, helper.record, helper.doc
        self.doc["schema_version"] = 4
        self.record.pop("google_reviews")
        self.record.pop("google_url")
        self.record.update(source_format="raw", currency="EUR", menu_item="Spritz EUR 8",
                           serving_note="Cocktail; volume not stated", conditions="none")
    def tearDown(self): self.f.db.close()
    def raw(self): return json.dumps(self.doc).encode()
    def run_import(self, apply=False):
        raw = self.raw()
        return m.run(raw, self.f, apply, hashlib.sha256(raw).hexdigest() if apply else None)

    def test_no_google_record_audits_inserts_and_reruns_without_overwrite(self):
        audit = self.run_import()
        self.assertEqual(audit["records"][0]["outcome"], "eligible_at_read")
        self.assertEqual(self.f.db.execute("SELECT COUNT(*) FROM prices_current").fetchone()[0], 0)
        apply = self.run_import(True)
        self.assertTrue(apply["complete"])
        self.assertEqual(apply["records"][0]["outcome"], "inserted")
        row = self.f.db.execute("SELECT price_cents, confirmations, status, source FROM prices_current").fetchone()
        self.assertEqual(tuple(row), (800, 0, "active", "manual"))
        self.assertEqual(self.run_import(True)["records"][0]["outcome"], "skipped_existing_or_guarded")

    def test_html_text_is_explicit_and_real_price_change_fails_before_database(self):
        self.f.menu = b"<p>Spritz EUR 8</p>"
        self.record["source_format"] = "html_text_v1"
        self.record["source_sha256"] = m.source_digest(self.f.menu, "html_text_v1")
        self.assertEqual(self.run_import()["records"][0]["outcome"], "eligible_at_read")
        self.f.queries.clear()
        self.f.menu = b"<p>Spritz EUR 9</p>"
        with self.assertRaises(m.Error): self.run_import(True)
        self.assertEqual(self.f.queries, [])

    def test_rejects_google_placeholders_conditional_or_incomplete_context(self):
        original = copy.deepcopy(self.record)
        for field, value in (("google_reviews", 0), ("google_reviews", 101),
                             ("google_url", "https://www.google.com/maps/place/example"),
                             ("currency", "GBP"), ("hh", 1), ("conditions", "EUR 2 service"),
                             ("menu_item", ""), ("serving_note", ""), ("source_format", "browser")):
            with self.subTest(field=field, value=value):
                self.record.clear(); self.record.update(original); self.record[field] = value
                with self.assertRaises(m.Error): self.run_import()
        self.record.clear(); self.record.update(original)
        for field in ("currency", "menu_item", "serving_note", "conditions", "source_format"):
            with self.subTest(missing=field):
                self.record.clear(); self.record.update(original); self.record.pop(field)
                with self.assertRaises(m.Error): self.run_import()
        self.assertEqual(self.f.queries, [])

    def test_duplicate_and_oversized_batches_are_rejected(self):
        self.doc["records"] = [self.record, copy.deepcopy(self.record)]
        with self.assertRaises(m.Error): m.validate(self.raw())
        self.doc["records"] = [dict(self.record, venue_key=f"n{number+1}") for number in range(200)]
        self.assertEqual(len(m.validate(self.raw())["records"]), 200)
        self.doc["records"].append(dict(self.record, venue_key="n201"))
        with self.assertRaises(m.Error): m.validate(self.raw())

    def test_every_legacy_status_history_report_and_hidden_guard_remains_atomic(self):
        base.Tests.test_all_existing_statuses_history_reports_and_hidden_block(self)

    def test_new_customer_price_after_audit_is_never_overwritten(self):
        self.assertEqual(self.run_import()["records"][0]["outcome"], "eligible_at_read")
        self.f.race = True
        result = self.run_import(True)
        self.assertEqual(result["records"][0]["outcome"], "skipped_existing_or_guarded")
        row = self.f.db.execute("SELECT price_cents,confirmations,status FROM prices_current").fetchone()
        self.assertEqual(tuple(row), (999, 7, "review"))

    def test_bad_version_hash_or_approval_stops_before_queries(self):
        base.Tests.test_version_hash_and_approval_block_before_database(self)

    def test_historical_manifests_keep_review_requirements(self):
        old = base.Tests(); old.setUp()
        try:
            for version in (1, 2):
                old.doc["schema_version"] = version
                if version == 2: old.record["source_format"] = "raw"
                old.record["google_reviews"] = 100
                with self.assertRaises(m.Error): m.validate(old.raw())
                old.record["google_reviews"] = 101
                self.assertEqual(m.validate(old.raw())["schema_version"], version)
        finally: old.tearDown()
