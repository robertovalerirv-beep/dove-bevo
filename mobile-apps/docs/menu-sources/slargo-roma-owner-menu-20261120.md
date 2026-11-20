# Slargo Roma owner menu, source-only candidate (20 November 2026)

## Scope and identity

- Existing Roberto static venue: `Slargo`, `n11481060811`, cell `sr2yk`, Largo Ravenna 10, Roma, coordinates `41.91287, 12.51803`, city ID `72959652`. The existing discovery record links the OSM venue to `https://www.slargo.it/`. The protected audit must recheck this production static binding before any seed.
- First-party menu: <https://www.slargo.it/menus>. A direct HTTPS GET with an ordinary browser User-Agent returned HTTP 200 on 2026-11-20. The fetched UTF-8 HTML was 1,426,394 bytes, raw SHA-256 `5f949a9a72e34cfac867fb49f641b3a65ca9e822630a3c8c8aeabaaeb3206ba1` in repeated requests. The importer's `html_text_v1` markup-text digest was `a926a937e78a033b3a6c024a0bac6badcbab255f79c7a3dd1d510f1497fe8fd1` in both requests; this is the manifest's source pin. The protected importer's own no-redirect urllib request with `DoveBevoMenuAudit/1` User-Agent also returned HTTP 200 and exactly the same raw and semantic digests. A changed text digest must hold any protected run.
- The source page presents 76 menu item rows. The source-only manifest records **37 factual EUR prices** for the existing venue: 10 draft-beer serving variants from five named beers (rows 10–14), 26 `calice` wine prices (rows 29–54), and the printed generic `SPRITZ` price (row 57). Each retained row includes the printed serving where applicable, original EUR amount, and an evidence pointer. Neither a venue nor customer price is fabricated or overwritten.

## What the menu supports

| Owner section | Printed rows | Staged | Important limit |
| --- | --- | ---: | --- |
| `ARTIGIANALI ALLA SPINA` | 10–14 | 10 | Five named beers, each `33cl` and `50cl`. Printed tap selection can change; recheck the owner menu before seeding. |
| `VINO NATURALE` | 29–54 | 26 | Only the `calice` variant of each named wine. The different `bottiglia` prices are excluded. |
| `COCKTAIL` | 57 | 1 | Generic `SPRITZ` at EUR 6.00. The page lists Aperol, Campari, Select and Cynar in its description, but does not state four separately priced offers. |

The page does not state a mandatory service fee or minimum spend in its menu text. `fees` and `fee_coverage` are empty, which means **fee scope is unknown**, not that the venue promises no fee. No broad content-reuse licence was found. Only names, serving labels and prices are transcribed; descriptive prose and images are not copied.

## Deliberately held

- Rows 1–9 are food. Rows 15–28 are cans or bottles and cannot be represented as draft beer. Rows 55–56 are passito and port with no printed `calice` serving; their category is uncertain.
- Rows 58–59 print `GIN TONIC / LEMON` and `TANQUERAY TONIC / LEMON` as combined labels with one price each. They do not separately identify a Gin Tonic and Gin Lemon price, so no `gin_tonic`/`gin_lemon` offer is inferred.
- Rows 60–61 are generic long drinks, rows 62–68 amari/liqueurs, rows 69–75 spirits, and row 76 grouped soft drinks. These do not fit the currently permitted app drink-category/serving contract unambiguously; none are staged.
- The source-only manifest and this note are a review candidate. An independent reviewer must check every retained row against the exact pinned owner page, the venue identity, fee/minimum terms and source-use basis. Only then may a separate protected dry-run audit be considered. **No audit tag, seed tag, public D1 write, legacy price change or store release is part of this branch.**
