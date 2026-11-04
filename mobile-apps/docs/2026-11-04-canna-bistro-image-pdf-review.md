# Canna Bistro Napoli image-PDF menu: held

Reviewed 2026-11-04. This is a source review, not a seed or an authorization to publish prices.

- Existing public Dove Bevo venue: `n11476202839`, `Canna Bistro`, Napoli, cell `sr60k`, public catalogue `20261102`. The [OSM node](https://www.openstreetmap.org/node/11476202839) is a bar at 40.8506794, 14.2504828. The live catalogue lists the same key, name and rounded coordinates.
- The [venue's own site](https://www.cannabistro.it/?lang=it) links the [menu PDF](https://cdn.website.dish.co/media/a4/6d/10261980/MENU.pdf). Both the site and PDF give Via Vincenzo Bellini 13, Napoli.
- Exact downloaded PDF: 7,655,825 bytes, SHA-256 `cbf9697c28cc045f64f998152c0a6bc7a1cdea91d1fa102b831a3b6195a13cfa`, 20 pages. `pdftotext -layout` yielded no menu text. All 20 pages were rendered and visually reviewed against those exact bytes. The owner PDF and page images are not committed.

| PDF pages | Visual finding |
| --- | --- |
| 1–3 | Cover and food pages; no candidate drink offer. |
| 4 | Three draft beers have a `SIZE MEDIUM` price, but no volume in millilitres. |
| 5 | Cocktail section introduction. |
| 6–8 | Named cocktails and prices. Page 8 also marks two drinks `OUT OF STOCK`, two `COMING SOON`, and one Negroni variant without a price; these cannot be treated as available fixed-price offers. |
| 9 | Wines by the glass with individual prices. |
| 10–14 | Wine-bottle lists, including entries marked `Terminato`; bottle prices must not be labelled as glass prices. |
| 15–16 | Gin list. Page 16 describes standard tonic and a €1 charge for other tonic choices; these are not safe to flatten into one universal gin price. |
| 17–19 | Spirits with 6 cl and 3 cl variants, plus a vodka section without a stated serving size. |
| 20 | Opening details and a compulsory service charge: **`SERVIZIO 10%` / `MIN.1€`**. The same page lists water €3, soft drink €5 and spritz €7.50. |

## Hold reason

The menu states a service fee of 10% with a €1 minimum. This means the charge is `max(10% of the bill, €1)`. The existing v2 fee row can express a fixed fee **or** a percentage of the bill, but has no minimum field or combined-fee formula. Two fee rows would add the charges; a label that says “minimum €1” would not make the minimum machine-readable or enforceable. The `pdf_image_v1` source contract in draft PR #240 also rejects fee rows altogether. Importing offers without this compulsory charge could misstate a customer's price.

**Decision:** no Canna offer or fee manifest was placed in `mobile-apps/data/mobile-menu-v2-seeds/`; no public or private database write was made. Keep this lead held until an additive fee model and page-level fee evidence can represent the exact rule, then re-fetch the owner's PDF and independently re-review the candidate at that exact SHA before any import. The copyright notice on page 20 also calls for source-use review before publication; this note records facts and links without copying menu artwork or descriptions.
