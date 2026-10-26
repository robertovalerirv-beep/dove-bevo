#!/usr/bin/env bash
# Capture the existing live-service test on a real 13-inch iPad simulator.
set -euo pipefail

IOS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RESULT_BUNDLE="$IOS_ROOT/.build/iPadScreenshots.xcresult"
SCREENSHOTS="$IOS_ROOT/.build/Screenshots-iPad"
INVENTORY="$IOS_ROOT/.build/iPadSimulatorInventory.json"

if [[ -e "$RESULT_BUNDLE" || -e "$SCREENSHOTS" ]]; then
    printf 'iPad capture output already exists; preserve it before starting another capture.\n' >&2
    exit 1
fi
mkdir -p "$IOS_ROOT/.build"
SDK_VERSION="$(xcrun --sdk iphonesimulator --show-sdk-version)"
xcrun simctl list --json > "$INVENTORY"
SIMULATOR_ID="$(python3 - "$INVENTORY" "$SDK_VERSION" <<'PY'
import json
from pathlib import Path
import re
import sys
import uuid


def select_ipad(inventory, sdk_version):
    if not re.fullmatch(r"\d+(?:\.\d+)*", sdk_version):
        raise ValueError("The selected Xcode simulator SDK version is invalid")
    sdk_major = int(sdk_version.split(".")[0])
    types = {
        item["identifier"]: item
        for item in inventory["devicetypes"]
        if item.get("productFamily") == "iPad"
        and re.search(r"\b13\s*[-\u2010-\u2015]?\s*inch\b", item.get("name", ""), re.IGNORECASE)
    }
    runtimes = {}
    for runtime in inventory["runtimes"]:
        version = runtime.get("version", "")
        if (runtime.get("isAvailable") is True
                and runtime.get("identifier", "").startswith("com.apple.CoreSimulator.SimRuntime.iOS-")
                and re.fullmatch(r"\d+(?:\.\d+)*", version)
                and int(version.split(".")[0]) == sdk_major):
            runtimes[runtime["identifier"]] = tuple(map(int, version.split(".")))
    candidates = []
    for runtime_id, devices in inventory["devices"].items():
        if runtime_id not in runtimes:
            continue
        for device in devices:
            device_type = types.get(device.get("deviceTypeIdentifier"))
            if device.get("isAvailable") is True and device_type:
                # Accept only an identifier supplied by simctl, never a guessed
                # UDID or a renamed phone/11-inch tablet that resembles an iPad.
                uuid.UUID(device["udid"])
                candidates.append((runtimes[runtime_id], device_type, device))
    if not candidates:
        raise ValueError("No installed available 13-inch iPad simulator matches the selected Xcode iOS SDK major version")
    newest = max(item[0] for item in candidates)
    matches = [item for item in candidates if item[0] == newest]
    matches.sort(key=lambda item: (
        item[2].get("state") != "Booted", item[1]["name"], item[2]["name"], item[2]["udid"]
    ))
    return matches[0]


try:
    version, device_type, device = select_ipad(json.loads(Path(sys.argv[1]).read_text()), sys.argv[2])
    print(f'13-inch iPad capture: {device_type["name"]} | {device["name"]} | '
          f'iOS {".".join(map(str, version))} | {device["udid"]} | selected SDK {sys.argv[2]}', file=sys.stderr)
    print(device["udid"])
except (ValueError, KeyError, TypeError, OSError) as error:
    sys.exit(f"iPad simulator selection failed: {error}")
PY
)"

if [[ ! -d "$IOS_ROOT/DoveBevo.xcodeproj" ]]; then
    bash "$IOS_ROOT/scripts/generate-project.sh"
fi

export_attachments() {
    local status=$?
    local export_status=0
    trap - EXIT INT TERM
    set +e
    if [[ -d "$RESULT_BUNDLE" ]]; then
        xcrun xcresulttool export attachments --path "$RESULT_BUNDLE" \
            --output-path "$SCREENSHOTS"
        export_status=$?
        if [[ "$export_status" != 0 ]]; then
            printf 'iPad attachment export failed; the original test result bundle is retained.\n' >&2
        fi
    else
        printf 'No iPad test result bundle was produced; no screenshot evidence is available.\n' >&2
        export_status=1
    fi
    # A screenshot-export failure cannot turn a failed test green or conceal its
    # actual status. A passed test still needs its real attachments to succeed.
    if [[ "$status" == 0 && "$export_status" != 0 ]]; then
        status=$export_status
    fi
    exit "$status"
}
trap export_attachments EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

xcodebuild \
    -project "$IOS_ROOT/DoveBevo.xcodeproj" \
    -scheme DoveBevo -configuration Debug \
    -destination "platform=iOS Simulator,id=$SIMULATOR_ID,arch=$(uname -m)" \
    -derivedDataPath "$IOS_ROOT/.build/DerivedData" \
    -resultBundlePath "$RESULT_BUNDLE" \
    -parallel-testing-enabled NO \
    -only-testing:DoveBevoUITests/BrowserSmokeTests/testLiveWebsiteCitySearchAndMap \
    CODE_SIGNING_ALLOWED=NO test
