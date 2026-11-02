# Additive Berlin catalogue and two reviewed menu variants

Prepared locally on 2 November 2026. No publication, deployment, provider query, DB audit or price import is claimed. This cohort uses retained research; raw private provider responses, menu PDFs/images, personal reviews and credentials are not committed.

The active catalogue grows from 24 to 34 venues, adding only ten independently joined Berlin identities under the unchanged builder rules. All original 24 venue objects remain identical. `mobile-apps/data/europe-catalogue-baseline-20261101.json` preserves the original catalogue bytes and SHA-256 `3e7bcc7f44ed3a52d22c666db5febb433ddb343379b96a4085d191f5c811c497`. The old 20261101 inputs/proof and original 21-row menu manifest remain unchanged; their frozen historical tests remain in place.

New catalogue version: `8dba6d321be21f71`; LF-byte SHA-256: `3608eeed8bdd200c3d388bc9a24c47c651202b43f7f7149daf9b358d713fcb5b`. New proof: `mobile-apps/data/europe-catalogue-evidence-20261102-berlin.json`. The combined input directory `mobile-apps/data/europe-catalogue-inputs-20261102-berlin` copies the six historical source files byte-for-byte and adds curated Berlin public business fields plus the narrow OSM candidate set. `source-provenance.json` pins original raw-source hashes and curated-input hashes, describes filtering, and preserves six price holds. No new Google browser/provider check is implied: retained review counts were checked on 1 November, and the complete narrow OSM response is dated 2 November.

The ten additions are Bar Zentral, Vincent Piano Bar, Newton Bar, Bar Tausend, Honey Lou Bar, The Wash Bar, Mein Haus am See, Windhorst, The Curtain Club and Monkey Bar. Each has exactly one match under exact normalized name within 60 m, or matching official site plus name similarity at least 0.8 within 40 m. The unchanged builder rejects ambiguous matches and unsupported amenities. Country/currency/geohash/name/review-count contract checks remain unchanged.

Only Monkey Bar (`n2727229961`, cell `u336x`) has seed rows:

| Menu item | Drink | Band | Currency/minor units | Exact serving |
| --- | --- | --- | --- | --- |
| Aperol Spritz | spritz | ordinary, 0 | EUR 1200 | drink |
| Soda Water [still/sparkling] | water | ordinary, 0 | EUR 300 | 500 ml |

These are literal prices, not inferred minimums. Three EUR 13 no-alcohol cocktails exceed the unchanged EUR 12 category cap and remain held. Three explicit 125 ml wines would all share `wine_glass/0/EUR/glass:125`, with prices EUR 11/9.50/9.50; all remain held rather than silently selecting a wine or a minimum. Research `unit:ml` is not a valid wine serving: the contract requires `unit:glass` with the explicit volume. Beer method, arithmetic gin-plus-tonic prices, vague “from” specials, Oase identity and Wash low-alcohol ambiguity remain outside this batch.

Manifest: `mobile-apps/data/europe-menu-seed-berlin-20261102.json`; LF-byte SHA-256 `e8276f8c35738d5fafa580ea19e0c1332718857f52077ddcefcd897e8a5f07be`. Its sole source is the [current-linked official Monkey Bar PDF](https://monkeybarberlin.de/wp-content/uploads/sites/11/2023/11/25hours_hotel_bikini_berlin_monkey_bar.pdf), linked by the [official drinks page](https://monkeybarberlin.de/drinks/), checked 2 November 2026. Raw PDF SHA-256 `af0fd673aec3f701d627726795ed070242a0e3d45b6affc86b403978f6116637`, 1,883,886 bytes; source representation `pdf_raw_v1`. Pages 1–3 and legible detail crops were visually inspected in retained project evidence. The Euro notice is on page 3. The older URL date is not claimed as a publication or visit date.

Reproduce the complete catalogue/proof with the unchanged builder:

```powershell
python -B mobile-apps/tools/europe-catalogue/build_catalogue.py --inputs mobile-apps/data/europe-catalogue-inputs-20261102-berlin --output public/mobile-data/catalog.json --evidence mobile-apps/data/europe-catalogue-evidence-20261102-berlin.json
python -B -m unittest discover -s mobile-apps/tools/europe-catalogue -p 'test_*.py'
python -B -m unittest discover -s mobile-apps/tools/europe-menu-import -p 'test_*.py'
```

Historical reproduction tests freeze their evidence day at 2 November. The builder CLI deliberately checks current source freshness; a later stale-source failure requires fresh evidence, not bypassing that guard.

After independent review, the coordinator may integrate/deploy the additive catalogue and use the new exact audit tag `mobile-berlin-menu-audit/20261102-v1`. The separate exact seed tag is `mobile-berlin-menu-seed/20261102-v1`. Neither has been created by this preparation. The workflow pins the manifest, uses existing protected CF secrets and shared import concurrency, and invokes the unchanged importer. Its normal audit must verify live catalogue/version/hash, the currently linked exact PDF bytes and D1 state before application. Existing source/current/history, reports, hidden/moderation barriers and the 100-variant cap still block overwrites. No customer confirmation or paid date is fabricated. This cohort does not change the existing 50 actual prices or claim that two new rows are already present.

The original manifest keeps its old 24-venue catalogue pin. Once an additive catalogue is deployed, replaying that old manifest should fail its frozen catalogue check; do not rewrite the historical manifest or weaken the pin to make a replay succeed.
