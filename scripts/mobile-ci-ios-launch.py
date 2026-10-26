"""Bounded Simulator startup evidence, using only an installed compatible iPhone pair."""

import hashlib
import json
import os
from pathlib import Path
import plistlib
import re
import struct
import subprocess
import sys
import time
import uuid

IDENTITY = "com.dovebevo.app.preview"
MINIMUM = (16, 4, 0)
TOTAL_SECONDS = 330  # Leaves 30 seconds of margin inside the workflow's six-minute cap.
CLEANUP_RESERVE = 60  # Inventory recovery (8), shutdown (20), delete (30), and small overhead.
SETTLE_SECONDS = 25  # Native config may take its full 20-second network timeout before UI renders.
MAX_LOG_BYTES = 65536


class LaunchFailure(Exception):
    pass


def version(text):
    if not isinstance(text, str) or not re.fullmatch(r"\d+(?:\.\d+){0,2}", text):
        raise LaunchFailure("Unrecognized installed SDK/runtime version")
    values = tuple(int(part) for part in text.split("."))
    return values + (0,) * (3 - len(values))


def device_id(text):
    try:
        return str(uuid.UUID(text))
    except (ValueError, TypeError, AttributeError):
        raise LaunchFailure("Invalid simulator UDID") from None


def select_pair(runtimes, device_types, devices, sdk):
    """An available existing device/runtime pairing is the compatibility evidence.

    Do not infer compatibility from a device's display name or an undocumented
    supportedDeviceTypes shape. Require its explicit deviceTypeIdentifier and
    matching installed descriptor. The existing device is never modified.
    """
    sdk_version = version(sdk)
    descriptors = {entry.get("identifier"): entry for entry in device_types.get("devicetypes", [])}
    candidates = []
    for runtime in runtimes.get("runtimes", []):
        identifier = runtime.get("identifier", "")
        if not identifier.startswith("com.apple.CoreSimulator.SimRuntime.iOS-") or runtime.get("isAvailable") is not True:
            continue
        if re.search(r"beta|preview|release candidate|\brc\b", runtime.get("name", ""), re.I):
            continue
        try:
            runtime_version = version(runtime.get("version"))
        except LaunchFailure:
            continue
        if not MINIMUM <= runtime_version <= sdk_version:
            continue
        for existing in devices.get("devices", {}).get(identifier, []):
            type_id = existing.get("deviceTypeIdentifier", "")
            descriptor = descriptors.get(type_id)
            if existing.get("isAvailable") is not True or not descriptor:
                continue
            family = descriptor.get("productFamily")
            if not type_id.startswith("com.apple.CoreSimulator.SimDeviceType.iPhone-") or not descriptor.get("name", "").startswith("iPhone"):
                continue
            if isinstance(family, str) and family != "iPhone":
                continue
            try:
                source_id = device_id(existing.get("udid"))
            except LaunchFailure:
                continue
            candidates.append({"runtime": identifier, "runtime_version": runtime.get("version"), "device_type": type_id,
                               "source_device": source_id, "device_name": descriptor["name"],
                               "basis": "available installed device with explicit runtime/type pairing",
                               "matches_sdk": runtime_version == sdk_version})
    if not candidates:
        raise LaunchFailure("No reliable available stable iPhone/runtime pair at or above iOS 16.4 for this SDK; no runtime download attempted")
    return sorted(candidates, key=lambda pair: (not pair["matches_sdk"], tuple(-part for part in version(pair["runtime_version"])), pair["device_type"]))[0]


class CommandRunner:
    def __init__(self, evidence, invoke=subprocess.run, clock=time.monotonic):
        self.evidence = evidence
        self.evidence.mkdir(parents=True, exist_ok=True)
        self.invoke, self.clock = invoke, clock
        self.started = clock()
        self.deadline = self.started + TOTAL_SECONDS
        self.stages = []

    def remaining(self, cleanup=False):
        available = self.deadline - self.clock() - (0 if cleanup else CLEANUP_RESERVE)
        if available <= 0:
            raise LaunchFailure("Overall Simulator phase deadline reached")
        return available

    def log(self, stage, stdout, stderr):
        def text(value):
            return value.decode("utf-8", errors="replace") if isinstance(value, bytes) else (value or "")
        data = (text(stdout) + "\n" + text(stderr)).encode("utf-8")
        truncated = len(data) > MAX_LOG_BYTES
        body = data[:MAX_LOG_BYTES].decode("utf-8", errors="replace")
        (self.evidence / (stage + ".log")).write_bytes((body + ("\n[truncated]\n" if truncated else "")).encode("utf-8"))

    def run(self, stage, argv, timeout=10, cleanup=False, merge_output=False):
        started = self.clock()
        record = {"stage": stage, "requested_timeout_seconds": timeout,
                  "effective_timeout_seconds": 0, "started_elapsed_seconds": round(started - self.started, 3),
                  "elapsed_seconds": 0, "outcome": "deadline-exhausted", "exit_code": None}
        try:
            limit = min(timeout, self.remaining(cleanup))
            record["effective_timeout_seconds"] = round(limit, 3)
            record["outcome"] = "failed"
            try:
                result = self.invoke(argv, capture_output=True, text=True, timeout=limit, check=False)
            except subprocess.TimeoutExpired as error:
                record["outcome"] = "timed-out"
                self.log(stage, error.output, error.stderr)
                raise LaunchFailure(stage + " timed out") from None
            except OSError:
                record["outcome"] = "invocation-failed"
                raise LaunchFailure(stage + " could not start") from None
            record["exit_code"] = result.returncode
            self.log(stage, result.stdout, result.stderr)
            if result.returncode != 0:
                raise LaunchFailure(stage + " failed with exit " + str(result.returncode))
            record["outcome"] = "completed"
            output = result.stdout + ("\n" + result.stderr if merge_output else "")
            return output.strip()
        finally:
            record["elapsed_seconds"] = round(self.clock() - started, 3)
            self.stages.append(record)


def app_info_and_hash(app, runner):
    with (app / "Info.plist").open("rb") as source:
        info = plistlib.load(source)
    executable = info.get("CFBundleExecutable", "")
    if info.get("CFBundleIdentifier") != IDENTITY or info.get("DTPlatformName") != "iphonesimulator" or version(info.get("MinimumOSVersion")) != MINIMUM:
        raise LaunchFailure("Unexpected built simulator app identity/platform/minimum")
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", executable) or not (app / executable).is_file():
        raise LaunchFailure("Missing or unsafe app executable")
    if (app / "_CodeSignature").exists() or (app / "embedded.mobileprovision").exists():
        raise LaunchFailure("Expected an unsigned simulator bundle")
    digest = hashlib.sha256()
    for path in sorted(app.rglob("*"), key=lambda item: item.relative_to(app).as_posix()):
        runner.remaining()
        if path.is_symlink():
            kind, content = b"symlink", os.readlink(path).encode("utf-8")
        elif path.is_file():
            kind, content = b"file", path.read_bytes()
        else:
            continue
        digest.update(path.relative_to(app).as_posix().encode("utf-8") + b"\0" + kind + b"\0" + content + b"\0")
    return executable, digest.hexdigest()


def recover_owned(runner, selection, name, baseline):
    inventory = json.loads(runner.run("cleanup-inventory", ["xcrun", "simctl", "list", "devices", "--json"], timeout=8, cleanup=True))
    matches = []
    for entry in inventory.get("devices", {}).get(selection["runtime"], []):
        if entry.get("name") == name and entry.get("deviceTypeIdentifier") == selection["device_type"]:
            candidate = device_id(entry.get("udid"))
            if candidate not in baseline:
                matches.append(candidate)
    if len(matches) != 1:
        raise LaunchFailure("Uncertain simulator creation; no unique job-owned UDID to clean up safely")
    return matches[0]


def run_launch(app, evidence, runner, settle=time.sleep):
    result = {"identity": IDENTITY, "status": "failed", "screenshot_requires_human_review": True,
              "total_deadline_seconds": TOTAL_SECONDS, "cleanup_reserve_seconds": CLEANUP_RESERVE,
              "settle_seconds": SETTLE_SECONDS}
    owned, selection, create_attempted = None, None, False
    baseline = set()
    name = "DoveBevoPreview-CI-" + uuid.uuid4().hex
    try:
        executable, app_hash = app_info_and_hash(app, runner)
        result["app_tree_sha256"] = app_hash
        result["app_hash_format"] = "sorted relative path NUL kind NUL content NUL; symlinks hashed as targets without following"
        sha = runner.run("checkout", ["git", "rev-parse", "HEAD"])
        if not re.fullmatch(r"[0-9a-f]{40}", sha):
            raise LaunchFailure("Invalid checkout SHA")
        result["checkout_sha"] = sha
        runner.run("simctl-help", ["xcrun", "simctl", "help"], merge_output=True)
        for command in ["create", "boot", "bootstatus", "install", "launch", "get_app_container", "io", "shutdown", "delete", "list"]:
            help_text = runner.run("help-" + command, ["xcrun", "simctl", "help", command], merge_output=True)
            required = {"launch": "--terminate-running-process", "bootstatus": "-b", "io": "screenshot"}.get(command)
            if required and required not in help_text:
                raise LaunchFailure("Installed simctl lacks required " + command + " semantics")
        sdk = runner.run("simulator-sdk", ["xcrun", "--sdk", "iphonesimulator", "--show-sdk-version"])
        runtimes = json.loads(runner.run("runtimes", ["xcrun", "simctl", "list", "runtimes", "--json"]))
        types = json.loads(runner.run("device-types", ["xcrun", "simctl", "list", "devicetypes", "--json"]))
        devices = json.loads(runner.run("devices", ["xcrun", "simctl", "list", "devices", "--json"]))
        for entries in devices.get("devices", {}).values():
            for entry in entries:
                baseline.add(device_id(entry.get("udid")))
        selection = select_pair(runtimes, types, devices, sdk)
        result["selection"], result["simulator_sdk"] = selection, sdk
        result["owned_name"] = name
        create_attempted = True
        owned = device_id(runner.run("create", ["xcrun", "simctl", "create", name, selection["device_type"], selection["runtime"]], timeout=20))
        if owned in baseline:
            owned = None
            raise LaunchFailure("Simulator creation returned an existing device; refusing to modify it")
        result["owned_udid"] = owned
        runner.run("boot", ["xcrun", "simctl", "boot", owned], timeout=20)
        runner.run("bootstatus", ["xcrun", "simctl", "bootstatus", owned, "-b"], timeout=180)
        runner.run("install", ["xcrun", "simctl", "install", owned, str(app)], timeout=90)
        launched = runner.run("launch", ["xcrun", "simctl", "launch", "--terminate-running-process", owned, IDENTITY], timeout=20)
        pid_match = re.fullmatch(re.escape(IDENTITY) + r":\s*([1-9]\d*)", launched)
        if not pid_match:
            raise LaunchFailure("Simulator launch did not return the expected app PID")
        pid = int(pid_match.group(1))
        result["launch_pid"] = pid
        installed = runner.run("installed-container", ["xcrun", "simctl", "get_app_container", owned, IDENTITY, "app"])
        expected = str(Path(installed) / executable)
        if runner.remaining() <= SETTLE_SECONDS:
            raise LaunchFailure("Insufficient overall deadline for startup settling")
        settle(SETTLE_SECONDS)
        process = runner.run("post-launch-process", ["ps", "-p", str(pid), "-o", "command="])
        if process != expected and not process.startswith(expected + " "):
            raise LaunchFailure("Launched PID is no longer the installed app executable")
        screenshot = evidence / "launch.png"
        runner.run("screenshot", ["xcrun", "simctl", "io", owned, "screenshot", str(screenshot)], timeout=20)
        image = screenshot.read_bytes()
        if len(image) < 24 or image[:8] != b"\x89PNG\r\n\x1a\n" or image[12:16] != b"IHDR":
            raise LaunchFailure("Simulator did not produce a PNG screenshot")
        width, height = struct.unpack(">II", image[16:24])
        if not width or not height:
            raise LaunchFailure("Simulator screenshot has invalid dimensions")
        result["screenshot"] = {"file": "launch.png", "sha256": hashlib.sha256(image).hexdigest(), "width": width, "height": height}
        result["status"] = "launched-process-and-captured-png"
    except Exception as error:
        result["failure"] = str(error)[:2048]
    finally:
        if create_attempted and owned is None and selection is not None:
            try:
                owned = recover_owned(runner, selection, name, baseline)
                result["owned_udid"] = owned
            except Exception as error:
                result["cleanup_failure"] = str(error)[:2048]
                result["cleanup"] = "uncertain-creation-not-touched"
        if owned is not None:
            try:
                runner.run("shutdown", ["xcrun", "simctl", "shutdown", owned], timeout=20, cleanup=True)
            except Exception as error:
                result["shutdown_warning"] = str(error)[:2048]
            try:
                runner.run("delete", ["xcrun", "simctl", "delete", owned], timeout=30, cleanup=True)
                result["cleanup"] = "deleted-job-owned-simulator"
            except Exception as error:
                result["cleanup_failure"] = str(error)[:2048]
                result["cleanup"] = "failed"
        result["elapsed_seconds"] = round(runner.clock() - runner.started, 3)
        result["stages"] = runner.stages
        result["success"] = result["status"] == "launched-process-and-captured-png" and result.get("cleanup") == "deleted-job-owned-simulator"
        (evidence / "launch-result.json").write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print("Simulator startup evidence: " + ("captured; PNG requires human review" if result["success"] else "failed; inspect launch-result.json and bounded logs"))
    return 0 if result["success"] else 1


def main():
    root = os.environ.get("RUNNER_TEMP")
    if not root:
        print("RUNNER_TEMP is required", file=sys.stderr)
        return 2
    app = Path(root) / "mobile-ios-derived/Build/Products/Debug-iphonesimulator/App.app"
    evidence = Path(root) / "mobile-evidence/ios/launch"
    return run_launch(app, evidence, CommandRunner(evidence))


if __name__ == "__main__":
    raise SystemExit(main())
