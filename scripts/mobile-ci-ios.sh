#!/usr/bin/env bash
# The first hosted resolution exports evidence; it never invents or commits a lock.
set -euo pipefail
: "${RUNNER_TEMP:?GitHub runner temporary directory required}"
evidence="$RUNNER_TEMP/mobile-evidence/ios"
lock="ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved"
mkdir -p "$evidence"
common=(-project ios/App/App.xcodeproj -scheme App -configuration Debug
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator'
  -derivedDataPath "$RUNNER_TEMP/mobile-ios-derived"
  -clonedSourcePackagesDirPath "$RUNNER_TEMP/mobile-ios-packages")
locked=(-onlyUsePackageVersionsFromResolvedFile -disableAutomaticPackageResolution)

case "${1:-}" in
  resolve)
    {
      node --version
      npm --version
      xcodebuild -version
      xcrun swift --version
      xcodebuild -showsdks
      git rev-parse HEAD
    } 2>&1 | tee "$evidence/toolchain.txt"
    # Record the exact flag semantics exposed by this installed compiler, too.
    xcodebuild -help > "$evidence/xcodebuild-help.txt" 2>&1
    grep -- '-onlyUsePackageVersionsFromResolvedFile' "$evidence/xcodebuild-help.txt"
    grep -- '-disableAutomaticPackageResolution' "$evidence/xcodebuild-help.txt"
    if [[ -f "$lock" ]]; then
      git ls-files --error-unmatch "$lock" > /dev/null
      git diff --exit-code -- "$lock"
      cp "$lock" "$evidence/Package.resolved"
      echo 'locked - committed app workspace resolution required' | tee "$evidence/resolution-mode.txt"
      xcodebuild "${common[@]}" "${locked[@]}" -resolvePackageDependencies 2>&1 | tee "$evidence/resolve.log"
      cmp "$lock" "$evidence/Package.resolved"
    else
      echo 'INITIAL RESOLUTION EVIDENCE ONLY - review and commit this real app workspace lock, then rerun locked CI' | tee "$evidence/resolution-mode.txt"
      xcodebuild "${common[@]}" -resolvePackageDependencies 2>&1 | tee "$evidence/resolve.log"
      test -s "$lock"
      cp "$lock" "$evidence/Package.resolved"
    fi
    shasum -a 256 "$evidence/Package.resolved" | tee "$evidence/package-lock-sha256.txt"
    ;;
  build)
    test -s "$lock"
    test -s "$evidence/Package.resolved"
    cmp "$lock" "$evidence/Package.resolved"
    xcodebuild "${common[@]}" "${locked[@]}" build CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY= 2>&1 | tee "$evidence/build.log"
    cmp "$lock" "$evidence/Package.resolved"
    app="$RUNNER_TEMP/mobile-ios-derived/Build/Products/Debug-iphonesimulator/App.app"
    test -d "$app"
    test "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$app/Info.plist")" = com.dovebevo.app.preview
    test "$(/usr/libexec/PlistBuddy -c 'Print :DTPlatformName' "$app/Info.plist")" = iphonesimulator
    test "$(/usr/libexec/PlistBuddy -c 'Print :MinimumOSVersion' "$app/Info.plist")" = 16.4
    test ! -e "$app/embedded.mobileprovision"
    test ! -e "$app/_CodeSignature"
    plutil -convert json -o "$evidence/built-info.json" "$app/Info.plist"
    test -s "$app/PrivacyInfo.xcprivacy"
    node --input-type=module -e 'import {checkNativeOutput} from "./native/build-policy.ts"; console.log(`Packaged native assets: ${checkNativeOutput(process.argv[1])} reviewed files`)' "$app/public" | tee "$evidence/asset-check.txt"
    # Preserve executable modes inside the download; no IPA or release archive.
    ditto -c -k --keepParent "$app" "$evidence/App-simulator.zip"
    shasum -a 256 "$evidence/App-simulator.zip" | tee "$evidence/app-sha256.txt"
    ;;
  *) echo 'Usage: mobile-ci-ios.sh resolve|build' >&2; exit 2 ;;
esac
