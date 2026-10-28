# Mobile release status

Last verified: 28 October 2026 (UTC).

Google Play's production changes are **in review**. iOS build 26 is **Waiting for
Review** for external TestFlight testing; Roberto's group contains one tester
and that build. Internal build 21 is installed on the owner's iPhone. Physical evidence
currently covers map/price rendering and reported venue Back behavior; neither
store state establishes an approved public release.

## Source and scope

The canonical repository is `robertovalerirv-beep/dove-bevo`; the active mobile
branch is `codex/mobile-internal-testing-20261027`. Owner main
`2338467a795d48d10cdc606c6a6f10b1e9c15e34` is incorporated without conflicts. Mobile additions are
confined to `mobile-apps/` and `.github/workflows/mobile-apps.yml`; the website,
backend, schema, deployment and website security settings are unchanged.
PR #62 remains an older draft at head `722c`; it has not been updated or merged.
The mobile work has not been merged to main. An independent literal tree
comparison confirms every tracked file outside the mobile allowlist equals
that owner main; the owner's new website changes are preserved.

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
The separate external group **Roberto feedback** now contains only the
owner-requested Roberto email tester. No App Store Connect team roles or public
invitation link were added. The provider currently says **No Builds Available**;
registration alone does not establish that an invitation was sent.

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

Build 21 is **TestFlight Internal Only** and cannot be submitted for external
testing or public App Store distribution. A production-eligible IPA, genuine iOS store captures and
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
upload reported no files, and the provider lists zero artifacts. The hidden
`.build` exclusion was corrected with a narrowly scoped hidden-file opt-in for
the existing credential-free artifact allowlist.

The follow-up tag `mobile-capture/v1.0.0-xcode27.1-2`, source
`7512b62725496daa106ea7442c718a427c7610ad`, ran as
[40703342794](https://github.com/robertovalerirv-beep/dove-bevo/actions/runs/40703342794)
(workflow number 23). Ten unit tests and both native UI cases passed, but the
live case failed the same exact-label assertion. Artifact **12823956355** was
successfully downloaded and its ZIP SHA-256 verified as
`7718ba103f2e39c3ffed381ac3fc25c635d7dab6508ffb73dbc8205567278706`.
The genuine original 1206 by 2622 failed-test frame and recording show Milano
tiles, two price pins and clusters during the assertion wait. The actual
accessibility hierarchy contains **Mappa interattiva dei bar, region**, whereas
the test required exact equality with **Mappa interattiva dei bar**. The hierarchy
also contains the current **2 bar su 43 qui hanno un prezzo** status. This is a
documented selector mismatch, not evidence of an absent map or a stale hierarchy.
Lifecycle collection reports no renderer-termination event and the crash summary
is empty; those collectors are best-effort. The test remains failed, and the
iPad and final validated-capture steps were skipped.

## External TestFlight candidate

`mobile-beta/v1.0.0-roberto.1`, source
`b070690a960532e7fd7f40195c62dd2614ed5986`, ran as
[40707946369](https://github.com/robertovalerirv-beep/dove-bevo/actions/runs/40707946369)
(workflow/build number 24) and **failed before signing**. Both check jobs passed;
the signer stopped at its `xcodebuild -version` pipeline with a broken-pipe
exception. No IPA was created or uploaded. The first-line consumer `head -n 1`
can close the pipe before Xcode finishes writing its complete version output.
A reviewed full-consumption parser repair now passes the original-failure
regression, nonzero-producer and minimum-version controls. The coordinator
reran all 88 script guards successfully.
This isolated lane requires fresh Android and iOS
checks, retains the exact approved toolchain and signing verification, and
uploads without the Internal Only restriction. It does not submit the public
App Store version. The corrected tag `mobile-beta/v1.0.0-roberto.2`, source
`88880558efe638e06f2fef69d74e5e789369b4cd`, succeeded as
[40710808509](https://github.com/robertovalerirv-beep/dove-bevo/actions/runs/40710808509)
(build 26). Both check jobs and signing/upload job `122900311762` passed.
Artifact **12826177998** has verified ZIP SHA-256
`060bfeb7af10bcb11b424fcdbc4a93debbaebed9e5ec762b313c7cc376e96860`;
the IPA SHA-256 is
`41dbff7ebbe12eb0f79de1117f65431ab9dc0396d83352b02e3ec6ec2dc18218`.
Independent checks confirm version/build, phone/tablet support, expected public
profile metadata and `distributionScope=app-store`. The manifest attests strict
signature validation and successful upload; Windows did not independently run
Apple codesign or CMS trust verification.

Apple subsequently processed build 26 and displayed **Ready to Submit**.
Beta App Review was submitted with automatic tester notification selected.
The provider now displays **Waiting for Review**, with **Roberto feedback**
containing one tester and one build. No public link or developer-team role was
created. The tester still shows **No Builds Available** pending approval;
invitation delivery and installation are not established. Beta description,
feedback address and review instructions were saved in App Store Connect.
The public App Store version also has build 26 selected and saved. Its latest
submission validation now lists only the 13-inch iPad screenshot as missing.
The verified original medium Dynamic Island iPhone screenshot is uploaded,
processed and persists after refresh as **1 of 10 App Screenshots**. Public App
Review has not been submitted.

The third credential-free capture run,
`mobile-capture/v1.0.0-xcode27.1-3`, source
`be66b18ceea2ede8a7443f79d8b56462f0ec6872`, is running as
[40709708958](https://github.com/robertovalerirv-beep/dove-bevo/actions/runs/40709708958)
(workflow number 25), **failed** at the positive-coverage assertion. Its reviewed test accepts only the base map label and
the exact observed region suffix, adds positive live-price coverage checks,
and retains map-style, native-error and privacy-return checks. The map-label
and map-style assertions passed. The genuine failed-test frame still shows
Milano tiles, price pins and 2 priced venues out of 43. The added coverage
assertion required `isHittable`, although the owner's `.map__status` CSS uses
`pointer-events:none` for this read-only status. Its actual runtime hit-test
property was not exported; source and frame evidence support a test defect.
The iPad and validated-capture steps were skipped. Artifact **12827130851** has
verified SHA-256
`b6ae550b671f99a15078801a6eabbfbfc8da463a85c565bbe4261ccb06b9f662`.
A narrow test repair uses finite, nonempty on-screen geometry for this status.
No website code was changed.

The fourth capture tag `mobile-capture/v1.0.0-xcode27.1-4`, source
`b1f69e0f338a481dbfaa0278db2d9be3324712a5`, ran as
[40714924179](https://github.com/robertovalerirv-beep/dove-bevo/actions/runs/40714924179)
(workflow number 27). **All ten Swift units and all three iPhone UI cases
passed**, including the live search/map/positive coverage/Privacy-return case.
Its final named original PNG is 1206 by 2622, SHA-256
`4805f62d67d20c209b51fdb87a1b955cbaa0ea5d5afe516bc8febb3d9adf85b0`.
It is preserved unchanged in `store-assets/ios-screenshots/` with provenance.
Independent source comparison confirms native app, project, generator and
bundled resources match uploaded build 26; Debug branches only log diagnostics.
The capture is an unsigned Debug simulator run, not binary-identical device
evidence. Actual map tiles and existing price pins were visually inspected.

The separate iPad Air 13-inch M4/iOS 27.0 runner failed before its live test
started: `XCTDaemonErrorDomain Code=18`, **Timed out waiting for AX loaded
notification**, followed by the eight-minute step timeout. No iPad screenshot
was produced and the workflow remains failed. Artifact **12828892348** has
verified SHA-256
`dc27593965068f7282939d596a714fe8dd5aeb4c84c89f15f69a44a048805c53`.
The capture script now explicitly waits for its selected simulator to boot,
matching the passing phone startup pattern, and shuts down only a device it
booted. Mocked command controls and independent review pass; effectiveness
against Apple's AX initialization failure is still unverified. An isolated
iPad-only capture lane is being prepared without repeating the phone suite.
The existing AWS real-device connector requires reauthentication, so no free
minutes or device availability were established and no session or charge was
created.

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
