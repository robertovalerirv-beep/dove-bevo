#!/usr/bin/env bash
set -euo pipefail
IOS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ ! -d "$IOS_ROOT/DoveBevo.xcodeproj" ]]; then
    bash "$IOS_ROOT/scripts/generate-project.sh"
fi
xcodebuild \
    -project "$IOS_ROOT/DoveBevo.xcodeproj" \
    -scheme DoveBevo -configuration Debug \
    -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
    -derivedDataPath "$IOS_ROOT/.build/DerivedData" \
    CODE_SIGNING_ALLOWED=NO build
