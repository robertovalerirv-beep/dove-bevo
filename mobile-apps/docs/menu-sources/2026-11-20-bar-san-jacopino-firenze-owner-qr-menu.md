# Bar San Jacopino Firenze: owner QR menu candidate

This is a **source-only, app-only candidate** for Roberto's existing venue. It does not change the website, customer prices, or production menu database. No price is represented as a customer observation, a verified visit, or a discount.

## Identity and source

- [Dove Bevo's current public health route](https://www.dovebevo.com/api/health) reported static `data_version: 20261112` on 20 November 2026. In [that version's `spzcp` cell](https://www.dovebevo.com/data/20261112/v/spzcp.json), the exact existing tuple is `n2052775899`, `Bar San Jacopino`, kind `2`, `43.78423, 11.24065`, empty address, city `61753360` Firenze. The manifest preserves the empty address as null.
- [OSM node 2052775899](https://www.openstreetmap.org/node/2052775899) presently has `amenity=pub`, `name=Bar San Jacopino`, and coordinates `43.7842335, 11.2406485`, matching the published rounded tuple. The [venue's own location page](https://barsanjacopino.it/dove-siamo/) names Bar San Jacopino at Via del Ponte All'Asse 2/4R, Firenze. This owner address is identity context; it is not inserted into Roberto's static catalogue.
- The [public app-only v2 venue read](https://www.dovebevo.com/api/mobile/v2/menu/venues/n2052775899?cell=spzcp&limit=1) returned zero stored offers and unknown fee coverage on 20 November. Recheck this read before any import.
- The [venue-domain QR menu](https://barsanjacopino.it/qrcode/menu) returned HTTPS 200, HTML and the same visible-text SHA-256 on two fresh fetches: `81bec72abf23337e1dd253f782a2ac20624a100f85d491284409bbf1af294450`. The importer uses `html_text_v1` to pin that exact visible text. If it changes, hold the import for a new source review.

## Transcription and limits

- The candidate holds **41 exact EUR offer variants**: ten named `COCKTAIL` prices, five `VINI` glass/bottle variants, twelve `BIANCHI` variants, and fourteen `ROSSI` variants. A glass and a bottle are separate offers. The source's image labels explicitly say `Prezzo a bicchiere` and `Prezzo a bottiglia`; the manifest preserves those labels as `bicchiere` and `bottiglia`. No volume is stated, so `serving_ml` is null.
- The named item and amount come from the live owner menu. Examples include Mojito EUR 6, Negroni EUR 6, Prosecco Cuvée Extra Dry EUR 3.50/glass and EUR 15/bottle, Chianti EUR 3/glass and EUR 12/bottle, and Brunello di Montalcino EUR 48/bottle. These are menu facts only. Descriptions, photos and recipe text are excluded.
- Coffee, soft drinks, food and the `MENÙ DEL GIORNO` are outside this focused 41-row alcoholic-drink batch; their absence does not imply the venue does not sell them. No mandatory fee or explicit no-fee statement appears in the checked drink sections. Fee coverage remains **unknown**.

## Freshness and release hold

The QR page carries no menu revision date. On 20 November the home page's `Il nostro menu` link pointed to `/menu-completo/`, which returned 404, while the separate `/qrcode/menu` page remained live. The site body names `Elisa&Charlie SAS di Enrico Chen & C.` but the footer still contains an older 2020 business name. These facts do not establish a different venue, but they make independent current-source/rights review important. The manifest only stages an immutable source candidate; it must not be seeded on the strength of this writer's transcription alone.

Before any public write, an independent reviewer must compare **all 41 rows** with the pinned owner page, resolve the page-freshness concern, verify the current static cell and source hash, then run the protected read-only audit on the reviewed main commit. Inspect duplicates, reports/hidden status, source pin and fee scope in its receipt. Only a successful exact audit may precede a separate guarded seed and 41/41 public readback. Do not overwrite customer contributions.
