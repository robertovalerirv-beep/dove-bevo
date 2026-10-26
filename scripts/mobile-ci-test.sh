#!/usr/bin/env bash
# Contract tests for lock bootstrap, locked resolution, drift and compiler failures.
# xcodebuild is a fixture here. These tests do not prove an Apple compilation.
set -euo pipefail
script="$(cd "$(dirname "$0")" && pwd)/mobile-ci-ios.sh"
scratch="$(mktemp -d "${TMPDIR:-/tmp}/mobile-ci-tests.XXXXXXXX")"
scratch="$(cd "$scratch" && pwd)"
case "$scratch" in
  */mobile-ci-tests.*) ;;
  *) echo 'Unexpected test directory' >&2; exit 1 ;;
esac
trap 'rm -rf -- "$scratch"' EXIT
mkdir -p "$scratch/bin"
cat > "$scratch/bin/xcodebuild" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$CALLS"
if [[ "$*" == *-help* ]]; then
  printf '%s\n' '-onlyUsePackageVersionsFromResolvedFile' '-disableAutomaticPackageResolution'
elif [[ "$*" == *-resolvePackageDependencies* ]]; then
  if [[ ! -f "$LOCK" || "${DRIFT:-}" == yes ]]; then
    mkdir -p "$(dirname "$LOCK")"
    printf '%s\n' '{"testFixtureOnly":true}' > "$LOCK"
  fi
elif [[ "$*" == *' build '* ]]; then
  exit 73
fi
MOCK
cat > "$scratch/bin/git" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == rev-parse ]]; then printf '%040d\n' 1; fi
MOCK
for command in node npm xcrun shasum; do
  printf '#!/usr/bin/env bash\nprintf "fixture-tool-version\\n"\n' > "$scratch/bin/$command"
done
chmod +x "$scratch/bin/"*
export PATH="$scratch/bin:$PATH"
export CALLS="$scratch/calls.txt"
export RUNNER_TEMP="$scratch/runner"
export LOCK='ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved'
mkdir -p "$RUNNER_TEMP" "$scratch/project"
cd "$scratch/project"

bash "$script" resolve > "$scratch/initial.log" 2>&1
grep -q 'INITIAL RESOLUTION EVIDENCE ONLY' "$RUNNER_TEMP/mobile-evidence/ios/resolution-mode.txt"
cmp "$LOCK" "$RUNNER_TEMP/mobile-evidence/ios/Package.resolved"
initial="$(grep -- '-resolvePackageDependencies' "$CALLS")"
[[ "$initial" != *-disableAutomaticPackageResolution* ]]
echo 'PASS: missing lock uses explicit initial resolver and exports its exact bytes'

: > "$CALLS"
bash "$script" resolve > "$scratch/locked.log" 2>&1
locked="$(grep -- '-resolvePackageDependencies' "$CALLS")"
[[ "$locked" == *-disableAutomaticPackageResolution* && "$locked" == *-onlyUsePackageVersionsFromResolvedFile* ]]
echo 'PASS: existing lock requires both Xcode lock flags'

printf '%s\n' '{"committedFixtureOnly":true}' > "$LOCK"
if DRIFT=yes bash "$script" resolve > "$scratch/drift.log" 2>&1; then
  echo 'Lock drift unexpectedly accepted' >&2; exit 1
fi
echo 'PASS: resolver lock mutation fails closed'

# Restore only the test fixture to reach the compiler invocation.
cp "$RUNNER_TEMP/mobile-evidence/ios/Package.resolved" "$LOCK"
: > "$CALLS"
status=0
bash "$script" build > "$scratch/build.log" 2>&1 || status=$?
[[ "$status" == 73 ]]
build="$(grep -- ' build ' "$CALLS")"
[[ "$build" == *-disableAutomaticPackageResolution* && "$build" == *-onlyUsePackageVersionsFromResolvedFile* && "$build" == *CODE_SIGNING_ALLOWED=NO* ]]
echo 'PASS: build stays locked and unsigned, compiler failure propagates through tee'

mv "$LOCK" "$scratch/fixture-lock"
: > "$CALLS"
if bash "$script" build > "$scratch/missing.log" 2>&1; then
  echo 'Build without lock unexpectedly accepted' >&2; exit 1
fi
[[ ! -s "$CALLS" ]]
echo 'PASS: build without resolved lock fails before compiler invocation'
