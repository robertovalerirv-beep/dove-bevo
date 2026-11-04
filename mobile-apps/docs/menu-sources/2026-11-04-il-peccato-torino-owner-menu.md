# Il Peccato Torino owner menu source, 4 November 2026

This source-only batch stages 32 regular drink offers for the existing Torino
map venue `n9933713554` in cell `u0j2q`. It does not publish prices or alter
Roberto's website, backend, schema, or customer contributions.

## Identity and live baseline

- The exact [public v2 venue](https://www.dovebevo.com/api/mobile/v2/menu/venues/n9933713554?cell=u0j2q)
  returned `stored_offer_count: 0`, `offers: []`, and `next_after: null` on
  4 November 2026. The baseline therefore has no semantic duplicates to
  omit. Repository manifests at the checked main commit also had no row for
  this venue key.
- Roberto's static catalogue identifies `Il peccato`, kind `2`, coordinates
  `45.06538, 7.65333`, city `Torino`, with the owner website
  `https://www.ilpeccatopubkaraoke.it/`. The [OSM node](https://www.openstreetmap.org/node/9933713554)
  has the same name and website tag and locates it on Via Monginevro. The
  [owner menu](https://www.ilpeccatopubkaraoke.it/menu/) states Via Monginevro
  8. OSM/static has no house number, so the manifest correctly keeps
  `address: null`; it does not invent the missing static address.
- The owner homepage links this current menu page. The page did not state a
  menu revision date. Its prices must be checked again just before import.

## Source and interpretation

- First-party source: `https://www.ilpeccatopubkaraoke.it/menu/`; live HTTP
  200 with the protected `DoveBevoMenuAudit/1` user agent. `html_text_v1`
  digest was stable across three requests:
  `88b251163dc147127016aac98277f50650d6b290db28bbc236114d978b7d08be`.
- The 32 offers preserve the displayed name, EUR amount, and any stated
  serving. `piccola` and `media` have no millilitre quantity on the menu, so
  `serving_ml` remains null. `Peccato` appears in both the chupito and cocktail
  sections; the two rows retain their distinct serving labels and prices.
- The `€4` Spritz offered before the `giropizza & karaoke` bundle is
  conditional and excluded; the separate regular Spritz is `€6`. Multi-brand
  generic bottled beer and soft-drink rows, food, and bottle wines were
  excluded because their item or serving attribution is ambiguous for this
  batch.
- The owner page did not state a compulsory drink cover or service fee.
  `fees` and `fee_coverage` are empty, leaving fee coverage **unknown**.
  This is not a claim that there is no fee.
- Only factual item names, serving labels, prices, and short evidence
  references are staged. No menu prose, photos, or artwork is copied.

## Release boundary

The content-addressed manifest is a draft source proposal only. Recheck the
exact source digest and public v2 baseline immediately before any protected
audit or one-off import. Do not seed this batch if the menu, venue identity,
or live duplicate baseline has changed.
