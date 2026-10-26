#!/usr/bin/env bash
set -euo pipefail
IOS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ ! -d "$IOS_ROOT/DoveBevo.xcodeproj" ]]; then
    bash "$IOS_ROOT/scripts/generate-project.sh"
fi
SIMULATOR_ID="${IOS_SIMULATOR_ID:-}"
if [[ -z "$SIMULATOR_ID" ]]; then
    SIMULATOR_ID="$(xcrun simctl list devices available --json | python3 -c '
import json, sys
devices = json.load(sys.stdin)["devices"]
phones = [d for runtime, group in devices.items() if ".iOS-" in runtime
          for d in group if d.get("isAvailable") and d["name"].startswith("iPhone")]
if not phones:
    sys.exit("No available iPhone simulator; install an iOS runtime in Xcode")
print(next((d for d in phones if d["state"] == "Booted"), phones[0])["udid"])
')"
fi
RESULT_BUNDLE="$IOS_ROOT/.build/TestResults.xcresult"
COUNTER=1
while [[ -e "$RESULT_BUNDLE" ]]; do
    RESULT_BUNDLE="$IOS_ROOT/.build/TestResults-$COUNTER.xcresult"
    COUNTER=$((COUNTER + 1))
done
mkdir -p "$IOS_ROOT/.build"
printf '%s\n' "$RESULT_BUNDLE" > "$IOS_ROOT/.build/last-test-result-path.txt"
set +e
xcodebuild \
    -project "$IOS_ROOT/DoveBevo.xcodeproj" \
    -scheme DoveBevo -configuration Debug \
    -destination "platform=iOS Simulator,id=$SIMULATOR_ID" \
    -derivedDataPath "$IOS_ROOT/.build/DerivedData" \
    -resultBundlePath "$RESULT_BUNDLE" \
    -parallel-testing-enabled NO \
    CODE_SIGNING_ALLOWED=NO test
TEST_STATUS=$?
set -e
if [[ -d "$RESULT_BUNDLE" ]]; then
    xcrun xcresulttool export attachments --path "$RESULT_BUNDLE" \
        --output-path "$IOS_ROOT/.build/Screenshots"
fi
exit "$TEST_STATUS"
