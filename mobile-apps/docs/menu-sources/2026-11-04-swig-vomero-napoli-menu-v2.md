# Swig Vomero: app-only regular drink menu snapshot

Checked on 2026-11-04. This is a proposed source-only menu-v2 seed for one
existing Roberto venue. The manifest does not import anything into production,
create a venue, change customer prices, or alter the website.

## Identity and owner source

- Existing published static venue: n7154744122, cell sr607, name Swig,
  kind 1, coordinates 40.84413, 14.23328, Napoli. The exact tuple is
  present in Roberto's public 20261102 catalogue and passes the guarded
  importer's public_identity check.
- [Swig Bar's own menu](https://www.swigbar.net/) calls it a cocktail bar in
  Vomero, publishes the item prices, and links its own review profile. That
  review profile's place ID agrees with the [Vomero venue listing and address](https://www.waze.com/live-map/directions/it/campania/napoli/swig-shot-bar-vomero?to=place.ChIJ99cKGfoIOxMRcYzUvTgM2R0)
  at Via Alessandro Scarlatti 50/a. The [OSM point](https://www.openstreetmap.org/node/7154744122)
  is on the same Scarlatti street segment. No Google review count is copied.
- Source URL: https://www.swigbar.net/; html_text_v1 SHA-256
  89ff86c46834d141552e04d2bc202fb6eca329736d02b0e7c9fe2250ea134b0f.
  Two independent fetches yielded this same normalized visible-text hash.
- Immutable manifest:
  ed8c9397878c5ef43f16ae4cae49a201064a23253a6d481661dcc05789ed8048.json;
  its exact-file SHA-256 is the same hexadecimal value.

## Factual offers and limits

The owner menu explicitly lists **65 regular EUR offers**:

| Group | Count | Published regular prices | Serving evidence |
| --- | ---: | --- | --- |
| Named shots | 39 | €3 or €4 | The owner places them under SHOTS; no volume is stated. |
| Named cocktails | 14 | €8 or €10 | No volume is stated. |
| Bottled beers | 6 | €3 or €4 | Each item explicitly names 33cl or 50cl. |
| Wines and prosecco | 6 | €6 per 150ml glass; €25 per 750ml bottle | Each variant explicitly states CALICE 150ml or BOTTIGLIA 750ml. |

Only names, EUR amounts, and explicit serving sizes are transcribed. Decorative
emoji, menu descriptions, images, and inferred drink categories are omitted.
The three by-the-glass rows use wine_glass; bottles and other items keep an
unspecified app category rather than assigning a potentially misleading one.

The Italian menu advertises happy-hour prices, but language versions disagree
about the time window. All promotional rows are therefore held. The menu has
no explicit mandatory-fee statement, so fee coverage stays **unknown**, not
fee-free. The regular-price rows do not claim a visit, confirmation, review
count, or current stock.

## Guarded route

The local manifest validator accepted all 65 offers. The guarded importer's
public identity and pinned source-text checks returned verified, with zero
source diagnostics. This was a source-only check; it did not attest production
D1 binding or write public data.

An independent reviewer should compare the exact owner menu, static identity,
servings, and fee scope before this draft is merged. The separately authorized
protected audit must re-fetch the exact source hash and inspect existing
customer data and moderation state. Only a later successful guarded seed can
make these offers available to app clients.
