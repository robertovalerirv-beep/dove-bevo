# Native usability update testing release

Corrected build **1.0.0 (32)** is **Active / Available to internal testers** in Google Play for the existing owner list, and **Testing** in TestFlight for the existing **Dove Bevo owner testing** and **Roberto feedback** groups. Prior build **31** retains the superseded naming form. These testing updates are separate from the submitted Android 20 and iOS 26 public releases. Those original submissions remain under review, with automatic release settings preserved. Testing availability does not establish a public launch or an installed-device result.

Real-iPhone feedback exposed a confusing name form and technical-ID placeholder. The owner explicitly retained bookmarks but requires the existing venue name automatically, with no naming form. The correction at `9b54a44733e4626eaafee4976c2534f77a939cab` is **not present in build 31**. [Beta run 40760373576](https://github.com/robertovalerirv-beep/dove-bevo/actions/runs/40760373576), tag `mobile-beta/v1.0.0-autonames.1`, completed successfully at 20:28:16 UTC: both fresh checks passed before both signers ran. The original physical screenshots establish the earlier venue-card/save-form display, not a completed corrected save/reopen pass.

## Implemented behaviour

- Both platforms in the corrected source: **⋯ at the top right → Salva nei preferiti** saves the currently open venue using its existing displayed name. There is no naming or rename form and no generated identifier fallback. **Preferiti** reopens or removes private bookmarks. The list holds up to 50 entries and remains readable offline; opening live maps/prices requires internet. Build 31 retains the earlier manual-name form.
- A private bookmark does not contribute a price. The existing orange **Aggiungi un prezzo qui** action publishes a price through the website's ordinary flow; native testing never invents public prices or venues.
- Both platforms: the Reload action becomes **Interrompi** while a document loads, with retry/recovery after cancellation. It does not undo an already submitted website contribution.
- Android: history-aware Back/Forward controls, bounded trusted WebView history restoration, and user-triggered location help/App Settings. System Back still closes the app at history root.
- iOS: native error recovery excludes covered web content from accessibility and restores it after recovery. Stopped/superseded navigation callbacks do not replace the current recovery state in the verified cases.

Saved entries contain only the validated public venue link and associated name. The correction reads only three bounded public strings from the active venue page: its URL, displayed heading and existing selection marker. It checks that they identify the same current venue, rejects hidden/ambiguous overlays, and rechecks native navigation and foreground state before saving. This is a fixed read-only expression, not a generic privileged bridge or a page mutation. Existing valid saved records remain readable. No browsing history, device coordinates, prices, cookies or tokens are copied into bookmarks. iOS establishes backup exclusion before atomic replacement; Android reports same-directory write/rename errors. Both reject unreadable whole-file data without silently overwriting it.

## Automatic-name correction verification

Independent review found and repaired two delayed-result races: removing a bookmark while a save was pending, and iOS app/scene deactivation while name capture was pending. The final source cancels those requests instead of allowing a removed row or background save to reappear. Central checks passed 98 iOS script guards, 47 Android units, debug/application-test compilation and lint with zero errors and 24 local warnings.

The corrected source's fresh hosted Android check also passed: 47 units with no failures/skips, lint with zero errors and 25 warnings, 13 release guards and 29 smoke-helper guards. Independent verification of report artifact `12848530002` matched provider ZIP SHA-256 `8742ed7ceb8c10956ad2eaf537e91efb7ac990bd875b53b34c1b51e368e1de24` and checked the actual report totals. These hosted checks do not execute Android device tests.

The first central Android runtime attempt passed 8 of 12 cases. A negative control found a cached production service worker controlling the fixture navigation, with the owned document marker absent. This was a test-isolation failure, not an app success. The repaired test runner creates a fresh private WebView data directory before WebKit initialization, intercepts service-worker requests locally and asserts the owned document identity before interactions. It changes no production permission, network policy, user data or minimum SDK. The fixture runner explicitly requires API 28 or newer; the production application still supports API 24. The coordinator's final fresh-profile run passed all 12 native runtime cases in 25.747 seconds on the exact integrated APK.

A separate independent normal-process live Android check used that same Debug APK, without instrumentation or fixture injection. Favorites was empty initially. Searching Milano, opening **Camparino in Galleria**, and saving once produced that exact name with no form, even after its heading had scrolled offscreen. Home → Preferiti → reopen restored the same venue/address and existing prices; Back/Forward worked. Only the new bookmark was removed and the list was empty afterward. A two-drink card scrolled to Privacy/Regole. Seven original PNGs and 66 observations are retained locally. The owned headless API 36 emulator was shut down, and the user's desktop was never controlled. This is Android emulator evidence, not an iPhone or store-installed result.

The owner's short zero/one-price screenshots alone do not establish a scrolling defect: Privacy/Regole is the footer, and a short card may have no scroll range. No speculative website or native scrolling workaround was applied. iOS scrolling and corrected physical-iPhone acceptance remain open.

Fresh iOS checks passed **98 script guards, 35 Swift unit cases and 4 phone UI cases**, with zero failures or test-case skips. The live website case saved **Camparino in Galleria** automatically, returned Home, reopened the same venue, removed only the QA bookmark and positively checked the map afterward. Independent review matched all 39 executed native case names to the exact source inventory. Artifact `12849616242` is 13,035,213 bytes, ZIP SHA-256 `d3688df902b23c21e19e570507f1b663683fdd60d68dd1a20bd4639ebd5a3fbb`. Its 170 entries passed bounded extraction; original saved-list and map PNGs are 1206 × 2622 and are associated with the passing live test. Best-effort collectors reported no allowlisted renderer termination and completed owned-simulator cleanup; this is not a system-wide crash-free attestation.

Unedited correction evidence: [iOS automatic bookmark](images/ios-automatic-bookmark-native-test.png), [Android automatic bookmark](images/android-automatic-bookmark-native-test.png), and [source/hash provenance](images/automatic-bookmark-provenance.json). Both show the existing venue name; only the new local QA row was removed afterward. These are simulator/emulator captures, not store screenshots or physical-device acceptance.

## Corrected build 32 distribution

Both signed artifacts use version 1.0.0/build 32 and the exact source above. Provider ZIP digests and actual extracted files were checked before store actions.

| Artifact | Verified identity | SHA-256 |
| --- | --- | --- |
| Android AAB | `com.dovebevo.app`, code 32, non-debuggable, min SDK 24/target 36; upload certificate identical to approved builds 20/31 | `d606205aeefbafa3725e757483702b60bbcc570715e6c234a6aeb7e5656fa15a` |
| iOS IPA | `com.dovebevo.app`, build 32, minimum iOS 16.4, phone/iPad, SDK 27.1, team `9T359CV674`, `get-task-allow=false`, normal eligible export | `92e6fe6f518724b9a469a05d7d5cab8ef20865a6709c5d1072881ab9835915a9` |

Android signing job `123079609788` and iOS signing/upload job `123079609847` both passed. The Android artifact is `12848004888`, ZIP SHA-256 `6e7d6c306f4b7cb21af0f5595f5de431244840fb82ec7d6d12ecdad88106b0c6`. The iOS artifact is `12848772101`, ZIP SHA-256 `3f9837a8346857ff5b0b2f55f0c30cdea2834598060723a3db7378d00e3b79a3`. The release manifest matches the IPA/source/build and records strict Mac signature checks plus successful upload. Windows parsing independently checks metadata/public profile identity, not Apple cryptographic trust. Both bundles contain the current neutral policy bytes.

Google accepted code 32 and published internal release 3 at **20:28 UTC**. Readback shows **Active / Available to internal testers**, with the existing **Stefano Valeri** one-user list still selected. There were no errors and one deobfuscation-file warning; no user devices lost support. No new tester audience or production promotion was added.

Apple processed build 32, saved the automatic-name testing instructions, and accepted assignment to both existing groups with **Automatically notify testers** selected. The final build row reads **Testing**, with both owner and Roberto groups. Original provider screenshots are retained locally. The signed manifest's `appStoreProcessingVerified=false` is preserved as an accurate upload-time statement; later UI readback supplies processing and assignment evidence. No new tester, public invitation link or developer role was created, and notification delivery/installation is not inferred.

After this testing distribution, Google still shows the original production changes **in review**, managed publishing off; Apple still selects public build 26 with **Waiting for Review** and automatic release after approval selected. Neither public submission was replaced.

## Historical build 31 testing distribution

[Run 40747563721](https://github.com/robertovalerirv-beep/dove-bevo/actions/runs/40747563721), tag `mobile-beta/v1.0.0-native.1`, passed at exact source `e07a8b8596b8248e710db0587c7587a5f772d80c`. The only workflow adjustment adds the existing beta family to the Android internal signer. Both existing checks remain prerequisites; the eligible iOS uploader is unchanged. Eleven event/ref/repository cases and independent review confirm that production, capture and Internal Only iOS jobs are excluded from this beta run.

| Artifact | Verified identity | SHA-256 |
| --- | --- | --- |
| Android AAB | `com.dovebevo.app`, version 1.0.0/code 31, non-debuggable, target SDK 36; approved upload signer matches release 20 | `9b7e816cdde1e7f43ca37e9d5a9eaae0bbabed13126e3ec31002644ed12f2441` |
| iOS IPA | `com.dovebevo.app`, version 1.0.0/build 31, minimum iOS 16.4, phone/iPad targets, SDK 27.1, distribution entitlement `get-task-allow=false`, normal app-store-eligible export | `fbab52952878c8a5b7fd81f1ba00ad80b3b333936effcdfaa85d59e53d058503` |

Provider ZIP digests, bounded extraction, embedded metadata, public signer identity and bundled policy bytes were independently checked. Mac strict signature/profile/entitlement verification and successful upload are separate from Windows metadata parsing. Apple's subsequent processing and **Testing** readback supply the provider-ingestion evidence; the original export manifest correctly records that processing was not verified at upload time.

Google accepted code 31 and published internal release 2 on 28 October at 18:57 UTC. The existing one-user owner list was selected and read back after reload; no new email list, public test audience or developer access was added. The resolved no-testers warning left one deobfuscation-file warning. The track reads **Active / Available to internal testers**; production remains code 20 in review. No internal test installation is inferred from this state.

Apple processed build 31, saved native-feature testing notes, accepted assignment to both existing groups with automatic notification selected and now displays **Testing**. Build 26 also moved to **Testing** for Roberto, whose tester row reads **Invited** dated 28 October. This confirms the provider invitation state, not email delivery or installation. The separate public version still selects build 26 and reads **Waiting for Review**.

Both stores' existing privacy-policy references point to the same stable GitHub document. Only that branch's `mobile-apps/privacy.md` was updated. The latest neutral Preferiti wording at `a85ac7612dcc4f1209cf7cd5e885100b7b5ae636` covers both prior manual and current automatic names; independent public readback matches the corrected source policy SHA-256 `c8bf5941d6ea61e67e9a99212f18f38fa972eb45278f6dcb03400f568532570e`. Historical build 31 bundled the earlier policy at `f069a421c5724b609bef4fce0f8863f94acfeb2f`, SHA-256 `a1fb81f0458c30989c80afebfd85414158cbd210ce7053694134b4e482633b7c`. The website and backend remain unchanged.

## Verification

| Platform | Authoritative evidence | Result |
| --- | --- | --- |
| Android | Fresh integrated unit tests, lint and debug/application-test compilation at `4f2553ef6e59a6768adca07cb3ef325a3d9d50fc` | 40 units passed; zero lint errors and 24 existing warnings |
| Android | Installed integrated APK on the owned headless API 36 emulator; native usability plus local page/service-worker fence suites | 9 of 9 passed in 18.799 seconds |
| Android | Normal production shell and live website, outside instrumentation fixtures | Native saved venue lifecycle, navigation, location help and Reload passed; venue/history survived observed Activity recreation and process restart |
| iOS | [Quality run 40738410794](https://github.com/robertovalerirv-beep/dove-bevo/actions/runs/40738410794), exact source `6980dc4ee7333bef5978fa2afb23ea03964a4d6c` | 93 script guards, 29 Swift units and 4 phone UI tests passed, with zero test-case skips |
| iOS | Live website city/map flow followed by native save, navigation away, reopening, edited-name cancellation, removal of only the QA entry and positive map return | Passed on an owned fresh iPhone 17 simulator |
| iOS | Original artifact 12839287041, digest and archive safety checked before extraction | Original native saved-list and final live-map PNGs verified |
| Android | Fresh hosted check job 123025303967 and retained HTML/XML reports at signed-run source `e07a8b8596b8248e710db0587c7587a5f772d80c` | 40 Java units, zero failures/skips; zero lint errors and **25 warnings**; 13 release guards and 29 smoke-helper tests passed |
| iOS | Fresh hosted check job 123025304420 at that same source | 93 guards and 29 Swift units passed, zero failures/skips; unit-only run, with no UI tests executed here |

Build 31 retained the exact iOS App, project, scripts and policy inputs from the successful Mac quality run. The automatic-name correction changes both platforms and therefore requires fresh checks. Its beta workflow runs the full 35 Swift units and 4 phone UI cases before either signer; it does not reuse the earlier successful UI run as proof of this revision. Historical hosted 25 lint warnings and local 24 warnings are distinct observations.

Historical original, unedited screenshots from the earlier manual-name tests: [iOS saved venues](images/ios-saved-venues-native-test.png) and [Android saved venues](images/android-saved-venues-native-test.png). These show removed local QA entries, not the automatic-name correction or store-distribution evidence.

Android regressions were demonstrated before repair: an old stopped HTTP failure could replace usable content, and an old same-URL finish could end a replacement load before its start. Runtime checks also caught an early HTTP 500 callback being cleared by a later page-start callback. The repaired suite retains positive HTTP failure/retry coverage and unconditional SSL cancellation. Fixture-only corrections use an actual touch for history activation and real dialog event-loop boundaries.

The first Mac quality attempt failed to compile a test because a throwing expression was inside XCTest's nonthrowing assertion wrapper, making an outer catch unreachable. The narrow test-only correction retained malformed-data and disk-preservation checks; the next exact-source run passed. No passing result is inferred from the failed attempt.

## Remaining boundaries

Earlier build-31 production Android QA observed the actual toolbar, native saved list and location-help/settings return without granting permissions. Changing font scale from 1.0 to 1.5 produced observed Activity destroy/create events; the venue and Back/Forward history survived. A settled background process kill changed the app PID and was followed by an actual MainActivity creation; venue, history and saved row survived. The font setting was restored to 1.0, only the QA saved row was removed, and the owned emulator was shut down afterward. At scale 1.5, Condividi/Ricarica wrap within their buttons while all actions remain visible. Fifteen original screenshots and 125 timestamped observations are retained in the selected project evidence folder. This historical lifecycle check is separate from the automatic-name live check above.

The iOS UI checks use a Debug phone simulator; signed Release verification and provider processing are separate evidence. Corrected-source native tests and signing/upload passed as recorded above. Physical TestFlight screenshots show venue cards and the superseded manual-name form; the automatic-name flow has no physical acceptance result yet. New iPad-runtime and complete held-load/VoiceOver acceptance remain unverified. Identical-URL overlapping response attribution remains an API limitation. Historical generic unattributed jetsam metadata is not a claim about the current run or a crash-free system.

Preserve the existing public review submissions and verify actual approval and public store availability before reporting a launch. Corrected-build physical acceptance and invitation delivery remain open. The owner already supplied the earlier form/card feedback; request the corrected flow only after its TestFlight availability is confirmed. GitHub is canonical; OneDrive working-copy presence is not cloud-sync proof.

Implementation: [design](2026-10-28-mobile-usability-design.md), [plan](2026-10-28-mobile-usability-plan.md).
