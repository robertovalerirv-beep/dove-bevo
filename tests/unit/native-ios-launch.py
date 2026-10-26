"""Pure launch-orchestrator tests. Every subprocess and wait is fake; no Simulator runs."""

import base64
import importlib.util
import json
from pathlib import Path
import plistlib
import subprocess
import sys
import tempfile
import unittest
from types import SimpleNamespace

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("ios_launch", "scripts/mobile-ci-ios-launch.py")
launch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launch)

SOURCE_ID = "11111111-1111-4111-8111-111111111111"
OWN_ID = "22222222-2222-4222-8222-222222222222"
TYPE = "com.apple.CoreSimulator.SimDeviceType.iPhone-17"
RUNTIME = "com.apple.CoreSimulator.SimRuntime.iOS-26-2"


def inventory():
    return (
        {"runtimes": [{"identifier": RUNTIME, "name": "iOS 26.2", "version": "26.2", "isAvailable": True}]},
        {"devicetypes": [{"identifier": TYPE, "name": "iPhone 17", "productFamily": "iPhone"}]},
        {"devices": {RUNTIME: [{"udid": SOURCE_ID, "name": "iPhone 17", "deviceTypeIdentifier": TYPE, "isAvailable": True}]}},
    )


class Clock:
    value = 0.0

    def now(self):
        return self.value

    def advance(self, seconds):
        self.value += seconds


class FakeProcess:
    def __init__(self, clock, app, mode="success"):
        self.clock, self.app, self.mode = clock, app, mode
        self.calls = []
        self.runtimes, self.types, self.devices = inventory()
        self.created_name = None
        if mode == "no-pair":
            self.runtimes["runtimes"][0]["isAvailable"] = False

    def __call__(self, argv, **kwargs):
        self.calls.append((list(argv), kwargs["timeout"]))
        self.clock.advance(0.1)
        output = ""
        if argv[:3] == ["git", "rev-parse", "HEAD"]:
            output = "a" * 40
        elif argv[:2] == ["ps", "-p"]:
            output = str(self.app / "App") if self.mode != "crashed" else "/usr/bin/unrelated"
        elif argv[:2] == ["xcrun", "--sdk"]:
            output = "26.2"
        elif argv[:3] == ["xcrun", "simctl", "help"]:
            output = "--terminate-running-process -b screenshot create boot bootstatus install launch get_app_container io shutdown delete list"
            if self.mode == "missing-help" and argv[-1] == "launch":
                output = "usage: launch"
            if self.mode == "help-stderr":
                return SimpleNamespace(returncode=0, stdout="", stderr=output)
        elif argv[:3] == ["xcrun", "simctl", "list"]:
            output = json.dumps({"runtimes": self.runtimes, "devicetypes": self.types, "devices": self.devices}[argv[3]])
        elif argv[:3] == ["xcrun", "simctl", "create"]:
            self.created_name = argv[3]
            if self.mode == "existing-id":
                return SimpleNamespace(returncode=0, stdout=SOURCE_ID, stderr="")
            self.devices["devices"][RUNTIME].append({"udid": OWN_ID, "name": argv[3], "deviceTypeIdentifier": TYPE, "isAvailable": True})
            if self.mode == "create-timeout":
                self.clock.advance(kwargs["timeout"])
                raise subprocess.TimeoutExpired(argv, kwargs["timeout"], output="")
            output = OWN_ID
        elif argv[:3] == ["xcrun", "simctl", "bootstatus"]:
            if self.mode in ("boot-timeout", "boot-large-timeout"):
                self.clock.advance(kwargs["timeout"])
                output = "Waiting on BackBoard" if self.mode == "boot-timeout" else "Waiting on BackBoard\n" * 10000
                raise subprocess.TimeoutExpired(argv, kwargs["timeout"], output=output)
            if self.mode == "budget":
                self.clock.advance(300)
        elif argv[:3] == ["xcrun", "simctl", "launch"]:
            output = "com.dovebevo.app.preview: 4242"
        elif argv[:3] == ["xcrun", "simctl", "get_app_container"]:
            output = str(self.app)
        elif argv[:3] == ["xcrun", "simctl", "io"]:
            png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+yh9sAAAAASUVORK5CYII=")
            Path(argv[-1]).write_bytes(png)
        elif argv[:3] == ["xcrun", "simctl", "delete"] and self.mode == "delete-failed":
            return SimpleNamespace(returncode=1, stdout="", stderr="delete failed")
        return SimpleNamespace(returncode=0, stdout=output, stderr="")


class SelectionTests(unittest.TestCase):
    def test_prefers_sdk_pair_over_older_available_runtime(self):
        runtimes, types, devices = inventory()
        old = "com.apple.CoreSimulator.SimRuntime.iOS-18-5"
        runtimes["runtimes"].append({"identifier": old, "name": "iOS 18.5", "version": "18.5", "isAvailable": True})
        devices["devices"][old] = list(devices["devices"][RUNTIME])
        self.assertEqual(launch.select_pair(runtimes, types, devices, "26.2")["runtime"], RUNTIME)

    def test_rejects_unavailable_beta_and_older_than_minimum(self):
        for change in ({"isAvailable": False}, {"name": "iOS 26.2 Beta"}, {"version": "15.0"}):
            runtimes, types, devices = inventory()
            runtimes["runtimes"][0].update(change)
            with self.assertRaises(launch.LaunchFailure):
                launch.select_pair(runtimes, types, devices, "26.2")

    def test_requires_explicit_device_type_pair_not_names_or_guessed_runtime_fields(self):
        runtimes, types, devices = inventory()
        del devices["devices"][RUNTIME][0]["deviceTypeIdentifier"]
        runtimes["runtimes"][0]["supportedDeviceTypes"] = [TYPE]
        with self.assertRaises(launch.LaunchFailure):
            launch.select_pair(runtimes, types, devices, "26.2")

    def test_rejects_ipad_and_runtime_newer_than_selected_sdk(self):
        runtimes, types, devices = inventory()
        types["devicetypes"][0]["productFamily"] = "iPad"
        with self.assertRaises(launch.LaunchFailure):
            launch.select_pair(runtimes, types, devices, "26.2")
        runtimes, types, devices = inventory()
        with self.assertRaises(launch.LaunchFailure):
            launch.select_pair(runtimes, types, devices, "26.1")


class OrchestratorTests(unittest.TestCase):
    def run_fake(self, mode):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        root = Path(temp.name)
        app = root / "App.app"
        app.mkdir()
        (app / "App").write_bytes(b"fake executable, never run")
        with (app / "Info.plist").open("wb") as output:
            plistlib.dump({"CFBundleIdentifier": "com.dovebevo.app.preview", "DTPlatformName": "iphonesimulator", "MinimumOSVersion": "16.4", "CFBundleExecutable": "App"}, output)
        evidence = root / "evidence"
        clock = Clock()
        fake = FakeProcess(clock, app, mode)
        runner = launch.CommandRunner(evidence, invoke=fake, clock=clock.now)
        result = launch.run_launch(app, evidence, runner, settle=clock.advance)
        metadata = json.loads((evidence / "launch-result.json").read_text())
        return result, fake, clock, metadata

    def assert_owned_cleanup(self, fake):
        cleanup = [argv for argv, _ in fake.calls if argv[:3] in (["xcrun", "simctl", "shutdown"], ["xcrun", "simctl", "delete"])]
        self.assertEqual(cleanup, [["xcrun", "simctl", "shutdown", OWN_ID], ["xcrun", "simctl", "delete", OWN_ID]])

    def test_launch_pid_process_png_and_exact_owned_cleanup(self):
        code, fake, clock, metadata = self.run_fake("success")
        self.assertEqual(code, 0)
        self.assertEqual(metadata["launch_pid"], 4242)
        self.assertEqual(metadata["settle_seconds"], 25)
        self.assertGreaterEqual(clock.value, 25)
        self.assertTrue(metadata["screenshot_requires_human_review"])
        self.assertEqual(metadata["checkout_sha"], "a" * 40)
        self.assertEqual(len(metadata["app_tree_sha256"]), 64)
        self.assertEqual(sum(argv[:3] == ["xcrun", "simctl", "create"] for argv, _ in fake.calls), 1)
        self.assert_owned_cleanup(fake)
        self.assertLess(clock.value, 330)

    def test_boot_timeout_preserves_log_and_cleans_only_owned_device(self):
        code, fake, clock, metadata = self.run_fake("boot-timeout")
        self.assertEqual(code, 1)
        self.assertIn("bootstatus timed out", metadata["failure"])
        self.assert_owned_cleanup(fake)
        self.assertLess(clock.value, 330)
        self.assertIn("Waiting on BackBoard", (fake.app.parent / "evidence/bootstatus.log").read_text())

    def test_failure_logs_are_bounded(self):
        code, fake, _, _ = self.run_fake("boot-large-timeout")
        self.assertEqual(code, 1)
        log = (fake.app.parent / "evidence/bootstatus.log").read_bytes()
        self.assertLess(len(log), launch.MAX_LOG_BYTES + 32)
        self.assertIn(b"[truncated]", log)

    def test_help_on_stderr_is_accepted(self):
        self.assertEqual(self.run_fake("help-stderr")[0], 0)

    def test_missing_help_or_candidate_never_creates_a_device(self):
        for mode in ("missing-help", "no-pair"):
            code, fake, _, _ = self.run_fake(mode)
            self.assertEqual(code, 1)
            self.assertFalse(any(argv[:3] == ["xcrun", "simctl", "create"] for argv, _ in fake.calls))

    def test_existing_udid_is_never_booted_shutdown_or_deleted(self):
        code, fake, _, metadata = self.run_fake("existing-id")
        self.assertEqual(code, 1)
        self.assertIn("existing device", metadata["failure"])
        self.assertFalse(any(argv[:3] in (["xcrun", "simctl", "boot"], ["xcrun", "simctl", "shutdown"], ["xcrun", "simctl", "delete"]) for argv, _ in fake.calls))

    def test_uncertain_creation_recovers_only_exact_unique_job_name_and_new_udid(self):
        code, fake, _, metadata = self.run_fake("create-timeout")
        self.assertEqual(code, 1)
        self.assertEqual(metadata["owned_udid"], OWN_ID)
        self.assert_owned_cleanup(fake)

    def test_global_budget_leaves_cleanup_time(self):
        code, fake, clock, metadata = self.run_fake("budget")
        self.assertEqual(code, 1)
        self.assertIn("deadline", metadata["failure"])
        self.assert_owned_cleanup(fake)
        self.assertLess(clock.value, 330)

    def test_pid_reuse_or_immediate_app_exit_is_failure_and_cleans_up(self):
        code, fake, _, metadata = self.run_fake("crashed")
        self.assertEqual(code, 1)
        self.assertIn("app executable", metadata["failure"])
        self.assert_owned_cleanup(fake)

    def test_delete_failure_prevents_success_claim(self):
        code, _, _, metadata = self.run_fake("delete-failed")
        self.assertEqual(code, 1)
        self.assertEqual(metadata["cleanup"], "failed")


if __name__ == "__main__":
    unittest.main()
