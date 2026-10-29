# Exact resume checkpoint — one-time European menu seed

Saved 29 October 2026 at the owner's request because credits were ending. **Work is stopped. Nothing from this seed has been deployed, imported, merged to main or distributed as a new mobile build.** Do not resume on a timer or background trigger; wait for the owner to resume.

## Objective and boundaries

Implement one sourced venue/menu-price seed across major European cities, then let customers add and update observations normally. Preserve Roberto's business plan and current layout. The latest direct import request is the root coordinator's narrow authorization for necessary import support; older app-only instructions still forbid unrelated changes. One freshly spawned writer interpreted its refreshed instructions as prohibiting backend/schema changes and made no edits; root therefore owns the draft backend patch. Recheck the current instructions and actual request before any live deployment. No further approval has been requested or received in this checkpoint.

Keep everything under `C:\Users\stefa\OneDrive\Dove Bevo`; Roberto's `robertovalerirv-beep/dove-bevo` is canonical. Never touch credentials, `.env*`, `.dev.vars*`, old unrelated worktrees or the existing main checkout's many deleted files. No Google Maps scraper, paid AI API, recurring crawl, new Cloudflare resource or invented public data. Firecrawl credit balance was **-41**, so no Firecrawl retrieval/job was executed; available web retrieval and direct bounded first-party GETs were used.

## Frozen branches

| Worktree under the selected project | Branch | State at pause |
| --- | --- | --- |
| `europe-menu-seed-20261029` | `codex/europe-menu-seed-20261029` | Root integration; new backend/API, schema and this resume record are checkpointed here. Base is owner main `1a58d7332d4275e0a56ed21c60240459afab1a5e`. |
| `europe-menu-web-20261029` | `codex/europe-menu-web-20261029` | Clean at **`074115f0407a907d554e2b24974535601806af75`**. Web provenance display only; not integrated. |
| `europe-menu-native-20261029` | `codex/europe-menu-native-20261029` | Clean tracked files at **`df419c225f584a74af44a4642377ba8240e2c37b`**; owned untracked `.task-tmp/` preserved. Android repair only, based on mobile branch `80e05589bc63f52ec2e69335ceeb06df76ef86d4`. |
| `europe-menu-backend-20261029` | `codex/europe-menu-backend-20261029` | Unchanged clean base `1a58d733…`; unused writer made no edits. |

Root owns branch pushes and the single canonical UOS handoff. Obtain the root checkpoint's final SHA from `git log -1` and remote readback; this document intentionally does not embed its own commit hash.

## Implemented and verified

Root backend paths: `migrations/0010_menu_seed.sql`, `src/shared/menu-seed.ts`, `src/worker/lib/db.ts`, `src/worker/routes/venues.ts`, `tests/worker/menu-sources.test.ts`, and ADR 0042.

- **0010** is a new, unapplied migration. It copies every existing current/history row and recreates `pc_cell`/`po_venue`, permitting source `menu` in addition to both legacy values. It creates `menu_seed_batches` and `menu_seed_prices`. No historical migration was edited.
- Batch fields: `batch_id` PK, `manifest_sha256` unique, `checked_on`, `applied` integer default 0. Source ledger: `record_hash` PK, batch, venue/drink/hh/cell/cents, currency constrained to EUR, checked/published dates, menu URL/item/serving/context and unique `source_obs_id`; unique venue/drink/hh.
- Public **GET `/api/venues/:key/menu-sources?c=<cell>`** returns `{prices:[{drink,hh,price_cents,checked_on,published_on,menu_url,menu_item,serving,context}]}`. Exact visible venue and cell are required. Duplicate/extra/bad query parameters fail. Only an active current `menu` row with the exact matching owned history observation and fingerprint gets metadata. Response is `no-store`, under existing GET guards.
- Existing **seven-element price tuples and cell keys `p,u,pend,h,g` are unchanged**. No privileged import HTTP endpoint was added.
- Actual local workerd/D1 tests: **11 passed**, including legacy payload shape, visible source, hidden/pending/wrong-cell rejection, missing/wrong owner observation, stale fingerprints and a real customer POST replacing menu provenance. Worker TypeScript compilation passed. Initial failures were fixture omissions of mandatory `venues_hidden.name/day`, corrected after reading the schema.
- Independent reviewer reproduced the wrong-owner flaw before the owner-history join and its rejection afterwards. SQLite in-memory preservation checks retained eight current rows/eight observation IDs, all four statuses, both legacy source values and both indexes. Final migration preservation still needs a dedicated D1 regression; no production D1 migration has run.

Web **074115f** changes six files under `src/app` and tests only. Its bounded source reader allows 18 rows, 64 KiB, 8 seconds; validates exact fields, HTTPS URLs without credentials, real nonfuture Rome dates and item/serving/context lengths (200/200/1024; URL 2048). Metadata must match drink, HH, cents and observed day. It retires stale venue requests, labels official-menu rows and source links, hides only their Confirm action, and retains Changed/Report. Existing receipt layout is preserved in IT/EN. Actual lane checks: **446 unit tests**, **8 new Chromium/WebKit UI checks at 390×844**, **3 existing receipt checks**, types/lint/format/build all passed. Its endpoint was mocked: **integration with root's real endpoint remains pending**. Independent review remains pending. Original screenshot is in that worktree's ignored `test-results/menu-sources-official-sour-bc544--and-keeps-customer-actions-chromium/official-menu-receipt-390.png`.

Android **df419c2** changes only `FavoriteComparison.java` and its JVM test. Finite world coordinate bounds replace the Italy-only box; exact geohash-cell validation remains. Paris/Berlin/Madrid positives, wrong-cell and invalid-number/coordinate negatives were added. Actual lane checks: **72 JVM tests**, **13 release guards**, lint **0 errors/23 known warnings**, Debug APK built; independent source/XML review approved. The APK is unsigned Debug QA, not a distributed update. APK SHA256 `9105ea62775b5d7058e2d8ef10f7a1d3e5a09c0b772010a6c222c9a9ff951c2b`.

## Explicitly NOT implemented

**No catalogue merge, OSM identity lookup, source-to-price extraction/validation CLI, actual seed manifest, frozen 0011 data migration, rollback tool, public import or combined deployment exists yet.** `scripts/menu-seed/`, `tests/unit/menu-seed.test.ts` and `seed-data/europe-venues.geojson` do not exist. Catalogue work was exploration/design only; no catalogue patch or new test was written. Do not mistake proposed interfaces for completed code.

GBP/non-EUR data is unsupported by current public and native price contracts; never relabel or silently convert it. Current nine drink categories and price ceilings stay unchanged. Beer is the existing 400 ml draft category; bottles, pints and other explicit volumes are not interchangeable. Do not silently broaden restaurant/café classification: verify exact OSM identity and actual amenity, allowing only deliberately approved bounded seeds.

## Source evidence already on disk

`C:\Users\stefa\OneDrive\Dove Bevo\test-evidence\europe-menu-seed-20261029\sources\collection.json` records **16 successful HTTP 200** source fetches, exact raw SHA256, filenames, final URLs and sizes. Original HTML/PDF and normalized text are beside it. Fetch script: selected-project `.task-tmp/europe-seed-collect.py`; maximum three requests concurrently, 2 MiB per response, 25-second timeout. No public mutation occurred. Keep complete menus out of public Git; commit short factual evidence and hashes only.

These are **candidate facts**, not approved imports. Counts are claims on the business's own site, not a fresh Google API attestation:

| City / candidate | Own-site Google count and menu URLs | Candidate prices / holds |
| --- | --- | --- |
| Firenze — I Portici, Piazza dell'Isolotto 3/4r | `https://iporticifirenze.it/` claims 360; `https://iporticifirenze.it/menu/` | Spritz Aperol €7, Gin Tonic €7, Gin Lemon €7, Sbagliato €7. Distinct existing codes. Volumes unspecified. |
| Roma — Misto, Via Fezzan 21 | `https://mistococktailbar.it/` claims over 470; `/menu/` | Beefeater/Three Cents Gin Tonic €10; zero-alcohol version €9 is NOT ordinary gin tonic. Named wine prices require exact item selection. |
| Roma — Suburra 1930, Piazza della Suburra 13/15 | `https://suburra1930.it/` claims 668; `/menu-bevande/` | Spritz €8, alcohol-free cocktail €6, wine glass €6, treated water €2. Generic classics price is not proof of a named Negroni. |
| Paris — Café Albert, 117 rue Ordener | `https://lecafedalbert.com/` claims 1716; `/carte/` | Classic **Cinzano** Spritz €10, Beefeater GT €10, Negroni €10; specified Spritz/GT HH €8 daily 17–20. XXL €14 is a different variant. 25/50 cl beer does not equal existing 400 ml beer. |
| Berlin — Oase Deluxe, Karl-Liebknecht-Str. 11 | `https://www.oasecocktail-berlin.de/` claims 1500+; linked PDF at `https://dcsmjrhynn8lk.cloudfront.net/ab673502-c5f7-4080-8056-65d426955626/Oase-Deluxe-cocktail-menu.pdf` | Reported PDF p6 Spritz €10.90 normal / €7.90 HH 14–05. **Visually recheck the table and stale filename before freezing**. |
| Madrid — Lima Nikkei, C. de Rosario Pino 8 | `https://limanikkeimadrid.com/en/` claims 1446; `/en/carta/` | Negroni €12.50, Aperol Spritz €10.50, water €3.50. Check venue amenity/category. |
| Torino — MeiShi, Corso Cosenza 22/B | `https://ristorantemeishi.it/` claims 1966; `/cantina/` | Spritz/Sbagliato €7. **Restaurant amenity may make it ineligible for the existing bar catalogue**. Alternative Open Baladin has publisher count 6048 but its current Qodeup menu could not be fetched; indexed prices are not fresh verification. |
| London — FiLLi Islington, 1 Lever St EC1V 3QU | `https://fillicafe.com/uk/stores/london/islington` claims 649; linked `/uk/menu` | Still/sparkling water **£2.69 GBP: HOLD**, no conversion. Café classification and exact identity pending. |

Every candidate still needs a stable OSM key, coordinates/geohash, city attribution, deduplication and matching live data. No OSM lookup has yet been executed. Do not fabricate an n/w/r key or coordinate. Review eligibility is **strictly >100**, not >=100. Missing or ambiguous facts remain held.

## Resume in this order

1. Read this note and ADR 0042; inspect all three branch statuses/HEADs and remote readbacks. Preserve owned temporary files. Read the current authoritative UOS handoff; do not use old mirrors as recall.
2. Independently review web `074115f`; cherry-pick it into **root seed branch** after review. **Do not cherry-pick Android df419c2 into the backend branch:** mobile source is not on main. Keep Android release on its existing mobile-base branch.
3. Implement catalogue support in an isolated writer lane. Proposed core: optional fourth `buildDataset` argument with a strict FeatureCollection (metadata `version_floor: "20261029"`, maximum 250 Point features, canonical unique positive n/w/r keys, permitted amenities/city nodes, Europe box south34/north72/west-25/east45). Normal PBF features retain Italy validation; only exact seed keys may be outside it. Existing PBF wins key collisions; no duplicate venues/cities/counts. Permit café only when explicitly seeded, keeping bulk exclusion unchanged. Fixed input `seed-data/europe-venues.geojson` ≤512 KiB; fixture runs skip it. Version floor only for production; later PBF date wins. Extend output checker only for exact seed identities/geohash. Write positive Paris/search/cell and negative unapproved/malformed/duplicate/limits tests.
4. Obtain exact OSM identities and source-backed coordinates for qualified venues/city nodes. Keep OSM data separate from prices/review audit. Verify **20261029** is unused before publishing immutable data URLs; live baseline was 20261027.
5. Implement offline CLI `node scripts/menu-seed/plan.mjs --manifest FILE --sources COLLECTION.json --out-dir NEW_DIR`. Proposed manifest: schema `dovebevo-menu-seed/v1`, batch_id, checked_on, venues with key/cell/city, optional name/lat/lon, currency, review_evidence `{url,count,sha256,excerpt}`, menu `{url,sha256}`, prices `{drink,hh,price_cents,menu_item,serving,context,published_on,evidence_excerpt}`. Validate actual cached raw SHA/excerpts and first-party menu link/host, >100 count, EUR/catalog caps, unambiguous item/serving, dates, URL/text/byte bounds and exact geohash. Produce explicit HOLD reasons, never guessed values. Export report/apply.sql/rollback.sql to a new directory; CLI has no credentials or remote writes.
6. SQL must guard inside the atomic mutation against ANY existing current status, prior history, reports, hidden venues and pending/removed user venues. Ordered conditional current→history→ledger statements may use `changes()` and `last_insert_rowid()` within the migration transaction. Gate all work and cache invalidation on exact batch hash plus `applied=0`, then mark applied=1. Replay must perform zero writes; different manifest/same batch must fail or explicitly hold. Rollback may remove only exact untouched owned rows with zero confirmations/no customer history or moderation; never remove catalogue keys after customer activity. Add real SQLite/D1 replay/race/customer-preservation tests before generating **0011**.
7. Root runs fresh combined unit/Worker/type/lint/build/e2e checks, migration/data snapshot preservation, 390 px source display against the real endpoint and legacy native payload contract. Review generated SQL and counts independently. Only then push PR, merge through green CI, let existing **Deploy staging** generate catalogue → build → apply migrations → deploy. Do not manually apply remote D1 or add an unrestricted endpoint. No new recurring job.
8. Read back health/data_version, selected static venue/search entries, cell price rows and source metadata; report inserted/skipped counts accurately. Existing public Android20/iOS26 reviews and build36 testing remain separate. Distribute the narrow Android compatibility update through the gated mobile build only when ready; source/tests are not a released update.

## Environment and continuity

Node24.19.0/npm11.17.0 available. Root `node_modules` is a junction to `app-improvements-20261028/node_modules`; both package locks SHA256 `538577571b9655471cc58fa4cc3ab39a4c78518a56884e6d055762c9fbf2f8a3`. Web lane copied existing dependencies into its ignored node_modules. No new dependency installation required. Default Python has neither pypdf nor bs4.

Android approved JDK: `C:\Users\stefa\AppData\Local\DoveBevo\sdk\jdk21`; SDK `C:\Users\stefa\AppData\Local\Android\Sdk` contains **android-37.0** (not android-37) and android-36. Shared Gradle cache `app-release/mobile-apps/android/.gradle-user-home`; distribution `gradle-9.3.1-all/9ot9r568e8zfvvd4mn8rbu1j0/gradle-9.3.1/bin/gradle.bat`. Keep TEMP/builds/logs selected-project-local. No emulator or desktop control is running.

UOS memory bootstrap returned **Authority snapshot tracked bytes are unreadable**. Do not treat installed UOS main or OneDrive PublishedMemory as recall. Verified global project route is `uos`; current task journal is `uosj-48cc17664bc5eefb5d5556cac7b85b12`, revision1 before pause finalization. Root must finish final checkpoint → one handoff → bind/publish/sealed-receipt close. The root resume note and branches remain usable even if canonical publication is blocked; never dismiss a bound journal. Previous feature journal is closed; do not reuse it. All agent commands finished and no provider mutation/background job remains active at pause.
