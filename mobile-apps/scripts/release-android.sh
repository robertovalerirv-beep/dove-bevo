#!/usr/bin/env bash
# Only the protected release job supplies the key. Never enable xtrace here.
set +x
set -euo pipefail
umask 077
export LC_ALL=C

release_fail() { printf 'Android release failed: %s\n' "$1" >&2; exit 1; }
[[ "${GITHUB_ACTIONS:-}" == true && "${RUNNER_ENVIRONMENT:-}" == github-hosted && "${RUNNER_OS:-}" == Linux ]] \
    || release_fail 'the protected GitHub-hosted Linux job is required.'
[[ "$(uname -s)" == Linux ]] || release_fail 'Linux is required.'
if [[ "${DOVEBEVO_BUILD_NUMBER+x}" == x ]]; then
    [[ "$DOVEBEVO_BUILD_NUMBER" =~ ^[1-9][0-9]{0,9}$ ]] \
        || release_fail 'the optional build number must be a positive integer.'
    (( 10#$DOVEBEVO_BUILD_NUMBER <= 2100000000 )) \
        || release_fail 'the optional build number exceeds the Play version-code limit.'
fi
[[ -n "${DOVEBEVO_ANDROID_KEYSTORE_BASE64:-}" && -n "${DOVEBEVO_SIGNING_PASSWORD:-}" && -n "${DOVEBEVO_ANDROID_CERT_SHA256:-}" ]] \
    || release_fail 'the protected key, password and pinned public certificate fingerprint are required.'
[[ ${#DOVEBEVO_ANDROID_KEYSTORE_BASE64} -le 65536 && ${#DOVEBEVO_SIGNING_PASSWORD} -le 4096 ]] \
    || release_fail 'a protected signing input exceeds its limit.'
release_expected_cert="${DOVEBEVO_ANDROID_CERT_SHA256//:/}"
[[ "$release_expected_cert" =~ ^[0-9A-Fa-f]{64}$ ]] || release_fail 'the pinned certificate fingerprint is invalid.'
release_expected_cert="${release_expected_cert,,}"
[[ -n "${RUNNER_TEMP:-}" && -d "$RUNNER_TEMP" && ! -L "$RUNNER_TEMP" ]] \
    || release_fail 'an existing runner temporary directory is required.'
[[ -n "${JAVA_HOME:-}" && -x "$JAVA_HOME/bin/java" && -x "$JAVA_HOME/bin/jarsigner" && -x "$JAVA_HOME/bin/keytool" ]] \
    || release_fail 'JDK 21 including jarsigner and keytool is required.'
for release_tool in realpath stat id mktemp base64 timeout grep sha256sum; do
    command -v "$release_tool" >/dev/null || release_fail 'a required runner tool is missing.'
done

release_mobile_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
release_source_root="$(cd -- "$release_mobile_root/.." && pwd -P)"
release_android_root="$release_mobile_root/android"
release_temp="$(realpath -e -- "$RUNNER_TEMP")"
release_uid="$(id -u)"
[[ "$release_temp" != / && "$(stat -c '%u' -- "$release_temp")" == "$release_uid" ]] \
    || release_fail 'runner temporary directory ownership is invalid.'
case "$release_temp/" in "$release_source_root/"*) release_fail 'signing files must stay outside the source checkout.' ;; esac
release_aab="$release_android_root/app/build/outputs/bundle/release/app-release.aab"
[[ ! -e "$release_aab" && ! -L "$release_aab" ]] || release_fail 'use a fresh release output directory.'
release_private_dir=''
release_private_identity=''
release_build_started=0
release_verified=0
release_sha=''

release_cleanup() {
    local release_status=$? release_file
    trap - EXIT INT TERM
    set +e
    unset DOVEBEVO_ANDROID_KEYSTORE_BASE64 DOVEBEVO_SIGNING_PASSWORD DOVEBEVO_ANDROID_KEYSTORE
    if [[ -n "$release_private_dir" ]]; then
        if [[ -d "$release_private_dir" && ! -L "$release_private_dir" \
            && "$(basename -- "$release_private_dir")" =~ ^dovebevo-android-signing\.[A-Za-z0-9]{8}$ \
            && "$(realpath -e -- "$release_private_dir" 2>/dev/null)" == "$release_private_dir" \
            && "$(stat -c '%d:%i:%u:%a' -- "$release_private_dir" 2>/dev/null)" == "$release_private_identity" \
            && "$(dirname -- "$release_private_dir")" == "$release_temp" ]]; then
            for release_file in upload.p12 java-version.txt jarsigner.txt keytool.txt; do
                if [[ -e "$release_private_dir/$release_file" || -L "$release_private_dir/$release_file" ]]; then
                    if [[ -f "$release_private_dir/$release_file" && ! -L "$release_private_dir/$release_file" \
                        && "$(stat -c '%u' -- "$release_private_dir/$release_file")" == "$release_uid" ]]; then
                        rm -f -- "$release_private_dir/$release_file" 2>/dev/null || release_status=1
                    else release_status=1; fi
                fi
            done
            rmdir -- "$release_private_dir" 2>/dev/null || release_status=1
        else release_status=1; fi
    fi
    if [[ "$release_status" != 0 || "$release_verified" != 1 ]]; then
        # Only remove a new output from this invocation, never a pre-existing bundle.
        if [[ "$release_build_started" == 1 && -f "$release_aab" && ! -L "$release_aab" \
            && "$(stat -c '%u' -- "$release_aab")" == "$release_uid" \
            && "$(realpath -e -- "$release_aab")" == "$release_aab" ]]; then
            rm -f -- "$release_aab" || release_status=1
        fi
        printf 'Android release did not complete with verified signing and cleanup.\n' >&2
        exit 1
    fi
    printf 'Signed Android bundle verified; SHA-256: %s\n' "$release_sha"
    printf 'Output: mobile-apps/android/app/build/outputs/bundle/release/app-release.aab\n'
    exit 0
}
trap release_cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

release_private_dir="$(mktemp -d -- "$release_temp/dovebevo-android-signing.XXXXXXXX")"
[[ -d "$release_private_dir" && ! -L "$release_private_dir" \
    && "$(dirname -- "$release_private_dir")" == "$release_temp" \
    && "$(basename -- "$release_private_dir")" =~ ^dovebevo-android-signing\.[A-Za-z0-9]{8}$ \
    && "$(realpath -e -- "$release_private_dir")" == "$release_private_dir" ]] \
    || release_fail 'the private signing directory is not an owned runner path.'
release_private_identity="$(stat -c '%d:%i:%u:%a' -- "$release_private_dir")"
[[ "$release_private_identity" == *":$release_uid:700" ]] || release_fail 'private signing directory protection failed.'
timeout --signal=TERM --kill-after=5s 15s "$JAVA_HOME/bin/java" -version >"$release_private_dir/java-version.txt" 2>&1 \
    || release_fail 'JDK version check failed.'
grep -Eq '^(openjdk|java) version "21([.\"-])' "$release_private_dir/java-version.txt" \
    || release_fail 'JDK 21 is required.'
if ! printf '%s' "$DOVEBEVO_ANDROID_KEYSTORE_BASE64" | base64 --decode >"$release_private_dir/upload.p12" 2>/dev/null; then
    release_fail 'the protected keystore encoding is invalid.'
fi
[[ -s "$release_private_dir/upload.p12" && "$(stat -c '%a' -- "$release_private_dir/upload.p12")" == 600 ]] \
    || release_fail 'the decoded keystore is empty or not private.'
unset DOVEBEVO_ANDROID_KEYSTORE_BASE64
export DOVEBEVO_ANDROID_KEYSTORE="$release_private_dir/upload.p12"
release_build_started=1
(
    cd -- "$release_android_root"
    timeout --signal=TERM --kill-after=30s 900s bash ./gradlew --no-daemon --no-configuration-cache --no-build-cache --console=plain :app:bundleRelease </dev/null
) || release_fail 'the protected bundle build failed.'
[[ -s "$release_aab" && -f "$release_aab" && ! -L "$release_aab" \
    && "$(realpath -e -- "$release_aab")" == "$release_aab" \
    && "$(stat -c '%u' -- "$release_aab")" == "$release_uid" ]] || release_fail 'the build produced no owned release bundle.'

# An explicit own keystore/alias trusts the normal self-signed upload certificate.
# Require strict exit 0: exit 4 also means expiry/disabled algorithms, so never waive it.
# JDK 21 source: sun/security/tools/jarsigner/Main.java, loadKeyStore and verifyJar.
(
    ulimit -f 64
    timeout --signal=TERM --kill-after=5s 90s "$JAVA_HOME/bin/jarsigner" -J-Duser.language=en -J-Duser.country=US \
        -verify -strict -keystore "$DOVEBEVO_ANDROID_KEYSTORE" -storetype PKCS12 \
        -storepass:env DOVEBEVO_SIGNING_PASSWORD "$release_aab" dovebevo-upload
) >"$release_private_dir/jarsigner.txt" 2>&1 </dev/null || release_fail 'strict upload-certificate signature verification failed.'
[[ "$(stat -c '%s' -- "$release_private_dir/jarsigner.txt")" -le 65536 ]] \
    || release_fail 'the signature verification report exceeded its limit.'
grep -Fxq 'jar verified.' "$release_private_dir/jarsigner.txt" \
    || release_fail 'jarsigner did not verify a signed bundle.'
(
    ulimit -f 64
    timeout --signal=TERM --kill-after=5s 30s "$JAVA_HOME/bin/keytool" -J-Duser.language=en -J-Duser.country=US \
        -printcert -jarfile "$release_aab"
) >"$release_private_dir/keytool.txt" 2>&1 </dev/null || release_fail 'the bundle certificate could not be inspected.'
[[ "$(stat -c '%s' -- "$release_private_dir/keytool.txt")" -le 65536 ]] \
    || release_fail 'the bundle certificate report exceeded its limit.'
release_cert_count=0
release_actual_cert=''
while IFS= read -r release_line; do
    if [[ "$release_line" =~ ^[[:space:]]*SHA256:[[:space:]]*([0-9A-Fa-f:]+)[[:space:]]*$ ]]; then
        release_actual_cert="${BASH_REMATCH[1]//:/}"
        release_actual_cert="${release_actual_cert,,}"
        release_cert_count=$((release_cert_count + 1))
    fi
done <"$release_private_dir/keytool.txt"
[[ "$release_cert_count" == 1 && "$release_actual_cert" == "$release_expected_cert" ]] \
    || release_fail 'the actual bundle certificate does not match the pinned upload certificate.'
release_sha="$(sha256sum -- "$release_aab")"
release_sha="${release_sha%% *}"
[[ "$release_sha" =~ ^[0-9a-f]{64}$ ]] || release_fail 'release bundle hashing failed.'
release_verified=1
