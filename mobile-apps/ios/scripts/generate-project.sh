#!/usr/bin/env bash
set -euo pipefail

IOS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOOLS="$IOS_ROOT/.build/tools"
VERSION="2.44.1"
SHA256="a2e905fb68446e9bb4008cdfe2e13e3f176d0cbcca828b71770f8e53fca91b73"
ZIP="$TOOLS/xcodegen-$VERSION.zip"
mkdir -p "$TOOLS"
if [[ ! -f "$ZIP" ]]; then
    curl --fail --show-error --location --proto '=https' --tlsv1.2 \
        "https://github.com/yonaskolb/XcodeGen/releases/download/$VERSION/xcodegen.zip" \
        --output "$ZIP"
fi
# Verify before extraction or execution, including every cached use.
printf '%s  %s\n' "$SHA256" "$ZIP" | shasum -a 256 --check
unzip -q -o "$ZIP" -d "$TOOLS"
XCODEGEN="$TOOLS/xcodegen/bin/xcodegen"
chmod +x "$XCODEGEN"
if [[ "$("$XCODEGEN" --version)" != "Version: $VERSION" ]]; then
    printf 'Unexpected XcodeGen version\n' >&2
    exit 1
fi
cd "$IOS_ROOT"
"$XCODEGEN" generate --spec project.yml
