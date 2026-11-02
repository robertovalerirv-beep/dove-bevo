# Italian cohort G: four prices published, seven held

This cohort contains eleven existing-venue price facts in Parma, Modena and Brescia. The protected apply inserted four Mondo Liquido prices. Three Birrlandina facts failed the fresh source fetch before binding or database access; four Tonic facts remained unapproved and unattempted. This is a partial result, not an eleven-price success.

All original menu, serving and source hashes are unchanged. Scope is EUR normal-price categories, without a Google review minimum. Mondo water/large upgrades/premium gins, ambiguous Tonic variants and all mandatory-cover Birrodromo facts remain excluded. A menu-check date is not evidence of a customer payment date.

## Audit and apply evidence

- Manifest SHA256: `85d71fa3bb484b734fa034ffa303110f5505f62fb05f712b6ec4fd43d613ae12`.
- Audit run `41462923492`, artifact `13150740811`, ZIP SHA256 `8a2708d469148756c06301d22772daa7559d061074707fb4ba96770f55501220`: groups 1 and 2 contained seven eligible facts, all four guard counts zero, identical empty before/after current state, no errors or cache invalidations. Tonic group 0 fetched its menu but failed preflight before binding. Only groups 1 and 2 were approved.
- Apply run `41464943802`, exact head `07b9769416e26eb6b97db1f943ac9d62e60ec3ed`, artifact `13149759319`, ZIP SHA256 `fdeefa6bad32d65ec6441453e6ded083e0ee6aaf849ef6eef54d7d2f4bb4e58e`: Mondo group 2 inserted four, with zero skips or indeterminate outcomes. Birrlandina group 1 failed source fetch before binding/query, with no record outcomes. Overall run conclusion remains failure.
- Independently verified exact database after-state, zero initial confirmations, date, active status, cell invalidation and public receipt for all four Mondo facts. Coordinator fresh public reads at `2026-11-02T15:21:18Z` verified all 96 newly imported rows from D/E/F/G across 36 venues, 18 cities and 20 cells. Provider ZIP digests, exact heads and unique inserted identities were checked again for all five apply artifacts.

The combined counts are in `mobile-apps/data/italy-menu-release-evidence-20261102.json`. They describe this expansion only, not complete city or Italy-wide coverage. Seven G facts remain held; successful host fetches do not replace a failed hosted source gate. No source repinning or access bypass was used. The original importer, source-isolation code and atomic customer/history/report/hidden guards remain unchanged.
