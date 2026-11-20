# Skjuma, Torino: current owner tap list candidate

Status: **source-only; no public import**. The immutable manifest is
`7d9f08f12bb0418f4cd6224379375ea2f15f44eec9c6e9e105c22d9097b91ef6.json`.
Independent source review and the protected dry-run receipt are required before
any seed tag.

## Venue and owner control

- The published `20261119` static cell `u0j2q` contains OSM node
  [`n4736078515`](https://www.openstreetmap.org/node/4736078515), `Skjuma`,
  pub kind `2`, `45.07851, 7.67135`, Via Santa Chiara 45h, Torino. The public
  [mobile-menu-v2 venue response](https://www.dovebevo.com/api/mobile/v2/menu/venues/n4736078515?cell=u0j2q&limit=100&minimum_spend=1)
  returned `stored_offer_count: 0` on 2026-11-20.
- The [OSM node XML](https://api.openstreetmap.org/api/0.6/node/4736078515)
  gives the same venue name and address, coordinates `45.0785067, 7.6713503`,
  `website=https://skjuma.com/`, and `website:menu` equal to the proposed
  [menu URL](https://torino.beerguide.it/venues/skjuma-craft-beers/menu).
- `https://skjuma.com/` currently redirects to the
  [Skjuma venue page](https://torino.beerguide.it/venues/skjuma-craft-beers),
  which identifies Skjuma at Via Santa Chiara 45h and links directly to its
  menu. That page says Skjuma founded Torino BeerGuide and displays the
  venue's business details. This is an owner-operated menu, not a search
  result or third-party price estimate.

## Price evidence and boundaries

- Fetched the owner menu twice on 2026-11-20; both responses had exactly
  544,293 bytes and identical `html_text_v1` normalized SHA-256
  `a67260c8095bd1db5b6a0799d30d9b0dc4d20010dcfa4bf6378e2ea85e4c7c6c`.
  The raw HTML SHA-256 of the first fetch was
  `d16432af7c0e7c4b7e7590551e9dda0f452cc98eaee0b66645a2980ab87a13ea`.
  The manifest pins the normalized digest in
  both source hash fields, as required by the importer.
- The manifest transcribes **all 19 explicit price variants in the `Spine`
  section**: eight named drafts or cider, each with `Piccola` EUR 4.00 and
  `Media` EUR 6.00; plus COSTALUPI, LA CASINÉRA and PROSECCO at EUR 5.00 for
  the first `Piccola` price slot. `RV-0` is cider and is deliberately not
  categorized as beer. Each row keeps the exact posted name, original EUR
  amount, and explicit size label. The menu does not state millilitres for
  these sizes, so all `serving_ml` values are null.
- This is **bounded, partial menu coverage**. The menu also has bottled beers,
  spritz, cocktails, wines, nonalcoholic drinks and spirits outside `Spine`;
  none are represented by this manifest. It must not be counted as complete
  Skjuma price coverage. The named tap selection rotates, so recheck the live
  menu and digest immediately before the protected audit/seed.
- No complete service fee or minimum spend is established by the checked
  section. `fees` and `fee_coverage` are empty; this means **unknown fee
  coverage**, not no fee. No review counts, estimates, invented prices, food
  rows, descriptions or images are included.

## Before public import

1. Independently compare all 19 price variants with the live owner menu and
   confirm the owner redirect and venue identity still hold. If the tap list
   or normalized hash changes, create a new reviewed manifest; never overwrite
   this immutable source record.
2. Merge the source-only change after review. Run the protected
   `mobile-menu-v2-audit/<manifest-sha256>` dry run from a reviewed main commit,
   examine the receipt and current public venue binding, then consider a
   separate seed tag. Public import requires verified seed receipt and public
   v2 readback; this source record alone does not publish prices.
