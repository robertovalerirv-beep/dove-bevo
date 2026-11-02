# Italian owner-menu cohort M

Status: proposed for the final protected read-only v3 audit. No production write occurs from this source commit.

Nine normal EUR menu amounts are tied to three exact existing catalogue venues in Firenze, Genova and Roma. No Google-review threshold is used. The three venue-owned source pages were fetched directly on 2026-11-02 and their normalized `html_text_v1` digests matched repeat reads and the hosted v2 read-only audit. No current/customer price, pending report or hidden entry was visible for these exact keys in their public cells. The protected v3 audit must still check private tables and static identities before any seed tag.

| Venue and exact node | City and cell | Proposed normal menu amounts | Owner source |
| --- | --- | --- | --- |
| Kikuya, Via dei Benci 43R, `n2361866569` | Firenze `srb0b` | Classic Spritz EUR 7.50; Virgin Mojito EUR 6; still or sparkling water EUR 2 | https://www.kikuyapub.com/ |
| Bar degli Aperitivi, Via Ippolito D Aste 1-3-5R, `n911863120` | Genova `spyke` | named Gin Tonic EUR 16 | https://www.bardegliaperitivigenova.it/menu-digitale/ |
| Roma Beer Company Ponte Milvio, Piazzale di Ponte Milvio 40-42, `n5730113518` | Roma `sr2ye` | Aperol Spritz EUR 8; Gin Tonic EUR 10; Gin Lemon EUR 10; Negroni EUR 10; non-alcoholic Tramonto EUR 10 | https://www.romabeercompany.it/birre_rbc_cocktail/ |

These are menu amounts, not all-in bills, paid observations or confirmed customer contributions. The inspected pages do not state a mandatory service or cover charge for these items; that is not a guarantee about a later bill. Kikuya's happy-hour prose has no priced item used here. Genova's other named variants remain for app-only v2; its EUR 13 non-alcoholic drinks exceed the present v1 importer range. Roma Beer Company uses explicit group prices on its current owner cocktail page. Its 50 cl named beer and named Prosecco glass are held for app-only v2 because the legacy generic labels lose item/serving specificity.

Two prior read-only audit tags remain immutable and will never be seeded. V1 rejected Torino because the draft used unrounded OSM coordinates instead of exact published static coordinates. V2 corrected the coordinate, then rejected Torino after its menu source returned a different normalized digest to the hosted checker. The remaining Firenze, Genova and Roma groups each completed v2 dry-run with their rows eligible at read. Torino's two prices are now held until source stability and any cover-charge conditions can be represented. No writes occurred in either failed audit. The v3 audit is still required for this exact nine-row manifest.

Source-use review found no explicit extraction ban on these venue-owned pages or linked site information, but no general reuse licence is inferred. This small set records factual names, servings and amounts with source URL and pinned digest, not menu artwork or full creative text. Stop if a source changes or a restriction is found.

The legacy website, customer contributions, moderation tables and EUR API remain unchanged. The importer uses exact venue key, category and normal-price key; it refuses overwriting an existing current or historical price and refuses reported or hidden venues. Run immutable-source CI and the protected v3 read-only audit first, inspect every group receipt, then run the explicitly pinned v3 seed tag only if all nine remain eligible. Independently verify affected public cells and preserve raw audit/seed receipts and exact branch head in release evidence before normal merge.
