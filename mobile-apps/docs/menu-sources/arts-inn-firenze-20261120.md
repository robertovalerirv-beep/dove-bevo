# The Arts Inn Firenze: source-only menu candidate (20 November 2026)

**Status:** Draft source-only candidate for independent all-row review. No public
price or fee has been imported by this change.

## Venue and sources

- Existing published Italian catalogue venue: `n6368806264` in cell `spzcp`,
  `The Arts Inn`, Via del Porcellana 63, Firenze, latitude `43.77363`,
  longitude `11.24814`, static city ID `61753360`. Its public mobile v2 record
  had zero stored offers and unknown fee coverage when checked.
- [Current OSM node](https://www.openstreetmap.org/node/6368806264) links to
  the owner's site and records Via del Porcellana 63 with unit `R`. The owner
  [menu](https://it.theartsinn-florence.com/menu) gives `63R`; this is the same
  civic address with the Florence red-number suffix, not another branch.
- [Signature cocktails](https://it.theartsinn-florence.com/menu): 12 named
  cocktails at EUR 15 each. `html_text_v1` SHA-256
  `2454094b742dffe2fe020151fccaf517448c924226b1c567a9e9ee22784ba73e`.
- [Classic cocktails](https://it.theartsinn-florence.com/menu?location=Via+del+Porcellana&menu=cocktails):
  24 printed entries at EUR 13, 14 or 15. `html_text_v1` SHA-256
  `12c3a96f27d644991e90f305e850b549a4d1a7a89591f1af71bba3cf79545be6`.
- [Bar rules](https://www.theartsinn-florence.com/bar-rules): EUR 5 per person
  is required to secure a booking for groups larger than six, or larger than
  three on weekends. `html_text_v1` SHA-256
  `e11db172a1edc37f3e86a5f147f5aa27d4770db8090ae0e737293e0a72e209c5`.
  The owner describes this as a fee, not a minimum drink spend. It is stored
  separately from all 36 menu item amounts, with a conditional applicability
  label. The rules do not state whether it is later credited or refunded; no
  such claim is made. A table otherwise requires a drink order, without a
  stated minimum amount.

All three owner pages returned HTTP 200 with the importer user agent and
produced the same normalized text hashes on two independent fetches. Their
robots.txt permits the menu and rules paths; neither page displays an update
date. `source_checked_on` is therefore the observation date, not a claim that
the menu has remained unchanged. This candidate records only factual names,
printed prices, conditions and links. It copies no images, descriptions,
layouts, or customer contributions; no express reuse licence was found.

## Row decisions

The manifest has 36 regular EUR cocktail offers, one conditional group booking
fee, and `documented_partial` fee coverage. Servings are left null because the
owner menu does not print volumes. The printed combined names
`MOSCOW MULE/LONDON MULE` and `GODFATHER/GODMOTHER` remain combined; neither is
expanded into invented separate prices. `NEGRONI`, `PREMIUM NEGRONI`,
`NEGRONI SBAGLIATO` and `HUGO SPRITZ` use their exact supported drink filters;
the other cocktails have no inferred filter category.

The broad EUR 13–15 statement for off-menu drinks is excluded because it is
not an exact item price. Gin choices under “GIN AND TONIC / MARTINI” are held
for a separate serving-identity review, and the generic mocktail and other
menu sections are outside this small verified batch. The conditional booking
fee is displayed separately from a drink price and must not be added to a
map pin or a cheapest-drink comparison.

## Release gate

The 36 printed name/price pairs were checked in menu order against the live
owner pages while generating the immutable manifest. A separate reviewer must
inspect every row and the fee condition. After source-only merge, the protected
production dry-run must verify the exact owner hashes, published venue identity,
customer/legacy preservation, and absent eligible rows before any guarded seed.
Finally read back all 36 offers and the fee from the public API. Until then,
these rows are staged facts only, not live coverage.
