# Dove bevo for iPhone and iPad

Standalone UIKit app, bundle identifier `com.dovebevo.app`, minimum iOS 16.4.
It opens `https://www.dovebevo.com/` directly in a persistent `WKWebView`.
The mobile additions do not change the website, API, authentication, database or
Cloudflare configuration.
There are no third-party runtime SDKs or native JavaScript bridges.

A native first-launch screen shows the bundled `mobile-apps/terms.md` before a
web view is constructed. Privacy is available offline. «Ho almeno 18 anni e
accetto» stores only accepted rules version `2026-10-26` in this app's preferences
and opens the website once. Missing or stale acceptance returns to welcome;
declining leaves welcome available without starting the website or location.

The native controls provide back, forward, home, sharing, reload, browser handoff,
location-permission help, accessible loading/progress, offline information and retry.
The More menu also opens a native, scrollable Privacy screen from the shared
`mobile-apps/privacy.md` bundled as UTF-8, available without connectivity. A
support button explicitly opens `mailto:dovebevo@gmail.com`; returning with the
native back button preserves the existing website view and session.
WebKit can recover automatically once after a content-process termination; another
termination shows an explicit retry. Dark mode, system text sizes, safe areas,
landscape and iPad share popovers use UIKit defaults.

## Build with Xcode

Requirements: macOS, Xcode 16.4 or later with an installed iOS simulator, command-line
tools selected with `xcode-select`, Python 3 and network access for the build tool
and the live-site smoke test. CI pins Xcode 26.3 and the iOS 26.2 simulator.
The production live-test job uses `macos-15-intel`; RC.6 actually ran on
macOS 15.7.9 (24G830), `Macmini6,2` / `x86_64h`, with an iPhone 17 `x86_64`
simulator. Internal checks and signing jobs remain on macOS 26 ARM. The Intel
trial still failed the live search after a WebKit GPU failure; neither host
has passed the required live suite. See [release status](../RELEASE_STATUS.md)
for exact runs and remaining gates. No Node or CocoaPods installation
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
available iPhone simulator UDID to choose a particular device, including an older
OS for explicit compatibility checks. Set `IOS_SIMULATOR_RUNTIME` to an exact
installed version such as `26.2` to pin the main tests and both store captures;
an unavailable pin or a conflicting device selection fails. `IOS_SIMULATOR_MODEL`
selects an exact actual iPhone type from `simctl`, independent of a device's
editable name. CI selects iPhone 17 to retain a medium Dynamic Island screenshot,
alongside the separate large-iPhone and 13-inch iPad captures. Tests otherwise choose the newest installed
available iOS runtime matching the selected Xcode SDK major version and print its
device, OS and SDK. Missing matching runtimes fail clearly. Open the generated `mobile-apps/ios/DoveBevo.xcodeproj`
to run interactively. `project.yml` is the reproducible source of the project;
generated Xcode projects, tools and build outputs are ignored.

Outputs stay under `mobile-apps/ios/.build/`: the simulator app is
`DerivedData/Build/Products/Debug-iphonesimulator/DoveBevo.app`, device archive is
`DoveBevo.xcarchive`, and test evidence is `TestResults*.xcresult` plus exported
`Screenshots/`. `last-test-result-path.txt` records the latest result bundle.
`SimulatorDiagnostics/` retains bounded process-termination diagnostics without
logging website URLs or session values from application code.
Reruns preserve previous result bundles. An unsigned archive cannot be installed
on a physical device or uploaded as a signed App Store build.

## Verification and release boundaries

`mobile-testing/v*` tags prepare a separate internal-testing build after fresh
unit and signing-boundary checks. The iOS export must set
`testFlightInternalTestingOnly`; the installed Xcode must advertise that option
before credentials are decoded. These builds cannot be submitted to customers.
They exist for real-phone checks when hosted graphics or network challenges
block the live suite. No tester invitations or public review submissions are
sent automatically. `mobile-release/v*` keeps its full Android/iOS live gates.
Both tag families share this workflow's build-number counter.
Use a new unique tag after an accepted upload: rerunning an existing workflow
reuses its build number and is not a new distribution attempt.

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

## Protected signed release

After the release workflow's Android and iOS functional checks pass, invoke:

```sh
bash mobile-apps/ios/scripts/release-ios.sh
# Explicitly add upload only in the authorized release workflow:
bash mobile-apps/ios/scripts/release-ios.sh --upload
```

The separate script leaves ordinary unsigned CI unchanged. It requires macOS,
Xcode 26+, an iOS 26+ SDK and Python 3.9+ (standard library only). Provide these
inputs through the platform's protected secrets/environment, never a source file:

| Input | Purpose |
| --- | --- |
| `DOVEBEVO_IOS_CERTIFICATE_BASE64` | Base64 of an encrypted Apple Distribution P12 |
| `DOVEBEVO_SIGNING_PASSWORD` | P12 password |
| `DOVEBEVO_IOS_PROFILE_BASE64` | Base64 App Store Connect distribution profile |
| `DOVEBEVO_BUILD_NUMBER` | Optional positive build number; default `1` |
| `RUNNER_TEMP` | OS temporary directory outside this checkout and OneDrive |
| `DOVEBEVO_ASC_PRIVATE_KEY` | Upload only: raw PKCS8 PEM App Store Connect team key |
| `DOVEBEVO_ASC_KEY_ID` | Upload only: approved key ID |
| `DOVEBEVO_ASC_ISSUER_ID` | Upload only: approved team key issuer UUID |

The script verifies team `9T359CV674`, explicit App ID `com.dovebevo.app`, profile
expiry, App Store distribution type and the exact valid Apple Distribution
identity authorized by the profile. It rejects development, ad hoc and enterprise
profiles. Manual archive/export options pin the profile UUID and certificate
fingerprint. Both the archive and exported app undergo real `codesign` checks;
the exported entitlements, embedded profile, bundle/build/platform and actual
signature certificate must match. Metadata tests do not mock Apple signing:

```sh
python3 -m unittest discover -s mobile-apps/ios/scripts/tests -v
```

The original P12 and the AES256/SHA1-MAC trial are retained in the secure signing
store. Internal.3's AES trial failed Apple's importer with
`import-format-unknown` / OSStatus `-25257`, before archive or export. A separate
encrypted 3DES compatibility container preserves the certificate, private key
and password; its actual Apple import is pending Internal.4's result. Local
container verification does not establish Apple importer compatibility.

`mobile-apps/scripts/publish-signing-secrets.ps1` still defaults to
`ios-distribution.p12`. To select the compatibility container for an authorized
retry, use explicit parameters:

```powershell
.\mobile-apps\scripts\publish-signing-secrets.ps1 -IosCertificateFile ios-distribution-apple-3des.p12 -IosCertificateOnly
```

That mode updates only the existing `DOVEBEVO_IOS_CERTIFICATE_BASE64` repository
secret. It does not replace the signing password, profile, API key or Android
identity. No signing material belongs in the source tree or OneDrive.

Signing material is decoded only into a fresh `0700` directory under validated
`RUNNER_TEMP` with `0600` files, imported into a task-owned ephemeral keychain and
restricted to Apple signing tools. Only the matching profile is installed in the
OS Xcode provisioning directory. Existing identical profiles are reused and
preserved; collisions fail without overwriting. Exit/signal cleanup restores the
previous keychain search list, removes the task's keychain/profile and deletes
its private temporary files, including on command failures. A cleanup failure
fails the release. A killed host cannot run a trap; GitHub-hosted job isolation
is the additional cleanup boundary.

Outputs are `.build/release/DoveBevo.xcarchive`,
`.build/release/export/DoveBevo.ipa` and the secret-free
`.build/release/release-manifest.json`. Existing release output is preserved and
causes a new invocation to stop. The signed app necessarily contains its public
distribution profile and certificate chain; no P12, private key or authentication
file is copied to these outputs.

Upload is disabled unless `--upload` is passed. That mode requires the selected
Xcode's `altool` to support an explicit `--p8-file-path`, validates the IPA and then
uploads using the approved API key in the private temporary directory. It never
uses an Apple Account password, a credential in the user's home directory or an
Admin provisioning API key. An upload command succeeding does not attest App
Store processing, TestFlight approval or public release. Apple documents
[API authentication for altool](https://developer.apple.com/documentation/technotes/tn3147-migrating-to-the-latest-notarization-tool),
[App Store upload tools](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/)
and the [Xcode 16+ profile location](https://developer.apple.com/documentation/xcode-release-notes/xcode-16-release-notes).

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
The included privacy manifest also covers the controlled website's audited data
flows conservatively as linked data, without tracking, and declares the app-only
UserDefaults reason `CA92.1` for rules acceptance. Store disclosures still require
owner review before submission. The 1024 px icon is the existing approved mobile preview brand asset;
no public website/brand source was modified.
