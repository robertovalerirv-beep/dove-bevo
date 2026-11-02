#!/usr/bin/env bash
set -euo pipefail
IOS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ ! -d "$IOS_ROOT/DoveBevo.xcodeproj" ]]; then
    bash "$IOS_ROOT/scripts/generate-project.sh"
fi
xcodebuild \
    -project "$IOS_ROOT/DoveBevo.xcodeproj" \
    -scheme DoveBevo -configuration Release \
    -destination 'generic/platform=iOS' \
    -derivedDataPath "$IOS_ROOT/.build/DerivedData" \
    -archivePath "$IOS_ROOT/.build/DoveBevo.xcarchive" \
    CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY='' archive
