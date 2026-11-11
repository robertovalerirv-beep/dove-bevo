# Vinile Palermo: owner drink menu, 11 November 2026

This is a **source-only, unseeded** mobile-menu-v2 candidate for one existing venue. It changes no website, backend, or public price.

## Identity and source

- Existing Dove Bevo static venue: `n5410425433`, cell `sqc2z`, Palermo city ID `67253662`, `Via Giuseppe Piazzi 19`, and exact published static coordinates `38.12423, 13.34737`. [OSM node](https://www.openstreetmap.org/node/5410425433); the public `/api/mobile/v2/menu/venues/n5410425433?cell=sqc2z` returned `stored_offer_count: 0` during research.
- [Vinile Pub owner homepage](https://vinilepub.it/) says `Via Giuseppe Piazzi 19, 90141 Palermo PA` and directly links [this drink-menu PDF](https://vinilepub.it/wp-content/uploads/menu-vinilepub_online.pdf).
- The PDF was directly fetched twice on 11 November 2026: HTTP 200, `application/pdf`, 1,115,042 bytes, SHA-256 `c82fd401193a0a1e25e5c681327b050d94f64765f81998d8ac9c2be1bca547a3` both times. It has 16 image-only pages. `pdfinfo` reports title `menu-vinilepub-26+cartavini_P3`, creation 19 October 2026 16:55:10, modification 19 October 2026 16:55:11. The owner site linked it on the check date. No effective price date or current receipt is stated.
- [Source manifest](../data/mobile-menu-v2-seeds/aa3ceeb4f83a8932ee05b5a25b7ca66c2d3046dde65c095dfdf2d4eb012c7d9f.json) binds each reviewed item to the exact PDF hash, PDF page, printed name, and normalized EUR amount. The page-evidence digest is `adc20bb8dd22e179571e897a9e107b9c71a27ad6265674bee1ac8d585759c21b`.

## Scope and interpretation

75 unambiguous named offers were transcribed: 17 on page 2, 17 on page 3, 14 on page 4, 15 on page 5, three wine-by-glass offers on page 7, one prosecco-by-glass offer on page 8, and eight beverages on page 9. This is deliberately a subset, not a statement that other menu items or prices do not exist. Factual names, displayed prices, and printed serving labels are used; no artwork, photos, prose, or menu layout is copied. EUR is supported by the menu's wine pages and its Palermo venue context.

The source prints the draft-beer sizes as `0,20 cl` and `0,40 cl`, which appear anomalous. Those four draft-beer rows are held out of the manifest; no unit is inferred or converted. Tequila Sunrise is held out of this first batch for the separate supplemental review. For the prosecco glass, the printed `Bicchiere` size is recorded; no volume is inferred. The PDF states no mandatory cover or service charge. Fee coverage remains **unknown**; the manifest makes no fee-exemption claim. Prices are menu observations, not customer-confirmed receipts.

## Verification and release gate

The local import schema validator accepted all 75 rows, and `source_digests` reproduced both source pins from the downloaded PDF. The normal importer dry run could not start in this worker because its protected database credentials are unavailable; it returned `startup/unavailable` and did not write public data. Before seeding, a separate reviewer must check all 75 lines against the exact rendered PDF pages including the wine glass and category labels. Then the coordinator can run the authorized protected dry run and seed process, followed by public venue read-back. No public write was performed here.
