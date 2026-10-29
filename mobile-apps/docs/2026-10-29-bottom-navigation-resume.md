# Bottom navigation — exact paused-work checkpoint

29 October 2026. The owner says credits are still almost finished and requests another exact resume note. **The active launch goal was explicitly set to `paused` and the tool confirmed that state. Do not restart from an automatic continuation; wait for the owner's explicit resumption.** Implementation/tests/provider actions have stopped. This record supersedes the earlier note's claim that no Android navigation code exists.

## Required layout, both platforms

- Put **Home, Mappa, Preferiti, Salva nei preferiti and Drink consigliati together in the bottom area/menu**.
- Put **Share/Condividi and Reload/Ricarica in the top three-dot menu**. Reload can retain the existing Stop behaviour during a load.
- **Preferiti appears only at the bottom**, never duplicated in the three-dot menu.
- Keep the website/backend/schema, Roberto's business plan and paused European importer unchanged. Private bookmarks use existing venue names; drink recommendations remain shared. Context actions must remain safe and unavailable without a usable open venue.

## Exact source state

| Lane / local directory beneath `C:\Users\stefa\OneDrive\Dove Bevo` | Branch | Frozen state |
| --- | --- | --- |
| Root: `app-improvements-20261028` | `codex/mobile-bottom-navigation-20261029` | Base **80e05589bc63f52ec2e69335ceeb06df76ef86d4** before this documentation commit. No Android/iOS patch is integrated. Obtain final root note commit with `git log -1`. |
| Android: `bottom-navigation-android-20261029` | `codex/mobile-bottom-navigation-android-20261029` | **56f589fcae6f4716c22516bd299bc55cb9425a94**, WIP, nine Android-only files, clean worktree. |
| iOS: `bottom-navigation-ios-20261029` | `codex/mobile-bottom-navigation-ios-20261029` | **80e05589bc63f52ec2e69335ceeb06df76ef86d4**, clean; source inspection/design only, **no implementation**. |

All lanes start from the tested build-36 source/documentation base. **Do not include the separate Europe-coordinate patch `df419c2` or any importer/backend WIP.** Those remain paused on their existing branches. The complete earlier seed continuation is `docs/ONE_OFF_MENU_SEED_RESUME.md` on `codex/europe-menu-seed-20261029`, frozen at **b4d7ecc98c8cfff7e0d6af391c4a02b4d4b7a9b5**. No public venue or price import has happened.

## Android: drafted, unverified

Commit56f589f contains:

- `MainActivity.java`: moves Home/Save/Recommendations into the persistent bottom area; top retains Back/Forward/ellipsis, with Share/Reload in overflow. Removes overflow Save/Favourites duplication and the old venue-action row.
- New `BottomNavigationBar.java`, `BottomNavigationLayout.java`, Home/bookmark-add vector drawables, strings/IDs, geometry unit tests and updates to the owned native runtime fixture.
- Five icon+short-label controls, full accessibility labels; proposed adaptive layout uses3+2 rows below360dp or font scale≥1.3. Only Mappa/Preferiti have destination selection; Home loads the existing home URL in the retained browser, Save remains on the map after confirmation.

**No post-edit compile, unit test, lint, APK build, instrumentation, visual check or independent patch review ran.** The only actual run was the preimplementation Gradle unit target, which failed with five compile errors because `BottomNavigationLayout` did not exist yet. That process (session73427) finished; no active session remains. Do not reuse earlier69/72-pass counts as evidence for this WIP.

**Known first repair:** the new `showFavorites` foreground guard rejects restoring Preferiti from `onCreate`, because `foreground` becomes true only in `onResume`. Repair the initialization/restore path without weakening context-action/foreground fences; add a regression covering restored favourites. Then assess actual adaptive measurement and fixture compilation.

## iOS: implementation not started

Current source still has the old two-tab `UITabBarController`, toolbar Home/Share/Reload and top Save/Recommendations. Candidate design (not code): a native standalone five-item `UITabBar` in `NativeTabsController`, retaining only the two actual map/favourites navigation stacks. Home/Save/Recommendations are actions and must not select blank controllers; only map/favourites selection persists. This also keeps the bar at the bottom on iPad without a More overflow.

Pending files include `App/NativeTabsController.swift`, `App/BrowserViewController.swift`, controller tests and existing phone UI tests. Move Back/Forward to the header, Share and dynamic Reload/Stop to More. Remove the `updateMoreMenu` early cache keyed only by Save eligibility; otherwise Share/Reload state can remain stale on the home page. Remove the successful-save automatic `showSavedVenues()` jump; Save should keep the retained map/history, with a native confirmation. Update action availability on navigation, pending captures, scene/background changes, errors and destination changes. Converting away from UITabBarController must not accidentally weaken existing selected-map/lifecycle checks. No new iOS tests/guards/builds ran.

## Next steps after explicit resumption

1. Check goal status and current instructions; verify all branch HEADs/statuses and the latest canonical UOS handoff. Preserve unrelated work and ignored caches. Do not infer that a new model turn alone resumes the paused goal.
2. Inspect Android WIP:
   `git -C "C:\Users\stefa\OneDrive\Dove Bevo\bottom-navigation-android-20261029" diff 80e05589 HEAD -- mobile-apps/android`
   Repair the known restoration issue before checks. Using the existing approved JDK/SDK/Gradle cache, run `:app:testDebugUnitTest :app:lintDebug :app:assembleDebug :app:assembleDebugAndroidTest`, then release guards. Root owns all SDK/device execution; no foreground PC control or unowned AVD operations.
3. Implement iOS in its isolated worktree. Re-entry reads: `Get-Content mobile-apps/ios/App/BrowserViewController.swift -TotalCount 230` and `Get-Content mobile-apps/ios/Tests/FavouriteComparisonControllerTests.swift`. Preserve one browser/history and current rules/recommendation/write safety.
4. Independently review both frozen changes, integrate only app paths into root, and rerun fresh combined checks. Tests must prove all five bottom locations, no overflow duplicates, contextual disabled states on home/loading/error/favourites, Home versus retained Mappa, no blank action destinations, Save staying on map, fresh Share/Reload/Stop state, history and stale-callback fences. Verify narrow widths/large text and48dp touch targets on actual native controls, not just source patterns.
5. Use an owned headless Android runtime with a fresh ownership record; capture original unedited layout/overflow screenshots. Do not reuse the old emulator's process ID or ownership record. No real public content during tests.
6. The last actually observed Mobile apps workflow is **run40792481875, number36**, successful at source01ffc665/tag `mobile-beta/v1.0.0-favourites-comparison.2`. **No new run/tag/signing was started.** Next run would37 only if no intervening run: re-read rather than reserve it. One necessary new `mobile-beta/v*` tag runs both checks and full iOS native/UI tests before either signer. Keep strict meaningful assertions; a green source guard alone is not native compilation.
7. Verify actual signed artifact provenance, package/signer/policy, upload/processing and existing tester-group availability. Native source and unsigned APKs are not public launches. Decide public-update sequencing from the current review state and tested release; do not cancel an existing review merely to check status. Keep the original public submissions intact until a concrete verified replacement is ready.

## Fresh store observations before pause

Google publishing overview was refreshed and showed **Changes in review**, managed publishing off. Apple session expired; the owner signed back in. A fresh authenticated read showed **iOS1.0.0 build26 Waiting for Review**, automatic release selected. **No store values, review submissions, tester memberships or builds were changed.** Recheck sessions and provider state on resumption; these observations are historical. Public availability and installation from the public stores remain unverified. Build36 testing availability is the prior verified beta baseline, not completion of this layout request.

## Environment and continuity

All project work remains under the selected OneDrive folder; Roberto's GitHub is canonical. No secret was read, copied or printed. Approved JDK is `C:\Users\stefa\AppData\Local\DoveBevo\sdk\jdk21`; SDK is `C:\Users\stefa\AppData\Local\Android\Sdk` with platform **android-37.0** (not android-37) and android-36. Shared Gradle cache/distribution is in `app-release/mobile-apps/android/.gradle-user-home/wrapper/dists/gradle-9.3.1-all/9ot9r568e8zfvvd4mn8rbu1j0/gradle-9.3.1/bin/gradle.bat`; use project-local TEMP/logs. Do not install SDKs or alter signing configuration for this layout.

The shared-memory bootstrap again failed with **Authority snapshot tracked bytes are unreadable**. Do not recall from OneDrive mirrors or treat the installed UOS checkout as authority. The project source and explicit layout are verified; project route `uos` is already known. This stop checkpoint must be published via one final bound/sealed UOS handoff, and its journal closed; older journals are closed and must not be reused. All agents and executable sessions are stopped. Only checkpoint commit/push, readback and memory/backup finalization are permitted now; implementation waits for the owner.
