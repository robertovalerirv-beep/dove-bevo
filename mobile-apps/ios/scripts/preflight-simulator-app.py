"""Bounded health check for the selected simulator before live UI tests."""

import argparse
from pathlib import Path
import plistlib
import re
import subprocess


BUNDLE_ID = "com.dovebevo.app"
DEVICE_ID = re.compile(r"^[0-9A-Fa-f]{8}(?:-[0-9A-Fa-f]{4}){3}-[0-9A-Fa-f]{12}$")


def preflight(device_id, ios_root, app_path, run=subprocess.run):
    if not DEVICE_ID.fullmatch(device_id):
        raise ValueError("Selected simulator identity is invalid")
    root = Path(ios_root).resolve(strict=True)
    expected = root / ".build/DerivedData/Build/Products/Debug-iphonesimulator/DoveBevo.app"
    app = Path(app_path).resolve(strict=True)
    if not app.is_relative_to(root) or app != expected.resolve(strict=True) or not app.is_dir():
        raise ValueError("Unsigned app path is outside the selected build")
    info = (app / "Info.plist").resolve(strict=True)
    if not info.is_relative_to(app) or not info.is_file():
        raise ValueError("Unsigned app metadata is outside the selected build")
    with info.open("rb") as stream:
        contents = stream.read(131073)
    if len(contents) > 131072:
        raise ValueError("Unsigned app metadata is too large")
    try:
        metadata = plistlib.loads(contents)
    except (ValueError, plistlib.InvalidFileException) as error:
        raise ValueError("Unsigned app metadata is invalid") from error
    if not isinstance(metadata, dict) or metadata.get("CFBundleIdentifier") != BUNDLE_ID:
        raise ValueError("Unsigned app bundle identity is invalid")

    def guarded(args, timeout):
        result = run(args, capture_output=True, text=True, timeout=timeout)
        if result.returncode != 0:
            raise RuntimeError("Selected simulator app preflight failed")
        return result.stdout.strip()

    guarded(["xcrun", "simctl", "install", device_id, str(app)], 90)
    launched = guarded(["xcrun", "simctl", "launch", device_id, BUNDLE_ID], 75)
    match = re.fullmatch(r"com\.dovebevo\.app: ([1-9][0-9]*)", launched)
    if not match:
        raise RuntimeError("Selected simulator app did not return a positive PID")
    guarded(["xcrun", "simctl", "terminate", device_id, BUNDLE_ID], 20)
    return int(match.group(1))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--device-id", required=True)
    parser.add_argument("--ios-root", required=True)
    parser.add_argument("--app", required=True)
    args = parser.parse_args()
    try:
        pid = preflight(args.device_id, args.ios_root, args.app)
    except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired):
        parser.exit(1, "Selected simulator app preflight failed; UI tests were not started\n")
    print(f"Selected simulator app preflight passed with positive PID {pid}")


if __name__ == "__main__":
    main()
