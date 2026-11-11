# Volume Firenze owner-menu source review

Checked 11 November 2026. This is a source-only candidate for the apps. No customer price, new venue, public import or website change is claimed.

## Venue and source

- Existing public venue: `n4477898189` in `spzbz`, Volume, Piazza di Santo Spirito 5/r, Firenze, 43.76669/11.24789, city ID 61753360. The live app-v2 route showed zero stored offers and the legacy cell had zero customer prices.
- [OSM node](https://www.openstreetmap.org/node/4477898189) matches the [owner site](https://www.volume.fi.it/) name, address and website.
- [Direct owner DRINKS Menù page](https://www.volume.fi.it/food/) returned HTTP 200, `text/html; charset=UTF-8`, 50,020 bytes with the guarded importer user agent and no redirect. [WordPress page 42](https://www.volume.fi.it/wp-json/wp/v2/pages/42?_fields=id,modified,link,slug) reports last modification on 9 September 2026, resolving the older events archive concern.
- Raw HTML SHA-256: `db997b432755f0c9f01a47394541c72068f63dc9afd9e4571bc6a61e20d68bfc`. Guarded `html_text_v1` normalized text SHA-256: `877861dfb59c70c5ca5ad8821fdd75727e9726fa8cec888460ac7c32bae12f36`; this is pinned as both importer source hash fields. A later content change must fail the audit, not silently update prices.
- Source-use review found no menu reuse restriction on the owner page or robots root. The list carries factual item names and prices only; it does not copy menu prose or imagery.

## Exact staged prices

| # | Menu section | Printed item | Serving | EUR |
| ---: | --- | --- | --- | ---: |
| 1 | ALTERNATIVE SPRIZ 10€ | Coverciano | — | 10.00 |
| 2 | PREMIUM GIN SELEZIONE 12€ | Peter in Florence | — | 12.00 |
| 3 | PREMIUM GIN SELEZIONE 12€ | Sabatini | — | 12.00 |
| 4 | PREMIUM GIN SELEZIONE 12€ | Roku | — | 12.00 |
| 5 | PREMIUM GIN SELEZIONE 12€ | Monkey 47 | — | 12.00 |
| 6 | PREMIUM GIN SELEZIONE 12€ | Mare | — | 12.00 |
| 7 | PREMIUM GIN SELEZIONE 12€ | Hendrick’s | — | 12.00 |
| 8 | PREMIUM GIN SELEZIONE 12€ | Bulldog | — | 12.00 |
| 9 | MOSKOW MULES 8€ | VOLUME MULES | — | 8.00 |
| 10 | MOSKOW MULES 8€ | ULTRA CLASSIC | — | 8.00 |
| 11 | MOSKOW MULES 8€ | RASE | — | 8.00 |
| 12 | BEER – BIRRE | BLANCE – MC 77 | Small | 5.50 |
| 13 | BEER – BIRRE | BLANCE – MC 77 | Large | 6.50 |
| 14 | BEER – BIRRE | SUPER B – BALADIN | Small | 5.50 |
| 15 | BEER – BIRRE | SUPER B – BALADIN | Large | 6.50 |
| 16 | BEER – BIRRE | MENABREA – LAGER | Small | 5.00 |
| 17 | BEER – BIRRE | MENABREA – LAGER | Large | 6.00 |
| 18 | BEER – BIRRE | ITALIAN BOCK – RITUAL LAB | Small | 5.50 |
| 19 | BEER – BIRRE | ITALIAN BOCK – RITUAL LAB | Large | 6.50 |
| 20 | BEER – BIRRE | AMERICAN IPA – OPPERBACCO | Small | 5.50 |
| 21 | BEER – BIRRE | AMERICAN IPA – OPPERBACCO | Large | 6.50 |
| 22 | VINI ROSSI | Nobile di Montepulciano | — | 7.00 |
| 23 | VINI ROSSI | Bolgheri | — | 7.00 |
| 24 | VINI ROSSI | Cabernet Sauvignon | — | 6.00 |
| 25 | VINI ROSSI | Chianti | — | 6.00 |
| 26 | VINI BIANCHI | Traminer Aromatico | — | 6.00 |
| 27 | VINI BIANCHI | Vermentino | — | 6.00 |
| 28 | VINI BIANCHI | Pinot Grigio | — | 6.00 |
| 29 | CLASSIC DRINKS | Old Fashioned | — | 8.00 |
| 30 | CLASSIC DRINKS | Negroni | — | 8.00 |
| 31 | CLASSIC DRINKS | Manhattan | — | 8.00 |
| 32 | CLASSIC DRINKS | Whiskey Sour | — | 8.00 |
| 33 | CLASSIC DRINKS | Margarita | — | 8.00 |
| 34 | CLASSIC DRINKS | Bloody Mary | — | 8.00 |
| 35 | CLASSIC DRINKS | Boulevardier | — | 8.00 |
| 36 | CLASSIC DRINKS | Americano | — | 8.00 |
| 37 | CLASSIC DRINKS | Espresso Martini | — | 12.00 |
| 38 | JUICER – *fino alle ore 21 | ZEN | — | 7.00 |
| 39 | JUICER – *fino alle ore 21 | FRESCA | — | 7.00 |

## Exclusions and meaning

- `Pinot Nero 7` is excluded because the page does not print a currency marker for this row.
- The five beer names each have distinct printed Small and Large prices. No millilitres are claimed. The source does not explicitly state draught service, so the `beer_draft` category is not inferred.
- The gin list does not state tonic is included, and wine rows do not specify glass size. They are not relabelled as gin and tonic or wine by the glass.
- `ZEN` and `FRESCA` use `conditional` prices with `Servito fino alle ore 21`, reflecting the owner section heading. No other offer inherits this time limit.
- No service charge or explicit fee-free statement appears on this drink page. Fee coverage remains unknown; the list is item price, not a claimed all-in bill.
- Next gate: independent line-by-line source review, full exact-head hosted checks, then source-only merge. A separate protected production audit and guarded seed are required before any public app price.
