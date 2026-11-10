#!/usr/bin/env bash
set -euo pipefail
TEST_ARGS=(-parallel-testing-enabled NO)
if [[ "$#" == 1 && "$1" == --unit-only ]]; then
    TEST_ARGS+=(-only-testing:DoveBevoTests)
    RUN_UI_TESTS=false
elif [[ "$#" != 0 ]]; then
    printf 'Usage: bash mobile-apps/ios/scripts/test-simulator.sh [--unit-only]\n' >&2
    exit 2
else
    RUN_UI_TESTS=true
fi
IOS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ ! -d "$IOS_ROOT/DoveBevo.xcodeproj" ]]; then
    bash "$IOS_ROOT/scripts/generate-project.sh"
fi
SDK_VERSION="$(xcrun --sdk iphonesimulator --show-sdk-version)"
SELECTOR_ARGS=(--sdk-version "$SDK_VERSION")
if [[ -n "${IOS_SIMULATOR_ID:-}" ]]; then
    SELECTOR_ARGS+=(--device-id "$IOS_SIMULATOR_ID")
fi
if [[ -n "${IOS_SIMULATOR_RUNTIME:-}" ]]; then
    SELECTOR_ARGS+=(--runtime-version "$IOS_SIMULATOR_RUNTIME")
fi
if [[ -n "${IOS_SIMULATOR_MODEL:-}" ]]; then
    SELECTOR_ARGS+=(--device-model "$IOS_SIMULATOR_MODEL")
fi
SIMULATOR_ID="$(xcrun simctl list --json | python3 "$IOS_ROOT/scripts/select_simulator.py" \
    "${SELECTOR_ARGS[@]}")"
SIMULATOR_ARCH="$(uname -m)"
RESULT_BUNDLE="$IOS_ROOT/.build/TestResults.xcresult"
COUNTER=1
while [[ -e "$RESULT_BUNDLE" ]]; do
    RESULT_BUNDLE="$IOS_ROOT/.build/TestResults-$COUNTER.xcresult"
    COUNTER=$((COUNTER + 1))
done
ENTRY_BROWSER_RESULT_BUNDLE="$IOS_ROOT/.build/EntryBrowserFixtureResults.xcresult"
COUNTER=1
while [[ -e "$ENTRY_BROWSER_RESULT_BUNDLE" ]]; do
    ENTRY_BROWSER_RESULT_BUNDLE="$IOS_ROOT/.build/EntryBrowserFixtureResults-$COUNTER.xcresult"
    COUNTER=$((COUNTER + 1))
done
mkdir -p "$IOS_ROOT/.build"
printf '%s\n' "$RESULT_BUNDLE" > "$IOS_ROOT/.build/last-test-result-path.txt"
TEST_STARTED_AT="$(date +%s)"
DIAGNOSTICS="$IOS_ROOT/.build/SimulatorDiagnostics"
mkdir -p "$DIAGNOSTICS"
COLLECTOR_PID=''
BOOTED_BY_SCRIPT=false
simulator_state() {
    xcrun simctl list devices --json | python3 -c '
import json, sys
devices = [d for group in json.load(sys.stdin)["devices"].values() for d in group if d["udid"] == sys.argv[1]]
if len(devices) != 1:
    sys.exit("Selected simulator state is unavailable")
print(devices[0]["state"])
' "$SIMULATOR_ID"
}
finish() {
    local status=$?
    trap - EXIT INT TERM
    set +e
    if [[ -n "$COLLECTOR_PID" ]]; then
        kill -TERM "$COLLECTOR_PID" 2>/dev/null
        wait "$COLLECTOR_PID" \
            || printf 'Native lifecycle collection was unavailable; test status is retained.\n' >&2
    fi
    if [[ "$BOOTED_BY_SCRIPT" == true ]]; then
        local current_state
        if ! current_state="$(simulator_state)"; then
            printf 'Owned simulator state was unavailable; test status is retained.\n' >&2
        elif [[ "$current_state" != Shutdown ]]; then
            xcrun simctl shutdown "$SIMULATOR_ID" >/dev/null 2>&1 \
                || printf 'Owned simulator shutdown was unavailable; test status is retained.\n' >&2
        fi
    fi
    python3 "$IOS_ROOT/scripts/collect-diagnostics.py" --since "$TEST_STARTED_AT" \
        || printf 'Host crash metadata was unavailable; test status is retained.\n' >&2
    if [[ -d "$RESULT_BUNDLE" ]]; then
        xcrun xcresulttool export attachments --path "$RESULT_BUNDLE" \
            --output-path "$IOS_ROOT/.build/Screenshots" \
            || printf 'Attachment export was unavailable; test status is retained.\n' >&2
    fi
    exit "$status"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# bootstatus -b boots only this selected device if needed and waits for readiness.
# Capture during the test: Xcode may shut the simulator down before returning.
SELECTED_STATE="$(simulator_state)"
case "$SELECTED_STATE" in
    Shutdown) BOOTED_BY_SCRIPT=true ;;
    Booted|Booting) ;;
    *) printf 'Selected simulator is in an unsupported transition state.\n' >&2; exit 1 ;;
esac
printf 'Selected simulator initial state: %s; boot owned by script: %s\n' "$SELECTED_STATE" "$BOOTED_BY_SCRIPT"
xcrun simctl bootstatus "$SIMULATOR_ID" -b
python3 "$IOS_ROOT/scripts/collect-native-lifecycle.py" --device "$SIMULATOR_ID" \
    --output "$DIAGNOSTICS/native-lifecycle-$(basename "$RESULT_BUNDLE" .xcresult).json" &
COLLECTOR_PID=$!
# Build the exact unsigned app and verify a positive launch PID on this selected
# simulator before starting the live UI suite. This catches hosted launch stalls
# without treating a missing app process as a passed product test.
if [[ "$RUN_UI_TESTS" == true ]]; then
    xcodebuild \
        -project "$IOS_ROOT/DoveBevo.xcodeproj" \
        -scheme DoveBevo -configuration Debug \
        -destination "platform=iOS Simulator,id=$SIMULATOR_ID,arch=$SIMULATOR_ARCH" \
        -derivedDataPath "$IOS_ROOT/.build/DerivedData" \
        CODE_SIGNING_ALLOWED=NO build
    python3 "$IOS_ROOT/scripts/preflight-simulator-app.py" \
        --device-id "$SIMULATOR_ID" --ios-root "$IOS_ROOT" \
        --app "$IOS_ROOT/.build/DerivedData/Build/Products/Debug-iphonesimulator/DoveBevo.app"
fi
set +e
# The owned-document tests exercise real WebKit navigation and URL identity.
# Run them in a fresh test app process: the hosted simulator has previously
# failed to finish simulated navigation after the other WebKit tests created
# many WebContent processes. Keep the remaining unit and UI tests in the
# ordinary result bundle, without omitting or weakening either set.
xcodebuild \
    -project "$IOS_ROOT/DoveBevo.xcodeproj" \
    -scheme DoveBevo -configuration Debug \
    -destination "platform=iOS Simulator,id=$SIMULATOR_ID,arch=$SIMULATOR_ARCH" \
    -derivedDataPath "$IOS_ROOT/.build/DerivedData" \
    -resultBundlePath "$ENTRY_BROWSER_RESULT_BUNDLE" \
    -parallel-testing-enabled NO \
    -only-testing:DoveBevoTests/MobileEntryBrowserTests \
    CODE_SIGNING_ALLOWED=NO test
ENTRY_BROWSER_TEST_STATUS=$?
xcodebuild \
    -project "$IOS_ROOT/DoveBevo.xcodeproj" \
    -scheme DoveBevo -configuration Debug \
    -destination "platform=iOS Simulator,id=$SIMULATOR_ID,arch=$SIMULATOR_ARCH" \
    -derivedDataPath "$IOS_ROOT/.build/DerivedData" \
    -resultBundlePath "$RESULT_BUNDLE" \
    "${TEST_ARGS[@]}" \
    -skip-testing:DoveBevoTests/MobileEntryBrowserTests \
    CODE_SIGNING_ALLOWED=NO test
TEST_STATUS=$?
set -e
if [[ "$ENTRY_BROWSER_TEST_STATUS" -ne 0 ]]; then
    exit "$ENTRY_BROWSER_TEST_STATUS"
fi
exit "$TEST_STATUS"
