"""Offline guards for the Windows background Android probe; no SDK is started."""

import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest import mock


script = Path(__file__).resolve().parents[1] / "android-local-live.py"
spec = importlib.util.spec_from_file_location("dove_android_local_live", script)
local = importlib.util.module_from_spec(spec)
spec.loader.exec_module(local)
temporary = Path(__file__).resolve().parents[3] / ".task-tmp" / "android-local-live-tests"
temporary.mkdir(parents=True, exist_ok=True)


class AndroidLocalLiveTests(unittest.TestCase):
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
            self.assertFalse(any("install" in command or "input" in command for command in commands))
            self.assertEqual(json.loads(Path(result["receipt_path"]).read_text())["result"], "failed")


if __name__ == "__main__":
    unittest.main()
