"""Behavioral acceptance tests using only synthetic, local evidence."""

import ast
import contextlib
import copy
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import shutil
import socket
import tempfile
import unittest
from unittest import mock

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("menu_evidence_planner", HERE / "planner.py")
planner = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(planner)
OWNED_TEMP = HERE.parents[2] / ".task-tmp" / "menu-seed-tests"


class PlannerAcceptanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        OWNED_TEMP.mkdir(parents=True, exist_ok=True)
        planner.no_link(OWNED_TEMP)

    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix="case-", dir=OWNED_TEMP))
        self.cell = planner.geohash5(41.9, 12.5)
        self.doc = {
            "schema_version": 1, "batch_id": "local-acceptance", "as_of": "2026-10-30",
            "catalogue": {"data_version": "20261028", "cells": []},
            "sources": [], "candidates": [{
                "id": "candidate-1",
                "venue": {"cell": self.cell, "key": "n123", "name": "Caffe Esempio",
                          "address": "Via Roma 10", "identity_source_id": "menu",
                          "identity_excerpts": ["Caffe Esempio", "Via Roma 10"]},
                "review": {"kind": "google_visible", "source_id": "google",
                           "excerpt": "Caffe Esempio | Via Roma 10 | 101 reviews", "count": 101},
                "prices": [{"id": "row-1", "drink": "negroni", "cents": 800,
                            "currency": "EUR", "hh": 0, "item": "Negroni", "serving": "single",
                            "context": "", "source_id": "menu", "excerpt": "Negroni €8.00",
                            "amount_literal": "€8.00", "hh_excerpt": None}],
            }],
        }
        self.add_source("menu", "<html><body><h1>Caffe Esempio</h1><p>Via Roma 10</p>"
                        "<p>Negroni €8.00</p></body></html>")
        self.add_source("google", "Caffe Esempio | Via Roma 10 | 101 reviews",
                        "text/plain", "https://www.google.com/maps/place/Caffe-Esempio")
        self.set_catalogue()

    def tearDown(self):
        # Recursive cleanup is confined to this exact test-owned child. Do not
        # remove the shared .task-tmp parent, evidence, or production files.
        target = self.root.resolve(strict=True)
        owner = OWNED_TEMP.resolve(strict=True)
        self.assertTrue(target.is_relative_to(owner))
        self.assertEqual(target.parent, owner)
        self.assertNotEqual(target, owner)
        planner.no_link(self.root)
        shutil.rmtree(target)

    def pin(self, path, raw):
        (self.root / path).write_bytes(raw)
        return {"path": path, "sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw)}

    def add_source(self, identifier, text, media_type="text/html", url="https://example.com/menu"):
        suffix = ".html" if media_type == "text/html" else ".txt"
        spec = {"id": identifier, **self.pin(identifier + suffix, text.encode("utf-8")),
                "url": url, "media_type": media_type,
                "representation": "browser_visible_text" if media_type == "text/plain" else "raw_http",
                "checked_on": "2026-10-29", "published_on": None, "published_excerpt": None}
        self.doc["sources"] = [source for source in self.doc["sources"] if source["id"] != identifier] + [spec]
        return spec

    def set_catalogue(self, **changes):
        venue = {"key": "n123", "name": "Caffe Esempio", "kind": 1, "lat": 41.9,
                 "lon": 12.5, "address": "Via Roma 10", "city": 0}
        venue.update(changes)
        raw = {"c": [[123, "Roma"]], "v": [[venue[field] for field in
               ("key", "name", "kind", "lat", "lon", "address", "city")]]}
        self.doc["catalogue"]["cells"] = [{"cell": self.cell,
                                            **self.pin("cell.json", planner.canonical(raw))}]

    def run_plan(self):
        return planner.plan(self.doc, self.root)

    def row(self):
        return self.doc["candidates"][0]["prices"][0]

    def reasons(self):
        return self.run_plan()["rows"][0]["hold_reasons"]

    def replace_price(self, text, **changes):
        self.add_source("menu", "<h1>Caffe Esempio</h1><p>Via Roma 10</p><p>" + text + "</p>")
        self.row().update({"excerpt": text, **changes})

    def test_qualified_evidence_still_cannot_publish_or_import(self):
        report = self.run_plan()
        self.assertEqual(report["summary"], {"candidates": 1, "rows": 1, "evidence_qualified": 1, "held": 0})
        self.assertIs(report["publication_blocked"], True)
        self.assertEqual(report["public_imports"], 0)
        self.assertIn("live_customer_price_history_removed_and_moderation_preservation_not_proven", report["publication_blockers"])
        self.assertIn("current_written_backend_boundary_does_not_authorize_menu_price_import", report["publication_blockers"])

    def test_google_count_100_fails_and_101_passes(self):
        review = self.doc["candidates"][0]["review"]
        for count, held in ((100, True), (101, False)):
            with self.subTest(count=count):
                text = f"Caffe Esempio | Via Roma 10 | {count} reviews"
                self.add_source("google", text, "text/plain", "https://www.google.com/maps/place/Caffe-Esempio")
                review.update(count=count, excerpt=text)
                self.assertEqual(bool(self.reasons()), held)

    def test_publisher_claim_and_wrong_google_venue_stay_held(self):
        candidate = self.doc["candidates"][0]
        candidate["review"]["kind"] = "publisher_claim"
        self.assertIn("first_party_or_unverified_review_count_is_not_direct_google_evidence", self.reasons())
        candidate["review"]["kind"] = "google_visible"
        text = "Another Bar | Via Roma 10 | 101 reviews"
        candidate["review"]["excerpt"] = text
        self.add_source("google", text, "text/plain", "https://www.google.com/maps/place/Another-Bar")
        self.assertIn("google_review_venue_name_not_evidenced", self.reasons())

    def test_first_party_host_cannot_masquerade_as_google(self):
        next(source for source in self.doc["sources"] if source["id"] == "google")["url"] = "https://google.com.example.com/menu"
        self.assertIn("review_source_is_not_direct_google", self.reasons())

    def test_review_thousands_count_is_exact(self):
        text = "Caffe Esempio | Via Roma 10 | 1,101 reviews"
        self.add_source("google", text, "text/plain", "https://maps.google.co.uk/place/Caffe-Esempio")
        self.doc["candidates"][0]["review"].update(excerpt=text, count=1101)
        self.assertEqual(self.reasons(), [])
        self.doc["candidates"][0]["review"]["count"] = 101
        self.assertIn("visible_google_review_count_not_evidenced", self.reasons())

    def test_integer_requirements_reject_bool_float_string_and_hh_two(self):
        for field, values in (("cents", [True, 800.0, "800"]), ("hh", [True, 0.0, "0", 2])):
            for value in values:
                with self.subTest(field=field, value=value):
                    row = self.row()
                    previous = row[field]
                    row[field] = value
                    with self.assertRaises(planner.InputError):
                        self.run_plan()
                    row[field] = previous

    def test_all_nine_inclusive_caps_and_outside_values(self):
        items = {"beer_draft": "Draft beer 400ml", "spritz": "Spritz", "negroni": "Negroni",
                 "sbagliato": "Sbagliato", "gin_tonic": "Gin tonic", "gin_lemon": "Gin lemon",
                 "wine_glass": "Wine glass", "alcohol_free": "Alcohol free lemonade", "water": "Water"}
        self.assertEqual(len(planner.LIMITS), 9)
        for drink, (low, high) in planner.LIMITS.items():
            for cents, expected_held in ((low, False), (high, False), (low - 1, True), (high + 1, True)):
                with self.subTest(drink=drink, cents=cents):
                    literal = f"€{cents // 100}.{cents % 100:02d}"
                    serving = "draft_400ml" if drink == "beer_draft" else "glass" if drink == "wine_glass" else "single"
                    self.replace_price(f"{items[drink]} {literal}", drink=drink, item=items[drink],
                                       cents=cents, amount_literal=literal, serving=serving)
                    self.assertEqual("price_outside_category_inclusive_cents_limits" in self.reasons(), expected_held)
                    if not expected_held:
                        self.assertEqual(self.reasons(), [])

    def test_exact_key_cell_name_and_unit_sensitive_address(self):
        venue = self.doc["candidates"][0]["venue"]
        cases = (("key", "new-venue", "canonical_venue_key_not_found"),
                 ("cell", "u4pru", "canonical_venue_cell_mismatch"),
                 ("name", "Caffe Esempio Bar", "canonical_venue_name_mismatch"),
                 ("address", "Via Roma 10A", "canonical_venue_address_mismatch"),
                 ("address", "", "canonical_venue_address_missing"))
        for field, value, expected in cases:
            with self.subTest(field=field):
                previous = venue[field]
                venue[field] = value
                self.assertIn(expected, self.reasons())
                venue[field] = previous

    def test_identity_accents_case_punctuation_only(self):
        self.set_catalogue(name="Caffè Esempio", address="VIA ROMA, 10")
        self.assertEqual(self.reasons(), [])
        self.set_catalogue(address="Via Roma 10 unit 2")
        self.assertIn("canonical_venue_address_mismatch", self.reasons())

    def test_catalogue_wrong_geohash_and_tuple_shape_rejected(self):
        self.set_catalogue(lat=51.5, lon=-0.1)
        with self.assertRaisesRegex(planner.InputError, "geohash5"):
            self.run_plan()
        self.set_catalogue()
        raw = {"c": [[123, "Roma"]], "v": [["new-key", "New venue", "bar", 41.9, 12.5]]}
        self.doc["catalogue"]["cells"] = [{"cell": self.cell, **self.pin("cell.json", planner.canonical(raw))}]
        with self.assertRaisesRegex(planner.InputError, "seven-element"):
            self.run_plan()

    def test_catalogue_numeric_kind_and_optional_city_index(self):
        for kind in range(5):
            self.set_catalogue(kind=kind, city=-1)
            self.assertEqual(self.reasons(), [])
        for kind in ("bar", True, -1, 5):
            self.set_catalogue(kind=kind)
            with self.assertRaisesRegex(planner.InputError, "catalogue kind"):
                self.run_plan()
        self.set_catalogue(key="user123")
        with self.assertRaisesRegex(planner.InputError, "OSM"):
            self.run_plan()

    def test_separate_price_source_requires_same_literal_venue_identity(self):
        self.add_source("other", "<p>Other Bar | Other Street 99 | Negroni €8.00</p>",
                        url="https://example.com/other")
        self.row()["source_id"] = "other"
        self.assertIn("price_source_venue_identity_not_evidenced", self.reasons())
        self.add_source("other", "<h1>Caffe Esempio</h1><p>Via Roma 10</p><p>Negroni €8.00</p>",
                        url="https://other.example.com/menu")
        self.assertEqual(self.reasons(), [])

    def test_alcohol_free_and_large_shared_servings_held(self):
        for text, drink, reason in (
                ("Alcohol free Gin tonic €8.00", "gin_tonic", "alcohol_free_conflicts_with_drink_category"),
                ("Gin tonic 1 litre €8.00", "gin_tonic", "large_or_shared_serving_held"),
                ("Gin tonic for 4 people €8.00", "gin_tonic", "large_or_shared_serving_held"),
                ("Negroni XXL €8.00", "negroni", "large_or_shared_serving_held")):
            with self.subTest(text=text):
                self.replace_price(text, item=text.replace(" €8.00", ""), drink=drink)
                self.assertIn(reason, self.reasons())

    def test_impossible_happy_hour_times_held(self):
        self.add_source("menu", "<h1>Caffe Esempio</h1><p>Via Roma 10</p><p>Negroni €8.00</p>"
                        "<p>Happy hour 99:99-99:99 Negroni €8.00</p>")
        self.row().update(hh=1, hh_excerpt="Happy hour 99:99-99:99 Negroni €8.00")
        self.assertIn("happy_hour_item_amount_and_time_conditions_not_explicit", self.reasons())

    def test_malformed_google_thousands_group_is_held(self):
        text = "Caffe Esempio | Via Roma 10 | 1.01 reviews"
        self.add_source("google", text, "text/plain", "https://www.google.com/maps/place/example")
        self.doc["candidates"][0]["review"].update(excerpt=text, count=101)
        self.assertIn("visible_google_review_count_not_evidenced", self.reasons())

    def test_osm_key_must_be_canonical_positive_at_most_15_digits(self):
        for key in ("n0", "n001", "w1234567890123456"):
            with self.subTest(key=key):
                self.set_catalogue(key=key)
                with self.assertRaisesRegex(planner.InputError, "OSM"):
                    self.run_plan()
        self.set_catalogue(key="n123456789012345")
        self.doc["candidates"][0]["venue"]["key"] = "n123456789012345"
        self.assertEqual(self.reasons(), [])

    def test_same_venue_drink_hh_conflicts_never_select_cheapest(self):
        second = copy.deepcopy(self.row())
        second["id"] = "row-2"
        self.doc["candidates"][0]["prices"].append(second)
        report = self.run_plan()
        self.assertEqual(report["summary"]["held"], 2)
        self.assertTrue(all("conflicting_rows_same_venue_drink_hh" in row["hold_reasons"] for row in report["rows"]))

    def test_hash_and_raw_size_pin_reject_corruption(self):
        source = self.doc["sources"][0]
        source["sha256"] = "0" * 64
        with self.assertRaisesRegex(planner.InputError, "hash or byte"):
            self.run_plan()
        source["sha256"] = hashlib.sha256((self.root / source["path"]).read_bytes()).hexdigest()
        source["bytes"] += 1
        with self.assertRaisesRegex(planner.InputError, "hash or byte"):
            self.run_plan()

    def test_forged_excerpt_hidden_html_and_untrusted_sidecar_fail(self):
        self.row()["excerpt"] = "Negroni €7.00"
        self.assertIn("excerpt_not_in_verified_normalized_html", self.reasons())
        self.row()["excerpt"] = "Negroni €8.00"
        self.add_source("menu", '<h1>Caffe Esempio</h1><p>Via Roma 10</p><script>Negroni €8.00</script>')
        self.assertIn("excerpt_not_in_verified_normalized_html", self.reasons())
        self.add_source("menu", "Caffe Esempio Via Roma 10 Negroni €8.00", "text/plain")
        self.assertIn("price_requires_verified_raw_html_not_text_sidecar", self.reasons())
        self.assertIn("venue_identity_requires_verified_raw_html", self.reasons())

    def test_utf8_html_entities_and_ignored_script_style(self):
        self.add_source("menu", '<head><style>bad</style></head><h1>Caffe Esempio</h1><p>Via Roma 10</p>'
                        '<script>Negroni €1</script><p>Negroni&nbsp;&euro;8.00</p>'
                        '<div hidden>Fake €9</div><div style="display:none">Fake €10</div>')
        self.assertEqual(self.reasons(), [])
        self.assertNotIn("Fake", planner.html_text((self.root / "menu.html").read_bytes()))

    def test_pdf_remains_held_even_with_forged_text(self):
        source = self.doc["sources"][0]
        source.update(self.pin("menu.pdf", b"%PDF-1.4 Negroni EUR 8.00"), media_type="application/pdf")
        self.assertIn("pdf_extraction_not_independently_audited", self.reasons())

    def test_traversal_windows_paths_and_symlink_evidence_rejected(self):
        source = self.doc["sources"][0]
        original = source["path"]
        for path in ("../outside.html", "a/../menu.html", "C:/menu.html", "a\\menu.html", "/menu.html"):
            with self.subTest(path=path):
                source["path"] = path
                with self.assertRaises(planner.InputError):
                    self.run_plan()
        source["path"] = original
        link = self.root / "link.html"
        try:
            link.symlink_to(self.root / "menu.html")
        except OSError:
            self.skipTest("host denies local symlink creation")
        source["path"] = "link.html"
        with self.assertRaisesRegex(planner.InputError, "symlink"):
            self.run_plan()

    def test_dates_are_actual_retrieval_not_footer_or_filename(self):
        source = self.doc["sources"][0]
        for value in ("2026-10-31", "2026-02-30", "29/10/2026"):
            with self.subTest(value=value):
                source["checked_on"] = value
                with self.assertRaises(planner.InputError):
                    self.run_plan()
        source["checked_on"] = "2026-10-29"
        source.update(published_on="2026-10-28", published_excerpt="Copyright 2026-10-28")
        self.assertIn("publication_date_not_explicitly_evidenced", self.reasons())

    def test_credential_urls_query_tokens_and_non_https_rejected(self):
        source = self.doc["sources"][0]
        for url in ("http://example.com/menu", "https://user:password@example.com/menu",
                    "https://example.com/menu?token=secret", "https://example.com/menu#secret",
                    "https://127.0.0.1/menu", "https://localhost/menu"):
            with self.subTest(url=url):
                source["url"] = url
                with self.assertRaises(planner.InputError):
                    self.run_plan()

    def test_gbp_never_converted(self):
        self.replace_price("Negroni £8.00", currency="GBP", amount_literal="£8.00")
        self.assertIn("non_eur_no_conversion_permitted", self.reasons())
        self.assertIn("literal_eur_amount_does_not_equal_cents", self.reasons())

    def test_beer_pint_bottle_250_and_500ml_are_held(self):
        for description in ("Draft beer pint", "Draft beer bottle 400ml", "Draft beer 250ml", "Draft beer 500ml"):
            with self.subTest(serving=description):
                self.replace_price(description + " €8.00", drink="beer_draft", item=description, serving="draft_400ml")
                self.assertTrue(self.reasons())
        self.replace_price("Draft beer 40 cl €8.00", drink="beer_draft", item="Draft beer 40 cl", serving="draft_400ml")
        self.assertEqual(self.reasons(), [])

    def test_ranges_packages_multiple_prices_and_category_forgery_held(self):
        for text in ("Negroni from €8.00", "Negroni package €8.00", "Negroni €8.00 or €9.00", "Negroni 2 for €8.00"):
            with self.subTest(text=text):
                self.replace_price(text)
                self.assertTrue(self.reasons())
        self.replace_price("Water €8.00", item="Water", drink="negroni")
        self.assertIn("drink_category_not_explicit_in_item_or_context", self.reasons())

    def test_happy_hour_requires_same_source_item_amount_and_times(self):
        self.row().update(hh=1, hh_excerpt="Negroni €8.00")
        self.assertIn("happy_hour_item_amount_and_time_conditions_not_explicit", self.reasons())
        self.add_source("menu", '<h1>Caffe Esempio</h1><p>Via Roma 10</p><p>Happy hour 18-20 Negroni €8.00</p>')
        self.row()["hh_excerpt"] = "Happy hour 18-20 Negroni €8.00"
        self.assertEqual(self.reasons(), [])
        self.row()["hh_excerpt"] = "Happy hour 18-20 Spritz €8.00"
        self.assertIn("happy_hour_item_amount_and_time_conditions_not_explicit", self.reasons())

    def test_worldwide_comparability_flag_survives_qualified_non_italy_venue(self):
        self.cell = planner.geohash5(51.5, -0.1)
        self.doc["candidates"][0]["venue"]["cell"] = self.cell
        self.set_catalogue(lat=51.5, lon=-0.1)
        report = self.run_plan()
        self.assertEqual(report["rows"][0]["status"], "evidence_qualified")
        self.assertIs(report["rows"][0]["android_52_italy_bounds_contains_venue"], False)
        self.assertEqual(report["rows"][0]["worldwide_comparability"], "not_proven")

    def test_replay_digest_canonical_output_and_exclusive_directory(self):
        first = self.run_plan()
        second = self.run_plan()
        self.assertEqual(planner.canonical(first), planner.canonical(second))
        claimed = first.pop("plan_digest")
        self.assertEqual(claimed, planner.digest(first))
        first["plan_digest"] = claimed
        output = self.root / "new-report"
        planner.write_report(first, output)
        expected = (output / "report.json").read_bytes()
        with self.assertRaises(planner.InputError):
            planner.write_report(second, output)
        self.assertEqual((output / "report.json").read_bytes(), expected)

    def test_unknown_fields_duplicates_and_bounds_rejected(self):
        self.doc["execute_sql"] = "DROP TABLE example"
        with self.assertRaises(planner.InputError):
            self.run_plan()
        del self.doc["execute_sql"]
        with self.assertRaises(planner.InputError):
            planner.strict_json(b'{"schema_version":1,"schema_version":1}')
        self.doc["candidates"] *= planner.MAX_CANDIDATES + 1
        with self.assertRaises(planner.InputError):
            self.run_plan()

    def test_cli_success_and_error_never_create_invalid_output(self):
        input_path = self.root / "batch.json"
        input_path.write_bytes(planner.canonical(self.doc))
        output = self.root / "cli-report"
        args = ["--input", str(input_path), "--evidence-root", str(self.root), "--output-dir", str(output)]
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(planner.main(args), 0)
        self.assertEqual(json.loads((output / "report.json").read_text("utf-8"))["public_imports"], 0)
        input_path.write_bytes(b'{"bad": "input"}')
        invalid_output = self.root / "must-not-exist"
        args[-1] = str(invalid_output)
        with contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(planner.main(args), 2)
        self.assertFalse(invalid_output.exists())

    def test_planner_has_no_network_process_sql_or_public_write_capability(self):
        tree = ast.parse((HERE / "planner.py").read_text("utf-8"))
        imports = []
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                imports.extend(alias.name for alias in node.names)
            if isinstance(node, ast.ImportFrom):
                imports.append(node.module)
        self.assertFalse(set(imports) & {"socket", "http", "requests", "urllib.request", "subprocess", "sqlite3", "os"})
        with mock.patch.object(socket, "create_connection", side_effect=AssertionError("network forbidden")):
            self.assertEqual(self.run_plan()["summary"]["evidence_qualified"], 1)


if __name__ == "__main__":
    unittest.main()
