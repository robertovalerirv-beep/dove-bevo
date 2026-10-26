#!/usr/bin/env python3
"""Select a simulator reproducibly from simctl's real available-device JSON."""

import argparse
import json
import re
import sys


def select_simulator(inventory, sdk_version, requested_id=None):
    sdk = tuple(int(part) for part in sdk_version.split("."))
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
        return matches[0]
    matches = [item for item in candidates if item[0][0] == sdk[0]]
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
    args = parser.parse_args()
    try:
        version, device = select_simulator(json.load(sys.stdin), args.sdk_version, args.device_id)
        print(f'iOS simulator: {device["name"]} | iOS {".".join(map(str, version))} | {device["udid"]} | selected SDK {args.sdk_version}', file=sys.stderr)
        print(device["udid"])
    except (ValueError, KeyError) as error:
        sys.exit(str(error))
