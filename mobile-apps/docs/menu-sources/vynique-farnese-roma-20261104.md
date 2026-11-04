# VyNIQUE Farnese, Roma: owner drink menu candidate

This candidate stages **58 named EUR drink offers** for one existing Rome map
venue. It is a draft source proposal for the phone-only v2 menu. Nothing in
this branch changes the website, backend, schema, legacy customer prices, or
public data.

## Venue and live baseline

- Roberto's published `20261102` static catalogue contains `n12020660918`,
  **VyNique**, bar kind `1`, coordinates `41.89531, 12.47135`, cell `sr2y7`,
  city Roma (`72959652`). Its static address is empty, so the manifest keeps
  `address: null`. The [OSM node](https://www.openstreetmap.org/node/12020660918)
  has the same name and location near Piazza Farnese.
- The [owner homepage](https://vynique.it/) identifies the Piazza Farnese
  branch at **Via dei Baullari 106, Roma** and directly links its own
  [Farnese drink-menu PDF](https://vynique.it/wp-content/uploads/2026/05/VyNIQUE-Farnese_Drink-menu_FW2025_web.pdf).
  The PDF footer repeats the same branch name and address. Its separate
  Frattina branch at Via Frattina 94 has a different menu; this candidate does
  not use that menu.
- The [public mobile-v2 venue read](https://www.dovebevo.com/api/mobile/v2/menu/venues/n12020660918?cell=sr2y7)
  returned `stored_offer_count: 0` and `offers: []` on 4 November 2026. No
  same-venue manifest was found in the checked main commit.

## Source and transcription

- The owner PDF returned HTTP 200, `application/pdf`, 1,440,308 bytes, and
  `Last-Modified: Tue, 19 May 2026 13:30:16 GMT` on 4 November 2026. The
  homepage linked it at the time of review. Its exact raw SHA-256 is
  `e4db7c4a3930396d1b79acde4434dd3b46d70b3583e1a5dd1fd5330b2597d8e2`;
  the importer `pdf_text_v1` normalized-text SHA-256 is
  `20d151fa7946d2c754c40eb4ff5332b525caaca07b5bb5fdb6cbdbf7a6489987`.
- The 58 offers are 29 named cocktails, three named alcohol-free cocktails,
  six named beers with printed `30 cl`, `33 cl`, or `50 cl` servings, 16
  individually priced premium gin-tonic choices, and four premium vodka-tonic
  choices. The source prints one price for each. The two slash-separated
  cocktail choices are retained as the owner's combined display names and
  **not** split into inferred separate offers. Gin and vodka brands retain
  their exact printed names; the tonic type comes from the printed menu
  section, not an invented product name.
- All offers retain EUR and the exact printed regular price. No venue visit,
  customer payment, confirmation, Google-review count, food, prose, image,
  bottle-wine price, spirit substitution, or inferred fee is added. The PDF
  does not establish complete fee coverage; `fees` and `fee_coverage` are
  empty and remain **unknown**.
- This is a factual, limited transcription of the owner-public menu. The PDF
  itself and its artwork are not committed. The owner has not guaranteed that
  a printed item will remain available or keep the same price; live source
  and venue identity must be rechecked before a protected import.

## Gate

The content-addressed manifest is
`mobile-apps/data/mobile-menu-v2-seeds/5b07b6d93694e4ea56a3e2c81d137c0118c69001723ae72db8036c3a68b0a2df.json`.
Local schema validation and line-level source checks passed. An independent
reviewer must compare the exact names, amounts, beer volumes and branch
identity, then run the protected dry-run audit on the reviewed main commit.
Only a separate, guarded seed after that audit can publish app-only offers.
