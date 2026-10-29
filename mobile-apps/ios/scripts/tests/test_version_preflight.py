"""Run the real version preflight with a producer that detects an early reader."""

import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


SOURCE = Path(__file__).resolve().parents[1] / "release-ios.sh"
LEGACY_ASSIGNMENT = '''XCODE_VERSION="$(xcodebuild -version | head -n 1 | awk '{print $2}')"'''


class VersionPreflightTests(unittest.TestCase):
    def run_preflight(self, version="27.1", producer_status=0, legacy=False):
        git_bash = Path(os.environ.get("ProgramFiles", "C:/Program Files")) / "Git/bin/bash.exe"
        bash = str(git_bash) if git_bash.is_file() else shutil.which("bash")
        if not bash:
            self.skipTest("Bash is unavailable")
        source = SOURCE.read_text(encoding="utf-8")
        self.assertIn("set -euo pipefail", source)
        lines = source.splitlines()
        assignment = LEGACY_ASSIGNMENT if legacy else next(line for line in lines if line.startswith("XCODE_VERSION="))
        minimum = next(line for line in lines if line.startswith('[[ "${XCODE_VERSION%%.*}"'))
        fail = next(line for line in lines if line.startswith("fail() {"))
        root = SOURCE.parent.parent / ".build/version-preflight-tests"
        root.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=root) as working:
            folder = Path(working)
            # A bounded, padded second line exceeds pipe capacity so an early
            # reader always closes before the producer completes. No sleeps,
            # Apple tools, signing inputs or provider operations are involved.
            script = '''set -euo pipefail
xcodebuild() {
    trap 'printf observed > broken-pipe.txt; exit 86' PIPE
    local padding chunk
    printf -v padding '%65536s' ''
    printf 'Xcode %s\\n' "$FIXTURE_VERSION"
    printf 'Build version PUBLIC '
    for ((chunk=0; chunk<128; chunk++)); do printf '%s' "$padding"; done
    printf '\\n'
    printf complete > producer-completed.txt
    return "$FIXTURE_STATUS"
}
''' + fail + "\n" + assignment + "\n" + minimum + '\nprintf "%s" "$XCODE_VERSION" > continued.txt\n'
            env = {key: os.environ[key] for key in ["PATH", "SystemRoot", "WINDIR"] if key in os.environ}
            env.update(FIXTURE_VERSION=version, FIXTURE_STATUS=str(producer_status))
            result = subprocess.run([bash, "-s"], input=script, cwd=folder, env=env,
                                    capture_output=True, text=True, timeout=15)
            continued = folder / "continued.txt"
            return result, (folder / "producer-completed.txt").exists(), (folder / "broken-pipe.txt").exists(), \
                continued.read_text() if continued.exists() else None

    def test_legacy_early_reader_reproduces_a_broken_pipe(self):
        result, completed, broken_pipe, continued = self.run_preflight(legacy=True)
        self.assertEqual(result.returncode, 86, result.stderr)
        self.assertTrue(broken_pipe)
        self.assertFalse(completed)
        self.assertIsNone(continued)

    def test_actual_version_parser_drains_the_producer_and_selects_only_first_line(self):
        result, completed, broken_pipe, continued = self.run_preflight()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(completed)
        self.assertFalse(broken_pipe)
        self.assertEqual(continued, "27.1")

    def test_failed_producer_still_stops_before_preflight_continues(self):
        result, completed, broken_pipe, continued = self.run_preflight(producer_status=89)
        self.assertEqual(result.returncode, 89, result.stderr)
        self.assertTrue(completed)
        self.assertFalse(broken_pipe)
        self.assertIsNone(continued)

    def test_minimum_xcode_version_is_retained(self):
        for version, expected in [("25.4", 1), ("26.0", 0)]:
            with self.subTest(version=version):
                result, completed, broken_pipe, continued = self.run_preflight(version)
                self.assertEqual(result.returncode, expected, result.stderr)
                self.assertTrue(completed)
                self.assertFalse(broken_pipe)
                self.assertEqual(continued, version if expected == 0 else None)
                if expected:
                    self.assertIn("App Store uploads require Xcode 26 or later", result.stderr)


if __name__ == "__main__":
    unittest.main()
