# Offside Sports Pub Milano: owner beer-menu facts

Checked 2026-11-11. This source-only record prepares named drink-price facts
for an **existing** Milano venue. It does not import public prices, create a
venue, change customer reports, or alter Roberto's website.

**PUBLIC SEED HOLD:** the owner requires EUR 15 minimum consumption per person
during televised live sports. The app currently cannot display a minimum-spend
condition alongside these regular drink prices. The staged facts must remain
source-only until the mobile venue view accurately surfaces that conditional
minimum, with the drink amounts still shown unchanged. Do not present a EUR
4.50 drink as the full amount payable during a live sports broadcast.

## Exact venue identity

- The [live Dove Bevo menu route](https://www.dovebevo.com/api/mobile/v2/menu/venues/n13543749848?cell=u0ndb&limit=100)
  returned zero stored offers and the published tuple `n13543749848`,
  `u0ndb`, Offside Sports Pub, kind `2`, `45.48715, 9.1658`, Via Losanna 46,
  Milano. Live `/api/health` reported data version `20261108`; Milano's static
  city id in that catalogue is `62505581`.
- The [OSM node](https://www.openstreetmap.org/node/13543749848) independently
  names Offside Sports Pub, describes a pub at `45.4871547, 9.1658013`, has
  Via Losanna 46 address tags, and links directly to the
  [venue's site](https://www.offsidesportspub.it/). The venue site prints the
  same public-facing address and links its beer menu.

## Menu and price scope

- Immutable manifest `2ec1a735ba235b0a087342e90f72008be3b657258f8dd635f8f9ab2d2d11a047.json`
  contains **32** exact EUR name/price/serving combinations from the
  [owner's beer page](https://www.offsidesportspub.it/le-birre): 25 draft-beer
  size variants from 13 named beers, three cider variants, and four beer-based
  drink variants. All 18 product fragments occur exactly once in the fetched
  canonical text; the 32 manifest rows have distinct name/serving pairs.
- `piccola` and `media` are preserved without invented millilitre volumes.
  The bottled pear cider explicitly says `500ml`, so that printed size is kept.
  The rotating guest beer Lunar Haze is excluded because its future
  availability is not established for a one-off seed. The page's unpriced
  bottled-beer section is also excluded.
- The beer page fetched with the importer's menu-audit user agent returned
  921,279 UTF-8 HTML bytes, raw SHA-256
  `df2701596e4d7065f963a2de69e40a5b4d94563f4b8d58673348521c7cd9ad29`,
  and `html_text_v1` SHA-256
  `c6fba78b870f9bef8f30097413e76ccffe97073bf10d525d72ebfb1f2216162c`.
  The latter is the manifest's strict source pin. A changed owner page must
  fail the guarded import until reviewed again.

## Sports-event minimum and reuse review

The [owner homepage](https://www.offsidesportspub.it/) currently says that
**during live sports broadcasts there is a EUR 15 minimum consumption per
person**. Its raw SHA-256 at this check was
`b90934c83b7c0fc2b0956cada3153eac651399f21eade60cf69869cf4a12fa5b`;
its `html_text_v1` hash was
`87a548a740486d5fcd9b6607f9a69ebe2821554695cfed699c4b7c5986fa2ca9`.
This is a minimum spend, **not** a surcharge added to each drink. The current
mobile-menu fee schema models fixed or percentage add-ons, not minimum spends,
so `fees` and `fee_coverage` remain unset rather than misrepresenting EUR 15
as an extra fee or claiming a fee-free final bill. `condition_text` cannot
carry this warning on a regular offer; changing each offer to `conditional`
would incorrectly state that the printed price itself applies only during
sports broadcasts. The current mobile venue screen displays only additive
fees and generic unknown-fee wording, so the minimum is not yet visible to
customers. Keep the public-seed hold until that display is implemented and
verified; other charges are not established.

The owner's [robots.txt](https://www.offsidesportspub.it/robots.txt) returned
HTTP 200 with general `Allow: /`; the focused owner-page and site-policy
review found no explicit ban on this factual use. This is not a licence grant.
Only names, EUR amounts, and serving labels are transcribed; no photos, menu
artwork, descriptions, reviews, or page layout are copied. Independent
all-row, identity, source-rights, and fee-caveat review is required before
merging. A separate protected production audit, guarded seed, and exact
public readback are required before any live-price claim.
