# Italian owner-menu cohort M

Status: proposed for a protected read-only audit. No production write occurs from this source commit.

Six normal EUR menu amounts are tied to three exact existing catalogue venues. No Google-review threshold is used. The three owner-hosted source pages were fetched directly on 2026-11-02, their normalized `html_text_v1` digests were stable across repeat reads, and no customer price, report, or hidden entry was visible for these exact venue keys in their public cells. The protected audit must still check the private tables and static identities before any seed tag.

| Venue and exact node | City and cell | Proposed normal menu amounts | Source |
| --- | --- | --- | --- |
| Birrificio La Piazza, Via Durandi 13, `n5257878293` | Torino `u0j2q` | medium draft beer EUR 6.50; water 0.5 L EUR 2 | https://birrificiolapiazza.com/il-menu/ |
| Kikuya, Via dei Benci 43R, `n2361866569` | Firenze `srb0b` | Classic Spritz EUR 7.50; Virgin Mojito EUR 6; still or sparkling water EUR 2 | https://www.kikuyapub.com/ |
| Bar degli Aperitivi, Via Ippolito D Aste 1-3-5R, `n911863120` | Genova `spyke` | named Gin Tonic EUR 16 | https://www.bardegliaperitivigenova.it/menu-digitale/ |

These are menu amounts, not all-in bills, paid observations or confirmed customer contributions. The inspected menu pages do not state a mandatory service or cover charge for these items; that is not a guarantee about a later bill. Birrificio La Piazza has another branch at Via Perosa 32/A with different prices and an explicit free-cover statement; none of its prices are attributed to Via Durandi. Kikuya's happy-hour prose has no priced item used here. The Genova menu has multiple named variants; this cohort uses a single exact Gin Tonic and does not flatten its other cocktails into the legacy category. Its EUR 13 non-alcoholic drinks exceed the present v1 importer range and remain held for app-only v2.

Source-use review found no explicit extraction ban on these venue-owned pages or linked site information, but no general reuse licence is inferred. This small set records factual names, servings and amounts with the source URL and pinned digest, not menu artwork or full creative text. Stop if a source changes or a restriction is found.

The legacy website, customer contributions, moderation tables and EUR API remain unchanged. The importer uses exact venue key, category and normal-price key; it refuses overwriting an existing current or historical price and refuses reported or hidden venues. Run the immutable-source CI and protected read-only audit first, inspect every receipt, then run the explicitly pinned seed tag only if all six remain eligible. Independently verify all affected public cells and preserve raw audit/seed receipts and exact branch head in release evidence before normal merge.
