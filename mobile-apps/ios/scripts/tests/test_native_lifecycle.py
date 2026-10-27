"""Collector boundary checks with byte streams/fake processes; no Apple tools."""

import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location(
    "native_lifecycle", Path(__file__).resolve().parents[1] / "collect-native-lifecycle.py"
)
collector = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(collector)


def summary():
    return {"events": [], "discardedLines": 0, "oversizeOrIncompleteLines": 0, "droppedEvents": 0}


class LifecycleTests(unittest.TestCase):
    def test_only_exact_fixed_events_and_numeric_codes_are_retained(self):
        for message, expected in collector.EVENTS.items():
            self.assertEqual(collector.event_from_line(f"private-prefix DoveBevo: {message}\n".encode()), {"event": expected})
        self.assertEqual(collector.event_from_line(b"DoveBevo: navigation failed code=-1009\n"), {"event": "navigation_failed", "code": -1009})
        for message in [b"navigation finish https://private.example/", b"navigation failed code=not-a-code",
                        b"navigation failed code=9223372036854775808", b"arbitrary message", b"navigation finish\nextra"]:
            self.assertIsNone(collector.event_from_line(b"DoveBevo: " + message + b"\n"))

    def test_raw_prefixes_noise_and_oversize_lines_never_reach_output(self):
        source = io.BytesIO(b"private raw text\n" + b"x" * (collector.MAX_LINE * 3) + b"\n"
                            + b"private-path DoveBevo: navigation commit\n")
        result = summary()
        collector.read_events(source, result, lambda: None)
        self.assertEqual(result["discardedLines"], 1)
        self.assertEqual(result["oversizeOrIncompleteLines"], 1)
        self.assertEqual(result["events"][0]["event"], "commit")
        self.assertNotIn("private", json.dumps(result))

    def test_event_cap_drains_the_remaining_stream_without_growing_evidence(self):
        source = io.BytesIO(b"DoveBevo: navigation finish\n" * (collector.MAX_EVENTS + 17))
        result = summary()
        collector.read_events(source, result, lambda: None)
        self.assertEqual(len(result["events"]), collector.MAX_EVENTS)
        self.assertEqual(result["droppedEvents"], 17)
        self.assertEqual(source.read(), b"")

    def test_owned_process_group_stops_without_targeting_other_groups(self):
        process = SimpleNamespace(pid=7101, wait=lambda timeout: None)
        def kill(pid, sig):
            if sig == 0:
                raise ProcessLookupError
        with patch.object(collector.os, "killpg", side_effect=kill, create=True) as action, \
                patch.object(signal, "SIGKILL", 9, create=True):
            self.assertTrue(collector.stop_owned_group(process))
        self.assertEqual([call.args[0] for call in action.call_args_list], [7101, 7101])

    def test_unresponsive_owned_process_is_not_reported_cleaned(self):
        def wait(timeout):
            raise subprocess.TimeoutExpired("owned-stream", timeout)
        process = SimpleNamespace(pid=7101, wait=wait)
        with patch.object(collector.os, "killpg", create=True), patch.object(signal, "SIGKILL", 9, create=True):
            self.assertFalse(collector.stop_owned_group(process))

    def collect_fixture(self, error):
        root = Path(__file__).resolve().parents[2] / ".build" / "native-lifecycle-tests"
        root.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=root) as directory:
            output = Path(directory) / "safe.json"
            process = SimpleNamespace(pid=7101, stdout=io.BytesIO(), poll=lambda: -15)
            with patch.object(collector.subprocess, "Popen", return_value=process) as spawn, \
                    patch.object(collector, "read_events", side_effect=error), \
                    patch.object(collector, "stop_owned_group", return_value=True) as stop:
                result = collector.collect("actual-simctl-id", output)
            stop.assert_called_once_with(process)
            self.assertTrue(spawn.call_args.kwargs["start_new_session"])
            self.assertEqual(spawn.call_args.kwargs["stderr"], subprocess.DEVNULL)
            self.assertEqual(spawn.call_args.args[0][:4], ["xcrun", "simctl", "spawn", "actual-simctl-id"])
            self.assertEqual(json.loads(output.read_text()), result)
            self.assertTrue(process.stdout.closed)
            self.assertTrue(result["cleanupSucceeded"])
            return result

    def test_interrupted_stream_stops_its_child_and_records_only_safe_state(self):
        self.assertEqual(self.collect_fixture(KeyboardInterrupt())["collectionState"], "stopped")

    def test_stream_error_stops_child_without_copying_raw_exception(self):
        result = self.collect_fixture(OSError("private raw exception"))
        self.assertEqual(result["collectionState"], "unavailable")
        self.assertNotIn("private", json.dumps(result))


class ShellCleanupTests(unittest.TestCase):
    def run_cleanup(self, *, owned, state, status):
        # Exercise the actual EXIT handler with shell functions replacing every
        # process/SDK operation. No simulator or collector process is started.
        git_bash = Path(os.environ.get("ProgramFiles", "C:/Program Files")) / "Git/bin/bash.exe"
        bash = str(git_bash) if git_bash.is_file() else shutil.which("bash")
        if not bash:
            self.skipTest("Bash is unavailable")
        script = Path(__file__).resolve().parents[1] / "test-simulator.sh"
        handler = "finish() {" + script.read_text().split("finish() {", 1)[1].split("\ntrap finish EXIT", 1)[0]
        root = script.parent.parent / ".build/native-lifecycle-tests"
        root.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=root) as directory:
            folder = Path(directory)
            (folder / "result.xcresult").mkdir()
            fixture = """#!/usr/bin/env bash
set -euo pipefail
IOS_ROOT="$PWD"
RESULT_BUNDLE="$PWD/result.xcresult"
TEST_STARTED_AT=123
SIMULATOR_ID=owned-selected-device
COLLECTOR_PID=7101
BOOTED_BY_SCRIPT="${FIXTURE_OWNED}"
record() { printf '%s\\n' "$*" >> "$PWD/actions.txt"; }
kill() { record "kill $*"; return 1; }
wait() { record "wait $*"; return 4; }
xcrun() { record "xcrun $*"; return 6; }
python3() { record "python3 $*"; return 7; }
simulator_state() {
    if [[ "$FIXTURE_STATE" == unavailable ]]; then return 8; fi
    printf '%s\\n' "$FIXTURE_STATE"
}
""" + handler + "\ntrap finish EXIT\nexit \"$FIXTURE_STATUS\"\n"
            (folder / "fixture.sh").write_text(fixture, encoding="utf-8", newline="\n")
            env = dict(os.environ, FIXTURE_OWNED=str(owned).lower(), FIXTURE_STATE=state,
                       FIXTURE_STATUS=str(status))
            result = subprocess.run([bash, "fixture.sh"], cwd=folder, env=env,
                                    capture_output=True, text=True, timeout=10)
            self.assertEqual(result.returncode, status, result.stderr)
            actions = (folder / "actions.txt").read_text()
            self.assertIn("kill -TERM 7101", actions)
            self.assertIn("wait 7101", actions)
            self.assertIn("collect-diagnostics.py --since 123", actions)
            self.assertIn("xcresulttool export attachments", actions)
            return actions

    def test_caller_booted_device_is_preserved_and_test_failure_survives_diagnostic_failures(self):
        self.assertNotIn("simctl shutdown", self.run_cleanup(owned=False, state="Booted", status=23))

    def test_only_owned_running_device_is_shutdown_and_test_success_is_preserved(self):
        self.assertIn("simctl shutdown owned-selected-device", self.run_cleanup(owned=True, state="Booted", status=0))

    def test_owned_device_already_shutdown_is_preserved(self):
        self.assertNotIn("simctl shutdown", self.run_cleanup(owned=True, state="Shutdown", status=23))

    def test_failed_state_query_does_not_guess_a_shutdown(self):
        self.assertNotIn("simctl shutdown", self.run_cleanup(owned=True, state="unavailable", status=23))


if __name__ == "__main__":
    unittest.main()
