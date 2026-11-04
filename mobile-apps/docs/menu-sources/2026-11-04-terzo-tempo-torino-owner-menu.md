# Terzo Tempo, Torino: owner-linked drink menu candidate

Status: **source-only review candidate; no public seed has run**. The attached manifest is `eaf395cdb049500bfbb7322a448e97834256a969ab36647db7164800734494b9.json`. An independent source reviewer and the protected dry-run receipt are still required before any seed tag.

## Venue identity and present catalogue

- The current published static cell `u0j2q` in data version `20261102` contains OSM node `n11984484382`, `Terzo Tempo`, kind `2`, at `45.08008, 7.6544`, Torino city ID `63621589`. Its public mobile-menu-v2 venue response reported `stored_offer_count: 0` on 2026-11-04.
- [OSM node 11984484382](https://www.openstreetmap.org/node/11984484382) has the name `Terzo Tempo`, amenity `pub`, and source coordinates `45.0800756, 7.6543956`. OSM reverse geocoding resolves this point to Via Balme, Torino. The venue's [own website](https://www.birreriaterzotempotorino.it/) gives Via Balme 9, Torino, and its [menu page](https://www.birreriaterzotempotorino.it/menu/) links directly to the [Birreria Terzo Tempo menu](https://www.menudigitale.io/txqge). That menu also identifies the venue and `Balme, 9 Torino`.
- This candidate uses the existing OSM static identity. It adds no venue and no review count.

## Price evidence and handling

- The owner-linked menu was HTTP 200 `text/html; charset=UTF-8` without redirect on 2026-11-04. Three fetched menu bodies had different raw SHA-256 values from dynamic page details, but the importer's `html_text_v1` visible-text normalization was identical: `d60baee75735bb0c9c40ad03f3aadc51383a6625357ae4d53233d03639489e1f`. A fourth fetch of the exact owner-linked URL without a query string had the same normalized digest. The source row pins this normalized digest in both hash fields, as the importer requires.
- The manifest transcribes **229 explicit drink price variants** from the owner-linked HTML, with original EUR amounts and exact item names. Where the menu specifies a variant or serving, `serving_label` preserves its text. Millilitres appear only where the menu explicitly uses `cl`, `ml`, or `1 Litro`: 140 rows have a serving label and 43 have a supported millilitre value. Bare `33`, `0.25`, `0,5`, `0.75`, and similar labels remain literal labels with `serving_ml: null`.
- Section counts are Gin-Tonic 78, Birre Artigianali in bottiglia 22, Birre alla Spina 17, Amari & Liquori 17, Bibite 16, Cocktail 14, Shottini 13, Aperitivi 10, Whiskey 9, Rum 8, Vino 5, Grappe 5, Analcolici 4, Birre SENZA GLUTINE in Bottiglia 3, Caffè 3, Vodka 3, and Tequila 2. Food sections are excluded. The Guinness draft row is excluded because its description calls the price a `Super offerta!!` without stating the promotion period or standard price.
- Drink category assignments use explicit menu headings or drink names: draft beer, spritz, gin-tonic, two glasses of wine, Negroni, Negroni Sbagliato, Gin Lemon, water and nonalcoholic beverages. Other drinks have `category: null` rather than a guessed app taxonomy. Variant labels such as `con tonica premium` are preserved; a premium tonic price is a distinct offer. No source menu prose or imagery is copied.
- The menu has no clear complete service-fee statement. Both `fees` and `fee_coverage` are empty, meaning **fee coverage unknown**, not fee-free. The checked date records the source check, not a venue visit or guarantee that prices will remain current.

## Before any public seed

1. A second reviewer must independently compare the pinned live owner menu and all proposed price rows, especially the 78 gin-tonic variants, bottled beer sizes with ambiguous labels, and the excluded promotional Guinness. Confirm that the owner website still links this exact menu and the source-use decision remains valid.
2. Merge the source-only PR only after review and focused preservation checks. Run the protected `mobile-menu-v2-audit/<manifest-sha256>` dry run from a reviewed `main` commit. The audit must attest the current D1 venue binding, source hash, hidden/reported venue status and no conflicts.
3. Only after the dry-run receipt is examined and supported app builds display these named items, original EUR amounts, variants and unknown fee scope should a separate seed tag be considered. Inspect the protected seed receipt and public v2 readback. Do not infer public import from the manifest or this PR.
