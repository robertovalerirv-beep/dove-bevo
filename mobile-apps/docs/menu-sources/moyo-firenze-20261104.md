# Moyo, Firenze — app-only owner menu candidate

Checked 4 November 2026. This source-only candidate stages **36 named EUR drink offers** for one existing Roberto venue. It makes no public data change and does not touch the website, backend, legacy customer prices or user confirmations.

## Identity and live starting state

- [Moyo's current homepage](https://www.moyo.it/) identifies **Moyo, Via dei Benci 23R, Firenze** and directly links its [evening menu PDF](https://www.moyo.it/wp-content/uploads/2025/03/moyo-menu-sera-3.pdf).
- [OSM node 5598982521](https://www.openstreetmap.org/node/5598982521) names `Moyo`, tags it as a bar and locates it at `43.7680706, 11.2596751`. Roberto's published static catalogue `20261102`, cell `srb0b`, contains the exact node key `n5598982521`, name `Moyo`, kind `1`, rounded coordinates `43.76807, 11.25968`, and Firenze city tuple `61753360`. Its static address is empty, so the manifest leaves `address` null. The owner address is used to corroborate identity, not to modify Roberto's static tuple.
- The live [mobile venue route](https://www.dovebevo.com/api/mobile/v2/menu/venues/n5598982521?cell=srb0b) returned `stored_offer_count: 0` and unknown fee coverage on the check day. The wider Florence inventory was incomplete because several cells failed, so recheck this venue and nearby duplicates in the protected audit before import.

## Menu facts and omissions

- The owner-linked PDF was fetched twice with identical raw SHA-256 `cb64efe5e64c13fc9ce5e7184e68828bc09d5dabfd8c860da6227a6caff8853b`. Its importer-normalized `pdf_text_v1` SHA-256 is `976c1ac83334ad69b3ebfcaec52aff383763427e4d0003949dddb40079c6b53e`.
- The 36 offers comprise two explicitly sized waters, soft drinks and amari; six named bottled beers; nine international cocktail variants; seven classic cocktails; six Moyo signatures; and four mocktails. Menu headings print the prices for their listed drink groups: international and classic cocktails €10, signatures €15, mocktails €8. Other prices appear beside their item. The two slash-labelled gin and vodka alternatives are each represented as their explicit tonic and lemon variants, while the owner's combined `Aperol Spritz/Campari` and `Tanqueray 00 Tonic/Lemon` labels remain combined where the menu does not resolve the formulation. Bottle size is not invented for beer.
- Page 5 states `Coperto: 2€` without saying whether it applies to drinks. The manifest records one fee with **unknown applicability** and only `documented_partial` fee coverage. It does not add the fee to displayed drink prices.
- Draft Peroni and Raffo print `5/7` without labelled sizes; wine has ambiguous price columns; premium cocktails start at `da 12€`; food bundles and bottle service are out of scope. None of these is imported. No menu images, recipe text, Google review counts, invented visit dates or confirmations are copied.
- **Freshness caveat:** PDF metadata gives a creation date of 31 October 2025. It remains linked from the owner homepage on the check day, but that does not prove prices were renewed in 2026 or still charged at the till. Independent reviewer must verify the current owner link and menu before protected import.

## Gate

The exact UTF-8 manifest is `mobile-apps/data/mobile-menu-v2-seeds/3419c808baa9372765cd72b9928a963fcaf85f1fa74a96c5056015751abe68be.json`; its filename is its full-file SHA-256. Local `import_v2.validate` passed for the one venue, one source, 36 offers, one documented fee and fee coverage; the focused seed-manifest test passed. The general importer suite passed 15 of 19 tests; four shell tag tests could not run on this Windows host because WSL `/bin/bash` is absent. This is a **draft source candidate only**. Independent review must verify price and serving pairs, source-use basis, venue identity, current duplicates and freshness before a green merge. A distinct protected dry run and guarded seed are required before public data can change.
