# Cantine Sociali, Napoli: source-only app menu proposal

The [immutable manifest](../../data/mobile-menu-v2-seeds/17f5b2339f8b1d7487ce42e05d7d6316517ce9c89039bc4f1b76931a79701adc.json) stages **115 individually priced drinks** and one separately stated service-fee fact for the existing Dove Bevo venue `n7230981551`. This draft contains no new venue, customer contribution, website or backend change. It has not seeded public data. The live app-only menu endpoint returned `stored_offer_count: 0` for this venue before staging.

## Identity and source

- The published [Dove Bevo static cell](https://www.dovebevo.com/data/20261102/v/sr60k.json) contains `n7230981551`, **Cantine Sociali**, kind `1`, at `40.83571, 14.24115`, city Napoli ID `428339558`. The [OSM node](https://www.openstreetmap.org/node/7230981551) records a Cantine Sociali bar at `40.8357054, 14.2411491`. The other Cantine Sociali location at Santa Lucia is a different OSM node and is excluded.
- The venue-specific [QuickerMenu index](https://www.quickermenu.it/cantinesociali/) links the [drink](https://www.quickermenu.it/cantinesociali/drink/), [beer](https://www.quickermenu.it/cantinesociali/birre/), [amaro and digestif](https://www.quickermenu.it/cantinesociali/amaro-e-digestivi/) and [spirits](https://www.quickermenu.it/cantinesociali/distillati/) pages. Its footer identifies Piazza Giulio Rodinò, Napoli, and its [food page](https://www.quickermenu.it/cantinesociali/i-piatti/) explicitly says Piazza Rodinò 28. The [City of Napoli's venue plan](https://static-www.comune.napoli.it/wp-content/uploads/2025/08/Dehors_Elaborato_grafico_29.04.2019_pagine_172_197.pdf) independently locates Cantine Sociali at civic number 28. This supports the Chiaia venue match; it does not prove the menu was updated today.
- [QuickerMenu](https://www.quickermenu.it/) markets this as a venue menu platform and says operators can update menus themselves. The source is a **venue-specific merchant-hosted page**, not a Cantine Sociali-owned domain. The independent reviewer should verify this ownership and location chain before a protected seed tag. Only factual item names, exact displayed price amounts and explicit serving labels are staged; no descriptions, imagery, layout or review counts are copied.

All four pages returned HTTP 200 without redirect on **2026-11-04**. Their canonical `html_text_v1` SHA-256 values are pinned individually in the manifest. The drink page was re-fetched and gave the same normalized text hash twice. The menu's page dates are 22 January 2026 for drink and beer and 18 February 2026 for spirits and digestifs. The check date is an observation date, not an item-price update date. All item prices are stated in EUR on these Italian menu pages.

## Included price rows

| Page | Offers | Treatment |
| --- | ---: | --- |
| Drink | 62 | Named cocktails, with `spritz`, `negroni` and `sbagliato` categories only where the name makes that clear. Other cocktail categories remain null. |
| Beer | 6 | One explicit `50cl` Heineken at €7 (`serving_ml: 500`) and five other beers without a reliable size. No beer is marked draft because the page's draft/bottled headings do not unambiguously cover every item. |
| Amaro and digestifs | 10 | Each listed amaro or digestif has its own EUR amount; serving remains unspecified. |
| Spirits | 37 | Explicit `porzione` is retained where printed; it is not converted into millilitres. The VESUVIUS price has no portion label and retains an unspecified serving. |

The menu footer states **“coperto e servizio 10%”**. The manifest records this as a separate bill-percentage fee with unknown applicability and documented-partial fee coverage. It is **not** added to or hidden inside any drink amount; the menu does not explain exactly when it applies.

## Excluded or unresolved rows

- Ten beer variants display inconsistent size text such as `0.25cl`, `0.20 cl`, `0,40` and `cl 0,33`. We have not silently treated these as 25cl, 20cl, 40cl or 33cl. An operator can clarify the sizes before inclusion.
- The spirits lines for **Bombay Sapphire** and **Etsu** show numeric prices but omit a currency marker on the individual line. They are excluded pending explicit confirmation, despite the EUR context of nearby spirits.
- The [white-wine page](https://www.quickermenu.it/cantinesociali/vini-bianchi/) shows group/rotating glass prices and many named wines whose bottle or glass serving is not consistently stated. No wine row is staged until the serving and exact product price can be paired reliably.
- Unpriced `--` bottle variants and all food are excluded. No offer is labeled a deal, confirmed by a customer, or current at a later date.

## Gate before public import

Local structure validation and filename/content SHA-256 validation pass for this source-only candidate. Before publication, an independent reviewer should inspect the live merchant pages and every included price, serving and source-use basis. The protected read-only audit must then re-fetch the exact visible text and current static identity, and confirm there is no moderation, duplicate, conflict or customer-price-history issue. A separate guarded apply, public API readback and phone-app check are required before counting these as live prices. A draft PR is not a public import.
