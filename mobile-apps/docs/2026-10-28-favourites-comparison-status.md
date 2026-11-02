# Native favourites and drink comparison — beta 36

Verified 29 October 2026 UTC. Roberto's plan and existing website remain unchanged. This is an app feature for choosing a drink and comparing recorded prices at saved venues.

## Delivered behaviour

- Native **Mappa / Preferiti** destinations retain the existing browser, map and history. **Salva nei preferiti** and **Drink consigliati** are visible for an open venue; browser controls remain secondary.
- Saving uses the existing venue name automatically. Private bookmarks remain on the installation, without a naming form or account synchronization. They do not publish prices or recommendations.
- Preferiti offers the existing nine drink categories and separate **Normale / Happy hour** bands. It sorts available prices from lowest to highest, with venue name, price date and confirmations. Missing prices and unavailable data are explicit; neither becomes zero. Quarantined prices are excluded.
- The comparison client uses bounded, fixed-origin public GET requests. It sends no browser cookies, recommendation identifier or GPS coordinates. Public-cell requests can still reveal an approximate area and the connection IP to the server. At most fifty saved venues, three concurrent reads and a sixty-second overall deadline are allowed.
- Names and links persist locally; current prices require internet. Saved rows do not contain an offline price archive. Android's saved-file backup exclusions are explicit, while OEM transfer behaviour remains outside the app's control.

No website source, backend, schema, drink catalogue or public contribution semantics changed in this update. The previous, separately authorized shared-voting service remains as delivered in PR 73. No venues, menu prices, confirmations, votes or reports were submitted during this task's tests.

## Exact source and verification

Signed source: `01ffc66531b255485122836a3a4777dbb51bd158`, tag `mobile-beta/v1.0.0-favourites-comparison.2`, on branch `codex/mobile-favourites-comparison-20261028` in Roberto's canonical repository.

[Run 40792481875](https://github.com/robertovalerirv-beep/dove-bevo/actions/runs/40792481875) completed successfully. Both platform checks passed before either signing job started.

| Check | Result |
| --- | --- |
| Fresh local Android JVM tests | 69 passed; no failures or skips |
| Fresh local Android lint | 0 errors, 23 warnings |
| Hosted Android JVM/lint | 69 passed; 0 errors, 24 warnings |
| Owned API 36 Android instrumentation | 22 unique cases passed; no failures or skips |
| Integrated local iOS source guards | 106 passed |
| Hosted iOS native tests | 75 passed, including 18 new comparison cases |
| Hosted iOS UI tests | 4 passed; no failures or skips |

The hosted lint difference includes the Android Gradle Plugin version warning. Existing warnings are retained, not suppressed. Independent reviewers inspected both platform changes, the focused UI repairs, native/runtime evidence and the opposite platform's signed artifact. Root reran the integrated local checks.

The first exact-source attempt, [build 35 / run 40790377415](https://github.com/robertovalerirv-beep/dove-bevo/actions/runs/40790377415), passed all 75 iOS native tests but failed three UI assertions because the map tab was actually labelled “Dove bevo”. Both signing jobs were skipped. The product now keeps the browser header independent of the native “Mappa” destination; strict UI assertions were retained. Build 35 produced no signed release.

## Actual Android browsing checks

The final Debug app and test APK hashes were matched against the installed packages on the owned headless API 36 emulator. The Android application inputs are unchanged between this final local check and the signed source. This is emulator evidence, not a Play-delivered or physical-phone installation.

Normal browsing searched Milano and opened existing Camparino and The Dome entries. Saving required no name entry. Preferiti displayed recorded normal beer prices of **€8 / €10**, respectively, with dates and confirmations. Negroni and happy-hour beer showed missing prices honestly. Large text at 1.5 remained scrollable with both prices and all actions; the original 1.0 font scale was restored and read back. Opening a favourite and Android Back returned correctly to the same map venue. Only the two private test bookmarks were removed afterwards.

Original unedited captures and hash receipts are retained under the selected project's `test-evidence/native-comparison-20261028/`. They include `android-favourites-beer-final.png`, `android-favourites-large-text-prices.png` and `android-favourite-opened-on-map.png` in `captures/`. These are QA captures, not store-listing screenshots. The owned emulator was shut down and its ports/process disappearance verified. The user's desktop was not controlled for these checks.

## Signed artifacts and distribution

| Artifact | SHA-256 |
| --- | --- |
| Android release AAB, versionCode 36 | `a5bf8b768f0fdef4f6b6888439fa178f054b4b0e11cc97b7da49dc7f2db4eb5c` |
| iOS release IPA, build 36 | `4b6c035fdc6b4669e2d5763965cae8cab0610789d5e27c4631396cd088f15d03` |
| Bundled privacy disclosure, both packages | `c36fb4364c776426b08991349c5a2476d7f3b4054401075c0c5481667aa0c48f` |

Provider artifact IDs are Android `12862582879` and iOS `12863161202`. ZIP size, digest, safe paths, CRC, package identity and bundled policy were verified before distribution. Android upload-certificate pin matched. iOS CI performed strict Mac signature/profile validation and uploaded successfully; Windows ZIP/profile inspection is a separate metadata check.

Google Play release 5, **1.0.0 (36) - preferiti e confronto drink**, reads **Available to internal testers**, released 29 October at 00:41. The only validation warning concerned an absent deobfuscation file; this build does not use obfuscation. Existing testers were preserved.

Apple processed build `694cf887-d941-4471-b044-aaefb49866d7`; after its testing notes and existing groups were assigned, the builds list reads **Testing** for build 36 with **Dove Bevo owner testing** and **Roberto feedback**. Automatic tester notification remained selected. No team access, group membership or public invitation link was added. Email delivery, installation and physical acceptance of build 36 remain unverified.

The stable public privacy branch `codex/mobile-store-disclosures-20261026` was updated to `04a4b0f6c29ad7fef888338a58912729c46cc9d6`; a full connector readback matched the local policy. No new device permission, advertising SDK or tracking declaration was introduced.

These testing releases preserve the separate public submissions: Android 20 remains **Changes in review**, managed publishing off; iOS 26 remains **Waiting for Review**, automatic release selected. Beta availability is not public store approval or launch.

## Data coverage and follow-up

Comparison reads Roberto's existing prices. It does not create coverage. The current dataset is Italy-bounded; London's, Paris's, Madrid's and Berlin's catalogues are not implemented. [Menu research](2026-10-28-menu-source-feasibility.md) records three existing venues' first-party sources and their serving/context limitations. No prices were imported. The requested greater-than-100 Google-review eligibility remains unverified, and the existing public price path cannot truthfully represent an automated menu import's provenance and differing serving sizes. This is a separate data task, not a change to the business plan or a reason to hide existing venues.

Next owner: gather build-36 physical feedback using the [device checklist](../PHYSICAL_TEST_CHECKLIST.md), then read public review decisions. Possible later app-only improvements include ranking recommendations for the chosen drink, clearer last-refresh information and explicit bookmark export. None is claimed as implemented here.

GitHub holds the canonical branch and immutable signed-source tag. Source, worktrees, evidence and local notes remain in the selected OneDrive project folder. Cloud synchronization is not established by local file presence. Credentials stay in the approved protected stores.
