#!/usr/bin/env bash
# Capture the existing live-service test on a real store screenshot device.
set -euo pipefail

IOS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CAPTURE_DEVICE="${STORE_CAPTURE_DEVICE:-ipad}"
case "$CAPTURE_DEVICE" in
    ipad)
        RESULT_BUNDLE="$IOS_ROOT/.build/iPadScreenshots.xcresult"
        SCREENSHOTS="$IOS_ROOT/.build/Screenshots-iPad"
        INVENTORY="$IOS_ROOT/.build/iPadSimulatorInventory.json"
        CAPTURE_LABEL='13-inch iPad'
        ;;
    iphone-large)
        RESULT_BUNDLE="$IOS_ROOT/.build/iPhoneLargeScreenshots.xcresult"
        SCREENSHOTS="$IOS_ROOT/.build/Screenshots-iPhoneLarge"
        INVENTORY="$IOS_ROOT/.build/iPhoneLargeSimulatorInventory.json"
        CAPTURE_LABEL='large iPhone'
        ;;
    *)
        printf 'STORE_CAPTURE_DEVICE must be ipad or iphone-large.\n' >&2
        exit 2
        ;;
esac

if [[ -e "$RESULT_BUNDLE" || -e "$SCREENSHOTS" ]]; then
    printf '%s capture output already exists; preserve it before starting another capture.\n' "$CAPTURE_LABEL" >&2
    exit 1
fi
mkdir -p "$IOS_ROOT/.build"
SDK_VERSION="$(xcrun --sdk iphonesimulator --show-sdk-version)"
xcrun simctl list --json > "$INVENTORY"
SIMULATOR_ID="$(python3 - "$INVENTORY" "$SDK_VERSION" "$CAPTURE_DEVICE" <<'PY'
import json
from pathlib import Path
import re
import sys
import uuid


def select_device(inventory, sdk_version, capture_device):
    if capture_device not in ("ipad", "iphone-large"):
        raise ValueError("Capture device must be ipad or iphone-large")
    if not re.fullmatch(r"\d+(?:\.\d+)*", sdk_version):
        raise ValueError("The selected Xcode simulator SDK version is invalid")
    sdk_major = int(sdk_version.split(".")[0])
    family = "iPad" if capture_device == "ipad" else "iPhone"
    name_pattern = (r"\b13\s*[-\u2010-\u2015]?\s*inch\b" if capture_device == "ipad"
                    else r"\b(?:Pro\s*Max|Plus)\b|^iPhone\s+Air\b")
    types = {
        item["identifier"]: item
        for item in inventory["devicetypes"]
        if item.get("productFamily") == family
        and re.search(name_pattern, item.get("name", ""), re.IGNORECASE)
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
                # UDID or a renamed device that resembles a qualifying model.
                uuid.UUID(device["udid"])
                candidates.append((runtimes[runtime_id], device_type, device))
    if not candidates:
        label = "13-inch iPad" if capture_device == "ipad" else "large iPhone (Pro Max, Plus or iPhone Air)"
        raise ValueError(f"No installed available {label} simulator matches the selected Xcode iOS SDK major version")
    newest = max(item[0] for item in candidates)
    matches = [item for item in candidates if item[0] == newest]
    matches.sort(key=lambda item: (
        item[2].get("state") != "Booted", item[1]["name"], item[2]["name"], item[2]["udid"]
    ))
    return matches[0]


try:
    version, device_type, device = select_device(json.loads(Path(sys.argv[1]).read_text()), sys.argv[2], sys.argv[3])
    print(f'{sys.argv[3]} capture: {device_type["name"]} | {device["name"]} | '
          f'iOS {".".join(map(str, version))} | {device["udid"]} | selected SDK {sys.argv[2]}', file=sys.stderr)
    print(device["udid"])
except (ValueError, KeyError, TypeError, OSError) as error:
    sys.exit(f"Store screenshot simulator selection failed: {error}")
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
            printf '%s attachment export failed; the original test result bundle is retained.\n' "$CAPTURE_LABEL" >&2
        fi
    else
        printf 'No %s test result bundle was produced; no screenshot evidence is available.\n' "$CAPTURE_LABEL" >&2
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
