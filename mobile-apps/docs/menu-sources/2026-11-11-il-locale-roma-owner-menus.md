# Il Locale, Roma: reviewed source candidate

This is a source-only candidate for the existing Italian static venue
`n1917232843` in cell `sr2yt`. It does not create a venue, change Roberto's
website, or write public prices. The immutable candidate manifest is
`1ab3d82a869a6ad480837ff97c19af027306150f5548787fbb4793b31dafde93.json`.

## Venue identity

- The live Dove Bevo venue is **Il Locale**, Viale Adriatico 9/11, Roma,
  coordinates 41.93828, 12.53482, kind 1, static city ID 72959652. On
  11 November 2026 its menu-v2 API reported zero stored offers.
- [OSM node 1917232843](https://www.openstreetmap.org/node/1917232843)
  independently reports Il Locale, Viale Adriatico 9/11 and the venue website
  `https://www.ilocale.it`; its coordinates are within a few metres of the
  rounded static record. The owner's two menu pages print the same address.
- Public health reported catalogue version `20261108`. The exact static cell
  tuple is `[n1917232843, Il Locale, 1, 41.93828, 12.53482,
  Viale Adriatico 9/11, 0]`, and city tuple zero is `[72959652, Roma]`.

## Owner menus and exact scope

- [Bevande & Cocktails](https://www.ilocale.it/bevande-cocktails-7/) is an
  owner-hosted, navigable page. Its **Cocktail IBA** section lists 25
  individually named cocktails with exact EUR amounts. `Gin Tonic | da € 8`
  is a starting price and is excluded. The weekly special has variable
  contents and is excluded. Signatures labelled 2025 are held pending
  separate freshness review.
- [Le Nostre Birre](https://www.ilocale.it/menu-birre/) is an owner-hosted,
  navigable page. It lists four draft beers at EUR 6 each, without a printed
  serving volume; the manifest records draft form but leaves millilitres
  unknown. Nine named bottles have exact prices and an explicit 33 cl size;
  the manifest records 330 ml. Descriptive tasting prose and images are not
  copied.
- The two source pins use the importer's `html_text_v1` normalization:
  cocktails `a9263dae233f9fcaa9a21bb5327f539011c725cd47496b2cc5c6fde4a0eb9d64`;
  beers `b19ecacfc32c464297065ccbd1ce91b97d186a69eb6f4ce33a559ce537db025c`.
  Two consecutive direct HTTP 200 downloads on 11 November each gave the
  same normalized digest. Raw markup hashes differed between downloads:
  cocktails `d724a53b7db399d8f2dd04e50b7d120e1e79387560330739ccd21a06d1d93b7f`
  and `9be9830ccaea7beb9f5f38ac8a4a668d7e6cc66d2ccfedce9616b23c3f3f1422`;
  beers `e79f64c31ab4484cc9da6a236ade5f23eca77d5a064c77328a06f4defd84265c`
  and `4bf311cc32c29dd0fa4209c294a17eaccb99f4549478deba1ab8308eb8a0f90d`.
  This is why the stable visible-text hash, rather than raw markup bytes, is pinned.
- The site's WordPress page metadata says the cocktail page was modified
  8 October 2026 and the beer page 18 September 2026. Those timestamps
  establish page activity, not that every price was individually updated then.
  The prices were checked live on 11 November 2026.

## Rights, fees, and import boundary

Only the factual drink names, printed EUR prices and explicit serving facts
are transcribed. The pages display copyright © 2026. An inspection of the
owner pages, site search and `robots.txt` found no explicit restriction on
this narrow factual extraction; this is not a claim of a reuse licence for
the site's text, photographs or branding. Independent final source and rights
review is required before any public seed.

Neither inspected page establishes a current cover, service or table fee.
`fees` and `fee_coverage` remain empty; the app must not imply that fees are
absent. The 38-offer manifest has two sources, 25 cocktails and 13 beers,
with exact evidence references on each offer. It preserves original EUR
amounts and never converts or overwrites customer-contributed prices.

Local source-schema validation and a production-schema **in-memory** dry run,
apply and idempotent retry passed: 40 eligible rows (38 offers plus two
sources), 40 inserted rows, 40 identical on retry, zero customer-price
changes. This was not a protected production audit and did not publish data.
After independent review and exact-head checks, the owner-approved route is
source-only merge, protected dry-run audit, guarded seed and exact public
all-row readback.
