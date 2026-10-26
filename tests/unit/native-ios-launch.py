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
    def __init__(self, clock, app, mode="success", durations=None, overheads=None):
        self.clock, self.app, self.mode = clock, app, mode
        self.durations = durations or {}
        self.overheads = overheads or {}
        self.calls = []
        self.runtimes, self.types, self.devices = inventory()
        self.created_name = None
        if mode == "no-pair":
            self.runtimes["runtimes"][0]["isAvailable"] = False

    def __call__(self, argv, **kwargs):
        self.calls.append((list(argv), kwargs["timeout"]))
        stage = argv[2] if argv[:2] == ["xcrun", "simctl"] else argv[0]
        if stage == "list":
            stage += "-" + argv[3]
        duration = self.durations.get(stage, 0.1)
        if (stage == "create" and self.mode == "create-timeout") or (stage == "bootstatus" and self.mode in ("boot-timeout", "boot-large-timeout")):
            duration = kwargs["timeout"]
        # Process creation/wait overhead can exceed subprocess.run's soft cap;
        # the finite operation itself still obeys the requested timeout.
        self.clock.advance(min(duration, kwargs["timeout"]) + self.overheads.get(stage, 0))
        timed_out = duration > kwargs["timeout"]
        # Creation may have taken effect even when simctl never returns its UDID.
        if timed_out and stage != "create":
            raise subprocess.TimeoutExpired(argv, kwargs["timeout"], output="")
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
            if self.mode == "create-timeout" or timed_out:
                raise subprocess.TimeoutExpired(argv, kwargs["timeout"], output="")
            output = OWN_ID
        elif argv[:3] == ["xcrun", "simctl", "bootstatus"]:
            if self.mode in ("boot-timeout", "boot-large-timeout"):
                output = "Waiting on BackBoard" if self.mode == "boot-timeout" else "Waiting on BackBoard\n" * 10000
                raise subprocess.TimeoutExpired(argv, kwargs["timeout"], output=output)
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
    def run_fake(self, mode, durations=None, overheads=None):
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
        fake = FakeProcess(clock, app, mode, durations, overheads)
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
        self.assertLess(clock.value, 420)

    def test_boot_timeout_preserves_log_and_cleans_only_owned_device(self):
        code, fake, clock, metadata = self.run_fake("boot-timeout")
        self.assertEqual(code, 1)
        self.assertIn("bootstatus timed out", metadata["failure"])
        self.assert_owned_cleanup(fake)
        self.assertLess(clock.value, 420)
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
        code, fake, clock, metadata = self.run_fake("success", {"bootstatus": 180, "install": 300, "shutdown": 15, "delete": 20})
        self.assertEqual(code, 1)
        self.assertIn("install timed out", metadata["failure"])
        self.assert_owned_cleanup(fake)
        self.assertLess(clock.value, 420)

    def test_slow_boot_install_and_cleanup_fit_without_short_stage_timeouts(self):
        code, fake, clock, metadata = self.run_fake("success", {"bootstatus": 86, "install": 55, "launch": 40, "shutdown": 15, "delete": 20})
        self.assertEqual(code, 0)
        self.assert_owned_cleanup(fake)
        self.assertEqual(metadata["total_deadline_seconds"], 420)
        self.assertEqual(metadata["cleanup_reserve_seconds"], 60)
        self.assertEqual(metadata["settle_seconds"], 25)
        self.assertTrue(metadata["success"])
        self.assertLess(clock.value, 420)
        stages = {entry["stage"]: entry for entry in metadata["stages"]}
        for stage, elapsed, cap in (("bootstatus", 86, 180), ("install", 55, 90), ("launch", 40, 60), ("shutdown", 15, 20), ("delete", 20, 30)):
            self.assertEqual(stages[stage]["elapsed_seconds"], elapsed)
            self.assertEqual(stages[stage]["effective_timeout_seconds"], cap)
            self.assertEqual(stages[stage]["outcome"], "completed")
        self.assertEqual(len(metadata["screenshot"]["sha256"]), 64)

    def test_observed_combined_slow_startup_keeps_full_launch_settle_evidence_and_cleanup(self):
        # Hosted 49bf reached launch at 218.948s: bootstatus 110.506s and
        # install 95.097s despite its 90s soft cap. Replay a 218.745s prelude,
        # allow the full existing launch cap, then a previously observed 20s
        # container query and the full process/PNG caps after 25s settling.
        durations = {"git": 0.047, "help": 0.55, "xcrun": 3.132,
                     "list-runtimes": 0.28, "list-devicetypes": 0.278, "list-devices": 0.451,
                     "create": 0.578, "boot": 2.326, "bootstatus": 110.506, "install": 89.9,
                     "launch": 60, "get_app_container": 20, "ps": 10, "io": 20,
                     "shutdown": 13.243, "delete": 0.828}
        code, fake, clock, metadata = self.run_fake("success", durations, {"install": 5.197, "launch": 2.37})
        self.assertEqual(code, 0)
        self.assertEqual(metadata["total_deadline_seconds"], 420)
        self.assertEqual(metadata["cleanup_reserve_seconds"], 60)
        self.assertEqual(metadata["launch_pid"], 4242)
        stages = {entry["stage"]: entry for entry in metadata["stages"]}
        self.assertAlmostEqual(stages["launch"]["started_elapsed_seconds"], 218.745, places=3)
        self.assertEqual(stages["launch"]["effective_timeout_seconds"], 60)
        self.assertEqual(stages["install"]["effective_timeout_seconds"], 90)
        self.assertEqual(stages["install"]["elapsed_seconds"], 95.097)
        self.assertAlmostEqual(stages["post-launch-process"]["started_elapsed_seconds"] - stages["installed-container"]["started_elapsed_seconds"], 45, places=3)
        self.assertEqual(stages["post-launch-process"]["effective_timeout_seconds"], 10)
        self.assertEqual(stages["screenshot"]["effective_timeout_seconds"], 20)
        self.assertLess(stages["screenshot"]["started_elapsed_seconds"] + stages["screenshot"]["elapsed_seconds"], 360)
        self.assertEqual(len(metadata["screenshot"]["sha256"]), 64)
        self.assertEqual(sum(argv[:3] == ["xcrun", "simctl", "launch"] for argv, _ in fake.calls), 1)
        self.assert_owned_cleanup(fake)
        self.assertLess(clock.value, 420)

    def test_launch_is_clipped_at_work_deadline_without_success_or_lost_cleanup_reserve(self):
        code, fake, clock, metadata = self.run_fake("success", {"help": 8, "bootstatus": 180, "install": 55, "launch": 40, "shutdown": 15, "delete": 20})
        self.assertEqual(code, 1)
        self.assertEqual(metadata["failure"], "launch timed out")
        self.assertFalse(metadata["success"])
        self.assertNotIn("screenshot", metadata)
        stage = next(entry for entry in metadata["stages"] if entry["stage"] == "launch")
        self.assertEqual(stage["requested_timeout_seconds"], 60)
        self.assertLess(stage["effective_timeout_seconds"], 40)
        self.assertAlmostEqual(stage["started_elapsed_seconds"] + stage["elapsed_seconds"], 360, places=3)
        self.assertEqual(sum(argv[:3] == ["xcrun", "simctl", "launch"] for argv, _ in fake.calls), 1)
        self.assert_owned_cleanup(fake)
        self.assertLess(clock.value, 420)

    def test_slow_container_lookup_after_realistic_startup_preserves_settle_png_and_cleanup(self):
        for container_seconds in (15, 20):
            with self.subTest(container_seconds=container_seconds):
                code, fake, clock, metadata = self.run_fake("success", {"bootstatus": 70, "install": 45, "launch": 40, "get_app_container": container_seconds, "shutdown": 21, "delete": 10})
                self.assertEqual(code, 0)
                self.assertEqual(metadata["launch_pid"], 4242)
                self.assertEqual(metadata["total_deadline_seconds"], 420)
                self.assertEqual(metadata["cleanup_reserve_seconds"], 60)
                self.assertEqual(metadata["settle_seconds"], 25)
                stages = {entry["stage"]: entry for entry in metadata["stages"]}
                container = stages["installed-container"]
                self.assertEqual(container["effective_timeout_seconds"], 30)
                self.assertEqual(container["elapsed_seconds"], container_seconds)
                self.assertEqual(container["outcome"], "completed")
                self.assertGreater(container["started_elapsed_seconds"], 150)
                self.assertLess(container["started_elapsed_seconds"], 170)
                self.assertAlmostEqual(stages["post-launch-process"]["started_elapsed_seconds"] - container["started_elapsed_seconds"] - container_seconds, 25, places=3)
                self.assertEqual(len(metadata["screenshot"]["sha256"]), 64)
                self.assertEqual(metadata["shutdown_warning"], "shutdown timed out")
                self.assert_owned_cleanup(fake)
                self.assertLess(clock.value, 420)

    def test_container_lookup_is_clipped_and_produces_no_startup_evidence_after_timeout(self):
        code, fake, clock, metadata = self.run_fake("success", {"help": 8, "bootstatus": 170, "install": 45, "launch": 40, "get_app_container": 20, "shutdown": 15, "delete": 20})
        self.assertEqual(code, 1)
        self.assertEqual(metadata["failure"], "installed-container timed out")
        self.assertFalse(metadata["success"])
        self.assertNotIn("screenshot", metadata)
        self.assertFalse((fake.app.parent / "evidence/launch.png").exists())
        stage = next(entry for entry in metadata["stages"] if entry["stage"] == "installed-container")
        self.assertEqual(stage["requested_timeout_seconds"], 30)
        self.assertLess(stage["effective_timeout_seconds"], 20)
        self.assertAlmostEqual(stage["started_elapsed_seconds"] + stage["elapsed_seconds"], 360, places=3)
        self.assertFalse(any(argv[:2] == ["ps", "-p"] or argv[:3] == ["xcrun", "simctl", "io"] for argv, _ in fake.calls))
        self.assert_owned_cleanup(fake)
        self.assertLess(clock.value, 420)

    def test_exhausted_install_records_shortened_budget_and_keeps_cleanup_reserve(self):
        code, fake, clock, metadata = self.run_fake("success", {"help": 9, "bootstatus": 180, "install": 300, "shutdown": 15, "delete": 20})
        self.assertEqual(code, 1)
        stages = {entry["stage"]: entry for entry in metadata["stages"]}
        install = stages["install"]
        self.assertEqual(install["outcome"], "timed-out")
        self.assertLess(install["effective_timeout_seconds"], 90)
        self.assertAlmostEqual(install["started_elapsed_seconds"] + install["elapsed_seconds"], 360, places=3)
        self.assertEqual(metadata["cleanup"], "deleted-job-owned-simulator")
        self.assertFalse(any(argv[:3] == ["xcrun", "simctl", "launch"] for argv, _ in fake.calls))
        self.assert_owned_cleanup(fake)
        self.assertLessEqual(clock.value, 420)

    def test_timed_uncertain_create_recovers_exact_owned_device_with_realistic_cleanup(self):
        code, fake, clock, metadata = self.run_fake("success", {"create": 25, "list-devices": 5, "shutdown": 15, "delete": 20})
        self.assertEqual(code, 1)
        self.assertIn("create timed out", metadata["failure"])
        self.assertEqual(metadata["cleanup"], "deleted-job-owned-simulator")
        self.assert_owned_cleanup(fake)
        stages = {entry["stage"]: entry for entry in metadata["stages"]}
        self.assertEqual(stages["cleanup-inventory"]["outcome"], "completed")
        self.assertEqual(stages["cleanup-inventory"]["elapsed_seconds"], 5)
        self.assertLess(clock.value, 420)

    def test_stage_metadata_records_exit_failure_without_command_or_log_contents(self):
        code, _, _, metadata = self.run_fake("delete-failed")
        self.assertEqual(code, 1)
        stage = metadata["stages"][-1]
        self.assertEqual(stage["stage"], "delete")
        self.assertEqual(stage["outcome"], "failed")
        self.assertEqual(stage["exit_code"], 1)
        for entry in metadata["stages"]:
            self.assertEqual(set(entry), {"stage", "requested_timeout_seconds", "effective_timeout_seconds", "started_elapsed_seconds", "elapsed_seconds", "outcome", "exit_code"})

    def test_pid_reuse_or_immediate_app_exit_is_failure_and_cleans_up(self):
        code, fake, _, metadata = self.run_fake("crashed")
        self.assertEqual(code, 1)
        self.assertIn("app executable", metadata["failure"])
        self.assert_owned_cleanup(fake)

    def test_delete_failure_prevents_success_claim(self):
        code, _, _, metadata = self.run_fake("delete-failed")
        self.assertEqual(code, 1)
        self.assertEqual(metadata["cleanup"], "failed")


class CleanupDeadlineTests(unittest.TestCase):
    def test_launch_budget_is_clipped_and_no_launch_runs_after_work_deadline(self):
        with tempfile.TemporaryDirectory() as temp:
            clock = Clock()
            fake = FakeProcess(clock, Path(temp), durations={"launch": 40})
            runner = launch.CommandRunner(Path(temp), invoke=fake, clock=clock.now)
            clock.advance(350)
            with self.assertRaisesRegex(launch.LaunchFailure, "launch timed out"):
                runner.run("launch", ["xcrun", "simctl", "launch", "--terminate-running-process", OWN_ID, launch.IDENTITY], timeout=60)
            self.assertEqual(fake.calls[-1][1], 10)
            self.assertEqual(clock.value, 360)
            with self.assertRaisesRegex(launch.LaunchFailure, "deadline"):
                runner.run("launch", ["xcrun", "simctl", "launch", "--terminate-running-process", OWN_ID, launch.IDENTITY], timeout=60)
            self.assertEqual(len(fake.calls), 1)
            self.assertEqual(runner.stages[-2]["outcome"], "timed-out")
            self.assertEqual(runner.stages[-1]["effective_timeout_seconds"], 0)
            self.assertEqual(runner.stages[-1]["outcome"], "deadline-exhausted")

    def test_invocation_failure_records_stage_without_untrusted_exception_details(self):
        with tempfile.TemporaryDirectory() as temp:
            clock = Clock()

            def unavailable(*args, **kwargs):
                raise OSError("private invocation detail")

            runner = launch.CommandRunner(Path(temp), invoke=unavailable, clock=clock.now)
            with self.assertRaisesRegex(launch.LaunchFailure, "^install could not start$"):
                runner.run("install", ["xcrun", "simctl", "install", OWN_ID, "private app path"], timeout=90)
            self.assertEqual(runner.stages[-1]["outcome"], "invocation-failed")
            self.assertEqual(runner.stages[-1]["effective_timeout_seconds"], 90)
            self.assertNotIn("private", json.dumps(runner.stages))

    def test_near_deadline_cleanup_is_clipped_and_no_command_runs_after_deadline(self):
        with tempfile.TemporaryDirectory() as temp:
            clock = Clock()
            fake = FakeProcess(clock, Path(temp), durations={"shutdown": 15, "delete": 20})
            runner = launch.CommandRunner(Path(temp), invoke=fake, clock=clock.now)
            clock.advance(395)
            runner.run("shutdown", ["xcrun", "simctl", "shutdown", OWN_ID], timeout=20, cleanup=True)
            with self.assertRaisesRegex(launch.LaunchFailure, "delete timed out"):
                runner.run("delete", ["xcrun", "simctl", "delete", OWN_ID], timeout=30, cleanup=True)
            self.assertEqual(fake.calls[-1][1], 10)
            self.assertEqual(clock.value, 420)
            with self.assertRaisesRegex(launch.LaunchFailure, "deadline"):
                runner.run("delete", ["xcrun", "simctl", "delete", OWN_ID], timeout=30, cleanup=True)
            self.assertEqual(len(fake.calls), 2)
            self.assertEqual(runner.stages[-2]["effective_timeout_seconds"], 10)
            self.assertEqual(runner.stages[-2]["outcome"], "timed-out")
            self.assertEqual(runner.stages[-1]["effective_timeout_seconds"], 0)
            self.assertEqual(runner.stages[-1]["outcome"], "deadline-exhausted")


if __name__ == "__main__":
    unittest.main()
