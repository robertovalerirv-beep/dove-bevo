# Dove bevo for iPhone and iPad

Standalone UIKit app, bundle identifier `com.dovebevo.app`, minimum iOS 16.4.
It opens `https://www.dovebevo.com/` directly in a persistent `WKWebView`.
The website, API, authentication, database and Cloudflare configuration are unchanged.
There are no third-party runtime SDKs or native JavaScript bridges.

The native controls provide back, forward, home, sharing, reload, browser handoff,
location-permission help, accessible loading/progress, offline information and retry.
WebKit can recover automatically once after a content-process termination; another
termination shows an explicit retry. Dark mode, system text sizes, safe areas,
landscape and iPad share popovers use UIKit defaults.

## Build with Xcode

Requirements: macOS, Xcode 16.4 or later with an installed iOS simulator, command-line
tools selected with `xcode-select`, Python 3 and network access for the build tool
and the live-site smoke test. CI uses Xcode 26.3. No Node or CocoaPods installation
is needed. The build-tool source is [XcodeGen 2.44.1](https://github.com/yonaskolb/XcodeGen/releases/tag/2.44.1)
(MIT). The generation script downloads its official release ZIP, verifies the
pinned SHA-256 before extraction/execution and checks the executable's version.

From the repository root:

```sh
bash mobile-apps/ios/scripts/generate-project.sh
bash mobile-apps/ios/scripts/build-simulator.sh
bash mobile-apps/ios/scripts/test-simulator.sh
bash mobile-apps/ios/scripts/archive-unsigned.sh
```

Set `DEVELOPER_DIR` to choose an installed Xcode. Set `IOS_SIMULATOR_ID` to an
available iPhone simulator UDID to choose a particular device. Tests otherwise
choose an available iPhone. Open the generated `mobile-apps/ios/DoveBevo.xcodeproj`
to run interactively. `project.yml` is the reproducible source of the project;
generated Xcode projects, tools and build outputs are ignored.

Outputs stay under `mobile-apps/ios/.build/`: the simulator app is
`DerivedData/Build/Products/Debug-iphonesimulator/DoveBevo.app`, device archive is
`DoveBevo.xcarchive`, and test evidence is `TestResults*.xcresult` plus exported
`Screenshots/`. `last-test-result-path.txt` records the latest result bundle.
Reruns preserve previous result bundles. An unsigned archive cannot be installed
on a physical device or uploaded as a signed App Store build.

## Verification and release boundaries

`URLPolicyTests` covers exact HTTPS origins, deceptive hosts/ports/userinfo,
programmatic external navigation, maps/mail/phone handoff, unsafe schemes and
Cloudflare/blank subframes. `BrowserSmokeTests` checks native accessibility, then
requires the real website to load, searches the real city list for Milano,
returns to the interactive map and saves screenshots. An offline screen or
challenge page fails live readiness. These tests never submit prices, venues,
confirmations or other public contributions.

On a real device, verify foreground location permission allow/deny, map gestures,
website session retention after termination, native sharing, Apple Maps/email
handoff, airplane-mode retry, keyboard layout and VoiceOver. The location request
comes from the website's normal `navigator.geolocation` through WebKit; there is
no native location proxy and no use of new/beta geolocation delegate methods.
The [foreground location purpose string](https://developer.apple.com/documentation/bundleresources/information-property-list/nslocationwheninuseusagedescription)
is declared. Browsing and city search remain available when location is denied.

Configure an authorized Apple developer team, certificates and provisioning only
in Xcode's secure signing facilities or the CI platform secret store. Never put
signing keys, profiles, passwords or authentication caches in this repository or
OneDrive. For a signed archive, run the same Xcode project/scheme with an external
`DEVELOPMENT_TEAM` and signing configuration; export using externally supplied
App Store export options. Store metadata/privacy declarations, account agreements,
signed device testing and App Review are separate release steps.

## Browser and privacy boundary

Only exact HTTPS `www.dovebevo.com` and `dovebevo.com` origins, without userinfo
or nonstandard ports, become top-level app documents. A tapped HTTPS, mail or
phone link from the main website can open another app. Programmatic redirects
cannot launch external apps. New same-site windows reuse the same WebKit view.
HTTPS frames and their `about:blank`, `about:srcdoc`, `blob:` and `data:` bootstrap
documents remain within normal WebKit isolation, including Turnstile. WebKit's
normal [link-activation navigation type](https://developer.apple.com/documentation/webkit/wknavigationtype)
is the external-handoff gate. No local/file/custom-scheme bridge is installed.
No ATS exceptions, TLS challenge overrides, certificate bypasses, custom user
agent, cookie extraction or native backend proxy are present.

The native shell has no analytics SDK, tracking SDK, native account database or
background location collection. `WKWebsiteDataStore.default()` retains the
website's normal cookies/local storage in the app sandbox, separate from Safari.
The included privacy manifest describes the native shell; the website's own
privacy policy and accurate store disclosures still require owner review before
submission. The 1024 px icon is the existing approved mobile preview brand asset;
no public website/brand source was modified.
