"""Injected command/process/clock tests; no Android SDK, emulator or network runs."""

import base64
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from types import SimpleNamespace
from unittest.mock import patch

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("android_launch", "scripts/mobile-ci-android-launch.py")
launch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launch)

PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+yh9sAAAAASUVORK5CYII=")


def webview_dump(version="136.0.7103.60"):
    return "\n".join([
        "Current WebView Update Service state",
        "  Current WebView package (name, version): (com.google.android.webview, " + version + ")",
        "  Minimum WebView version code: 661308838",
        "  Number of relros started: 1",
        "  Number of relros finished: 1",
        "  WebView package dirty: false",
        "  Any WebView package installed: true",
        "  Preferred WebView package (name, version): (com.google.android.webview, " + version + ")",
        "  WebView packages:",
        "    Valid package com.google.android.webview (versionName: " + version + ", versionCode: 710306033, targetSdkVersion: 36) is  installed/enabled for all users",
        "    com.google.android.webview.beta is NOT installed.",
    ])


class Clock:
    def __init__(self):
        self.value = 0

    def now(self):
        return self.value

    def sleep(self, seconds):
        self.value += seconds


class Host:
    def __init__(self, root, mode):
        self.root, self.mode = root, mode
        self.work = root / "dovebevo-android-owned-fixture"
        self.work.mkdir()
        self.name = "DoveBevoPreview-fixture"
        self.console_port, self.server_port = 5560, 39001
        self.started, self.stopped = [], []
        self.removed = False
        self.listener = False
        self.server_bind_rejected = False

    def require_kvm(self):
        if self.mode == "missing-kvm":
            raise launch.LaunchFailure("KVM is not readable and writable")

    def reserve_ports(self):
        if self.mode == "busy-ports":
            raise launch.LaunchFailure("Chosen private ports are not free; no retry")

    def free_server_port(self):
        if self.mode == "time-wait" and "adb-server" in self.stopped:
            return False
        return not self.listener

    def listener_present(self):
        if self.mode == "malformed-net-inventory":
            raise launch.LaunchFailure("Unrecognized private listener inventory")
        return self.listener

    def start(self, stage, argv, env):
        self.started.append((stage, argv, env))
        if stage == "adb-server":
            # Vendor socket_spec_listen accepts localhost for IPv4 loopback,
            # but exits before listening when given the numeric client host.
            self.server_bind_rejected = self.mode == "loopback-binding-required" and argv[1:3] != ["-L", "tcp:localhost:" + str(self.server_port)]
            self.listener = not self.server_bind_rejected
        return stage

    def alive(self, process):
        if process == "adb-server" and self.server_bind_rejected:
            return False
        return not (self.mode in ("server-lost", "server-exit", "pid-mismatch") and process == "adb-server") and not (getattr(self, "lost_during_install", False) and process == "adb-server")

    def listener_owned(self, process):
        return self.alive(process) and self.mode != "foreign-listener"

    def stop(self, process, runner):
        self.stopped.append(process)
        if self.mode == "cleanup-failed":
            raise launch.LaunchFailure("Owned process group did not exit")
        if process == "adb-server":
            self.listener = False
        self.clock.sleep(min(15, runner.remaining(cleanup=True)))

    def remove(self):
        self.removed = True

    def snapshot(self, process, stage, runner, after_cleanup=False):
        result = {"pid": 4321, "exit_code": 2 if self.mode == "server-exit" else (0 if after_cleanup else None),
                  "expected_start_ticks": 100, "observed_start_ticks": 200 if self.mode == "pid-mismatch" else (None if after_cleanup else 100),
                  "identity": "mismatch" if self.mode == "pid-mismatch" else ("exited" if after_cleanup else "matches"),
                  "listener": {"status": "unknown" if self.mode == "diagnostic-probe-error" else "known", "rows": []},
                  "streams": {"stdout": {"status": "finished" if after_cleanup else "active", "discarded_bytes": 0},
                              "stderr": {"status": "finished" if after_cleanup else "active", "discarded_bytes": 0}},
                  "acceptable": self.mode not in ("diagnostic-probe-error", "pid-mismatch", "capture-incomplete")}
        (runner.evidence / (stage + "-startup.stderr.log")).write_text("owned child startup exit diagnostic\n")
        return result

    def finish_capture(self, process, runner):
        return self.mode != "capture-incomplete"


class Commands:
    def __init__(self, clock, host, mode, durations):
        self.clock, self.host, self.mode, self.durations = clock, host, mode, durations or {}
        self.calls = []
        self.boot_calls = 0
        self.pid_calls = 0
        self.webview_calls = 0

    def __call__(self, stage, argv, timeout, env, output=None):
        self.calls.append((stage, argv, timeout, env))
        duration = self.durations.get(stage, 0.1)
        self.clock.sleep(min(duration, timeout))
        if duration > timeout or self.mode == stage + "-timeout":
            raise subprocess.TimeoutExpired(argv, timeout, output=b"bounded failure")
        code, text = 0, ""
        if stage == "checkout":
            text = "a" * 40
        elif stage == "apk-identity":
            package = "other.app" if self.mode == "wrong-apk" else launch.IDENTITY
            text = "package: name='" + package + "' versionCode='1'\nlaunchable-activity: name='" + launch.ACTIVITY + "' label='' icon=''"
        elif stage == "adb-version":
            text = "Android Debug Bridge version 1.0.41\nVersion 37.0.1-12345"
        elif stage == "emulator-version":
            text = "Android emulator version 37.2.12.0 (build_id fixture)"
            if self.mode == "wrong-emulator-version":
                text = "Android emulator version 37.2.11.0 (build_id fixture)"
        elif stage == "adb-no-autostart-probe":
            code = 0 if self.mode == "probe-success" else 1
            if self.mode == "probe-spawned":
                self.host.listener = True
        elif stage == "adb-server-status":
            version = "35.0.0" if self.mode == "server-version" else "37.0.1"
            text = 'version: "' + version + '"\nexecutable_absolute_path: "' + str(self.host.root / "sdk/platform-tools/adb").replace("\\", "\\\\") + '"\n'
        elif stage == "ownership-devices":
            serial = "emulator-5554" if self.mode == "wrong-serial" else "emulator-5560"
            text = "List of devices attached\n" + serial + "\tdevice\n"
        elif stage == "ownership-avd":
            text = ("someone-else" if self.mode == "wrong-avd" else self.host.name) + "\nOK"
        elif stage == "boot-completed":
            self.boot_calls += 1
            text = "0" if self.mode == "boot-never" else "1"
        elif stage == "android-api":
            text = "35" if self.mode == "wrong-api" else "36"
        elif stage == "webview":
            self.webview_calls += 1
            major = "110" if self.mode == "old-webview" else "136"
            text = webview_dump(major + ".0.7103.60")
            changes = {
                "webview-current-only": lambda value: value.splitlines()[1],
                "webview-dirty": lambda value: value.replace("dirty: false", "dirty: true"),
                "webview-invalid": lambda value: value.replace("Valid package", "Invalid package"),
                "webview-not-installed": lambda value: value.replace("    Valid package com.google.android.webview (versionName: " + major + ".0.7103.60, versionCode: 710306033, targetSdkVersion: 36) is  installed/enabled for all users", "    com.google.android.webview is NOT installed."),
                "webview-disabled": lambda value: value.replace("is  installed/enabled", "is NOT installed/enabled"),
                "webview-any-false": lambda value: value.replace("package installed: true", "package installed: false"),
                "webview-relro-pending": lambda value: value.replace("relros finished: 1", "relros finished: 0"),
                "webview-relro-placeholder": lambda value: value.replace("relros started: 1", "relros started: 2147483647").replace("relros finished: 1", "relros finished: 2147483647"),
                "webview-wrong-version": lambda value: value.replace("versionName: 136.0.7103.60", "versionName: 135.0.7103.60"),
                "webview-missing-flag": lambda value: value.replace("  WebView package dirty: false\n", ""),
                "webview-duplicate-flag": lambda value: value + "\n  WebView package dirty: false",
            }
            if self.mode in changes:
                text = changes[self.mode](text)
            if self.mode == "webview-becomes-ready" and self.webview_calls == 1:
                text = text.replace("dirty: false", "dirty: true").replace("relros finished: 1", "relros finished: 0")
        elif stage == "install":
            text = "Failure [INSTALL_FAILED_INVALID_APK]" if self.mode == "install-failed" else "Performing Streamed Install\nSuccess"
            if self.mode == "server-lost-during-install":
                self.host.lost_during_install = True
        elif stage == "launch":
            text = "Status: ok\nLaunchState: COLD\nActivity: " + launch.IDENTITY + "/.MainActivity\nComplete"
            if self.mode == "launch-failed":
                text = "Error: Activity not started"
        elif stage in ("app-pid", "settled-pid", "screenshot-pid"):
            self.pid_calls += 1
            text = "999" if self.mode == "stale-pid" and stage != "app-pid" else "4242"
            if self.mode == "multiple-pids":
                text = "4242 9999"
            if self.mode == "screenshot-stale-pid" and stage == "screenshot-pid":
                text = "9999"
        elif stage == "process-name":
            text = "unrelated.app" if self.mode == "wrong-process" else launch.IDENTITY
        elif stage in ("foreground", "screenshot-foreground"):
            component = "other.app/.MainActivity" if self.mode == "wrong-foreground" else launch.COMPONENT
            text = "topResumedActivity=ActivityRecord{abc u0 " + component + " t1}"
            if self.mode == "screenshot-wrong-foreground" and stage == "screenshot-foreground":
                text = "topResumedActivity=ActivityRecord{abc u0 other.app/.MainActivity t1}"
        elif stage == "screenshot":
            output.write_bytes(b"not PNG" if self.mode == "invalid-png" else PNG)
        if stage in ("emulator-version", "acceleration") and self.mode == "headless-required" and "-no-window" not in argv:
            return SimpleNamespace(returncode=127, stdout=b"", stderr=b"qemu-system-x86_64: libpulse.so.0: cannot open shared object file")
        if stage == "acceleration" and self.mode == "acceleration-unusable":
            return SimpleNamespace(returncode=1, stdout=b"accel: KVM is not usable", stderr=b"")
        return SimpleNamespace(returncode=code, stdout=text.encode(), stderr=b"")


class LaunchTests(unittest.TestCase):
    def fixture(self, mode="success", durations=None):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        root = Path(temp.name)
        sdk = root / "sdk"
        for relative, body in {
            "platform-tools/source.properties": "Pkg.Revision=37.0.1\n",
            "emulator/source.properties": "Pkg.Revision=37.2.12\n",
            "system-images/android-36/google_apis/x86_64/source.properties": "Pkg.Revision=7\nAndroidVersion.ApiLevel=36\nSystemImage.TagId=google_apis\nSystemImage.Abi=x86_64\n",
            "licenses/android-sdk-license": "fixture preaccepted licence\n",
            "platform-tools/adb": "fixture, never executed",
            "emulator/emulator": "fixture, never executed",
            "cmdline-tools/latest/bin/avdmanager": "fixture, never executed",
            "cmdline-tools/latest/bin/sdkmanager": "fixture, never executed",
            "build-tools/36.0.0/aapt2": "fixture, never executed",
        }.items():
            path = sdk / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(body, encoding="utf-8")
        built = root / "mobile-android-build/_app/outputs/apk/debug/app-debug.apk"
        built.parent.mkdir(parents=True)
        built.write_bytes(b"fixture actual APK")
        evidence = root / "mobile-evidence/android"
        evidence.mkdir(parents=True)
        (evidence / "app-debug.apk").write_bytes(built.read_bytes())
        digest = hashlib.sha256(built.read_bytes()).hexdigest()
        (evidence / "apk-sha256.txt").write_text(digest + "  built-app-debug.apk\n")
        if mode == "hash-mismatch":
            built.write_bytes(b"other APK")
        clock, host = Clock(), Host(root, mode)
        host.clock = clock
        commands = Commands(clock, host, mode, durations)
        runner = launch.CommandRunner(evidence / "launch", invoke=commands, clock=clock.now, env={"PATH": "fixture"})
        return root, sdk, evidence, clock, host, commands, runner

    def run_fake(self, mode="success", durations=None):
        root, sdk, evidence, clock, host, commands, runner = self.fixture(mode, durations)
        code = launch.run_launch(root, sdk, evidence, runner, host, settle=clock.sleep)
        metadata = json.loads((evidence / "launch/launch-result.json").read_text())
        return code, metadata, commands, host, clock

    def test_happy_path_binds_apk_checkout_api_webview_pid_png_and_own_cleanup(self):
        code, result, commands, host, clock = self.run_fake()
        self.assertEqual(code, 0)
        self.assertTrue(result["success"])
        self.assertEqual(result["checkout_sha"], "a" * 40)
        self.assertEqual(result["android_api"], 36)
        self.assertEqual(result["launch_pid"], 4242)
        self.assertEqual(result["screenshot"]["sha256"], hashlib.sha256(PNG).hexdigest())
        self.assertEqual(result["runtime_packages"], {"emulator": "37.2.12", "image": "7", "platform_tools": "37.0.1"})
        self.assertGreaterEqual(clock.value, 25)
        self.assertEqual(host.stopped, ["emulator", "adb-server"])
        self.assertTrue(host.removed)
        self.assertTrue(result["screenshot_requires_human_review"])
        self.assertEqual(len(host.started), 2)
        self.assertNotIn("kill-server", str(commands.calls))
        for stage, argv, _, env in commands.calls:
            if stage in ("adb-version",) or Path(argv[0]).name != "adb":
                continue
            self.assertEqual(argv[1:5], ["-H", "127.0.0.1", "-P", "39001"])
            self.assertEqual(env["ANDROID_ADB_SERVER_PORT"], "39001")

    def test_rejects_missing_kvm_busy_ports_and_artifact_mismatches_before_process_start(self):
        for mode in ("missing-kvm", "busy-ports", "wrong-apk", "hash-mismatch"):
            with self.subTest(mode=mode):
                code, result, _, host, _ = self.run_fake(mode)
                self.assertEqual(code, 1)
                self.assertFalse(result["success"])
                self.assertEqual(host.started, [])
                self.assertTrue(host.removed)

    def test_every_emulator_probe_selects_headless_while_preserving_version_and_acceleration_checks(self):
        code, result, commands, _, _ = self.run_fake("headless-required")
        self.assertEqual(code, 0)
        version = [argv for stage, argv, *_ in commands.calls if stage == "emulator-version"]
        acceleration = [argv for stage, argv, *_ in commands.calls if stage == "acceleration"]
        self.assertEqual(len(version), 1)
        self.assertEqual(len(acceleration), 1)
        self.assertEqual(version[0][1:], ["-no-window", "-version"])
        self.assertEqual(acceleration[0][1:], ["-no-window", "-accel-check"])
        self.assertEqual(result["emulator_binary_version"], "37.2.12.0")

    def test_headless_probes_still_reject_unreviewed_version_or_unusable_acceleration(self):
        for mode in ("wrong-emulator-version", "acceleration-unusable"):
            code, result, _, host, _ = self.run_fake(mode)
            self.assertEqual(code, 1)
            self.assertFalse(result["success"])
            self.assertEqual(host.started, [])

    def test_closed_port_probe_refuses_autostart_or_new_listener_before_server_start(self):
        for mode in ("probe-success", "probe-spawned"):
            code, result, _, host, _ = self.run_fake(mode)
            self.assertEqual(code, 1)
            self.assertIn("autostart", result["failure"])
            self.assertEqual(host.started, [])
            if mode == "probe-spawned":
                self.assertEqual(result["cleanup"], "failed")
                self.assertFalse(host.removed)

    def test_server_uses_supported_loopback_binding_while_clients_keep_numeric_no_autostart_host(self):
        code, result, commands, host, _ = self.run_fake("loopback-binding-required")
        self.assertEqual(code, 0, result.get("failure"))
        server = [argv for stage, argv, _ in host.started if stage == "adb-server"]
        self.assertEqual(len(server), 1)
        self.assertEqual(server[0][1:], ["-L", "tcp:localhost:39001", "server", "nodaemon"])
        self.assertNotIn("-a", server[0])
        clients = [(argv, env) for stage, argv, _, env in commands.calls if Path(argv[0]).name == "adb" and stage != "adb-version"]
        self.assertTrue(clients)
        for argv, env in clients:
            self.assertEqual(argv[1:5], ["-H", "127.0.0.1", "-P", "39001"])
            self.assertEqual(env["ADB_SERVER_SOCKET"], "tcp:127.0.0.1:39001")
        for _, _, env in host.started:
            self.assertEqual(env["ADB_SERVER_SOCKET"], "tcp:127.0.0.1:39001")
        self.assertEqual(result["adb_closed_port_no_autostart_probe"], "nonzero-and-port-remained-closed")

    def test_wrong_ownership_never_installs_launches_or_screenshots(self):
        for mode in ("wrong-serial", "wrong-avd", "foreign-listener", "server-lost", "server-version"):
            code, result, commands, _, _ = self.run_fake(mode)
            self.assertEqual(code, 1)
            self.assertFalse(result["success"])
            self.assertFalse(any(stage in ("install", "launch", "screenshot") for stage, *_ in commands.calls))

    def test_server_loss_after_device_action_prevents_any_reconnect_or_later_launch(self):
        code, result, commands, host, _ = self.run_fake("server-lost-during-install")
        self.assertEqual(code, 1)
        self.assertIn("lost ownership", result["failure"])
        self.assertFalse(any(stage == "launch" for stage, *_ in commands.calls))
        self.assertEqual(len(host.started), 2)
        self.assertEqual(host.stopped, ["emulator", "adb-server"])

    def test_failed_child_exit_pid_mismatch_and_lost_listener_have_precleanup_diagnostics(self):
        for mode in ("server-exit", "pid-mismatch", "foreign-listener"):
            code, result, commands, host, _ = self.run_fake(mode)
            self.assertEqual(code, 1)
            self.assertFalse(result["success"])
            before = result["process_diagnostics"]["adb-server"]["before_cleanup"]
            if mode == "server-exit":
                self.assertEqual(before["exit_code"], 2)
            if mode == "pid-mismatch":
                self.assertEqual(before["identity"], "mismatch")
            self.assertTrue((host.root / "mobile-evidence/android/launch/adb-server-startup.stderr.log").exists())
            self.assertFalse(any(stage == "install" for stage, *_ in commands.calls))

    def test_open_precleanup_streams_are_expected_but_unknown_probes_or_incomplete_final_drain_fail(self):
        code, result, _, _, _ = self.run_fake()
        self.assertEqual(code, 0)
        before = result["process_diagnostics"]["adb-server"]["before_cleanup"]
        self.assertEqual(before["streams"]["stdout"]["status"], "active")
        self.assertEqual(result["process_diagnostics"]["adb-server"]["after_cleanup"]["streams"]["stdout"]["status"], "finished")
        for mode in ("diagnostic-probe-error", "capture-incomplete"):
            code, result, _, host, _ = self.run_fake(mode)
            self.assertEqual(code, 1)
            self.assertFalse(result["success"])
            self.assertTrue(result["diagnostic_failures"])
            self.assertEqual(host.stopped, ["emulator", "adb-server"])

    def test_diagnostic_write_failure_preserves_original_runtime_failure_and_owned_cleanup(self):
        root, sdk, evidence, clock, host, _, runner = self.fixture("server-exit")

        def failed_snapshot(*args, **kwargs):
            raise OSError(5, "secret=fixture-do-not-persist")

        host.snapshot = failed_snapshot
        self.assertEqual(launch.run_launch(root, sdk, evidence, runner, host, settle=clock.sleep), 1)
        result = json.loads((runner.evidence / "launch-result.json").read_text())
        self.assertEqual(result["failure"], "Tracked private adb server failed to own its listener")
        self.assertEqual(host.stopped, ["adb-server"])
        self.assertTrue(result["diagnostic_failures"])
        self.assertNotIn("fixture-do-not-persist", json.dumps(result))

    def test_boot_deadline_preserves_cleanup_and_does_not_install(self):
        code, result, commands, host, clock = self.run_fake("boot-never")
        self.assertEqual(code, 1)
        self.assertIn("boot", result["failure"])
        self.assertFalse(any(stage == "install" for stage, *_ in commands.calls))
        self.assertEqual(host.stopped, ["emulator", "adb-server"])
        self.assertLess(clock.value, 480)

    def test_api_and_active_webview_are_checked_before_install_without_updates(self):
        for mode in ("wrong-api", "old-webview"):
            code, _, commands, _, _ = self.run_fake(mode)
            self.assertEqual(code, 1)
            self.assertFalse(any(stage == "install" for stage, *_ in commands.calls))
            self.assertNotIn("update", str([argv for _, argv, *_ in commands.calls if argv[-1] != "webviewupdate"]))

    def test_current_webview_alone_or_invalid_service_readiness_never_permits_install(self):
        for mode in ("webview-current-only", "webview-dirty", "webview-invalid", "webview-not-installed", "webview-disabled", "webview-any-false", "webview-relro-pending", "webview-relro-placeholder", "webview-wrong-version", "webview-missing-flag", "webview-duplicate-flag"):
            with self.subTest(mode=mode):
                code, result, commands, host, clock = self.run_fake(mode)
                self.assertEqual(code, 1)
                self.assertFalse(result["success"])
                self.assertFalse(any(stage == "install" for stage, *_ in commands.calls))
                self.assertEqual(host.stopped, ["emulator", "adb-server"])
                self.assertLess(clock.value, 480)

    def test_read_only_webview_readiness_transition_is_bounded_and_keeps_exact_provider(self):
        code, result, commands, _, _ = self.run_fake("webview-becomes-ready")
        self.assertEqual(code, 0)
        self.assertGreaterEqual(commands.webview_calls, 2)
        self.assertEqual(result["webview"]["relros_started"], result["webview"]["relros_finished"])
        self.assertEqual(result["webview"]["package"], "com.google.android.webview")

    def test_time_wait_does_not_claim_a_listener_but_unknown_inventory_prevents_success(self):
        code, result, _, host, _ = self.run_fake("time-wait")
        self.assertEqual(code, 0)
        self.assertTrue(result["success"])
        self.assertTrue(host.removed)
        code, result, _, host, _ = self.run_fake("malformed-net-inventory")
        self.assertEqual(code, 1)
        self.assertFalse(result["success"])
        self.assertFalse(host.removed)

    def test_install_launch_process_foreground_and_screenshot_fail_closed(self):
        for mode in ("install-failed", "launch-failed", "stale-pid", "multiple-pids", "wrong-process", "wrong-foreground", "invalid-png", "install-timeout", "launch-timeout", "screenshot-stale-pid", "screenshot-wrong-foreground"):
            with self.subTest(mode=mode):
                code, result, _, host, _ = self.run_fake(mode)
                self.assertEqual(code, 1)
                self.assertFalse(result["success"])
                self.assertEqual(host.stopped, ["emulator", "adb-server"])

    def test_every_device_action_is_preceded_by_matching_owned_avd_readback(self):
        code, _, commands, _, _ = self.run_fake()
        self.assertEqual(code, 0)
        previous_action = None
        for stage, argv, *_ in commands.calls:
            if Path(argv[0]).name != "adb" or "-s" not in argv or stage in ("ownership-avd", "wait-for-device"):
                continue
            index = next(i for i, call in enumerate(commands.calls) if call[0] == stage)
            previous = [entry[0] for entry in commands.calls[:index]]
            self.assertIn("ownership-avd", previous)
            if previous_action is not None:
                self.assertGreater(max(i for i, entry in enumerate(previous) if entry == "ownership-avd"), previous_action)
            previous_action = index

    def test_cleanup_failure_prevents_success_and_keeps_process_homes(self):
        code, result, _, host, _ = self.run_fake("cleanup-failed")
        self.assertEqual(code, 1)
        self.assertFalse(result["success"])
        self.assertFalse(host.removed)
        self.assertEqual(result["cleanup"], "failed")

    def test_work_deadline_clips_command_without_consuming_cleanup_reserve(self):
        code, result, commands, host, clock = self.run_fake(durations={"wait-for-device": 179, "boot-completed": 9, "install": 119, "launch": 59, "adb-server-status": 1})
        self.assertEqual(code, 1)
        self.assertFalse(result["success"])
        self.assertEqual(host.stopped, ["emulator", "adb-server"])
        self.assertLessEqual(clock.value, 480)
        self.assertGreaterEqual(clock.value, 450)
        self.assertFalse(any(stage == "screenshot" for stage, *_ in commands.calls))
        self.assertIn("timed out", result["failure"])
        last = result["stages"][-1]
        self.assertLess(last["effective_timeout_seconds"], last["requested_timeout_seconds"])
        self.assertAlmostEqual(last["started_elapsed_seconds"] + last["elapsed_seconds"], 420, places=3)

    def test_setup_uses_stable_sdkmanager_without_accepting_licences(self):
        _, sdk, evidence, _, host, commands, runner = self.fixture()
        self.assertEqual(launch.run_setup(sdk, evidence, runner, host), 0)
        install = next(call for call in commands.calls if call[0] == "runtime-install")
        self.assertEqual(install[1][1:], ["--sdk_root=" + str(sdk), "--channel=0", "emulator", launch.IMAGE])
        self.assertLessEqual(install[2], 480)
        self.assertNotIn("--licenses", str(commands.calls))
        self.assertTrue(host.removed)

    def test_setup_rejects_missing_preaccepted_licence_and_revision_drift(self):
        for change in ("licence", "revision"):
            _, sdk, evidence, _, host, commands, runner = self.fixture()
            if change == "licence":
                (sdk / "licenses/android-sdk-license").unlink()
            else:
                (sdk / "emulator/source.properties").write_text("Pkg.Revision=37.3.0\n")
            self.assertEqual(launch.run_setup(sdk, evidence, runner, host), 1)
            self.assertTrue(host.removed)
            if change == "licence":
                self.assertFalse(commands.calls)

    def test_setup_timeout_does_not_claim_installation_and_cleans_isolated_home(self):
        _, sdk, evidence, clock, host, _, runner = self.fixture("runtime-install-timeout")
        self.assertEqual(launch.run_setup(sdk, evidence, runner, host), 1)
        result = json.loads((runner.evidence / "setup-result.json").read_text())
        self.assertFalse(result["success"])
        self.assertTrue(host.removed)
        self.assertLess(clock.value, 480)

    def test_environment_excludes_account_credentials_and_uses_private_homes(self):
        _, sdk, _, _, host, _, _ = self.fixture()
        env = launch.isolated_environment(sdk, host.work, {"PATH": "fixture", "HOME": "unrelated", "GITHUB_TOKEN": "fixture-never-real", "ADB_VENDOR_KEYS": "unrelated"})
        self.assertEqual(env["HOME"], str(host.work / "home"))
        self.assertNotIn("GITHUB_TOKEN", env)
        self.assertNotIn("ADB_VENDOR_KEYS", env)
        self.assertEqual(env["ADB_MDNS_AUTO_CONNECT"], "")


class ExecutionTests(unittest.TestCase):
    def test_real_snapshot_writes_bounded_logs_and_keeps_failed_listener_probes_unknown(self):
        header = b"sl local_address rem_address st tx_queue rx_queue tr tm retr uid timeout inode\n"
        row = b"0: 0100007F:9859 00000000:0000 0A 0:0 00:0 0 1000 0 12345\n"
        process = SimpleNamespace(pid=42, owned_start_ticks=100, owned_capture_errors={},
                                  owned_captures={"stdout": launch.BoundedCapture(io.BytesIO(b"ordinary startup\n")),
                                                  "stderr": launch.BoundedCapture(io.BytesIO(b"Authorization: fixture-token\n"))})
        for capture in process.owned_captures.values():
            self.assertTrue(capture.finish(1))
        host = launch.ProcessHost.__new__(launch.ProcessHost)
        host.server_port = 39001
        observation = {"pid": 42, "expected_start_ticks": 100, "observed_start_ticks": 100,
                       "exit_code": None, "process_group": 42, "identity": "matches", "probe_errors": {}}
        original_open = launch.Path.open

        for fail in (False, True):
            with tempfile.TemporaryDirectory() as temporary:
                runner = SimpleNamespace(evidence=Path(temporary))

                def opened(path, *args, **kwargs):
                    if path.parent.name == "net" and path.name in ("tcp", "tcp6"):
                        if fail:
                            raise OSError(5, "secret=fixture-network-probe")
                        return io.BytesIO(header + (row if path.name == "tcp" else b""))
                    return original_open(path, *args, **kwargs)

                with patch.object(launch, "observe_process", return_value=json.loads(json.dumps(observation))), patch.object(launch.Path, "iterdir", return_value=iter([Path("fd0")])), patch.object(launch.os, "readlink", return_value="socket:[12345]"), patch.object(launch.Path, "open", new=opened):
                    snapshot = host.snapshot(process, "adb-server", runner)
                self.assertEqual(snapshot["acceptable"], not fail)
                self.assertEqual(snapshot["listener"]["status"], "unknown" if fail else "known")
                persisted = (runner.evidence / "adb-server-process-before-cleanup.json").read_text()
                self.assertNotIn("fixture-network-probe", persisted)
                self.assertNotIn("fixture-token", (runner.evidence / "adb-server-startup.stderr.log").read_text())
                self.assertTrue((runner.evidence / "adb-server-process-before-cleanup.json").is_file())

    def test_scoped_listener_diagnostics_keep_foreign_ownership_and_malformed_inventory_distinct(self):
        header = "sl local_address rem_address st tx_queue rx_queue tr tm retr uid timeout inode\n"
        row = "0: 0100007F:9859 00000000:0000 0A 0:0 00:0 0 1000 0 12345\n"
        self.assertTrue(launch.selected_port_rows(header + row, 39001, {"12345"})[0]["owned_by_tracked_process"])
        self.assertFalse(launch.selected_port_rows(header + row, 39001, {"99999"})[0]["owned_by_tracked_process"])
        self.assertIsNone(launch.selected_port_rows(header + row, 39001, None)[0]["owned_by_tracked_process"])
        self.assertEqual(launch.selected_port_rows(header + row, 39002, set()), [])
        for data in ("malformed", header + row * 17):
            with self.assertRaises(launch.LaunchFailure):
                launch.selected_port_rows(data, 39001, set())

    def test_tracked_start_drains_both_flooded_pipes_and_explicitly_disables_adb_trace(self):
        process = SimpleNamespace(pid=42, stdout=io.BytesIO(b"a" * (launch.MAX_LOG_BYTES * 3)), stderr=io.BytesIO(b"b" * (launch.MAX_LOG_BYTES * 4)))
        host = launch.ProcessHost.__new__(launch.ProcessHost)
        with patch.object(launch.subprocess, "Popen", return_value=process) as popen, patch.object(launch, "process_start_ticks", return_value=100):
            self.assertIs(host.start("adb-server", ["never-executed"], {"ADB_TRACE": "auth", "PATH": "fixture"}), process)
        self.assertEqual(popen.call_args.kwargs["stdout"], subprocess.PIPE)
        self.assertEqual(popen.call_args.kwargs["stderr"], subprocess.PIPE)
        self.assertEqual(popen.call_args.kwargs["bufsize"], 0)
        self.assertNotIn("ADB_TRACE", popen.call_args.kwargs["env"])
        self.assertTrue(host.finish_capture(process, SimpleNamespace(remaining=lambda **kwargs: 10)))
        for capture in process.owned_captures.values():
            body, metadata = capture.snapshot()
            self.assertEqual(len(body), launch.MAX_LOG_BYTES)
            self.assertGreaterEqual(metadata["discarded_bytes"], launch.MAX_LOG_BYTES * 2)
            self.assertTrue(metadata["eof"])

    def test_one_finished_stream_does_not_hide_another_live_pipe_at_final_join(self):
        event = threading.Event()

        class HeldPipe:
            def read(self, size):
                event.wait(2)
                return b""

            def close(self):
                pass

        process = SimpleNamespace(owned_capture_errors={}, owned_captures={"stdout": launch.BoundedCapture(io.BytesIO(b"done")), "stderr": launch.BoundedCapture(HeldPipe())})
        host = launch.ProcessHost.__new__(launch.ProcessHost)
        started = time.monotonic()
        self.assertFalse(host.finish_capture(process, SimpleNamespace(remaining=lambda **kwargs: 0.01)))
        self.assertLess(time.monotonic() - started, 0.2)
        self.assertTrue(process.owned_captures["stdout"].snapshot()[1]["eof"])
        self.assertFalse(process.owned_captures["stderr"].snapshot()[1]["eof"])
        event.set()
        self.assertTrue(host.finish_capture(process, SimpleNamespace(remaining=lambda **kwargs: 1)))

    def test_capture_preserves_raw_split_utf8_bytes_and_partial_output_before_read_failure(self):
        class Chunks:
            def __init__(self, failure=False):
                self.chunks = iter((b"\xe2", b"\x82", b"\xac", b"\n"))
                self.failure = failure

            def read(self, size):
                try:
                    return next(self.chunks)
                except StopIteration:
                    if self.failure:
                        raise PermissionError(13, "private_key=fixture")
                    return b""

            def close(self):
                pass

        for failure in (False, True):
            capture = launch.BoundedCapture(Chunks(failure))
            self.assertTrue(capture.finish(1))
            body, metadata = capture.snapshot()
            self.assertEqual(body, "€\n".encode())
            self.assertEqual(metadata["retained_bytes"], 4)
            self.assertEqual(metadata["discarded_bytes"], 0)
            self.assertEqual(metadata["eof"], not failure)
            self.assertEqual(metadata["status"], "failed" if failure else "finished")
            self.assertNotIn("fixture", json.dumps(metadata))

    def test_process_observation_records_zero_exit_pid_reuse_and_probe_failure_truthfully(self):
        process = SimpleNamespace(pid=42, owned_start_ticks=100, poll=lambda: 0)

        def absent(pid):
            raise FileNotFoundError(2, "secret=fixture")

        exited = launch.observe_process(process, read_ticks=absent, read_group=absent)
        self.assertEqual(exited["exit_code"], 0)
        self.assertEqual(exited["identity"], "exited")
        reused = launch.observe_process(process, read_ticks=lambda pid: 200, read_group=lambda pid: 42)
        self.assertEqual(reused["identity"], "mismatch")

        def failed():
            raise OSError(5, "secret=fixture")

        process.poll = failed
        unknown = launch.observe_process(process, read_ticks=absent, read_group=absent)
        self.assertEqual(unknown["identity"], "unknown")
        self.assertIn("exit_status", unknown["probe_errors"])
        self.assertNotIn("fixture", json.dumps(unknown))

    def test_startup_capture_drains_after_cap_and_reports_truncation_without_live_disk_files(self):
        capture = launch.BoundedCapture(io.BytesIO(b"diagnostic\n" + b"x" * (launch.MAX_LOG_BYTES * 3)))
        self.assertTrue(capture.finish(1))
        body, metadata = capture.snapshot()
        self.assertEqual(len(body), launch.MAX_LOG_BYTES)
        self.assertGreater(metadata["discarded_bytes"], launch.MAX_LOG_BYTES)
        self.assertEqual(metadata["status"], "finished")

    def test_live_capture_join_is_bounded_and_reader_errors_do_not_expose_os_messages(self):
        event = threading.Event()

        class Live:
            def read(self, size):
                event.wait(2)
                return b""

            def close(self):
                pass

        capture = launch.BoundedCapture(Live())
        started = time.monotonic()
        self.assertFalse(capture.finish(0.01))
        self.assertLess(time.monotonic() - started, 0.2)
        self.assertEqual(capture.snapshot()[1]["status"], "active")
        event.set()
        self.assertTrue(capture.finish(1))

        class Broken:
            def read(self, size):
                raise OSError(5, "secret=fixture-do-not-record")

            def close(self):
                pass

        capture = launch.BoundedCapture(Broken())
        self.assertTrue(capture.finish(1))
        metadata = capture.snapshot()[1]
        self.assertEqual(metadata["status"], "failed")
        self.assertNotIn("fixture-do-not-record", str(metadata))

    def test_startup_log_redaction_is_bounded_and_preserves_ordinary_exit_reason(self):
        body = b"adb: invalid server option\nAuthorization: Bearer fixture-token\n-----BEGIN PRIVATE KEY-----\nfixture-key-material\n-----END PRIVATE KEY-----\n" + b"x" * launch.MAX_LOG_BYTES
        redacted = launch.safe_startup_log(body)
        self.assertIn(b"adb: invalid server option", redacted)
        self.assertNotIn(b"fixture-token", redacted)
        self.assertNotIn(b"fixture-key-material", redacted)
        self.assertLessEqual(len(redacted), launch.MAX_LOG_BYTES + 64)

    def test_private_listener_inventory_distinguishes_time_wait_all_listen_addresses_and_unknown_shape(self):
        header = "sl local_address rem_address st tx_queue rx_queue tr tm retr uid timeout inode\n"
        row = "0: 0100007F:9859 00000000:0000 06 0:0 00:0 0 1000 0 12345\n"
        self.assertFalse(launch.private_listener_present(header + row, 39001))
        for address in ("0100007F", "00000000", "00000000000000000000000000000000", "00000000000000000000000001000000"):
            self.assertTrue(launch.private_listener_present(header + row.replace("0100007F", address).replace(" 06 ", " 0A "), 39001))
        for malformed in ("", "unknown\n" + row, header + "unparseable row\n", header + row.replace(" 06 ", " XX ")):
            with self.assertRaises(launch.LaunchFailure):
                launch.private_listener_present(malformed, 39001)

    def test_listener_parser_requires_exact_ipv4_port_state_and_process_inode(self):
        header = "sl local_address rem_address st tx_queue rx_queue tr tm retr uid timeout inode\n"
        row = "0: 0100007F:9859 00000000:0000 0A 0:0 00:0 0 1000 0 12345\n"
        self.assertTrue(launch.listener_inodes_match(header + row, {"12345"}, 39001))
        for changed in (row.replace("0100007F", "00000000"), row.replace("0100007F", "0101A8C0"), row.replace("0100007F", "00000000000000000000000001000000"), row.replace(":9859", ":985A"), row.replace(" 0A ", " 01 "), row.replace("12345", "99999")):
            self.assertFalse(launch.listener_inodes_match(header + changed, {"12345"}, 39001))

    def test_actual_executor_uses_eof_stdin_owned_group_and_bounded_artifact_logs(self):
        class Process:
            returncode, pid = 0, 12000

            def __init__(self, argv, **kwargs):
                self.kwargs = kwargs
                kwargs["stdout"].write(b"x" * (launch.MAX_LOG_BYTES + 100))

            def wait(self, timeout):
                return 0

        with patch.object(launch.subprocess, "Popen", side_effect=Process) as popen:
            result = launch.execute("fixture", ["never-executed"], 10, {})
        self.assertEqual(len(result.stdout), launch.MAX_LOG_BYTES + 1)
        self.assertEqual(popen.call_args.kwargs["stdin"], subprocess.DEVNULL)
        self.assertTrue(popen.call_args.kwargs["start_new_session"])

    def test_executor_timeout_kills_only_tracked_command_group(self):
        class Process:
            pid, returncode, waits = 12000, 0, 0

            def __init__(self, argv, **kwargs):
                pass

            def wait(self, timeout):
                self.waits += 1
                if self.waits == 1:
                    raise subprocess.TimeoutExpired("fixture", timeout)

        with patch.object(launch.subprocess, "Popen", side_effect=Process), patch.object(launch.os, "killpg", create=True) as killpg, patch.object(launch.signal, "SIGKILL", 9, create=True):
            with self.assertRaises(subprocess.TimeoutExpired):
                launch.execute("fixture", ["never-executed"], 10, {})
        self.assertEqual(killpg.call_args.args[0], 12000)

    def test_reused_process_pid_is_not_signalled_or_adopted(self):
        process = SimpleNamespace(pid=12000, owned_start_ticks=100, poll=lambda: None)
        host = launch.ProcessHost.__new__(launch.ProcessHost)
        with patch.object(launch, "process_start_ticks", return_value=200), patch.object(launch.os, "killpg", create=True) as killpg:
            self.assertFalse(host.alive(process))
            with self.assertRaises(launch.LaunchFailure):
                host.stop(process, SimpleNamespace(remaining=lambda **kwargs: 60))
        killpg.assert_not_called()


if __name__ == "__main__":
    unittest.main()
