# Azzuppa Napoli: owner drink menu source review

Checked 2026-11-04. This is a source-only, app-only candidate. It has not
written public prices, modified customer contributions, or changed Roberto's
website or backend.

## Venue and source

- Roberto's published `20261102` static cell `sr60k` contains exactly one
  `n11476210904` tuple: `Azzuppa`, kind `1`, latitude `40.85077`, longitude
  `14.2505`, address `Via Bellini 15`, city `Napoli` (`428339558`). The protected
  importer's `public_identity` check matched this tuple on 2026-11-04.
- [Azzuppa's own menu](https://www.azzuppa.it/) identifies its premises as
  `Via Vincenzo Bellini, 15 - Napoli`. The expanded street name and number
  match the mapped venue. Its page presents priced wine, beer, spirits, and
  soft drinks. Its first-party visible-text SHA-256 is
  `5506aa9888c221aa08269f97ae669b0b46018f38ee20e42507c65ebd12845aca`.
  Two separate fetches produced this hash, and `source_identity` re-fetched
  and verified it through the protected importer's no-redirect transport.
- The exact-byte manifest is
  `236467f69d695cbb9c1ef80652c4800767741971ba352be1db9d3cac01a86b21.json`;
  its filename matches its SHA-256. It contains 37 regular EUR offers: 21
  single-price wines, three explicitly 33cl beers, seven spirits, and six
  soft drinks. EUR is inferred from the Italian premises/menu context; the
  owner page prints numeric amounts without an adjacent currency symbol.
  Wine and spirit serving labels remain null because the source does not
  state the volume. No Google review count, observation date, or customer
  confirmation is fabricated.

## Scope and cautions

- The [live app-only v2 venue route](https://www.dovebevo.com/api/mobile/v2/menu/venues/n11476210904?cell=sr60k&limit=100)
  returned `stored_offer_count: 0` on 2026-11-04. Thus none of the proposed
  named prices duplicate a live v2 offer as checked. The importer still must
  recheck production conflicts after review.
- Seven wines show two adjacent prices with glass and bottle icons. They are
  excluded because the text alone does not state a reliable serving label;
  neither amount has been assigned to a serving in this candidate.
- The owner says `Coperto incluso, vai tranquillo.` This supports that cover
  is included but is not an exhaustive statement about every possible fee.
  No fee row or `explicit_no_fee` coverage claim is made, so fee coverage
  remains unknown.
- The menu contains wines with vintages, so stock and menu prices may change.
  A changed source text must be re-reviewed and pinned in a new immutable
  manifest. Do not silently substitute a price or vintage.

## Verification and next gate

The local v2 manifest validator accepted all 37 offers, the static venue
identity check passed, and the exact owner-source hash check passed. These
checks do not attest production D1 bindings or seed any public row. An
independent reviewer should inspect the owner page and each price, then
merge only after review. The protected dry-run audit, separate guarded seed,
receipt inspection, and mobile readback remain required.

The focused legacy-preservation, workflow-safety, and seed-manifest unit
tests passed. A broader Windows unit run reported four failures only in
the shell-tag test: this host's WSL relay could not execute `/bin/bash`.
No production shell workflow was run or inferred from that local result.
