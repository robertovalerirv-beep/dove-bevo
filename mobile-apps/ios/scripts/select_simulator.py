#!/usr/bin/env python3
"""Select a simulator reproducibly from simctl's real available-device JSON."""

import argparse
import json
import re
import sys


def parse_runtime_version(value):
    if value is None:
        return None
    if (not isinstance(value, str) or len(value) > 11
            or not re.fullmatch(r"(?:0|[1-9][0-9]{0,2})(?:\.(?:0|[1-9][0-9]{0,2})){0,2}", value)):
        raise ValueError("Requested iOS runtime version is invalid")
    return tuple(map(int, value.split(".")))


def select_simulator(inventory, sdk_version, requested_id=None, runtime_version=None):
    sdk = tuple(int(part) for part in sdk_version.split("."))
    pinned = parse_runtime_version(runtime_version)
    if pinned is not None and pinned[0] != sdk[0]:
        raise ValueError("Requested iOS runtime does not match the selected Xcode iOS SDK major version")
    candidates = []
    for runtime, devices in inventory["devices"].items():
        match = re.search(r"\.iOS-(\d+(?:-\d+)*)$", runtime)
        if not match:
            continue
        version = tuple(int(part) for part in match.group(1).split("-"))
        for device in devices:
            if device.get("isAvailable") and device["name"].startswith("iPhone"):
                candidates.append((version, device))
    if requested_id:
        matches = [item for item in candidates if item[1]["udid"] == requested_id]
        if len(matches) != 1:
            raise ValueError("Requested iPhone simulator is unavailable")
        if pinned is not None and matches[0][0] != pinned:
            raise ValueError("Requested iPhone simulator does not match the requested iOS runtime version")
        return matches[0]
    matches = [item for item in candidates if item[0][0] == sdk[0]]
    if pinned is not None:
        matches = [item for item in matches if item[0] == pinned]
        if not matches:
            raise ValueError("No available iPhone simulator matches the requested iOS runtime version")
    if not matches:
        raise ValueError("No available iPhone simulator matches the selected Xcode iOS SDK major version")
    newest = max(item[0] for item in matches)
    matches = [item for item in matches if item[0] == newest]
    matches.sort(key=lambda item: (item[1].get("state") != "Booted", item[1]["name"], item[1]["udid"]))
    return matches[0]


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--sdk-version", required=True)
    parser.add_argument("--device-id")
    parser.add_argument("--runtime-version")
    args = parser.parse_args()
    try:
        version, device = select_simulator(json.load(sys.stdin), args.sdk_version, args.device_id, args.runtime_version)
        print(f'iOS simulator: {device["name"]} | iOS {".".join(map(str, version))} | {device["udid"]} | selected SDK {args.sdk_version}', file=sys.stderr)
        print(device["udid"])
    except (ValueError, KeyError) as error:
        sys.exit(str(error))
