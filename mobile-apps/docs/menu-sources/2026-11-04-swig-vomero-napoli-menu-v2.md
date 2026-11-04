# Swig Vomero: two net-new app-only shot prices

Checked on 2026-11-04. This draft is a source-only menu-v2 seed for one
existing Roberto venue. It does not import prices, create a venue, edit
customer observations, or change the website.

## Identity and source

- Existing published static venue: n7154744122, cell sr607, name Swig,
  kind 1, coordinates 40.84413, 14.23328, Napoli. The exact tuple passes
  the guarded importer's public_identity check against Roberto's 20261102
  catalogue.
- [Swig Bar's owner menu](https://www.swigbar.net/) calls it a cocktail bar
  in Vomero and links its own venue review profile. The linked place ID
  agrees with the [listing at Via Alessandro Scarlatti 50/a](https://www.waze.com/live-map/directions/it/campania/napoli/swig-shot-bar-vomero?to=place.ChIJ99cKGfoIOxMRcYzUvTgM2R0).
  The [OSM point](https://www.openstreetmap.org/node/7154744122) is on
  the same Scarlatti segment. No review count is copied.
- Owner source URL: https://www.swigbar.net/; normalized visible-text
  SHA-256 89ff86c46834d141552e04d2bc202fb6eca329736d02b0e7c9fe2250ea134b0f.
  Two independent fetches matched this hash.
- Immutable manifest: 4c8eddb7178a605e0011098cbf67a5dd573da8d7c99bce80f961d29109bfa149.json.
  Its filename is the SHA-256 of its exact UTF-8 bytes.

## Existing app catalogue check

The live app v2 route returned 115 Swig offers across two pages at the
time of this review. It already had matching amounts and serving sizes
for six bottled beers. The label formatting differs (for example,
33CL versus 33 cl), and the existing rows mark the price as conditional
outside Happy Hours. Adding the same six amounts as unconditional prices
would duplicate them and could misstate the promotion. Those six and the
other 57 overlapping draft rows were removed.

Only two prices remain absent as the same item, amount, serving and
price context:

| Shot | Owner menu price | Existing v2 state |
| --- | ---: | --- |
| ARRAKIS | €3 direct menu price | No ARRAKIS row |
| BRUCIA ANIME | €4 non-promotional SHOT price | Only €3 Happy Hours row |

The owner menu states Happy Hours every evening 18:30-20:30 and a €1
discount on shots. Both proposed amounts therefore have the conditional
context "outside Happy Hours 18:30-20:30". The English menu currently
repeats that same Italian promo statement; an older search snippet with
different hours was stale. No shot volume is claimed. No mandatory-fee
statement appears in the menu, so fee coverage stays unknown, not fee-free.

## Guarded route

The local manifest validator accepts exactly two offers. The guarded
importer's public identity and pinned source checks returned verified with
zero source diagnostics. Its legacy-preservation test passed. These local
checks do not attest production D1 binding or write public data.

An independent reviewer should recheck the owner menu, the two proposed
offers and live duplicate state. After merge, the protected audit must
re-fetch the pinned source and inspect production conflicts and moderation
state. A separate guarded seed, successful receipt and app readback are
required before either price is public.
