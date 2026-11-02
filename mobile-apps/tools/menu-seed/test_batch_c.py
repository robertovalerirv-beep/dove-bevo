"""Exact reviewed cohort and release boundary. No public/provider requests."""
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[3]
MANIFEST = ROOT / "mobile-apps/data/menu-seed-existing-20261102-c.json"
WORKFLOW = ROOT / ".github/workflows/mobile-italy-menu-c-import.yml"
PIN = "c501f0f9a0143edeb88a8dc23e796e32da2a6133a6c3c3f134ea6c958a366ea1"
SPEC = importlib.util.spec_from_file_location("batch_c_live_import", Path(__file__).with_name("live_import.py"))
m = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(m)


class BatchC(unittest.TestCase):
    def test_exact_manifest_bytes_and_git_blob_use_reviewed_lf_pin(self):
        raw = MANIFEST.read_bytes()
        self.assertNotIn(b"\r", raw)
        self.assertEqual(hashlib.sha256(raw).hexdigest(), PIN)
        blob = subprocess.check_output(["git", "show", ":mobile-apps/data/menu-seed-existing-20261102-c.json"], cwd=ROOT)
        self.assertEqual(blob, raw, "The checkout and Git index must bind the same LF bytes")

    def test_only_eight_reviewed_existing_venue_normal_prices(self):
        doc = m.validate(MANIFEST.read_bytes())
        self.assertEqual((doc["schema_version"], doc["data_version"], doc["checked_on"]), (2, "20261031", "2026-11-02"))
        expected = {
            ("n4224393624", "negroni"): 900, ("n4224393624", "sbagliato"): 900,
            ("n4224393624", "spritz"): 700, ("n4224393624", "alcohol_free"): 500,
            ("n12541095156", "negroni"): 700, ("n12541095156", "sbagliato"): 700,
            ("n12541095156", "gin_tonic"): 700, ("n12541095156", "gin_lemon"): 700,
        }
        self.assertEqual({(r["venue_key"], r["drink"]): r["cents"] for r in doc["records"]}, expected)
        self.assertEqual(len(doc["records"]), 8)
        for row in doc["records"]:
            self.assertEqual((row["cell"], row["city"], row["hh"], row["source_format"]), ("srb10", 61753360, 0, "raw"))
            self.assertNotIn(row["drink"], ["beer_draft", "water", "wine_glass"])
            self.assertIn("not a customer visit or payment", row["identity_note"])

    def test_retained_google_counts_exact_identity_and_pinned_raw_sources(self):
        rows = m.validate(MANIFEST.read_bytes())["records"]
        for row in rows:
            if row["venue_key"] == "n4224393624":
                self.assertEqual((row["name"], row["lat"], row["lon"], row["google_reviews"]), ("Green Street Bar", 43.77027, 11.26101, 223))
                self.assertEqual(row["google_url"], "https://www.google.com/maps?cid=14642652223940811783")
                self.assertIn("4.89 metres", row["identity_note"])
                self.assertIn("Standard-vs-premium gin prices are held", row["identity_note"])
                pin = "94ddc7d588a90ffbfa650b73d2394896fb6fdc9ad6620bd298841a4934cf53a3" if row["drink"] == "alcohol_free" else "ac0e6b01353ae1448b14028d2022c9e3f58be2db3a3583350d7b83e8bb4f4cc8"
            else:
                self.assertEqual((row["name"], row["lat"], row["lon"], row["google_reviews"]), ("PanicAle", 43.77698, 11.25265, 460))
                self.assertEqual(row["google_url"], "https://www.google.com/maps?cid=5896862915924166646")
                self.assertIn("4.0 metres", row["identity_note"])
                pin = "4879bc6746a694d2d8d1378dd74bf0db6967197434c6fd1b0da1ec45d954f13f"
            self.assertEqual(row["source_sha256"], pin)
            self.assertEqual(m.url(row["source_url"]), row["source_url"].split("/")[2])

    def test_no_overlap_with_the_existing_reviewed_batches(self):
        keys = {(r["venue_key"], r["drink"], r["hh"]) for r in m.validate(MANIFEST.read_bytes())["records"]}
        for filename in ["menu-seed-existing-20261101-a.json", "menu-seed-existing-20261101-b.json"]:
            old = json.loads((MANIFEST.parent / filename).read_bytes())
            self.assertTrue(keys.isdisjoint({(r["venue_key"], r["drink"], r["hh"]) for r in old["records"]}))

    def test_workflow_exact_tags_read_default_step_scoped_runner_and_pinned_actions(self):
        try:
            import yaml
        except ImportError:
            self.skipTest("PyYAML is unavailable; actual GitHub parser remains a required audit gate")
        workflow = yaml.load(WORKFLOW.read_text(encoding="utf-8"), Loader=yaml.BaseLoader)
        self.assertEqual(workflow["on"], {"push": {"tags": ["mobile-italy-menu-c-audit/20261102-v1", "mobile-italy-menu-c-seed/20261102-v1"]}})
        self.assertEqual(workflow["permissions"], {"contents": "read"})
        self.assertEqual(workflow["concurrency"], {"group": "dovebevo-one-off-menu-import", "cancel-in-progress": "false"})
        job = workflow["jobs"]["reviewed-batch-c"]
        self.assertEqual(job["env"], {"MANIFEST": "mobile-apps/data/menu-seed-existing-20261102-c.json", "MANIFEST_SHA256": PIN})
        for value in job["env"].values(): self.assertNotIn("runner.", value)
        for fence in ["github.repository == 'robertovalerirv-beep/dove-bevo'", "github.event_name == 'push'", "github.ref_type == 'tag'"]:
            self.assertIn(fence, job["if"])
        steps = job["steps"]
        for step in steps:
            if "uses" in step: self.assertRegex(step["uses"], r"^[A-Za-z0-9_./-]+@[0-9a-f]{40}$")
        self.assertEqual(steps[0]["with"]["persist-credentials"], "false")
        run = steps[2]
        self.assertEqual(set(run["env"]), {"RECEIPT", "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN"})
        self.assertTrue(run["env"]["RECEIPT"].startswith("${{ runner.temp }}/"))
        self.assertIn("audit/20261102-v1) mode_args=(); expected_mode=dry_run", run["run"])
        self.assertIn('seed/20261102-v1) mode_args=(--apply --approved-sha256 "$MANIFEST_SHA256")', run["run"])
        self.assertIn('*) exit 2', run["run"])
        self.assertIn('assert receipt["complete"] is True', run["run"])
        self.assertEqual(steps[3]["if"], "always()")
        self.assertEqual(steps[3]["with"]["path"], run["env"]["RECEIPT"])
        for key, value in job.items():
            if key != "steps": self.assertNotIn("${{ runner.", str(value))
        self.assertNotRegex(WORKFLOW.read_text(), r"pull_request_target|workflow_dispatch|contents: write")


if __name__ == "__main__": unittest.main()
