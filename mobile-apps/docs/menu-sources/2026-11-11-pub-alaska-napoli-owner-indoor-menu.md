# Pub Alaska Napoli: owner-linked indoor menu source

Checked 2026-11-11. This source-only draft records one existing Napoli venue and
does not publish prices, create a venue, change customer observations, or touch
Roberto's website.

## Venue and menu identity

- Dove Bevo's live `20261108` `sr607` catalogue contains `n13406746283`,
  **Pub Alaska**, kind 2, at `40.84427, 14.22563`; the [app menu route](https://www.dovebevo.com/api/mobile/v2/menu/venues/n13406746283?cell=sr607&limit=100)
  returned zero stored offers. The [OSM node](https://www.openstreetmap.org/node/13406746283)
  has the same name and position.
- The [venue's own site](https://alaskapub.it/) prints Via Francesco
  Fracanzano 13, Napoli and links **Il nostro menù** directly to its
  [Ordinalo digital menu](https://menudigitale.ordinalo.net/pubalaska_it/).
  Ordinalo [documents](https://www.ordinalo.net/supporto/ordini-interni-e-staff/)
  that this is an indoor menu, which can differ from takeaway or delivery.

## Recorded drink facts

- Immutable manifest:
  `3f43bcb78f4b795be3ca2f943eabf9b14d0de23137af520b04095f5ee8c26da7.json`;
  its filename is the SHA-256 of its exact UTF-8 bytes. The directly fetched
  297,830-byte HTML had raw SHA-256
  `10fcdedbdfbc4ff009526ca6507edb8e7ac6b7c141060ff04d80489e6e194b8e`
  and canonical `html_text_v1` SHA-256
  `83ff6fdb833eef1f0cfe875ae744d73f2dcacc16c36a10012199b45261da14e1`.
- **61** individually printed EUR drink prices were transcribed from **52**
  product cards: 7 soft drinks and waters, 13 draft-beer size variants, 6
  bottled beers, 15 wine entries including two explicit `Calice` variants,
  and 20 cocktails/bar drinks including coffee. Every draft size/amount pair
  is taken from the same card, and the headline price matches its first
  printed size. `Spritz` is one item at EUR 8 for the menu's listed choices;
  no separate choices or prices were invented.
- Serving labels are copied as printed. In particular, the draft `cl 0,25`
  format is kept verbatim and **not** converted into millilitres. The main
  wine prices and unsized spirits have a null serving; the menu does not
  establish their quantity. The `Amari` and `Amaro Jefferson` rows retain
  the menu's availability condition. No images, descriptions, or menu layout
  are copied.
- Current service-fee coverage is **unknown** (`fees: []`,
  `fee_coverage: []`). The venue's [older December 2025 PDF](https://alaskapub.it/wp-content/uploads/2025/12/menu2025dicweb.pdf)
  refers to table service, but it is a different price list and does not
  establish today's fee, amount, or applicability. These drink amounts are
  menu-item prices, not asserted final bills or fee-free totals.

## Verification and release boundary

The strict local manifest validator accepted all 61 rows; the file hash
matched its name; all 52 source cards and nine additional printed variants
were accounted for. An independent reviewer should re-fetch the owner-linked
menu, compare the entire offer list and exact source hash, confirm the venue
identity and fee caveat, then run the guarded importer from approved `main`.
Only a separate successful protected seed receipt and live app readback can
establish that these prices became available to customers.
