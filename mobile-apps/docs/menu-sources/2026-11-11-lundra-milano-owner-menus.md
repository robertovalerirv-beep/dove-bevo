# Lundra, Milano: owner-menu source candidate

This is a **source-only** mobile-menu-v2 candidate for Roberto's existing
Italian venue `n7139715639` in cell `u0nd8`. It adds no venue, writes no
public price, and changes neither the website nor the backend. The immutable
manifest is
`26ffba082eada4001639088d0d635a04d63993ba2bdbd7e314f1b848737588f8.json`.

## Venue identity

- The live Dove Bevo catalogue at version `20261108` identifies **Lundra**
  as a Milano bar (kind 1) at 45.46868, 9.15249, static city ID 62505581.
  The exact static tuple is `[n7139715639, Lundra, 1, 45.46868, 9.15249,
  "", 0]`; city tuple zero is `[62505581, Milano]`. The public app-only
  menu-v2 lookup reported zero stored offers at review time.
- [OSM bar node 7139715639](https://www.openstreetmap.org/node/7139715639)
  names Lundra and places it at 45.4686768, 9.1524884. It has **no street
  address or website tag**. The [owner homepage](https://www.lundramilano.it/)
  names Lundra Milano and prints Via Raffaello Sanzio 14, Milan; OSM
  [address node 7139715638](https://www.openstreetmap.org/node/7139715638)
  records Via Raffaello Sanzio 14 about 12.6 m from the bar. This supports
  venue matching, but the owner's address is **not** inserted into the
  empty published static-address field. The manifest uses `address: null`.

## Printed prices checked 11 November 2026

All amounts below are printed EUR prices for individually named drinks. No
serving volume is printed on these four owner pages, so the manifest does not
claim one. `DRAFT` is part of the printed beer name and denotes draft form;
the three draft items use the existing `beer_draft` category.

| Owner page | Exact named offers and prices | Count | `html_text_v1` SHA-256 |
| --- | --- | ---: | --- |
| [Signature cocktails](https://www.lundramilano.it/signature-cocktails/) | SARANDA €12; KSAMIL, BUTRINT, VRINA, SHENDELLI, XARRA €14 each | 6 | `1ecd4accd27787f247d21e637fa949e22e0d807bc45a7335a7c0bbfd7119679c` |
| [Classic cocktails](https://www.lundramilano.it/classic-cocktails/) | 20 CENTURY COCKTAIL, MINT JULEP, BATANGA, PAPER PLANE, MARTINI COCKTAIL, BOULEVARDIER, DARK’N STORMY, MANHATTAN, ESPRESSO MARTINI, MARGARITA, FRENCH 75, DAIQUIRI, SIMONE €12 each | 13 | `00ebab18d0075235a93bb27263e82efaf7db9d547383dbc3b0d9c34f982f074e` |
| [Beers](https://www.lundramilano.it/birra-page/) | CORONA €6; CORONA ZERO €8; BUD €6; H&B DRAFT €7; GOOSE IPA DRAFT €8; WEISS DRAFT €8 | 6 | `683ec7a8437063c34a2ca85c28e18fb017bbca319072a3e3df94c058a43daac4` |
| [Soft drinks](https://www.lundramilano.it/soft-drinks/) | COCA COLA €5; COCA COLA ZERO €5; REDBULL €6; THE PESCA €5; THE LIMONE €5; SANBITTER €5; CAMPARI SODA €5; SUCCO PESCA €5; SUCCO ANANAS €5; SUCCO ACE €5; ACQUA NATURALE €2; ACQUA FRIZZANTE €2 | 12 | `4c353265fa93b077bfe903d5edcda8f83782950dd281e02aee0926c55ae9c6d6` |

The [owner menu index](https://www.lundramilano.it/menu/) links each page.
Its normalized visible-text SHA-256 is
`b38af434d29b5c91da80865e87a69618738ac7dde7d69337b85a4fa180af762a`.
The source URLs in the manifest have trailing slashes because the owner
redirects the slashless links to those exact pages; the protected importer
rejects redirects. The repeated live reads had the same normalized
visible-text hashes. The menu does not state when each price became
effective; 11 November is the **check date**, not a customer visit date.

## Separate supplement, scope, and rights

The index states a **€3 supplement per person** for aperitivo from
**18:00–21:30**. The manifest records one conditional fixed fee with
`basis: person`, plus `documented_partial` fee coverage. It does not add €3
to any drink amount or claim a charge per drink. Days and any other fee
conditions are not stated, and this candidate does not infer them.

The index's generic `COCKTAIL BASE – €10` has no uniquely named drink and is
excluded. Unpriced category links, food, descriptions, photos, branding,
embedded reviews, and any inferred serving sizes are excluded. `CORONA
ZERO` remains a printed name; the soft-drinks heading does not prove every
item under it is alcohol-free, so no alcohol-free category is inferred.

The pages display © 2026 “All Rights Reserved.” The site `robots.txt` has
no general-user-agent disallow, and inspected menu/privacy pages did not
identify a separate ban on this narrow factual extraction. This is **not**
a licence to reuse the owner's prose, images, design, or third-party reviews.
An independent final source and rights review remains required before any
public seed.

The manifest has 37 offers, five immutable owner-page source rows, one
conditional fee, and one partial-fee-coverage row. Schema validation and a
production-schema **in-memory** dry run passed with 44 eligible rows, zero
errors and zero database writes. This is not a protected production audit or
a public price import. Before any seed, follow the protected exact-source
audit, moderation checks, independent review, and guarded import sequence in
the importer README.
