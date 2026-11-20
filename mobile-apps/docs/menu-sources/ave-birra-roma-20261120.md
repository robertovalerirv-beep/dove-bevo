# Ave Birra, Roma: owner taplist candidate

This is a **source-only candidate** for Roberto's existing venue. It adds no
venue, changes no customer price, and does not import public data. The
content-addressed manifest is
[`d2abd176bc98037469eed3097c5eb527d020d0641e7f5ff6b5df7be5020ef93d.json`](../../data/mobile-menu-v2-seeds/d2abd176bc98037469eed3097c5eb527d020d0641e7f5ff6b5df7be5020ef93d.json).
Independent comparison of **all nine rows** with the pinned owner page and a
protected read-only audit are required before any merge or seed.

## Existing venue identity

- The published `20261119` static tile `sr2ym` contains
  `["n5435192116", "Ave Birra", 2, 41.90922, 12.52455,
  "Via Arduino 3", 0]` under Roma city ID `72959652`.
- [OSM node 5435192116](https://www.openstreetmap.org/node/5435192116)
  names Ave Birra, tags it as a pub, and gives Via Arduino 3 with coordinates
  41.9092235, 12.5245505. The [venue's own menu](https://avebirra.it/menu/)
  and [homepage](https://avebirra.it/) identify the same name and address.
- The public mobile-menu-v2 GET for `n5435192116`, cell `sr2ym`, returned
  `stored_offer_count: 0` on 20 November 2026. This observation can change
  before review or import and must be checked again.

## Pinned owner prices

The owner menu returned HTTPS 200 directly, no redirect, twice on 20 November
2026 with the protected importer's `DoveBevoMenuAudit/1` user agent. Both
responses were 176,984 bytes, with raw SHA-256
`be2a09296586cd65c247d275d94ac679c14dc5f0c960f4c5a80ab896658352a7`.
The importer's `html_text_v1` visible-text SHA-256 was stable at
`79e288f2979d82c4bea6ea7cc903e045debc0593556d449df7d7c08d3b970c31`;
the manifest pins this normalized digest in both source hash fields. The
page's Taplist visibly presents these three named beers, breweries, styles,
servings and exact EUR amounts:

| Owner name and brewery | Style | 30 cl | 40 cl | 50 cl |
| --- | --- | ---: | ---: | ---: |
| IPA — Vetra | IPA (6.6%) | €5.00 | €6.00 | €7.00 |
| Mora — ECB | Stout (5.0%) | €5.00 | €6.00 | €7.00 |
| Lordz — Vetra | Double IPA (8.1%) | €6.00 | €7.00 | €8.00 |

Each size is one separate `beer_draft` offer. No volume or price is inferred.
The Taplist's Lager/Dunkel card appears with different brewery names in
separate page variants (Krug Bräu and Schlossbrauerei Au-Hallertau), so its
three prices are **not** included. The Taplist may rotate; the check date is
an observation date, not a menu publication or price guarantee. No fee or
minimum-spend statement was established, so no fee or coverage row is claimed.

## Source use and gate

The venue's homepage links its menu, and its `robots.txt` allows public
pages. No express extraction restriction appeared on the inspected page.
Only factual names, servings and EUR prices are staged; no descriptions,
photos or menu layout are copied. These observations are not legal clearance.
The source is mutable: if the protected audit's fresh normalized hash differs,
hold the batch for review rather than changing or reusing the source ID.
There has been no database write, public contribution, push or pull request.
