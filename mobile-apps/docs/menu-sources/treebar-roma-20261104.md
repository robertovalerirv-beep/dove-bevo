# Tree Bar, Roma — app-only owner menu candidate

This candidate records **158 named EUR drink offers** from the venue's [public menu](https://treebar.it/menu-treebar/), checked on 4 November 2026. It is for the additive mobile menu dataset only. The website, legacy EUR customer-price records, and customer confirmations are untouched. No live import has been requested by this branch.

## Venue identity

- Existing Roberto static catalogue: `n448931391` in cell `sr2y7`, **Tree Bar**, kind `bar`, 41.92305, 12.47143, Via Flaminia 226, Roma; static city ID `72959652`. The live venue menu API had zero named offers before this candidate.
- [OSM node 448931391](https://www.openstreetmap.org/node/448931391) has name Tree Bar, `amenity=bar`, Via Flaminia 226, and coordinates 41.9230468, 12.4714338. The [owner site](https://treebar.it/) and menu footer both identify Via Flaminia 226. No new venue was created.

## Source and transcription

- Owner URL: `https://treebar.it/menu-treebar/`; `html_text_v1` canonical text SHA-256 `ec60015a89642fc00eb46b8894b6991b13e6d85d580a3ff38d29d1bfe4a40387`. Two independent fetches on the check day produced the same normalized hash. The page labels its menu **inverno 2026**. The protected audit must fetch and verify the source again immediately before any import.
- Offers: 13 named beers, 36 named cocktails including eight in the alcohol-free section, 74 individually named spirits and liqueurs, and 35 named wine glass/bottle prices. Every amount is taken from the associated owner group, article or row; the manifest retains its evidence section, original EUR amount, product/producer identity, and serving distinction.
- Draught beer is labelled `Spina` without inventing a volume. Distillate rows use the menu's explicit 60 ml portion. The owner says a 30 ml portion can be ordered for half the list price, but this batch does not derive a new numeric offer from that rule. Wine `Calice` and `Bottiglia` are distinct; the Riesling in the `Vino analcolico` section is explicitly labelled alcohol-free. The `Sour` choice is conditional and carries the printed choice text.
- The menu does not state a service fee or complete fee coverage, so the manifest leaves both unknown. The batch omits `Sidro` because its brand is not specified, and omits the separate soft-drink and coffee sections. It does not represent a customer payment, confirmation or current availability guarantee.

## Gate and file

The sole manifest is `mobile-apps/data/mobile-menu-v2-seeds/51e6a81c07b82105e5b516a20f0e3c091a261f47a7ac48493f9699ed801e3158.json`. Its filename is the SHA-256 of the full UTF-8 manifest bytes. Local `import_v2.validate` passes. Before public use, require independent name/price review, exact-head hosted checks, a protected source/identity/customer/moderation dry run on the merged commit, then a separate guarded apply and public readback. Existing reports or hidden status block import.
