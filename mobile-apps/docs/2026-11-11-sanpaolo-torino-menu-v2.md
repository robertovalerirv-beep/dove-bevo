# Birrificio San Paolo Torino: owner drink-menu source

This is a source-only, unseeded mobile-menu-v2 candidate for one existing Dove Bevo venue. It does not change Roberto's website, backend, database, customer prices, or public content.

## Venue and owner source

- Existing static venue: `n1739196541`, cell `u0j2q`, Torino city `63621589`, published coordinates `45.05599, 7.64919`, name Birrificio San Paolo, Via Airasca 11 D. Its public v2 menu returned `stored_offer_count: 0` on 11 November 2026. [OSM node](https://www.openstreetmap.org/node/1739196541) lists the same owner website.
- The [owner menu page](https://birrificiosanpaolo.it/menu-birrificio-san-paolo/) currently embeds its [direct PDF menu](https://birrificiosanpaolo.it/wp-content/uploads/2024/11/menu-pdf-29ott25.pdf). The PDF GET and HEAD returned HTTP 200 without redirect, `application/pdf`, 75,713 bytes. Its file name and PDF metadata say 29 October 2025, and the server's Last-Modified header is 29 October 2025. This is the live owner-linked menu, but it is **not** proof of today's in-venue prices.
- Raw PDF SHA-256: `7278c590025fcbbfd4956b4c46f17c17df9d341dfc0af2b3161c778073d164d0`; importer-normalized PDF text SHA-256: `54e8d67bffd40c003211cbf93409ec45b437901112c33485d4fd36a85dada833`. The nine-page PDF has extractable text; the manifest uses `pdf_text_v1` and binds every offer to its printed page and amount.
- **Identity hold:** the owner's current homepage describes Via Airasca **11/B**, while the OSM node and Dove Bevo static venue say **11 D**. The OSM website points to this exact owner's domain and both use the identical venue name. The owner's [embedded venue map](https://birrificiosanpaolo.it/) uses coordinates `45.0559629, 7.6492143`, about 3.57 m from the published static point `45.05599, 7.64919`; this supports a common physical location but does not explain the address suffix. Do not seed until an independent reviewer explicitly resolves or accepts that discrepancy.

## Reviewed scope

The [immutable manifest](../data/mobile-menu-v2-seeds/186783ef7929e7273718115a9c80bf871384da2feccc0f4e62cab45dc9143e67.json) records 21 printed EUR drink offers: six beer formats, cider, a generic canned soft drink, water, Gin Tonic, Negroni, two espresso service options, and eight listed wines. Pages 6–9 were checked against the exact PDF. Printed litre sizes are converted arithmetically to `serving_ml`; the two special draught beers have only the printed `Piccola` or `Media` label and **no inferred volume**. Four red wines print 75 cl; four white wines do not print a serving size, so none is invented. Espresso's distinct counter/table prices keep their service conditions.

Food, food supplements, the broad mixed-spirit price lines, and the aperitivo context are excluded. The PDF does not state a mandatory cover charge; fee coverage remains unknown, with no no-fee declaration. No customer contribution was created. This menu is a dated owner observation, not a receipt or guarantee that each item is still served.

## Gate before any public import

Local importer `validate` and `source_digests` passed for all 21 offers and the exact PDF bytes. An independent reviewer must check the **11 D versus 11/B identity hold**, dated owner link, and every row against the PDF. Only after that identity hold is resolved and a green exact-head source PR is merged may the coordinator run the protected production dry run, inspect moderation/customer/legacy guards, perform a guarded seed, and check exact public read-back. No protected audit or seed was attempted in this source worktree.
