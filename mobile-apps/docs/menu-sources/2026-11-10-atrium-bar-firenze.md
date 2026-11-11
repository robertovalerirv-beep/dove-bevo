# Atrium Bar Firenze: owner cocktail-list candidate

This is a **source-only, app-only candidate**. It does not change the website, customer prices, or the public menu database. A separate guarded live audit must verify the exact source hash, static venue identity, and current duplicates before any import.

## Venue identity

- Roberto's [20261108 static cell `srb10`](https://www.dovebevo.com/data/20261108/v/srb10.json) contains `n12912861901`, **Atrium Bar**, kind `bar` (`1`), at `43.77708, 11.26635` in Firenze city `61753360`. The static address field is empty; the candidate leaves it null.
- [OSM node 12912861901](https://www.openstreetmap.org/node/12912861901) has the same name and coordinates. [Four Seasons' Atrium Bar page](https://www.fourseasons.com/florence/dining/lounges/atrium_bar/) identifies the bar within Four Seasons Hotel Firenze and directly links its cocktail list. The hotel's [official directions](https://www.fourseasons.com/florence/getting-here/) give Borgo Pinti 99, Firenze. This hotel address is context, not an inferred static catalogue address.
- The [public mobile v2 venue read](https://www.dovebevo.com/api/mobile/v2/menu/venues/n12912861901?cell=srb10&limit=1) returned `stored_offer_count: 0`, no offers, and unknown fee coverage on 10 November 2026. Recheck before import.

## First-party menu and transcription

- Source: [Four Seasons' live Italian cocktail list](https://www.fourseasons.com/it/florence/dining/lounges/atrium_bar/cocktails/). The owner page returned HTTPS 200 on 10 November 2026. The importer's `html_text_v1` digest was `5723288594c32a2f718bfa2f9d2f184660a6c870b5f611cf29486851543722cb` on two independent fetches. The source is mutable, so a future hash mismatch must hold the import for review.
- Ten exact drink rows are staged: eight `The Tasting Globe` cocktails at **EUR 25** and two `Non-Alcoholic Drinks` at **EUR 18**. The named-price evidence is the visible section, item title, and `EUR` amount on the source page. No serving size is printed for these items, so serving fields are null. No fee or explicit no-fee statement is printed, so fee coverage remains unknown.
- **Vintage - aged in barrell** is excluded. The [Italian list](https://www.fourseasons.com/it/florence/dining/lounges/atrium_bar/cocktails/) prints EUR 24 while the [English list](https://www.fourseasons.com/florence/dining/lounges/atrium_bar/cocktails/) prints EUR 25. Importing either amount would conceal a live first-party conflict.
- `Buffalo Wing` and `Bagel & Lox` are drink names under the source's `The Tasting Globe` cocktail section, not food prices. The Italian spelling `Buffalo Wing` is preserved. The source supplies no customer confirmations, receipt dates, review counts, or discounts, and the candidate claims none.

## Guardrails before any public seed

Run the importer's protected read-only audit on the exact manifest head. Check source hash, OSM/static tuple, current same-venue offer inventory, semantic duplicates, and source-use review. Hold the seed if the source changed or venue association is uncertain. This candidate adds no database rows until the separately authorized guarded import completes.
