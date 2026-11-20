# Bar San Jacopino Firenze: owner QR cocktail candidate

This is a **source-only, app-only candidate** for Roberto's existing venue. It does not change the website, customer prices, or production menu database. No price is represented as a customer observation, a verified visit, or a discount.

## Identity and source

- [Dove Bevo's current public health route](https://www.dovebevo.com/api/health) reported static `data_version: 20261112` on 20 November 2026. In [that version's `spzcp` cell](https://www.dovebevo.com/data/20261112/v/spzcp.json), the exact existing tuple is `n2052775899`, `Bar San Jacopino`, kind `2`, `43.78423, 11.24065`, empty address, city `61753360` Firenze. The manifest preserves the empty address as null.
- [OSM node 2052775899](https://www.openstreetmap.org/node/2052775899) presently has `amenity=pub`, `name=Bar San Jacopino`, and coordinates `43.7842335, 11.2406485`, matching the published rounded tuple. The [venue's own location page](https://barsanjacopino.it/dove-siamo/) names Bar San Jacopino at Via del Ponte All'Asse 2/4R, Firenze. This owner address is identity context; it is not inserted into Roberto's static catalogue.
- The [public app-only v2 venue read](https://www.dovebevo.com/api/mobile/v2/menu/venues/n2052775899?cell=spzcp&limit=1) returned zero stored offers and unknown fee coverage on 20 November. Recheck this read before any import.
- The [venue-domain QR menu](https://barsanjacopino.it/qrcode/menu) returned HTTPS 200, HTML and the same visible-text SHA-256 on two fresh fetches: `81bec72abf23337e1dd253f782a2ac20624a100f85d491284409bbf1af294450`. The importer uses `html_text_v1` to pin that exact visible text. If it changes, hold the import for a new source review.

## Transcription and limits

- The candidate holds **ten exact EUR cocktail prices** from the visible `COCKTAIL` section, including Mojito EUR 6 and Negroni EUR 6. No serving volume is printed for these items, so serving fields are null. These are menu facts only; descriptions, photos and recipe text are excluded.
- **Thirty-one wine glass/bottle variants are held and absent from the manifest.** Their distinction is carried by image `src`/`alt` attributes (`Prezzo a bicchiere` versus `Prezzo a bottiglia`) that the current `html_text_v1` visible-text digest does not bind. A source hash based only on visible text cannot safely attest those attributes. No wine offer should be added until a separately reviewed attribute-aware pin is implemented and tested. The held variants are not a public import candidate.
- Coffee, soft drinks, food and the `MENÙ DEL GIORNO` are also outside this focused cocktail batch; their absence does not imply the venue does not sell them. No mandatory fee or explicit no-fee statement appears in the checked cocktail section. Fee coverage remains **unknown**.

## Freshness and release hold

The QR page carries no menu revision date. On 20 November the home page's `Il nostro menu` link pointed to `/menu-completo/`, which returned 404, while the separate `/qrcode/menu` page remained live. The site body names `Elisa&Charlie SAS di Enrico Chen & C.` but the footer still contains an older 2020 business name. These facts do not establish a different venue, but they make independent current-source/rights review important. The manifest only stages an immutable source candidate; it must not be seeded on the strength of this writer's transcription alone.

Before any public write, an independent reviewer must compare **all ten cocktail rows** with the pinned owner page, resolve the page-freshness concern, verify the current static cell and source hash, then run the protected read-only audit on the reviewed main commit. Inspect duplicates, reports/hidden status, source pin and fee scope in its receipt. Only a successful exact audit may precede a separate guarded seed and 10/10 public readback. Do not overwrite customer contributions. The 31 held wine variants require a different source-pinning contract and are not part of this candidate.
