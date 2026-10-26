#!/usr/bin/env bash
# Signing/upload is an explicit release-workflow action, separate from tests.
set +x
set -euo pipefail
umask 077

IOS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(git -C "$IOS_ROOT" rev-parse --show-toplevel)"
SUPPORT="$IOS_ROOT/scripts/release_support.py"
RELEASE_ROOT="$IOS_ROOT/.build/release"
UPLOAD=false
if [[ "${1:-}" == "--upload" && "$#" == 1 ]]; then
    UPLOAD=true
elif [[ "$#" != 0 ]]; then
    printf 'Usage: bash mobile-apps/ios/scripts/release-ios.sh [--upload]\n' >&2
    exit 2
fi
fail() { printf 'iOS release failed: %s\n' "$1" >&2; exit 1; }
[[ "$(uname -s)" == Darwin ]] || fail 'macOS with Xcode is required'
[[ -n "${RUNNER_TEMP:-}" ]] || fail 'RUNNER_TEMP must name private OS temporary storage outside the checkout'
BUILD_NUMBER="${DOVEBEVO_BUILD_NUMBER:-1}"
[[ "$BUILD_NUMBER" =~ ^[1-9][0-9]{0,17}$ ]] || fail 'DOVEBEVO_BUILD_NUMBER must be a positive decimal integer'
for required in python3 security xcodebuild xcrun openssl codesign ditto; do
    command -v "$required" >/dev/null || fail "Required tool is unavailable: $required"
done
SDK_VERSION="$(xcrun --sdk iphoneos --show-sdk-version)"
[[ "${SDK_VERSION%%.*}" -ge 26 ]] || fail 'App Store uploads require the iOS 26 SDK or later'
XCODE_VERSION="$(xcodebuild -version | head -n 1 | awk '{print $2}')"
[[ "${XCODE_VERSION%%.*}" -ge 26 ]] || fail 'App Store uploads require Xcode 26 or later'
[[ ! -e "$RELEASE_ROOT" ]] || fail 'The release output already exists; preserve it before starting a separate release'

private_dir=''
task_keychain=''
keychain_attempted=false
search_list_changed=false
cleanup() {
    local status=$?
    local cleanup_failed=false
    trap - EXIT INT TERM
    set +e
    unset DOVEBEVO_IOS_CERTIFICATE_BASE64 DOVEBEVO_IOS_PROFILE_BASE64 DOVEBEVO_SIGNING_PASSWORD DOVEBEVO_ASC_PRIVATE_KEY
    if [[ -n "$private_dir" ]]; then
        python3 "$SUPPORT" cleanup-profile "$private_dir" || cleanup_failed=true
        if [[ "$search_list_changed" == true ]]; then
            python3 "$SUPPORT" keychain-list "$private_dir/original-keychains.txt" >/dev/null 2>&1 || cleanup_failed=true
        fi
        if [[ "$keychain_attempted" == true && -f "$task_keychain" ]]; then
            security delete-keychain "$task_keychain" >/dev/null 2>&1 || cleanup_failed=true
        fi
        python3 "$SUPPORT" cleanup-private "$private_dir" "$RUNNER_TEMP" "$REPO_ROOT" || cleanup_failed=true
    fi
    unset task_keychain_password
    if [[ "$cleanup_failed" == true ]]; then
        printf 'iOS release cleanup could not confirm removal of all owned signing material\n' >&2
        status=1
    fi
    exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

private_dir="$(python3 "$SUPPORT" private-dir "$RUNNER_TEMP" "$REPO_ROOT")"
task_keychain="$private_dir/dovebevo.keychain-db"
if [[ "$UPLOAD" == true ]]; then
    python3 "$SUPPORT" decode "$private_dir" upload
else
    python3 "$SUPPORT" decode "$private_dir"
fi
# Remove raw key/certificate inputs from the environment before build/tool child
# processes. Only the import command receives its necessary P12 password.
unset DOVEBEVO_IOS_CERTIFICATE_BASE64 DOVEBEVO_IOS_PROFILE_BASE64 DOVEBEVO_ASC_PRIVATE_KEY
openssl pkcs12 -in "$private_dir/distribution.p12" -info -noout \
    -passin env:DOVEBEVO_SIGNING_PASSWORD >"$private_dir/p12-info.txt" 2>&1 \
    || fail 'The P12 cannot be opened with the supplied signing password'
grep -Eqi 'Shrouded Keybag|Shrouded Key Bag|pkcs8ShroudedKeyBag' "$private_dir/p12-info.txt" \
    || fail 'The P12 must contain an encrypted private key'
security cms -D -i "$private_dir/distribution.mobileprovision" \
    >"$private_dir/profile.plist" 2>"$private_dir/profile-decode.txt" \
    || fail 'The provisioning profile cannot be decoded by Apple security tools'
python3 "$SUPPORT" profile "$private_dir/profile.plist" "$private_dir/profile.json"

task_keychain_password="$(openssl rand -base64 32)"
keychain_attempted=true
security create-keychain -p "$task_keychain_password" "$task_keychain" >/dev/null 2>&1 \
    || fail 'Cannot create the ephemeral signing keychain'
security set-keychain-settings -lut 21600 "$task_keychain" >/dev/null 2>&1
security unlock-keychain -p "$task_keychain_password" "$task_keychain" >/dev/null 2>&1
security import "$private_dir/distribution.p12" -k "$task_keychain" \
    -P "$DOVEBEVO_SIGNING_PASSWORD" -T /usr/bin/codesign >/dev/null 2>&1 \
    || fail 'Cannot import the signing identity into its private keychain'
unset DOVEBEVO_SIGNING_PASSWORD
security set-key-partition-list -S apple-tool:,apple:,codesign: -s \
    -k "$task_keychain_password" "$task_keychain" >/dev/null 2>&1 \
    || fail 'Cannot restrict signing-key access to Apple signing tools'
security find-identity -v -p codesigning "$task_keychain" >"$private_dir/identities.txt" 2>&1
IDENTITY="$(python3 "$SUPPORT" identity "$private_dir/profile.json" "$private_dir/identities.txt")"
security list-keychains -d user >"$private_dir/original-keychains.txt"
search_list_changed=true
python3 "$SUPPORT" keychain-list "$private_dir/original-keychains.txt" "$task_keychain" >/dev/null
python3 "$SUPPORT" install "$private_dir" "$private_dir/profile.json" "$REPO_ROOT"
python3 "$SUPPORT" options "$private_dir/profile.json" "$IDENTITY" "$private_dir/ExportOptions.plist"
PROFILE_UUID="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["uuid"])' "$private_dir/profile.json")"

bash "$IOS_ROOT/scripts/generate-project.sh"
mkdir -p "$RELEASE_ROOT"
xcodebuild -project "$IOS_ROOT/DoveBevo.xcodeproj" -scheme DoveBevo \
    -configuration Release -destination 'generic/platform=iOS' \
    -derivedDataPath "$IOS_ROOT/.build/ReleaseDerivedData" \
    -archivePath "$RELEASE_ROOT/DoveBevo.xcarchive" \
    CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM=9T359CV674 \
    CODE_SIGN_IDENTITY="$IDENTITY" PROVISIONING_PROFILE_SPECIFIER="$PROFILE_UUID" \
    CURRENT_PROJECT_VERSION="$BUILD_NUMBER" CODE_SIGNING_ALLOWED=YES CODE_SIGNING_REQUIRED=YES archive
codesign --verify --deep --strict "$RELEASE_ROOT/DoveBevo.xcarchive/Products/Applications/DoveBevo.app" >/dev/null 2>&1 \
    || fail 'The device archive code signature failed verification'
xcodebuild -exportArchive -archivePath "$RELEASE_ROOT/DoveBevo.xcarchive" \
    -exportPath "$RELEASE_ROOT/export" -exportOptionsPlist "$private_dir/ExportOptions.plist"
IPA="$RELEASE_ROOT/export/DoveBevo.ipa"
[[ -f "$IPA" ]] || fail 'The signed IPA was not exported'
ditto -x -k "$IPA" "$private_dir/ipa"
EXPORTED_APP="$private_dir/ipa/Payload/DoveBevo.app"
[[ -d "$EXPORTED_APP" ]] || fail 'The exported IPA has no DoveBevo app'
codesign --verify --deep --strict "$EXPORTED_APP" >/dev/null 2>&1 \
    || fail 'The exported IPA code signature failed verification'
codesign -d --entitlements :- "$EXPORTED_APP" >"$private_dir/entitlements.plist" 2>"$private_dir/entitlements-info.txt"
codesign -dvv "$EXPORTED_APP" >"$private_dir/codesign-details.txt" 2>&1
codesign -d --extract-certificates "$private_dir/signature-cert-" "$EXPORTED_APP" \
    >"$private_dir/signature-extract.txt" 2>&1
security cms -D -i "$EXPORTED_APP/embedded.mobileprovision" \
    >"$private_dir/embedded-profile.plist" 2>"$private_dir/embedded-profile-decode.txt"
python3 "$SUPPORT" verify "$private_dir" "$BUILD_NUMBER"
COMMIT="$(git -C "$REPO_ROOT" rev-parse HEAD)"
python3 "$SUPPORT" manifest "$IPA" "$RELEASE_ROOT/release-manifest.json" \
    "$private_dir/profile.json" "$BUILD_NUMBER" "$COMMIT"

if [[ "$UPLOAD" == true ]]; then
    ASC_KEY="$private_dir/private_keys/AuthKey_${DOVEBEVO_ASC_KEY_ID}.p8"
    openssl pkey -in "$ASC_KEY" -passin pass: -check -noout >"$private_dir/api-key-check.txt" 2>&1 \
        || fail 'The App Store Connect private key is invalid'
    # Xcode's bundled altool supports App Store uploads with API authentication.
    # Require its explicit key-path option rather than writing into a home cache
    # or relying on implicit credential discovery on the host.
    xcrun altool --help >"$private_dir/altool-help.txt" 2>&1
    grep -q -- '--p8-file-path' "$private_dir/altool-help.txt" \
        || fail 'Selected altool has no explicit --p8-file-path support; no upload attempted'
    xcrun altool --validate-app -f "$IPA" -t ios \
        --apiKey "$DOVEBEVO_ASC_KEY_ID" --apiIssuer "$DOVEBEVO_ASC_ISSUER_ID" \
        --p8-file-path "$ASC_KEY" --output-format json \
        >"$private_dir/upload-validation.json" 2>"$private_dir/upload-validation-error.txt" \
        || fail 'App Store Connect rejected IPA validation; no upload attempted'
    xcrun altool --upload-app -f "$IPA" -t ios \
        --apiKey "$DOVEBEVO_ASC_KEY_ID" --apiIssuer "$DOVEBEVO_ASC_ISSUER_ID" \
        --p8-file-path "$ASC_KEY" --output-format json \
        >"$private_dir/upload-result.json" 2>"$private_dir/upload-error.txt" \
        || fail 'The App Store Connect upload command failed; processing is unverified'
    python3 "$SUPPORT" upload-receipt "$RELEASE_ROOT/release-manifest.json"
    printf 'IPA upload command succeeded; App Store processing and review remain unverified.\n'
fi
printf 'Signed IPA and secret-free release manifest: %s\n' "$RELEASE_ROOT"
