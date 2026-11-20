# Offside Sports Pub Milano: owner beer-menu facts

Initially checked 2026-11-11 and rechecked 2026-11-20. This source-only
record prepares named drink-price facts for an **existing** Milano venue. It
does not import public prices, create a venue, change customer reports, or
alter Roberto's website.

**PUBLIC SEED HOLD:** the owner requires EUR 15 minimum consumption per person
during televised live sports. The revised manifest records this as a separate
conditional minimum spend, not an addition to each drink price. Current source
code has a separate display for that condition, but the public Android and
Windows binaries predate it and signed-client behavior still needs
verification. Keep this manifest source-only until each publicly installed
client that can show these prices visibly shows the minimum too. Do not
present a EUR 4.50 drink as the full amount payable during a live sports
broadcast.

## Exact venue identity

- The [live Dove Bevo menu route](https://www.dovebevo.com/api/mobile/v2/menu/venues/n13543749848?cell=u0ndb&limit=100)
  still returned zero stored offers and zero minimum-spend rows on 2026-11-20,
  with the published tuple `n13543749848`,
  `u0ndb`, Offside Sports Pub, kind `2`, `45.48715, 9.1658`, Via Losanna 46,
  Milano. Live `/api/health` reported data version `20261119`; Milano's static
  city id in that catalogue is `62505581`.
- The [OSM node](https://www.openstreetmap.org/node/13543749848) independently
  names Offside Sports Pub, describes a pub at `45.4871547, 9.1658013`, has
  Via Losanna 46 address tags, and links directly to the
  [venue's site](https://www.offsidesportspub.it/). The venue site prints the
  same public-facing address and links its beer menu.

## Menu and price scope

- Immutable manifest `e051dd206ccfefd6589a6407ff913c1cdda13d3fd22ad22295a1b0711d00b4b3.json`
  contains **32** exact EUR name/price/serving combinations from the
  [owner's beer page](https://www.offsidesportspub.it/le-birre): 25 draft-beer
  size variants from 13 named beers, three cider variants, and four beer-based
  drink variants. All 18 product fragments occur exactly once in the fetched
  canonical text; the 32 manifest rows have distinct name/serving pairs.
- The four beer-based drink variants retain the owner's description in each
  displayed name: `PANASCÈ · Birra e Gazzosa`, `RADLER · Birra e Lemon`,
  and `SNAKEBITE · Birra e Sidro` in both printed sizes. Their four amounts
  and serving labels remain unchanged.
- `piccola` and `media` are preserved without invented millilitre volumes.
  The bottled pear cider explicitly says `500ml`, so that printed size is kept.
  The rotating guest beer Lunar Haze is excluded because its future
  availability is not established for a one-off seed. The page's unpriced
  bottled-beer section is also excluded.
- The beer page fetched with the importer's menu-audit user agent returned
  918,696 UTF-8 HTML bytes on the 2026-11-20 recheck, raw SHA-256
  `01f1e644be6c261eda618e68c480a417bb8c3fd3affb25ec14d110cfe1ac0da2`,
  and `html_text_v1` SHA-256
  `c6fba78b870f9bef8f30097413e76ccffe97073bf10d525d72ebfb1f2216162c`.
  The latter is the manifest's strict source pin. A changed owner page must
  fail the guarded import until reviewed again.

## Sports-event minimum and reuse review

The [owner homepage](https://www.offsidesportspub.it/) currently says that
**during live sports broadcasts there is a EUR 15 minimum consumption per
person**. Its raw SHA-256 at the initial 2026-11-11 check was
`b90934c83b7c0fc2b0956cada3153eac651399f21eade60cf69869cf4a12fa5b`;
its `html_text_v1` hash was
`87a548a740486d5fcd9b6607f9a69ebe2821554695cfed699c4b7c5986fa2ca9`.
The homepage's raw HTML changed since the first check but its normalized
`html_text_v1` hash still matches. The 2026-11-20 fetch returned 925,698
UTF-8 bytes with raw SHA-256
`46a6ec1fbe55240991197a292ab3f8aadc73f9714211a94b771d2d2a80099096`.
The manifest pins the stable normalized text as a second owner source and
records one separate `minimum_spends` row: EUR 15, per person, applicable
only during live sports broadcasts. It is a minimum spend, **not** a
surcharge added to each drink. `fees` and `fee_coverage` remain empty,
meaning other charges are unknown. Regular drink amounts and their
`price_context` remain unchanged. Public-client display parity is the
remaining release gate before public import.

At the initial source review, the owner's
[robots.txt](https://www.offsidesportspub.it/robots.txt) returned HTTP 200
with general `Allow: /`; the focused owner-page and site-policy review found
no explicit ban on this factual use. This is not a licence grant.
Only factual drink names, EUR amounts, serving labels, and the minimum-spend
condition are transcribed; no photos, menu artwork, reviews, or page layout
are copied. Independent review of this corrected manifest, exact-head CI,
public-client parity, protected production audit, guarded seed, and exact
public readback are required before any live-price claim.
