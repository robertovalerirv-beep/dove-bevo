# L'Asilo, Torino: owner drink-menu candidate

Checked 2026-11-04. This is an app-only **review candidate**, not a live price
import. The immutable manifest is
`mobile-apps/data/mobile-menu-v2-seeds/7972cdfdc40e8430b60b2f3db6bc12c3e77aa4a14d6eb25b510a4f0f540584cd.json`
(SHA-256 of its exact UTF-8 bytes). It contains **111 EUR offers** from seven
first-party [L'Asilo menu sections](https://lasilosrl.com/menu.html), with no
new venue and no change to the website, legacy prices or customer contributions.

## Venue identity

- The public Dove Bevo Italian cell `u0j2q` at data version `20261102` contains
  the already mapped `n13074614346`, name `L'Asilo`, kind `bar`, at
  `45.07608, 7.68055`. The public app v2 menu read returned
  `stored_offer_count: 0` before this candidate was staged.
- The live [OSM node](https://www.openstreetmap.org/node/13074614346) has name
  `L'Asilo`, `amenity=bar` and coordinates `45.0760821, 7.6805474`.
  The [owner's menu index](https://lasilosrl.com/menu.html) says Via Bonelli
  11d, Torino; the [OSM address node](https://www.openstreetmap.org/node/4736081050)
  for 11d Via Franco Bonelli is 3.2 m from that venue node. The static cell has
  no street address, so the manifest keeps its address null and makes no
  stronger address claim through the app API. Public `places.json` maps Torino
  to city ID `63621589`.

## Menu and boundaries

| Owner page | Reviewed rows |
| --- | ---: |
| [Cocktail list](https://lasilosrl.com/menu/cocktail.html) | 25 |
| [Gin & Tonic](https://lasilosrl.com/menu/gintonic.html) | 18 |
| [Vino e Birra](https://lasilosrl.com/menu/vino-e-birra.html) | 4 |
| [Aperitivo](https://lasilosrl.com/menu/aperitivo.html) | 17 |
| [No Alcohol](https://lasilosrl.com/menu/noalcol.html) | 5 |
| [Vermouth](https://lasilosrl.com/menu/vermouth.html) | 7 |
| [Distillati](https://lasilosrl.com/menu/distillati.html) | 35 |

The source URLs returned direct 200 HTML with no redirect. Each source's
whitespace-normalized visible-text digest is pinned in the manifest, along
with a factual section/item/price evidence pointer for each offer. Named
products under an explicit group price are recorded at that group price.
The six named Spritz options each have **two separate conditional prices**:
EUR 4 through 21:30 and EUR 6 from 21:30, as the owner prints. The early price
is marked happy hour; neither is represented as an all-day price. Draft beer
and bottled beer stay distinct, with no invented volume. The daily rotating,
unnamed wine selection and generic unitemized soft drinks are excluded. The
same Negroni, Sbagliato and Americano appearing on two menu pages are entered
only once. No food, descriptive copy, images, user visits or Google review
counts are imported.

The menu states there is **no table service**. It does not establish that
every mandatory charge is absent; fee coverage therefore remains `unknown`.
All sources must still pass an independent item/condition/identity review,
exact-head hosted checks, a protected source and production-state dry run on
reviewed `main`, then a separate guarded apply and public readback. Any owner
page change or disputed pairing holds this candidate.
