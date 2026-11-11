# English Empire, Bologna: owner-menu source candidate

This is a **source-only** mobile-menu-v2 candidate for Roberto's existing
Italian venue `srbj4/n3100479745`. It adds no venue, changes no customer
price, and makes no public import. The immutable manifest is
`329b11b86caa88627028133331888be5c32db01bbdf35aaf1513c497efe8d24f.json`.

## Exact venue identity

- The published Dove Bevo catalogue version `20261108` has
  `[n3100479745, English Empire, 2, 44.49598, 11.34975,
  "Via Zamboni 24a", 0]` in cell `srbj4`; city tuple zero is
  `[667350399, Bologna]`. Its public mobile-menu-v2 venue GET returned no
  offers, fees or fee-coverage statement on 11 November 2026.
- [OSM node 3100479745](https://www.openstreetmap.org/node/3100479745)
  names **English Empire**, tags it as a pub at Via Zamboni 24a, Bologna,
  and gives coordinates 44.4959780, 11.3497521. The
  [venue-owned menu](https://www.empirebologna.it/menu) and
  [beer page](https://www.empirebologna.it/birre) identify **Empire Bologna**
  at Via Zamboni 24/A. The street, number and location match the existing
  catalogue record; this candidate does not create a duplicate venue.

## Pinned owner pages and reviewed prices

Both owner pages returned HTTP 200 directly, without redirects, on
11 November 2026. The pins below use the importer's `html_text_v1` visible
text normalization; they are **not** raw HTML-byte hashes.

| Page | `html_text_v1` SHA-256 | Manifest rows |
| --- | --- | ---: |
| [Menu](https://www.empirebologna.it/menu) | `52f367193669f8dd89476d188d82515e7c499f07fa01c2c12918f39281c60abe` | 21 |
| [Birre](https://www.empirebologna.it/birre) | `30aedf2365752e5091d383128f83e7a0c4e7e5d097fc69543351800e3abc86c3` | 22 |

The owner states that draft prices are printed **pint 0.5 l / half 0.25 l**.
The 11 fixed listed draft names each have two separate offers:

| Owner's printed name | Pint EUR | Half EUR |
| --- | ---: | ---: |
| Bass best scotch | 7.00 | 4.50 |
| Beck's | 6.00 | 4.00 |
| Tennent's Super | 7.00 | 4.50 |
| Franziskaner Weisse | 7.00 | 4.50 |
| Goose Island IPA | 7.50 | 5.00 |
| Guinness draught stout | 7.00 | 4.50 |
| Hoegaarden blanche | 7.00 | 4.50 |
| Leffe Blonde | 7.00 | 4.50 |
| Leffe Rouge | 7.00 | 4.50 |
| Stella Artois | 6.00 | 4.00 |
| Italian Apple Cider | 7.00 | 4.50 |

The owner calls the last item a cider; its manifest category is **null**, not
`beer_draft`. Its exact printed menu name and price are recorded, without
inventing a brand. The rotating **Seasonal beer** pair is excluded.

The menu page separately prints four named bottles at EUR 5.00 each:
**Bud**, **Corona Extra**, **Ichnusa** and **Corona Cero**. It calls Corona
Cero alcohol-free; no bottle size is claimed. Its 12 specifically named
cocktails are **Americano EUR 8**, **Negroni EUR 8**, **Spritz EUR 8**,
**Caipiroska EUR 8**, **Margarita EUR 9**, **Mojito EUR 9**,
**Moscow Mule EUR 8**, **Long Island Iced Tea EUR 9**,
**Pina Colada EUR 9**, **Sex on the Beach EUR 8**,
**Tequila Sunrise EUR 9** and **Vodka Redbull EUR 9**.

Five more separately named drinks are **Acqua 0,5 l EUR 1.50**,
**Red Bull EUR 5**, **Caffè EUR 1.50**, **Cappuccino EUR 2.50** and
**Cioccolata EUR 4**. The water serving is exactly the printed 0.5 l.
All 43 amounts remain EUR with exponent 2 and are regular item prices; the
check date is not presented as a customer purchase or confirmation date.

Generic labels **Analcolico**, **Long drink**, **Bibite**, **Succo di
frutta**, **Tè e infusi** and **Birra senza glutine** are excluded, as is
the premium long-drink EUR 9–13 range. Food and unpriced material are
excluded. The source-linked
[full online menu](https://pro.pns.sm/0sfict7) redirects to a JavaScript-only
Pienissimo view that exposed no independently comparable text in the
read-only fetch; this candidate relies on the current first-party pages
above. A later contradictory live menu is a hold, not a reason to guess.

## Package, fees and use review

The [owner's groups page](https://www.empirebologna.it/lauree-e-gruppi)
offers a **separately booked group package** at EUR 15 per person, minimum
eight people, including food and shared drinks. This is not a general
per-person minimum spend or a supplement on each ordinary menu item. No
group-package price is imported or added to the individual drink amounts.
The ordinary menu says there is no table service: customers order, pay and
collect at the bar. That does **not** prove all possible fees are absent, so
the manifest leaves fee coverage **unknown** and has no fee row.

The owner's `robots.txt` explicitly allows `/` and restricts admin and
booking-confirmation paths, not these menu pages. No source terms inspected
granted reuse of the owner's photos, descriptions or layout. This one-off
candidate carries only factual names, EUR amounts and printed serving sizes;
it does not copy images, marketing prose or third-party reviews. An
independent final source and rights review is required before merge or
protected public audit.

Schema validation and a production-schema **in-memory dry run** passed:
two source rows plus 43 eligible offers, no errors, no fees, no customer
price edits and zero production writes. This is neither a protected
production audit nor a public price import. Follow the protected audit,
guarded seed and exact public readback gates before calling the rows live.
