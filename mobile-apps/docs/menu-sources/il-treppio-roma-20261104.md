# Il Treppio, Roma — app-only owner menu candidate

Checked 4 November 2026. This source-only candidate stages **16 named EUR drink offers** for one existing Roberto venue. It makes no public data change and does not touch the website, backend, legacy customer prices or user confirmations.

## Identity and live starting state

- The [owner home page](https://www.iltreppio.it/) and [menu](https://www.iltreppio.it/menu/) identify Il Treppio at **Via Angelo Emo 61, Roma**. The home page links the menu, and the menu is served live with HTTP 200.
- [OSM node 1286797433](https://www.openstreetmap.org/node/1286797433), version 3, identifies `Il Treppio`, `amenity=pub`, `Via Angelo Emo 61` and coordinates `41.9047962, 12.4473600`. It tags the same owner site.
- Roberto's published static catalogue `20261102`, cell `sr2y7`, has the exact node key, name, kind `2`, rounded coordinates `41.9048, 12.44736`, address `Via Angelo Emo 61`, and city tuple `72959652 / Roma`. The manifest preserves that tuple.
- The live [mobile venue route](https://www.dovebevo.com/api/mobile/v2/menu/venues/n1286797433?cell=sr2y7) returned `stored_offer_count: 0`, no offers and `fee_coverage.status: unknown` on the check day. Recheck the live state before protected audit and import.

## Menu facts and omissions

- The owner's current [menu page](https://www.iltreppio.it/menu/) yielded the same `html_text_v1` visible-text SHA-256, `ff7ffee14eb38d7b3e03e3ca950d88a6edd03eda96340f9c234e1df9e0b7be89`, on two independent live fetches. It has the named price alongside each selected item's details.
- The 16 offers comprise two named draft beers, two listed bottled beers, and six wines each with a separately printed glass and bottle price. Draft size labels are preserved exactly as the owner's `0,4` and `0,3`; no unit or millilitre count is inferred. The two bottled beer sizes are explicitly stated as 33cl and 50cl. Wine is explicitly distinguished as `Calice` or `Bottiglia`.
- The owner prints `Pilsner Konig 50cl` but describes it as `33cl`, so that row is **held**. The unnamed six rotating beers and range-priced assorted bottles are excluded. Food, broad cocktail starting prices, non-priced gin/whisky, seasonal or time-limited promotions and optional deals are excluded. The owner page does not establish mandatory fee coverage, so both fee arrays are empty and fee scope remains **unknown**.
- These are published menu prices, not customer observations or guaranteed current availability. The menu itself says products evolve, so the protected audit must recheck the owner page before any seed. No images, recipe text, review counts, fabricated visit dates or confirmations are copied.

## Gate

The exact UTF-8 manifest is `mobile-apps/data/mobile-menu-v2-seeds/d1b2f484dfa84d821c024527771045fa579bc86816578563111de6cd47a6fa77.json`; its filename is the full-file SHA-256. A local source-pair assertion checked each selected name, price and detail within one owner menu card. Local `import_v2.validate` passed for the one venue, one source and 16 offers. This is a **draft source candidate only**. Independent review must verify each price/serving pair, source-use basis, venue identity and current duplicates before a green merge. A distinct protected dry run and guarded seed are required before public data can change.
