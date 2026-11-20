# Zdora, Genova — owner menu source review (20 November 2026)

## Source and identity

- Owner homepage: https://www.zdorabar.it/ . It gives Via Lomellini 34R, Genova and links directly to “Scarica il Menu (PDF)”.
- Menu PDF: https://www.zdorabar.it/public/uploads/sito/Zdora-menu-FEBBRAIO2026ITA.pdf . Fetched twice on 20 November 2026: HTTP 200, `application/pdf`, 821,714 bytes, 10 pages. Both downloads have raw SHA-256 `08b76f40542643642196893759438d464f868a80b64e4fb81cf6abdde9872071`. The importer’s normalized PDF text SHA-256 is `3e2bd598a50bc29c94f97c94853258298ed8cd3268febbc67f343b0b6d7bc658`.
- Existing Dove Bevo venue: `n2393258248`, cell `spyke`, Zdora, Via Lomellini 34 rosso, Genova, `44.41278, 8.92934`. OSM node version 4 (https://www.openstreetmap.org/node/2393258248) has matching name, address, and coordinates. The live mobile v2 venue route showed zero stored offers and no fee on the check date. This batch adds prices to that existing venue; it does not create a venue.
- The PDF filename says February 2026; its internal document title says November 2025 and its creation/modification metadata says 2 February 2026. The owner still linked it on the check date. These are published menu facts, not a guarantee of current till prices or all-day availability.

## Extracted data and limits

The immutable manifest `../../data/mobile-menu-v2-seeds/f603f7fd230cefa8780077ef469e4369ad20f6e1211fd80b8aba49d4fbf997f9.json` contains 119 beverage price rows from PDF pages 2–7, grouped as 12 beers, 17 wines, 31 page-5 cocktails, 28 page-6 spirits and gin drinks, and 31 coffees/soft drinks/fresh extracts. All amounts are the printed EUR amounts, stored in minor units with the original serving where stated. Each row identifies its page, menu heading and printed amount. Group heading prices apply only to the products visibly within that heading. “o” alternatives for Vodka Tonic/Vodka Lemon and Gin Tonic/Gin Lemon are separate clearly named choices at their shared printed group price. No unseen serving sizes are inferred.

Page 9 prints `COPERTO 1,50€`. It is one separate EUR 1.50 fixed fee with **unspecified basis** and **unknown applicability** to drink-only orders. It is not included in any beverage amount. Fee coverage is partial. Food, unpriced descriptions, artwork, menu photographs, ambiguous serving/price associations and unsupported availability claims are excluded. No Google review count is claimed. The owner site showed no separate reuse licence; only factual names, servings and price amounts are transcribed, not menu prose or presentation.

## Release boundary

This is a source-only draft, not a live import. The public website, Worker, database schema, legacy/customer prices and Roberto’s existing venue data remain untouched. Before any protected audit/seed operation, an independent reviewer should check every row against the pinned PDF, resolve any source ambiguity, confirm the live venue identity and check the latest public source. Import with the existing mobile v2 pipeline only after its normal audit, version and protected seed gates. Do not treat these prices as user-confirmed.
