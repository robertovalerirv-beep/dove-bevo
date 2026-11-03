"""Offline identity and fail-closed tests for the hosted iOS app preflight."""

import importlib.util
from pathlib import Path
import plistlib
import subprocess
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / "preflight-simulator-app.py"
SPEC = importlib.util.spec_from_file_location("simulator_preflight", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
DEVICE = "F82EF267-78B0-4334-8AE6-2C58E00EE70F"


class SimulatorPreflightTests(unittest.TestCase):
    def test_exact_selected_device_app_and_positive_pid_are_required(self):
        base = Path(__file__).resolve().parents[2] / ".build/native-lifecycle-tests"
        base.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=base) as directory:
            root = Path(directory)
            app = root / ".build/DerivedData/Build/Products/Debug-iphonesimulator/DoveBevo.app"
            app.mkdir(parents=True)
            info = app / "Info.plist"
            info.write_bytes(plistlib.dumps({"CFBundleIdentifier": "com.dovebevo.app"}))
            calls = []

            def run(args, **options):
                calls.append((args, options))
                output = "com.dovebevo.app: 19391" if args[2] == "launch" else ""
                return subprocess.CompletedProcess(args, 0, output, "")

            self.assertEqual(MODULE.preflight(DEVICE, root, app, run), 19391)
            self.assertEqual([call[0][2] for call in calls], ["install", "launch", "terminate"])
            self.assertTrue(all(call[0][3] == DEVICE for call in calls))
            self.assertEqual(calls[0][0][4], str(app))
            self.assertEqual(calls[1][0][4], "com.dovebevo.app")
            self.assertEqual([call[1]["timeout"] for call in calls], [90, 75, 20])

            calls.clear()
            for wrong_device, wrong_app in [("emulator-5554", app), (DEVICE, root)]:
                with self.assertRaises(ValueError):
                    MODULE.preflight(wrong_device, root, wrong_app, run)
            self.assertEqual(calls, [])

            info.write_bytes(plistlib.dumps({"CFBundleIdentifier": "com.other.app"}))
            with self.assertRaises(ValueError):
                MODULE.preflight(DEVICE, root, app, run)
            info.write_bytes(plistlib.dumps({"CFBundleIdentifier": "com.dovebevo.app"}))
            self.assertEqual(calls, [])

            with tempfile.TemporaryDirectory(dir=base) as outside_directory:
                outside = Path(outside_directory) / "DoveBevo.app"
                outside.mkdir()
                (outside / "Info.plist").write_bytes(
                    plistlib.dumps({"CFBundleIdentifier": "com.dovebevo.app"}))
                with self.assertRaises(ValueError):
                    MODULE.preflight(DEVICE, root, outside, run)
                with tempfile.TemporaryDirectory(dir=base) as linked_directory:
                    linked_root = Path(linked_directory)
                    linked_app = linked_root / ".build/DerivedData/Build/Products/Debug-iphonesimulator/DoveBevo.app"
                    linked_app.parent.mkdir(parents=True)
                    try:
                        linked_app.symlink_to(outside, target_is_directory=True)
                    except OSError:
                        pass  # Windows hosts may prohibit symlink creation; macOS CI exercises this.
                    else:
                        with self.assertRaises(ValueError):
                            MODULE.preflight(DEVICE, linked_root, linked_app, run)
            self.assertEqual(calls, [])

            def no_pid(args, **options):
                output = "com.other.app: 19391" if args[2] == "launch" else ""
                return subprocess.CompletedProcess(args, 0, output, "")

            with self.assertRaises(RuntimeError):
                MODULE.preflight(DEVICE, root, app, no_pid)

            def stopped(args, **options):
                return subprocess.CompletedProcess(args, 1 if args[2] == "terminate" else 0,
                                                   "com.dovebevo.app: 19391" if args[2] == "launch" else "", "")

            with self.assertRaises(RuntimeError):
                MODULE.preflight(DEVICE, root, app, stopped)


if __name__ == "__main__":
    unittest.main()
