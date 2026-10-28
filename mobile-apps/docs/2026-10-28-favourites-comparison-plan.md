# Native favourites comparison implementation plan

> For agentic workers: implement the frozen design in dependency order using isolated platform worktrees. Root integrates and independently verifies; never touch another lane's files.

**Goal:** Native map/favourites navigation and live same-drink comparison across local bookmarks.

**Architecture:** Retain the existing website browser. Native destinations own a current, bounded, public-cell read model, with no backend, schema, website UI or dependency changes.

**Tech stack:** Existing Java/Android SDK, UIKit/Swift, existing unit/instrumentation/XCTest seams.

**Spec:** mobile-apps/docs/2026-10-28-favourites-comparison-design.md.

## Global constraints

- Existing nine-category catalogue, EUR cents and explicit normal/happy-hour scope.
- At most fifty saved venues and three in-flight reads; GET only, no cookies, redirects or identifiers.
- Existing validated canonical URLs, foreground and generation fencing remain mandatory.
- No new venues or fabricated public contributions; preserve all original submissions.
- Source/build/evidence/temporary files stay in selected OneDrive project; credentials remain in protected stores.

## Review focus

- Old/hidden/moved venues and failed responses must not appear as valid zero prices.
- Calendar dates, floating JSON numbers, duplicate pairs and oversized data must fail honestly.
- Opening hidden favourites tabs must not send requests before rules acceptance or user navigation.
- Removed rows and deactivated screens must not be revived by stale callbacks.
- Native tabs must preserve history, accessibility, large text and the recommendation write fences.

## Task 1 - Existing-data and menu route

- [ ] Verify health/version/static-cell/public-price contracts against source and a bounded live GET.
- [ ] Record first-party menu facts for exact existing Italian venue keys, maintaining currency, serving/context and checked date.
- [ ] Record Google eligibility and menu publication constraints without claiming an unsupported import.

## Task 2 - Android native comparison

Owner: Android lane, exclusive platform tree mobile-apps/android.

- [ ] Add focused failing model/client/UI fixture checks for same category/band, active sorting, visibility, missing/error and races.
- [ ] Add bounded fixed-origin GET transport and cell model, preserving the bookmark store.
- [ ] Implement native persistent destinations and full favourites comparison list, context save/recommend actions and secondary browser controls.
- [ ] Run JVM checks, compilation and lint; root owns device execution.
- [ ] Commit only platform paths and report exact SHA, failures and commands.

## Task 3 - iOS native comparison

Owner: iOS lane, exclusive platform tree mobile-apps/ios.

- [ ] Add meaningful fixture/native test coverage equivalent to Android, retaining table-managed targets.
- [ ] Implement bounded ephemeral GET transport, strict cell model and cancellation.
- [ ] Implement native destinations and accessible favourites selectors/list; keep browser and rule acceptance intact.
- [ ] Run available source guards; hosted Mac must run native tests before signing.
- [ ] Commit only platform paths and report exact SHA, unavailable checks and commands.

## Task 4 - Integration and delivery

- [ ] Independently review both platform commits before integration; fix in owning lanes.
- [ ] Update bundled privacy disclosures and release documentation with actual behaviour and limits.
- [ ] Root runs fresh combined guards/JVM/build/lint and owned background Android fixture/live read-only checks.
- [ ] Run one necessary exact-source gated native beta, inspect actual results/artifacts before store upload.
- [ ] Read back distribution state, keeping public release and physical acceptance separate.
- [ ] Publish exactly one curated UOS handoff through bound checkpoint and sealed receipt; attempt mirrors honestly.
