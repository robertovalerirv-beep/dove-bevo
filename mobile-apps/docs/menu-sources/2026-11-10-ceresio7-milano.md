# Ceresio 7, Milano: owner-linked American Bar menu review

This is an app-only candidate for the guarded one-off menu importer. It is **not seeded** to production or submitted as customer content. The protected audit and independent reviewer remain required before any seed tag.

## Existing venue identity

- Roberto's live `20261108` static cell `u0ndb` contained `n3049190340`, `Ceresio 7`, kind `1`, `45.48352, 9.18031`, `Via Ceresio 7`, city `Milano` (`62505581`) on 10 November 2026: `https://www.dovebevo.com/data/20261108/v/u0ndb.json`.
- The [owner contact page](https://ceresio7.com/milano/contatti/) names Via Ceresio 7, Milan and phone `+39 0231039221`. The [OSM node](https://www.openstreetmap.org/node/3049190340) has the same business name, street, number and phone; Roberto's static coordinates are its rounded coordinates.
- The live app-only v2 route `https://www.dovebevo.com/api/mobile/v2/menu/venues/n3049190340?cell=u0ndb&limit=100` returned `stored_offer_count: 0` at review. This says nothing about legacy/customer prices or later imports.

## Current first-party source

- The current [Ceresio 7 homepage](https://ceresio7.com/) directly links its [American Bar menu](https://ceresio7.com/milano/bar/). This is a stronger current-use link than an orphaned QR page. The menu's drink images include May 2026 upload paths. The page does not state a menu expiration date; the protected audit must recheck the exact page.
- Three direct requests with the importer's user agent returned HTTP 200, no redirects, UTF-8 HTML and exactly 167,067 bytes each. Raw SHA-256 was `4fff72a3de5c6dbfeccb4cc94f1c1902c7f9439432e00f8e094691ced4af2f32`; the importer's `html_text_v1` visible-text SHA-256 was `d91e90d0420417d7f34d80e455949d86072e63544f0b3e75ca2eeb1d9fb2f71b`. The manifest pins the latter in both required fields.
- The manifest records **22 named cocktail offers at this one existing Milano venue**, each with its exact original EUR 18, 21 or 22 price. It transcribes only the priced drink rows from the `MEMORIA`, `VISIONE`, `ORIGINE`, `FIRME` and `ESSENZA` sections before `TAPAS MENU`. The three `ESSENZA` drinks are marked alcohol-free because the owner labels that section `No Alchol`; `SPRITZ REDUX` and `NEGRONCELLO` follow their named drink types. No recipe descriptions, images or other protected creative content are copied.
- None of the 22 drink rows specifies a serving volume. `serving_label` and `serving_ml` are null. The reviewed HTML has no separate condition attached to these named prices and does not establish a general service-fee rule, so empty `fees` and `fee_coverage` mean **unknown fee scope**, not free service.
- The source is a venue's menu price, not a paid/customer observation. There are no fabricated review counts, visit dates, confirmations, currencies or conversions. A changed menu digest, venue identity, hidden/reported venue or D1 conflict must fail the protected audit/seed guard. No public write was made in this lane.

## Local verification

- Against the third direct fetch, all 22 manifest evidence pointers resolved to an exact owner HTML item line and its exact EUR price line, with no duplicate item/price pair.
- `python -m unittest test_ceresio7_manifest test_seed_manifest test_import_v2.ImportTests.test_dry_run_apply_retry_and_legacy_preservation`: 3 passed.
- The full importer shell-tag test is not runnable on this Windows host because its WSL installation lacks `/bin/bash`; the protected Linux audit has not been run.

## Previously held sources

- Rita's Tikiroom, Milano: closed PR #298 is preserved for review history. Its QR page is not linked from the current owner homepage, carries a hidden May 2025 heading, and matches only 8 of 54 names on the current linked unpriced drinks page. Do not seed it.
- Bierkeller/Biergarten, Napoli: the listed domain redirected to unrelated gambling content during this review, so it is not a trustworthy owner-menu source.
- Hopside, Roma: its owner-linked PDF path includes a 2017 timestamp; current-use and price reliability are not established.
- Birrificio San Paolo, Torino: the current owner menu page describes food and beer but publishes no itemised drink prices.
