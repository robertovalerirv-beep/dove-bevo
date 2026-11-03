"""Offline guards for the Windows background Android probe; no SDK is started."""

import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest import mock
import xml.etree.ElementTree as ET


script = Path(__file__).resolve().parents[1] / "android-local-live.py"
spec = importlib.util.spec_from_file_location("dove_android_local_live", script)
local = importlib.util.module_from_spec(spec)
spec.loader.exec_module(local)
temporary = Path(__file__).resolve().parents[3] / ".task-tmp" / "android-local-live-tests"
temporary.mkdir(parents=True, exist_ok=True)


class AndroidLocalLiveTests(unittest.TestCase):
    def test_repeat_run_uses_already_accepted_home_without_resetting_app_data(self):
        home = ET.fromstring('<hierarchy><node content-desc="Cerca città o bar"/></hierarchy>')
        self.assertEqual(local.rules_or_home(home)[0], 'home')
        rules = ET.fromstring('<hierarchy><node text="Ho almeno 18 anni e accetto"/></hierarchy>')
        self.assertEqual(local.rules_or_home(rules)[0], 'rules')

    def test_only_dedicated_avd_name_is_accepted(self):
        self.assertTrue(local.owned_avd(b'dove-live\r\nOK\r\n'))
        self.assertTrue(local.owned_avd(b'dove-live\r\r\nOK\r\r\n'))
        for wrong in [b'other-project\r\nOK\r\n', b'dove-live-extra\nOK\n',
                      b'dove-live\nKO\n', b'dove-live\nOK\nextra\n', b'\xff\nOK\n']:
            self.assertFalse(local.owned_avd(wrong))

    def test_exact_apk_hash_is_required_before_any_device_operation(self):
        with tempfile.TemporaryDirectory(dir=temporary) as directory:
            apk = Path(directory) / "app-debug.apk"
            apk.write_bytes(b"owned gated APK fixture")
            digest = hashlib.sha256(apk.read_bytes()).hexdigest()
            self.assertEqual(local.validate_apk(apk, digest), digest)
            with self.assertRaisesRegex(ValueError, "does not match"):
                local.validate_apk(apk, "0" * 64)
            with self.assertRaisesRegex(ValueError, "lowercase SHA-256"):
                local.validate_apk(apk, digest.upper())

    def test_non_emulator_target_fails_before_install_or_public_navigation(self):
        with tempfile.TemporaryDirectory(dir=temporary) as directory:
            with mock.patch.object(local, "EVIDENCE", Path(directory)), \
                 mock.patch.object(local.subprocess, "run") as execute:
                execute.return_value = subprocess.CompletedProcess([], 0, b"0\n", b"")
                result = local.run(Path("adb.exe"), "a" * 64, Path("fixture.apk"))
            self.assertEqual(result["result"], "failed")
            self.assertEqual(result["stage"], "device")
            self.assertIn("not a physical phone", result["error"])
            commands = [call.args[0] for call in execute.call_args_list]
            self.assertFalse(any("install" in command or "input" in command or "force-stop" in command
                                 for command in commands))
            self.assertEqual(json.loads(Path(result["receipt_path"]).read_text())["result"], "failed")

    def test_foreign_avd_fails_before_install_and_never_force_stops_it(self):
        replies = [b'1\n', b'36\n', b'other-project\nOK\n']
        with tempfile.TemporaryDirectory(dir=temporary) as directory:
            with mock.patch.object(local, "EVIDENCE", Path(directory)), \
                 mock.patch.object(local.subprocess, "run") as execute:
                execute.side_effect = [subprocess.CompletedProcess([], 0, reply, b'') for reply in replies]
                result = local.run(Path("adb.exe"), "a" * 64, Path("fixture.apk"))
            self.assertEqual(result["result"], "failed")
            self.assertIn("not the dedicated dove-live AVD", result["error"])
            commands = [call.args[0] for call in execute.call_args_list]
            self.assertEqual(len(commands), 3)
            self.assertFalse(any("install" in command or "force-stop" in command for command in commands))


if __name__ == "__main__":
    unittest.main()
