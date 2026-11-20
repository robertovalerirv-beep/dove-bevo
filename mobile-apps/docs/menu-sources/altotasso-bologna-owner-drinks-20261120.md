# Altotasso, Bologna: owner drink-menu candidate

This is a **source-only app-menu candidate**, not a public import. The existing [live app-only venue route](https://www.dovebevo.com/api/mobile/v2/menu/venues/n3645643530?cell=srbj1&limit=1) returned zero stored offers, zero fees and unknown fee coverage on 20 November 2026. It names OSM static node `n3645643530`, cell `srbj1`, Bologna city ID `667350399`, at `44.49521, 11.33451`, and preserves its `Piazza San Francesco 6` address. [OSM node](https://www.openstreetmap.org/node/3645643530). The [owner's 8 November 2026 article](https://www.altotasso.com/2026/11/08/dove-bere-un-buon-cocktail-a-bologna-distillati-scelti/) links its current menu and prints `Piazza San Francesco 6/d`. The civic-number suffix differs from the static address; this is an identity alias to verify independently, not a silent address replacement.

The [first-party menu](https://www.altotasso.com/menu/) returned HTTP 200 as UTF-8 HTML, 158,216 bytes, without redirect on two direct fetches. Both raw-byte SHA-256 hashes were `a324ffeb768f19254a9918141c6ed238acffc928219f35514a532a3a9a162d9e`; both importer `html_text_v1` normalized SHA-256 hashes were `bd51e581e4fa49fb2e20524cec9c07ff1b9551c79dea2494625686178e0b7239`. The manifest pins the normalized importer digest. Its filename is its exact-byte SHA-256 (`dfc6d82bc6dce3f34835dead2042267e98475e4eca40b02c9ae42856a957be9e`). The menu has no printed effective date. [robots.txt](https://www.altotasso.com/robots.txt) permits normal fetching; no express restriction on using factual names and prices was found on the menu page. The candidate retains no images, prose descriptions, Google data or customer contributions.

The [immutable manifest](../../data/mobile-menu-v2-seeds/dfc6d82bc6dce3f34835dead2042267e98475e4eca40b02c9ae42856a957be9e.json) stages **259 regular EUR beverage offers** from **318** beverage-price table rows. Eight food rows and three blank rows were excluded. Two exact repeated rows were deduplicated. The 57 held beverage rows need manual correction or conflict resolution and are not in the manifest.

| Owner HTML section | Beverage rows | Staged | Held or duplicate |
| --- | ---: | ---: | ---: |
| `cocktails` | 33 | 32 | 1 |
| `pas-dose` | 2 | 2 | 0 |
| `gin-tonic` | 12 | 10 | 2 |
| `birra-spina` | 7 | 6 | 1 |
| `birre-bottiglia` | 12 | 9 | 3 |
| `calice-bollicine` | 8 | 8 | 0 |
| `calice-bianchi` | 7 | 7 | 0 |
| `calice-rossi` | 9 | 8 | 1 |
| `bottiglia-bollicine` | 19 | 15 | 4 |
| `bottiglia-bianchi` | 47 | 38 | 9 |
| `bottiglia-rossi` | 76 | 46 | 30 |
| `amari` | 32 | 31 | 1 |
| `grappe` | 13 | 8 | 5 |
| `whisky` | 18 | 17 | 1 |
| `cognac` | 6 | 5 | 1 |
| `rum` | 12 | 12 | 0 |
| `tequila` | 5 | 5 | 0 |

The owner HTML uses `calice-*` for by-the-glass wine and `bottiglia-*` for bottle wine; the latter serving label relies on the owner section ID and needs independent review before public import. Beer sections explicitly distinguish draft from bottle. Printed beer or wine sizes are retained only where unambiguous; otherwise serving volume is null. Spirit pour sizes, menu-effective date and any service charge applicability are unknown. The food section does not establish a drink fee. No `fee_coverage` or fee rows are asserted. The app price scope remains menu item only; these are owner-menu prices, not recent customer receipts.

## Held rows

- `cocktails` row 17 (Whiskey Sour): three cocktails share one printed price cell.
- `gin-tonic` row 6 (Gin Tonic TANQUERAY N° 10London dry 47,3%): gin name and description run together.
- `gin-tonic` row 10 (VODKA TONICMOSKOSKAJA · Russia): vodka name and brand run together.
- `birra-spina` row 8 (FUTURA.BOCK · Rossa · VOL. 6,3% · 0,4 lt): beer name and description run together.
- `birre-bottiglia` row 2 (HOPPY FLOWERDOUBLE IPA · Vol 7,5% · 33 cl · Chiara · Artigian): beer name and description run together.
- `birre-bottiglia` row 3 (BIG JOBDOBLE IPA · St. Austell · 0,50 cl · 7,2% Vol. · Artig): beer name and description run together; size is ambiguous.
- `birre-bottiglia` row 12 (Stone Go To IPAUSA · Craft Beer · Chiara · Vol 4,7% · 35,5 cl): beer name and description run together.
- `calice-rossi` row 2 (Lacrima Di Morro d’): wine name and producer run together.
- `bottiglia-bollicine` row 8 (FRANCIACORTA DOC G Extra BRUT AMMONITES ·): wine name and producer split across cells.
- `bottiglia-bollicine` row 12 (Pinto Nero & Riesling Nature): wine name appears corrupted.
- `bottiglia-bollicine` row 14 (Extra Brut Metodo Classico DOC X.T.Vini Estremi · Cave Mont): wine name is visibly truncated.
- `bottiglia-bollicine` row 17 (“Otreval”Prosecco Valdobbiadene DOC G Rive di Guia · Zero zucc): wine name is visibly truncated.
- `bottiglia-bianchi` row 4 (Friulano ‘): wine name and producer split across cells.
- `bottiglia-bianchi` row 7 (Ribolla Gialla): same wine and producer has a conflicting price at row 12.
- `bottiglia-bianchi` row 12 (Ribolla Gialla): same wine and producer has a conflicting price at row 7.
- `bottiglia-bianchi` row 17 (Pinot Grigio ‘): wine name and producer split across cells.
- `bottiglia-bianchi` row 29 (TIMORASSOP. Derthona · V. Indi. · Vigneti Massa · Piemonte): wine name and description run together.
- `bottiglia-bianchi` row 33 (Verdicchio VICARI’): wine name is visibly malformed.
- `bottiglia-bianchi` row 39 (Greco di Tufo D.O.C.G.Tenuta Scuotto · Campania): wine name and producer run together.
- `bottiglia-bianchi` row 43 (Bordeaux Blanc “Ronan by Clinet”Francia): wine name and origin run together.
- `bottiglia-rossi` row 7 (BARBERA d’): wine name and vintage split across cells.
- `bottiglia-rossi` row 11 (BAROLO DOC G” Paesi Tuoi” 2007 · Piemonte): wine name and vintage run together.
- `bottiglia-rossi` row 12 (BAROLO DOC G” Paesi Tuoi” 2005 · Piemonte): wine name and vintage run together.
- `bottiglia-rossi` row 13 (BAROLO DOC G” Paesi Tuoi” 2008 · Piemonte): wine name and vintage run together.
- `bottiglia-rossi` row 14 (BAROLO DOC G 2015Biologico · F.lli Barale · Piemonte): wine name and vintage run together.
- `bottiglia-rossi` row 16 (PINOT NERO 2015Hartmann Donà · Vign. Indipendenti · Bi · Alto A): wine name and producer run together.
- `bottiglia-rossi` row 19 (PINOT NERO 2019Vig.delle Dolomiti · Terre del Föhn · Alto Adig): wine name and producer run together.
- `bottiglia-rossi` row 24 (Teroldego 2016FORADORI · Trentino Alto Adige): wine name and producer run together.
- `bottiglia-rossi` row 25 (GUTTURNIO Frizzante2020 Il Poggiarello · Lombardia): wine name and producer run together.
- `bottiglia-rossi` row 30 (MERLOT Riseva 2015Marco Felluga · Collio · Friuli): wine name and producer run together.
- `bottiglia-rossi` row 32 (Cabernet Sauvignon 2014Hussonet · Cile): wine name and origin run together.
- `bottiglia-rossi` row 34 (MERLOTVENICA · Friuli): wine name and producer run together.
- `bottiglia-rossi` row 38 (CABERNET FRANCG. VENICA · FRIULI): wine name and producer run together.
- `bottiglia-rossi` row 44 (Chianti Superiore “Meme” 2018Fattoria di Petrognano · Toscana): wine name and producer run together.
- `bottiglia-rossi` row 45 (NOBILE di Montepulciano DOC G 2010Massimo Romeo · Toscana): wine name and producer run together.
- `bottiglia-rossi` row 46 (NOBILE di Montepulciano 2013Massimo Romeo · Toscana): wine name and producer run together.
- `bottiglia-rossi` row 47 (NOBILE di Montepulciano DOC 2014Poliziano · Toscana): wine name and producer run together.
- `bottiglia-rossi` row 48 (Rosso di Montepulciano DOC 2015Poliziano · Toscana): wine name and producer run together.
- `bottiglia-rossi` row 49 (Rosso di Montepulciano 2014Massimo Romeo · Toscana): wine name and producer run together.
- `bottiglia-rossi` row 50 (Montecucco Rosso DOC G 2018Campinuovi · Toscana): wine name and producer run together.
- `bottiglia-rossi` row 51 (Syrah’): wine name and producer split across cells.
- `bottiglia-rossi` row 52 (SYRAH ACHELO2017 · la Braccesca · Antinori · Toscana): wine name and vintage run together.
- `bottiglia-rossi` row 53 (Lacrima Di Morro d’): wine name and producer run together.
- `bottiglia-rossi` row 55 (VINO di VISCIOLEVICARI · Marche): wine name and producer run together.
- `bottiglia-rossi` row 57 (Montepulciano d’): wine name and vintage split across cells.
- `bottiglia-rossi` row 58 (Montepulciano d’): wine name and producer run together.
- `bottiglia-rossi` row 59 (MONTEPULCIANO D’): wine name and producer run together.
- `bottiglia-rossi` row 60 (Montepulciano d’Abr. Mgnum): magnum name and size are misspelled; needs review.
- `bottiglia-rossi` row 64 (Aglianico Del Vulture DOC G 2014Musto Carmelitano · Basilicat): wine name and producer run together.
- `bottiglia-rossi` row 69 (Syrah 2017Masseria del Feudo · Sicilia): wine name and producer run together.
- `grappe` row 3 (Terre): grappa variant and strength run together.
- `grappe` row 5 (Grappa di Barbaresco Marolo): same grappa appears with a conflicting price at row 13.
- `grappe` row 7 (PRIME UVE ‘): grappa name and variant split across cells.
- `grappe` row 10 (Terre): grappa variant and strength run together.
- `grappe` row 13 (MAROLO): same grappa appears with a conflicting price at row 5.
- `whisky` row 2 (‘): whisky name is split across cells.
- `cognac` row 2 (Cognac Hennessy ‘): cognac name is split across cells.

Exact duplicate rows omitted: `bottiglia-bianchi` row 8 (Friulano); `amari` row 16 (Amaro Lucano).

Local `import_v2.validate` passed on the exact 259-offer manifest; its filename matches its byte SHA-256. A separate row-mapping check matched each staged offer's source section and row, printed name, EUR amount and evidence reference against the directly fetched owner HTML. `git diff --check` passed. These checks establish a reviewable source candidate, not a public menu update.

Before any protected import, an independent reviewer must check every staged row against the pinned source, the `bottiglia-*` serving interpretation, source-use basis, OSM/static identity and address suffix, and unknown fees. A protected read-only audit must then verify live source digest, current catalogue and customer/moderation guards. Only a separate guarded seed on the reviewed main commit may publish app-only rows, followed by exact public API and app readback. This source-only PR does not write to the live database or Roberto's website.
