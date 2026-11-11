# Imbarchino, Torino: first-party winter menu review candidate

Checked 2026-11-11. This is an app-only **source review candidate**, not a
public import. Its immutable manifest is
`mobile-apps/data/mobile-menu-v2-seeds/c166cbbb75c2b45a364f8ab0c21c41552f61378af3e3d427355bb6d1d12f3c2f.json`
(SHA-256 of the exact UTF-8 file). It proposes **50 EUR drink offers** at one
already mapped Torino venue. No venue is created and no customer price is
replaced.

## Exact venue identity

- The live Dove Bevo catalogue at version `20261108`, cell `u0j2q`, has
  `w1078499512`, `Imbarchino`, kind `bar`, `45.05539, 7.68861`, address
  `Viale Umberto Cagni 37`, Torino city ID `63621589`.
- The live [OSM way](https://www.openstreetmap.org/way/1078499512) names
  `Imbarchino`, marks it `amenity=bar`, and gives `Viale Umberto Cagni 37`,
  Torino. The [owner homepage](https://www.imbarchino.space/) identifies the
  same venue and its operator, Va Lentino S.r.l. Società Benefit, at that
  address.
- The public app menu read for that exact key/cell returned
  `stored_offer_count: 0` on 2026-11-11. Existing legacy/customer prices were
  not modified or copied into this candidate.

## Current first-party menu chain

The live owner homepage links **Bar & Cucina**, whose
[page](https://www.imbarchino.space/bar-e-cucina) links **il nostro menù**.
The resulting [owner menu page](https://www.imbarchino.space/menu) currently
labels its linked PDF a **winter menu**. Clicking that link redirects from
`https://www.imbarchino.space/s/261105_menu_digital.pdf` to the exact
[Squarespace-hosted PDF](https://static1.squarespace.com/static/5e7e264530df6e33f115bd43/t/6aeb60bd810af771673c73ff/1793810621793/261105_menu_digital.pdf)
pinned in the manifest. The direct URL returned HTTP 200, `application/pdf`,
83,536 bytes, with no further redirect, twice on 2026-11-11. Raw SHA-256 is
`1fc0bebe51cf24adcd81bbc2be4a0008e0eec822ee71fcda4c1cbb1b4afbf3d3`;
the importer's `pdf_text_v1` normalized extraction SHA-256 is
`9e26a882f3a562b3688cd41673070347def0c1e5b1760107b2fb877156315463`.
The four-page PDF metadata gives creation and modification on 2026-11-04;
the live owner link, rather than the filename or metadata alone, is the
evidence that this is the current published menu.

## Drink and price interpretation

The 50 rows comprise six named beers, seven Spritz variants, six wines in
both explicitly printed 10 cl glass and 75 cl bottle sizes, six other cold
drinks, and 19 named cocktails. Each `evidence_ref` identifies the printed
page, section, item/group and EUR amount. The PDF explicitly labels the draft
beer section **40 cl**, individual bottle sizes, and the two wine columns;
those sizes are preserved. No size is inferred for Spritz or cocktails.

Named alternatives under an explicit group price, such as the seven Spritz
variants and grouped Mules/Sours, are listed at that price. The PDF says
**"ORDINA AL BANCONE"**. It does not establish that all possible fees are
absent, so fee coverage remains unknown. Generic "fuori menù" starting
prices, unpriced alternatives, brand-specific gin/tonic combinations, food,
promotions and descriptive copy are excluded. The optional `+3€` vodka
addition to Club Mate is also excluded; the base drink is recorded at 4 EUR.
No Google reviews, images, menu artwork, or fabricated prices are imported.

The source, venue pairing, grouped prices, and exact hashes still need an
independent review, a guarded private dry run against current production
state, and a separately authorized apply/readback. A changed owner menu or
disputed price pairing holds this candidate. This PR alone changes no live
app, website, database, or legacy contribution.
