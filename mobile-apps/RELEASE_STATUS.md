# Mobile release status

Last verified: 28 October 2026 (UTC).

Google Play's production changes are **in review**. iOS build 21 is **Ready to
Test** in TestFlight and is installed on the owner's iPhone. Physical evidence
currently covers map/price rendering and reported venue Back behavior; neither
store state establishes an approved public release.

## Source and scope

The canonical repository is `robertovalerirv-beep/dove-bevo`; the active mobile
branch is `codex/mobile-internal-testing-20261027`. Owner main
`abeac75353ad5c2b73f97ee33b98fb2040d79ff4` is preserved. Mobile additions are
confined to `mobile-apps/` and `.github/workflows/mobile-apps.yml`; the website,
backend, schema, deployment and website security settings are unchanged.
PR #62 remains an older draft at head `722c`; it has not been updated or merged.
The mobile work has not been merged to main.

Project source, worktrees, builds and evidence remain in the selected OneDrive
project folder. Cloud synchronization is unverified. Credentials remain in
protected OS/platform stores, outside source and OneDrive.

## Android production review

Signed version 1.0.0, versionCode **20**, was uploaded and saved in production
from source `eaef11d564d1c78ad308e16efa7b20ef27bfcc7d`.
Its AAB SHA-256 is
`04a3270fbb7ae9196a619fda1c6290d074aa43518b2568cc8e062151d203198f`.
Eleven changes were submitted. The latest publishing overview says **Changes in
review / Your changes are now in review**; preliminary quick checks finished.
Managed publishing is off. Review approval, public availability and a
Play-delivered installation have not been established.

The Italian listing includes four accepted, genuine build 14 screenshots at
1080 by 1920. Original files and hashes are retained in
`store-assets/android-screenshots/capture-provenance.json`; they are emulator
captures, not evidence of physical-device behavior.

The documented Firebase Test Lab restriction is disclosed in Sign-in Details.
It limits automated Test Lab submissions and external actions; normal browsing
requires no authentication and retains the website's ordinary behavior. See
[the safety boundary](android/TEST_LAB_SAFETY.md); this is not a general network
firewall or a claim about every review environment.

The release 20 universal APK is non-debuggable, matches the approved signer,
and has DEX/assets equal to the submitted AAB. Its SHA-256 is
`d8907c868f7308a489322045a736197cea354b0a136ba9e6c78f8983cda9b8ff`.
Both isolated real WebView/service-worker cases passed again on that exact APK
in 1.1 seconds: restricted POSTs reached no local submission sink, and normal
controls reached their expected local sinks. Fixtures used reserved `.invalid`
origins and in-memory responses. Android unit results are **28 passed**, with
lint at **zero errors and 24 warnings**.

Normal live browsing passed on signed build 14: Milano search/selection, map
tiles and markers, an existing venue, native back, share chooser, cold restart,
offline privacy and network-restored reload. No shares or public contributions
were sent. Directions opened Google Maps, but return navigation was unverified;
permission denial/approximate access did not establish a successful location
result. Independent release 20 testing now passed Milano search/selection,
rendered map tiles/markers, an existing venue and native Back to the map.
The original `release20-milano-map.png` is 1080 by 1920, SHA-256
`00623bb3d4b08fa9428d01191b77b1db6a3374151943ef894eb2e99120e8ef9c`.
These are emulator checks of the upload-signed APK, not a Play App Signing
installation or a physical-phone test; other build 14 results remain separate.

## iOS internal build and device testing

`mobile-testing/v1.0.0-internal.11`, source
`37aee19478ddd66ad33516b09e2aa7b2e4a49985`, ran as
[40694213437](https://github.com/robertovalerirv-beep/dove-bevo/actions/runs/40694213437).
Ten Swift unit tests and 81 script guards passed. Signing job `122840500668`
succeeded: archive, export, strict code-signature checks, actual certificate,
profile and entitlement validation, and upload all completed.
The verified IPA SHA-256 is
`7ce3c3a552ffb41e8bf30c51782a99d97e7066d0cc7cf5165c806ff740958b23`.

App Store Connect shows build **21 Ready to Test**, after the factual
OS-framework-only encryption question was answered. A manually distributed
internal group contains one build and one existing Account Holder. The last
provider read-back showed **Invited**; installation on the owner's iPhone 16
Plus is now observed, but server-side **Accepted** status has not been read back.
No other testers, users or roles were added.

The owner's original 590 by 1280 JPEG shows the native iOS controls, rendered
Milano tiles and price pins. The owner reports that Back works within venue
selection. These are limited physical checks: location, offline recovery,
sharing, directions and Forward remain untested on the phone. Source inspection
confirms city selection changes the map camera without adding browser history,
while opening a venue uses `pushState`; no Back defect is established.
The image SHA-256 is
`4358090143f04ad67ddb318d32b75af1afd10b882e37ff36939b15df5f72df50`.
It is QA evidence, not an accepted medium-iPhone or iPad store screenshot. Do not
resize or upscale it to satisfy store dimensions.

Build 21 is **TestFlight Internal Only** and cannot be submitted for public App
Store distribution. A production-eligible IPA, genuine iOS store captures and
the remaining physical checks are required. Digital Services Act trader
status was verified **Active in 27 countries** on 28 October.

The source now declares `ITSAppUsesNonExemptEncryption=false` (commit
`be8605b`), matching its use of OS frameworks rather than custom cryptography.
This source change is separate from the already uploaded internal build.

## iOS live capture trial

`mobile-capture/v1.0.0-xcode27.1-1` at source
`99a35f2a5bf5b368409432dbbf28e1767e462dc9` ran as
[40699367667](https://github.com/robertovalerirv-beep/dove-bevo/actions/runs/40699367667)
(workflow number 22), which **failed**. All eight other jobs were skipped; no
credentials were supplied. The actual host used macOS 27.0.1, Xcode 27.1 and an
iOS 27.0 iPhone 17 simulator. Ten unit tests and both native UI tests passed.
After selecting Milano Città, the live case failed its 45-second wait for the
map's accessibility label (`BrowserSmokeTests.swift:88`). No GPU-termination
line appeared in the job log; the underlying cause remains unknown. The iPad
capture and final PNG-validation steps were skipped.

The exporter reported 69 attachments and a manifest, but the always-run artifact
upload reported no files, and the provider lists zero artifacts. Hidden
`.build` exclusion is the leading explanation for that separate upload failure.
A narrowly scoped hidden-file opt-in is being prepared for the existing
credential-free artifact allowlist. The follow-up capture is not yet launched;
no diagnostic download, successful live result or store-ready iOS capture is
established. Keep the live assertions and original image dimensions unchanged.

## Retained failure history and remaining gates

[RC.6 run 40436740241](https://github.com/robertovalerirv-beep/dove-bevo/actions/runs/40436740241)
failed live checks: Android encountered a data-center Cloudflare challenge;
iOS 26.2 on Intel/Xcode 26.3 lost the city sheet after WebKit GPU crashes.
Native tests passed, but production signing was skipped. No website security
setting was changed to bypass either failure.

[Internal.3](https://github.com/robertovalerirv-beep/dove-bevo/actions/runs/40438320128)
failed P12 import; the separate 3DES container preserved the original identity.
[Internal.7](https://github.com/robertovalerirv-beep/dove-bevo/actions/runs/40673414558)
and [Internal.9](https://github.com/robertovalerirv-beep/dove-bevo/actions/runs/40678519019)
passed identity checks but failed profile discovery. A replacement profile kept
the same bundle/certificate and preserved the old active profile; both CMS
layers and DER/XML metadata were verified, without a revocation attestation.
[Internal.10](https://github.com/robertovalerirv-beep/dove-bevo/actions/runs/40691660000)
archived/exported, then stopped before the release manifest or upload. The exact
silent command was not established; reviewed extraction compatibility repairs
preceded Internal.11's successful end-to-end verification. Full older details
remain in Git history and retained evidence.

Next owners must read back Google's review decision, complete the remaining
iPhone checks, and verify genuine iOS captures
before preparing a production-eligible iOS submission. Use
[the device checklist](PHYSICAL_TEST_CHECKLIST.md). Upload, processing, review
approval and public availability are separate states; none imply the next.
