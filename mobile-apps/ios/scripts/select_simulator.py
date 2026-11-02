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


def resolve_device_model(inventory, value):
    if value is None:
        return None
    if (not isinstance(value, str) or len(value) > 80
            or not re.fullmatch(r"iPhone [A-Za-z0-9]+(?:[ -][A-Za-z0-9]+)*(?: \([A-Za-z0-9]+(?:[ -][A-Za-z0-9]+)*\))?", value)):
        raise ValueError("Requested iPhone model name is invalid")
    types = inventory.get("devicetypes", [])
    matches = [item for item in types if item.get("name") == value]
    if (len(matches) != 1 or matches[0].get("productFamily") != "iPhone"
            or not isinstance(matches[0].get("identifier"), str) or not matches[0]["identifier"]):
        raise ValueError("Requested iPhone model type is unavailable or ambiguous")
    model = matches[0]
    if sum(item.get("identifier") == model["identifier"] for item in types) != 1:
        raise ValueError("Requested iPhone model type identifier is ambiguous")
    return model


def select_simulator(inventory, sdk_version, requested_id=None, runtime_version=None, device_model=None):
    sdk = tuple(int(part) for part in sdk_version.split("."))
    pinned = parse_runtime_version(runtime_version)
    if pinned is not None and pinned[0] != sdk[0]:
        raise ValueError("Requested iOS runtime does not match the selected Xcode iOS SDK major version")
    model = resolve_device_model(inventory, device_model)
    candidates = []
    for runtime, devices in inventory["devices"].items():
        match = re.search(r"\.iOS-(\d+(?:-\d+)*)$", runtime)
        if not match:
            continue
        version = tuple(int(part) for part in match.group(1).split("-"))
        for device in devices:
            qualifies = (device.get("deviceTypeIdentifier") == model["identifier"] if model is not None
                         else device["name"].startswith("iPhone"))
            if device.get("isAvailable") and qualifies:
                candidates.append((version, device))
    if model is not None and not candidates:
        raise ValueError("No available simulator matches the requested iPhone model type")
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
    parser.add_argument("--device-model")
    args = parser.parse_args()
    try:
        inventory = json.load(sys.stdin)
        version, device = select_simulator(inventory, args.sdk_version, args.device_id, args.runtime_version, args.device_model)
        actual_types = [item for item in inventory.get("devicetypes", [])
                        if item.get("identifier") == device.get("deviceTypeIdentifier") and item.get("productFamily") == "iPhone"]
        actual_model = f' | actual model {actual_types[0]["name"]}' if len(actual_types) == 1 else ''
        print(f'iOS simulator: {device["name"]} | iOS {".".join(map(str, version))} | {device["udid"]} | selected SDK {args.sdk_version}{actual_model}', file=sys.stderr)
        print(device["udid"])
    except (ValueError, KeyError) as error:
        sys.exit(str(error))
