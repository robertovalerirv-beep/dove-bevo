# Jokr / Joker Napoli: app-only drink-menu seed

Checked 2026-11-04. This draft adds one immutable menu-v2 manifest for an
existing Roberto catalogue venue. It does not write public prices, create a
venue, change customer observations, or alter Roberto's website.

## Venue identity

- Roberto's live 20261102 `sr607` cell and mobile-v2 route identify
  `n9379445249` as **Joker**, kind 2, at 40.84637, 14.22908 in Napoli. The
  [OSM node](https://www.openstreetmap.org/node/9379445249) uses the same
  name and position. The live v2 route reported `stored_offer_count: 0` on
  2026-11-04.
- The [venue's own site](https://www.jokr.beer/) is branded **Jokr** and
  prints **Via Francesco De Mura, 35, Napoli** alongside its menu.
  [The venue listing](https://www.tripadvisor.it/Restaurant_Review-g187785-d2403077-Reviews-Jokr_Craft_Beer_Pub-Naples_Province_of_Naples_Campania.html)
  calls it *Jokr Craft Beer Pub* at number 35 and describes it as *Joker*.
  The spelling difference is therefore recorded; it is not treated as a
  separate venue. No review count is used.

## Source snapshot and prices

- Owner menu URL: https://www.jokr.beer/. Its visible-text `html_text_v1`
  SHA-256 is `bca2d59808f63b29dfbf6cae16d9bb55c5460df88ce5c30bb4bcd3215c9003b9`.
  Three separate source fetches had this digest. The root `robots.txt`
  allows the page, and no express extraction prohibition appeared on the
  menu. Only factual names, displayed servings, and EUR amounts are stored.
- Manifest: `96fa773b5ca1f41c623db9c78d190058baa047609f5823361a87d2baf8bf7ad0.json`.
  The filename is the SHA-256 of its exact UTF-8 bytes.
- The manifest has **73 priced drink rows**: 10 draft-beer serving options,
  53 packaged beers, 6 water/soft drinks, and 4 cocktails. Examples directly
  paired on the owner page include Bohemian Pilsner 25cl Draft €4.00 and
  40cl Draft €6.00; PiQuad 25cl Draft €4.50 and 40cl Draft €7.00;
  Lille Lørdag (2021) 44cl Can €7.50; Acqua Liscia cl.75 €2.50;
  Aperol Spritz €7.50; and Negroni €7.50. The Gin Tonic €7.50 row is
  conditional on the menu's **con Tanquerai** wording. The manifest
  preserves every packaged-beer serving label exactly as printed; it does
  not infer millilitres from centilitres.
- The beer section is an Untappd menu embedded on the venue's own page. It
  displays update dates of **Nov 13** and **Nov 17** without a year. Those
  dates do not establish recent stock or a 2026 update. An independent
  reviewer must confirm these beer rows remain suitable before seeding.
  The owner page does not establish a complete fee policy, so fee coverage
  remains unknown rather than fee-free.

## Verification and release boundary

The local strict manifest validator accepted all 73 offers, the filename
matched its byte hash, and no `(name, serving, amount)` triple was repeated.
Before import, independently review the current owner menu and the Joker/Jokr
identity, then run the protected source and public-identity audit from an
approved `main` commit. A successful audit and a separate guarded seed
receipt, followed by live app readback, are required before these amounts can
be described as available to customers.
