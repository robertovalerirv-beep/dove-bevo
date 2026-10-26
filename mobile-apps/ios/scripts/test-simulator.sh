#!/usr/bin/env bash
set -euo pipefail
IOS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ ! -d "$IOS_ROOT/DoveBevo.xcodeproj" ]]; then
    bash "$IOS_ROOT/scripts/generate-project.sh"
fi
SDK_VERSION="$(xcrun --sdk iphonesimulator --show-sdk-version)"
SIMULATOR_ID="$(xcrun simctl list devices available --json | python3 "$IOS_ROOT/scripts/select_simulator.py" \
    --sdk-version "$SDK_VERSION" ${IOS_SIMULATOR_ID:+--device-id "$IOS_SIMULATOR_ID"})"
SIMULATOR_ARCH="$(uname -m)"
RESULT_BUNDLE="$IOS_ROOT/.build/TestResults.xcresult"
COUNTER=1
while [[ -e "$RESULT_BUNDLE" ]]; do
    RESULT_BUNDLE="$IOS_ROOT/.build/TestResults-$COUNTER.xcresult"
    COUNTER=$((COUNTER + 1))
done
mkdir -p "$IOS_ROOT/.build"
printf '%s\n' "$RESULT_BUNDLE" > "$IOS_ROOT/.build/last-test-result-path.txt"
TEST_STARTED_AT="$(date +%s)"
set +e
xcodebuild \
    -project "$IOS_ROOT/DoveBevo.xcodeproj" \
    -scheme DoveBevo -configuration Debug \
    -destination "platform=iOS Simulator,id=$SIMULATOR_ID,arch=$SIMULATOR_ARCH" \
    -derivedDataPath "$IOS_ROOT/.build/DerivedData" \
    -resultBundlePath "$RESULT_BUNDLE" \
    -parallel-testing-enabled NO \
    CODE_SIGNING_ALLOWED=NO test
TEST_STATUS=$?
set -e
mkdir -p "$IOS_ROOT/.build/SimulatorDiagnostics"
xcrun simctl spawn "$SIMULATOR_ID" log show --style compact --last 15m \
    --predicate 'process == "DoveBevo" AND (eventMessage BEGINSWITH "DoveBevo:" OR eventMessage CONTAINS "processDidTerminate" OR eventMessage CONTAINS "terminated" OR eventMessage CONTAINS "crash")' \
    >"$IOS_ROOT/.build/SimulatorDiagnostics/browser-process.txt" \
    2>"$IOS_ROOT/.build/SimulatorDiagnostics/log-collection.txt" \
    || printf 'Simulator process diagnostics were unavailable; test status is retained.\n' >&2
python3 "$IOS_ROOT/scripts/collect-diagnostics.py" --since "$TEST_STARTED_AT" \
    || printf 'Host crash metadata was unavailable; test status is retained.\n' >&2
if [[ -d "$RESULT_BUNDLE" ]]; then
    xcrun xcresulttool export attachments --path "$RESULT_BUNDLE" \
        --output-path "$IOS_ROOT/.build/Screenshots"
fi
exit "$TEST_STATUS"
