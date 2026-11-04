# Nottingham, Roma: owner-menu source review

Status: source-only draft, 2026-11-04. No public database write is authorized by this file.

## Identity and current coverage

- Existing Roberto static OSM venue: `n3670898299`, cell `sr2yj`, Nottingham, Via del Quadraro 24, Roma, 41.86039, 12.5541, kind 2, static city ID `72959652`, catalogue version `20261102`.
- The owner [menu](https://www.nottinghamroma.it/menu/) and [home page](https://www.nottinghamroma.it/) display the same venue and address. The mobile v2 venue route reported `stored_offer_count: 0` when checked on 2026-11-04.
- The [published static cell](https://www.dovebevo.com/data/20261102/v/sr2yj.json) contains the exact venue tuple. No venue is invented and no new venue registry row is needed.

## Pinned source and scope

- First-party menu URL: `https://www.nottinghamroma.it/menu/` (HTTP 200, HTML, no redirect on the two source checks).
- Importer `html_text_v1` visible-text SHA-256 on both checks: `a48fb13da2e16e92978d26cb3a8d950e27d4bfdb2bfb711d40c7347fa96d74f8`. This is the required importer pin, not the raw HTML byte hash.
- Source-use scope: factual names, stated servings and stated EUR menu amounts only. No descriptions, photographs, food, Google review counts or customer prices are copied. An independent source and offer review is required before protected audit and seed.

The owner menu's *Birre alla spina* section contains the following complete set of explicitly priced drinks. Each listed small/medium pair is ordered `Piccola / media` on the source. No volume is inferred for those two sizes. The 33 cl serving is preserved verbatim; millilitres are left unset.

| Drink | Serving | Menu price |
| --- | --- | ---: |
| Tennent’s Super | Piccola | EUR 4.00 |
| Tennent’s Super | media | EUR 7.00 |
| Paulaner Urtyp | Piccola | EUR 3.50 |
| Paulaner Urtyp | media | EUR 5.50 |
| Paulaner Weiss | Piccola | EUR 4.00 |
| Paulaner Weiss | media | EUR 6.50 |
| Paulaner St. Thomas Bock | Piccola | EUR 3.50 |
| Paulaner St. Thomas Bock | media | EUR 5.50 |
| Tre Fontane Tripel | 33 cl | EUR 7.00 |

The menu's rotating `Birre del mese` has no quoted price and is excluded. `Servizio torta 1 €` applies to cake, not a drink order, and is excluded. No statement establishes whether service fees apply to drink orders, so fee coverage remains unknown. The owner warns that prices can vary by availability and season; these are checked menu offers, not guaranteed in-venue customer observations.

Manifest: `mobile-apps/data/mobile-menu-v2-seeds/70782223f0c3120c6dc7b415b6b6142072c5011d937f0e6c7c4ef5036a4291f2.json`.
