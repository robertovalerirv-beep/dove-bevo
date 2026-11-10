# Blended, Padova: current owner-linked drink list review

This is an app-only candidate for the guarded one-off menu importer. It has **not been seeded** or submitted as a customer contribution. Independent review and the protected audit remain required before a production seed.

## Existing venue identity

- Roberto's live `20261108` static cell [`u206q`](https://www.dovebevo.com/data/20261108/v/u206q.json) contained `n13144971801`, `Blended`, kind `1`, `45.41272, 11.87476`, `Via del Carmine 2/A`, city `Padova` (`406747508`) on 10 November 2026.
- The [owner homepage](https://blended-padova.it/) and its [drink list](https://blended-padova.it/i-nostri-cocktails/) both name Via del Carmine 2/A, Padova. The [OSM node](https://www.openstreetmap.org/node/13144971801) has the same venue name, address and coordinates; Roberto's coordinates are the rounded node coordinates.
- The live app-only [v2 menu route](https://www.dovebevo.com/api/mobile/v2/menu/venues/n13144971801?cell=u206q&limit=100) returned `stored_offer_count: 0` at review. This does not exclude legacy/customer prices or later imports.

## Current first-party source

- The current owner homepage directly links its [priced drink list](https://blended-padova.it/i-nostri-cocktails/). It is a live owner navigation path rather than an orphaned menu file. The owner does not state an expiration date; the protected audit must recheck the exact page.
- Three direct requests returned HTTP 200, no redirects and identical UTF-8 HTML of 141,264 bytes. Raw SHA-256 was `50b015d0210947a27bb0c9f30bb3c41555c997eaa11c14e7d25dba920f14102b`; the importer's `html_text_v1` visible-text SHA-256 was `e0eb3c5acf5d0ea2319c6227cd4f0f18d2f5d46c6cbcd09e21aaf4c8a8f86698`. The manifest pins the visible-text digest in both required fields.
- The manifest records **54 exact listed prices** for this one existing venue: house and classic cocktails, named aperitifs and alcohol-free drinks, four beer serving entries, and six wines under the owner's `VINI AL CALICE` heading. `PARK EXPORT 5,2 vol` occurs twice because the owner gives distinct `Media` and `Piccola` prices. The source says only `BIRRE`, not that the beer is on tap, so the draft-beer category is left unset. No beer volume is inferred from `Media` or `Piccola`.
- The import excludes menu entries whose price begins `da` (a variable starting price), an unpriced item, and the bottle/takeaway section. The listed beer size words are copied as serving labels; `Calice` is taken from the wine section heading. No numeric volume, visit date, review count, currency conversion or general fee is invented. The page does not establish a general service-fee policy, so empty `fees` and `fee_coverage` mean **unknown fee scope**.
- These are venue menu prices, not paid/customer observations. A changed menu digest, identity, hidden/reported venue or D1 conflict must fail the protected audit/seed guard. No public write was made in this lane.

## Local verification

- All 54 evidence pointers were checked against the saved source HTML: each exact item name and EUR amount resolves to the referenced title and price lines.
- `python -m unittest test_blended_padova_manifest test_seed_manifest test_import_v2.ImportTests.test_dry_run_apply_retry_and_legacy_preservation` passed locally.

## Candidates not selected

- Rétro Venezia has a current owner menu, but its existing v2 venue `n9445602376` already had 59 offers at review. Adding those again would risk duplication.
- Ai Scarponi, Padova, was not found in Roberto's public venue search fragment, so its prices are not attached to a guessed identity.
