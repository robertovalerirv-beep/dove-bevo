# Native usability update testing release

Build **1.0.0 (31)** is now **Active / Available to internal testers** in Google Play for the existing owner list, and **Testing** in TestFlight for the existing **Dove Bevo owner testing** and **Roberto feedback** groups. This is a separate testing update after the submitted Android 20 and iOS 26 public releases. Those original public submissions remain under review, with automatic release settings preserved. Testing availability does not establish a public launch or an installed-device result.

Real-iPhone feedback subsequently exposed a confusing name form and technical-ID placeholder. The owner explicitly retained bookmarks but requires the existing venue name automatically, with no naming form. That correction is in progress and is **not present in build 31**. The original physical screenshots are retained locally; they establish the venue-card/save-form display, not a completed save/reopen pass.

## Implemented behaviour

- Both platforms: **Salva locale** and **Locali salvati** provide an explicit native venue-name form, local list, reopening and removal. Only an actual usable public venue page is eligible. The list holds up to 50 entries; it is readable offline, while live maps/prices still require a connection.
- Both platforms: the Reload action becomes **Interrompi** while a document loads, with retry/recovery after cancellation. It does not undo an already submitted website contribution.
- Android: history-aware Back/Forward controls, bounded trusted WebView history restoration, and user-triggered location help/App Settings. System Back still closes the app at history root.
- iOS: native error recovery excludes covered web content from accessibility and restores it after recovery. Stopped/superseded navigation callbacks do not replace the current recovery state in the verified cases.

Saved entries contain only the validated public venue link and the chosen name. They do not automatically capture browsing history, device coordinates, prices, cookies or tokens. iOS establishes backup exclusion before atomic file replacement; Android reports same-directory file write/rename errors. Both reject unreadable whole-file data without silently overwriting it. The bundled privacy policy describes local storage and platform backup/transfer limits.

## Signed testing distribution

[Run 40747563721](https://github.com/robertovalerirv-beep/dove-bevo/actions/runs/40747563721), tag `mobile-beta/v1.0.0-native.1`, passed at exact source `e07a8b8596b8248e710db0587c7587a5f772d80c`. The only workflow adjustment adds the existing beta family to the Android internal signer. Both existing checks remain prerequisites; the eligible iOS uploader is unchanged. Eleven event/ref/repository cases and independent review confirm that production, capture and Internal Only iOS jobs are excluded from this beta run.

| Artifact | Verified identity | SHA-256 |
| --- | --- | --- |
| Android AAB | `com.dovebevo.app`, version 1.0.0/code 31, non-debuggable, target SDK 36; approved upload signer matches release 20 | `9b7e816cdde1e7f43ca37e9d5a9eaae0bbabed13126e3ec31002644ed12f2441` |
| iOS IPA | `com.dovebevo.app`, version 1.0.0/build 31, minimum iOS 16.4, phone/iPad targets, SDK 27.1, distribution entitlement `get-task-allow=false`, normal app-store-eligible export | `fbab52952878c8a5b7fd81f1ba00ad80b3b333936effcdfaa85d59e53d058503` |

Provider ZIP digests, bounded extraction, embedded metadata, public signer identity and bundled policy bytes were independently checked. Mac strict signature/profile/entitlement verification and successful upload are separate from Windows metadata parsing. Apple's subsequent processing and **Testing** readback supply the provider-ingestion evidence; the original export manifest correctly records that processing was not verified at upload time.

Google accepted code 31 and published internal release 2 on 28 October at 18:57 UTC. The existing one-user owner list was selected and read back after reload; no new email list, public test audience or developer access was added. The resolved no-testers warning left one deobfuscation-file warning. The track reads **Active / Available to internal testers**; production remains code 20 in review. No internal test installation is inferred from this state.

Apple processed build 31, saved native-feature testing notes, accepted assignment to both existing groups with automatic notification selected and now displays **Testing**. Build 26 also moved to **Testing** for Roberto, whose tester row reads **Invited** dated 28 October. This confirms the provider invitation state, not email delivery or installation. The separate public version still selects build 26 and reads **Waiting for Review**.

Both stores' existing privacy-policy references point to the same stable GitHub document. Only that branch's `mobile-apps/privacy.md` was updated, at `f069a421c5724b609bef4fce0f8863f94acfeb2f`; independent public readback matches the bundled policy SHA-256 `a1fb81f0458c30989c80afebfd85414158cbd210ce7053694134b4e482633b7c`. The website and backend remain unchanged.

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

The final integrated source retains the exact iOS App, project, scripts and bundled privacy inputs from the successful Mac quality run. Later native-code integration changes were Android-only; the subsequent signing change affects only the Android job selector. The earlier Mac quality tag activated one credential-free test job, with all eleven existing jobs skipped. The later beta run separately performed both fresh checks and both intended signers. Its 25 hosted lint warnings and the earlier 24 local warnings are distinct observations.

Original, unedited screenshots from the successful tests: [iOS saved venues](images/ios-saved-venues-native-test.png) and [Android saved venues](images/android-saved-venues-native-test.png). These show local QA entries that were removed after testing; they are not store-distribution evidence.

Android regressions were demonstrated before repair: an old stopped HTTP failure could replace usable content, and an old same-URL finish could end a replacement load before its start. Runtime checks also caught an early HTTP 500 callback being cleared by a later page-start callback. The repaired suite retains positive HTTP failure/retry coverage and unconditional SSL cancellation. Fixture-only corrections use an actual touch for history activation and real dialog event-loop boundaries.

The first Mac quality attempt failed to compile a test because a throwing expression was inside XCTest's nonthrowing assertion wrapper, making an outer catch unreachable. The narrow test-only correction retained malformed-data and disk-preservation checks; the next exact-source run passed. No passing result is inferred from the failed attempt.

## Remaining boundaries

Separate production Android QA observed the actual toolbar, native saved list and location-help/settings return without granting permissions. Changing font scale from 1.0 to 1.5 produced observed Activity destroy/create events; the venue and Back/Forward history survived. A settled background process kill changed the app PID and was followed by an actual MainActivity creation; venue, history and saved row survived. The font setting was restored to 1.0, only the QA saved row was removed, and the owned emulator was shut down afterward. At scale 1.5, Condividi/Ricarica wrap within their buttons while all actions remain visible. Fifteen original screenshots and 125 timestamped observations are retained in the selected project evidence folder. This covers the observed emulator/configuration, not every lifecycle or device variation.

The iOS UI checks use a Debug phone simulator. Signed Release archive/export/validation and TestFlight processing now pass separately. Physical TestFlight screenshots now show venue cards and the manual-name form; the revised automatic-name flow has no physical acceptance result yet. New iPad-runtime and complete held-load/VoiceOver acceptance remain unverified. Identical-URL overlapping response attribution remains an API limitation. Generic unattributed jetsam metadata exists, so the result is not a claim of a crash-free system.

Preserve the existing public review submissions and verify actual approval and public store availability before reporting a launch. Installed build-31 behaviour and invitation delivery remain open; a real-iPhone check was requested after TestFlight availability was confirmed. GitHub is canonical; OneDrive working-copy presence is not cloud-sync proof.

Implementation: [design](2026-10-28-mobile-usability-design.md), [plan](2026-10-28-mobile-usability-plan.md).
