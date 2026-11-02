"""Exercise the actual embedded store selector without running Apple tools."""

import ast
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "capture-ipad.sh"
embedded = SCRIPT.read_text().split("<<'PY'\n", 1)[1].split("\nPY\n", 1)[0]
module = ast.parse(embedded)
definitions = ast.Module(body=[node for node in module.body
                              if isinstance(node, (ast.Import, ast.ImportFrom, ast.FunctionDef))], type_ignores=[])
scope = {}
exec(compile(definitions, str(SCRIPT), "exec"), scope)
select_device = scope["select_device"]


def device(kind, suffix, *, available=True):
    return {"name": "Actual device", "deviceTypeIdentifier": kind, "isAvailable": available,
            "state": "Shutdown", "udid": f"00000000-0000-4000-8000-{suffix:012d}"}


def inventory():
    types = [{"identifier": key, "name": name, "productFamily": family} for key, name, family in [
        ("ipad13", "iPad Pro 13-inch (M5)", "iPad"), ("ipad11", "iPad Pro 11-inch (M5)", "iPad"),
        ("max", "iPhone 17 Pro Max", "iPhone"), ("plus", "iPhone 16 Plus", "iPhone"),
        ("air", "iPhone Air", "iPhone"), ("phone", "iPhone 17", "iPhone"),
    ]]
    runtimes = [{"identifier": f"com.apple.CoreSimulator.SimRuntime.iOS-26-{minor}",
                 "version": f"26.{minor}", "isAvailable": True} for minor in [2, 5]]
    devices = {runtime["identifier"]: [device("ipad13", minor * 10 + 1), device("max", minor * 10 + 2)]
               for minor, runtime in zip([2, 5], runtimes)}
    return {"devicetypes": types, "runtimes": runtimes, "devices": devices}


class CaptureSelectionTests(unittest.TestCase):
    def test_exact_pin_selects_actual_qualifying_ipad_and_large_phone(self):
        for family, kind in [("ipad", "ipad13"), ("iphone-large", "max")]:
            with self.subTest(family=family):
                version, selected_type, _ = select_device(inventory(), "26.2", family, "26.2")
                self.assertEqual(version, (26, 2))
                self.assertEqual(selected_type["identifier"], kind)
                self.assertEqual(select_device(inventory(), "26.2", family)[0], (26, 5))

    def test_unavailable_missing_or_sdk_mismatched_pin_never_falls_back(self):
        for family in ["ipad", "iphone-large"]:
            for pin in ["26.4", "26.2.0", "18.5"]:
                with self.subTest(family=family, pin=pin), self.assertRaises(ValueError):
                    select_device(inventory(), "26.2", family, pin)
            unavailable = inventory()
            unavailable["runtimes"][0]["isAvailable"] = False
            with self.assertRaises(ValueError):
                select_device(unavailable, "26.2", family, "26.2")
            unavailable = inventory()
            for item in unavailable["devices"]["com.apple.CoreSimulator.SimRuntime.iOS-26-2"]:
                item["isAvailable"] = False
            with self.assertRaises(ValueError):
                select_device(unavailable, "26.2", family, "26.2")

    def test_runtime_pin_is_strict_and_bounded(self):
        for pin in ["", "26.2\n", "026.2", "26.02", "26.2.0.0", "1000.2", "26..2", "26.2-beta",
                    "26/2", "２６.２", "9" * 10000, 26]:
            with self.subTest(pin=str(pin)[:25]), self.assertRaises(ValueError):
                select_device(inventory(), "26.2", "ipad", pin)

    def test_pin_preserves_actual_model_qualification_and_rejects_renamed_devices(self):
        for family, wrong_type, fake_name in [("ipad", "ipad11", "iPad Pro 13-inch"),
                                               ("iphone-large", "phone", "iPhone 17 Pro Max")]:
            values = inventory()
            fake = device(wrong_type, 99)
            fake["name"] = fake_name
            values["devices"]["com.apple.CoreSimulator.SimRuntime.iOS-26-2"] = [fake]
            with self.subTest(family=family), self.assertRaises(ValueError):
                select_device(values, "26.2", family, "26.2")

    def test_large_phone_air_and_plus_remain_valid_actual_types(self):
        for kind in ["air", "plus"]:
            values = inventory()
            values["devices"]["com.apple.CoreSimulator.SimRuntime.iOS-26-2"] = [device(kind, 99)]
            with self.subTest(kind=kind):
                self.assertEqual(select_device(values, "26.2", "iphone-large", "26.2")[1]["identifier"], kind)


class CaptureStartupTests(unittest.TestCase):
    def run_capture(self, *, state="Shutdown", boot_status=0, test_status=0, export_status=0):
        # Run the unchanged script in a dummy project. Every Apple command is a
        # shell function; the actual embedded selector still reads public data.
        git_bash = Path(os.environ.get("ProgramFiles", "C:/Program Files")) / "Git/bin/bash.exe"
        bash = str(git_bash) if git_bash.is_file() else shutil.which("bash")
        if not bash:
            self.skipTest("Bash is unavailable")
        root = SCRIPT.parent.parent / ".build" / "capture-startup-tests"
        root.mkdir(parents=True, exist_ok=True)
        values = inventory()
        selected = values["devices"]["com.apple.CoreSimulator.SimRuntime.iOS-26-2"][0]
        selected["state"] = state
        selected_id = selected["udid"]
        with tempfile.TemporaryDirectory(dir=root) as working:
            folder = Path(working)
            scripts = folder / "ios" / "scripts"
            scripts.mkdir(parents=True)
            (folder / "ios" / "DoveBevo.xcodeproj").mkdir()
            (scripts / "capture-ipad.sh").write_text(SCRIPT.read_text(), encoding="utf-8", newline="\n")
            (folder / "inventory.json").write_text(json.dumps(values), encoding="utf-8")
            (folder / "state.txt").write_text(state, encoding="utf-8")
            fixture = r'''#!/usr/bin/env bash
set -euo pipefail
record() { printf '%s\n' "$*" >> "$PWD/actions.txt"; }
python3() { "$FIXTURE_PYTHON" "$@"; }
xcrun() {
    record "xcrun $*"
    case "$*" in
        '--sdk iphonesimulator --show-sdk-version') printf '26.2\n' ;;
        'simctl list --json') cat "$PWD/inventory.json" ;;
        'simctl list devices --json')
            printf '{"devices":{"runtime":[{"udid":"%s","state":"%s"}]}}\n' \
                "$FIXTURE_ID" "$(cat "$PWD/state.txt")" ;;
        "simctl bootstatus $FIXTURE_ID -b")
            printf Booting > "$PWD/state.txt"
            if [[ "$FIXTURE_BOOT_STATUS" != 0 ]]; then return "$FIXTURE_BOOT_STATUS"; fi
            printf Booted > "$PWD/state.txt" ;;
        "simctl shutdown $FIXTURE_ID") printf Shutdown > "$PWD/state.txt" ;;
        'xcresulttool export attachments --path '*) return "$FIXTURE_EXPORT_STATUS" ;;
        *) printf 'Unexpected fake SDK command.\n' >&2; return 98 ;;
    esac
}
xcodebuild() {
    record "xcodebuild $*"
    mkdir -p "$PWD/ios/.build/iPadScreenshots.xcresult"
    return "$FIXTURE_TEST_STATUS"
}
source ios/scripts/capture-ipad.sh
'''
            (folder / "fixture.sh").write_text(fixture, encoding="utf-8", newline="\n")
            env = dict(os.environ, FIXTURE_PYTHON=sys.executable, FIXTURE_ID=selected_id,
                       FIXTURE_BOOT_STATUS=str(boot_status), FIXTURE_TEST_STATUS=str(test_status),
                       FIXTURE_EXPORT_STATUS=str(export_status), IOS_SIMULATOR_RUNTIME="26.2",
                       STORE_CAPTURE_DEVICE="ipad")
            result = subprocess.run([bash, "fixture.sh"], cwd=folder, env=env,
                                    capture_output=True, text=True, timeout=15)
            actions = (folder / "actions.txt").read_text().splitlines()
            return result, actions, selected_id

    def test_selected_shutdown_device_is_ready_before_xcodebuild_and_owned_cleanup(self):
        result, actions, selected_id = self.run_capture()
        self.assertEqual(result.returncode, 0, result.stderr)
        boot = actions.index(f"xcrun simctl bootstatus {selected_id} -b")
        build = next(i for i, item in enumerate(actions) if item.startswith("xcodebuild "))
        shutdown = actions.index(f"xcrun simctl shutdown {selected_id}")
        self.assertLess(boot, build)
        self.assertLess(build, shutdown)
        self.assertIn(f"platform=iOS Simulator,id={selected_id},", actions[build])
        self.assertTrue(any("xcresulttool export attachments" in item for item in actions))

    def test_boot_failure_prevents_xcodebuild_and_cleans_only_owned_device(self):
        result, actions, selected_id = self.run_capture(boot_status=47)
        self.assertEqual(result.returncode, 47, result.stderr)
        self.assertFalse(any(item.startswith("xcodebuild ") for item in actions))
        self.assertEqual(actions.count(f"xcrun simctl bootstatus {selected_id} -b"), 1)
        self.assertIn(f"xcrun simctl shutdown {selected_id}", actions)

    def test_previously_booted_or_booting_device_is_never_shutdown(self):
        for state in ["Booted", "Booting"]:
            with self.subTest(state=state):
                result, actions, selected_id = self.run_capture(state=state, test_status=23)
                self.assertEqual(result.returncode, 23, result.stderr)
                self.assertIn(f"xcrun simctl bootstatus {selected_id} -b", actions)
                self.assertFalse(any("simctl shutdown" in item for item in actions))

    def test_unknown_transition_stops_before_boot_or_test_without_shutdown(self):
        result, actions, _ = self.run_capture(state="Shutting Down")
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertFalse(any("simctl bootstatus" in item or "simctl shutdown" in item
                             or item.startswith("xcodebuild ") for item in actions))

    def test_attachment_failure_cannot_hide_original_test_status(self):
        for test_status, expected in [(0, 17), (23, 23)]:
            with self.subTest(test_status=test_status):
                result, actions, selected_id = self.run_capture(test_status=test_status, export_status=17)
                self.assertEqual(result.returncode, expected, result.stderr)
                self.assertIn(f"xcrun simctl shutdown {selected_id}", actions)
                self.assertTrue(any("xcresulttool export attachments" in item for item in actions))


if __name__ == "__main__":
    unittest.main()
