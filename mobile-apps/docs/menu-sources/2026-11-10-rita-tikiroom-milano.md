# Rita's Tikiroom, Milano: first-party QR menu review

This is an app-only **candidate** for the guarded one-off mobile menu importer. It is not a live seed, a customer observation, or evidence that the public app currently shows these prices. Review the exact source and protected dry-run receipt before any seed tag.

## Venue identity

- Existing Roberto static venue: `n1853370614`, cell `u0nd8`, city `Milano` (`62505581`), `Rita's Tikiroom`, `Ripa di Porta Ticinese 69`, `45.45049, 9.16952`, kind `1`. The live `20261108` static cell at `https://www.dovebevo.com/data/20261108/v/u0nd8.json` contained this exact tuple on 10 November 2026.
- The [owner homepage](https://www.ritastikiroom.com/it/) gives Ripa di Porta Ticinese 69, Milano, and the [OSM node](https://www.openstreetmap.org/node/1853370614) gives the same name, address, owner website and coordinates. Its source OSM coordinates have more precision than Roberto's static display tuple; the manifest deliberately uses the static tuple.
- Live app-only v2 route `https://www.dovebevo.com/api/mobile/v2/menu/venues/n1853370614?cell=u0nd8&limit=100` returned `stored_offer_count: 0` on 10 November 2026. This is only the state observed then, not a promise that the venue has no legacy or later prices.

## Price source and transcription

- [Owner-published QR menu](https://www.ritastikiroom.com/qr-menu-new/) on the same domain as the owner website. The menu footer links back to the owner website, and the owner website identifies this single Milan branch. We inspected the 10 November 2026 HTML; the page does not itself state a valid-until date.
- Three direct fetches with the importer's `DoveBevoMenuAudit/1` user agent returned HTTP 200, no redirects, HTML, and exactly 91,486 bytes. Raw SHA-256 was `01868a6779cf7da8e444f3192fe399ee43a16aedc0849a96b5b2c3dd647eb65e` each time. The importer's `html_text_v1` visible-text SHA-256 was `6a8d845c00b5c7dd9db10f810b9d50019e1f860a1bd0ad2653818c5bb411ee46` each time. The manifest pins the latter as both source hash fields, per this format.
- The manifest contains **58 individually priced drink/serving offers at one existing venue**: 41 cocktails, 6 entries in the owner's `Virgin forest` section, 2 draft beers, and 9 glass/bottle wine or Champagne offers. These are original EUR menu prices, not a generic estimated drink price. The owner depicts wine glass and bottle columns with `glassbottle.png`; the manifest labels the corresponding first/second prices `Glass`/`Bottle` without guessing a volume. No prices were converted or averaged.
- We removed only the editorial `– NEW` suffix from three cocktail names, and shortened the first draft-beer name to its displayed brand/product prefix rather than copying a sentence-long description. The source line remains identified in each evidence pointer. Ingredient descriptions and images are not copied.
- The menu does not establish a blanket service-fee rule. Empty `fees` and `fee_coverage` mean **fee scope unknown**, not zero fees. It also does not state drink sizes, so all `serving_ml` values are null. `Kombwine` is not tagged as alcohol-free because the menu does not establish its alcohol content. The other alcohol-free tags require the explicit `0% VOL` in their names.
- The owner may update menu items or prices. The protected importer must fail closed on a changed visible-text digest, changed static tuple, hidden/reported venue, or D1 conflict. Check the dry-run receipt before tagging a seed. No public D1 write or customer contribution was made while preparing this candidate.

## Local verification

- All 58 offer pointers were checked against the third independently fetched HTML snapshot: each named `<h4>` contained the manifest name, and its exact EUR amount matched the appropriate single, first-glass or second-bottle price column. This also found no duplicate offer tuple.
- `python -m unittest test_rita_tikiroom_manifest test_seed_manifest test_margo_torino_manifest`: 3 passed.
- `python -m unittest test_import_v2.ImportTests.test_dry_run_apply_retry_and_legacy_preservation`: passed.
- Full local v2 importer suite: 33 test methods ran, with one method failing in four tag-variant subtests. On this Windows host `wsl.exe` reports `/bin/bash: No such file or directory`. No protected audit/seed workflow was attempted, and this environment failure does not validate the release gate.

## Other inspected sources held

- `EDIT Porto Urbano`, Torino: its [owner HTML menu](https://editspace.com/menu-edit-porto-urbano) had many priced drinks, but the footer changed its visible-text hash across consecutive fetches. The importer would intermittently reject the pinned source even when drink prices stayed unchanged. No EDIT manifest is included.
- Spiller Milano: the [owner menu page](https://spillerbirrerie.it/menu/) links its Milano dinner PDF, but the PDF measured 8,407,900 bytes, above the importer's 8,388,608-byte source guard. No guard was widened and no Spiller manifest is included.
- Scott Duff, Milano: its owner menu was promising, but Roberto main already has three manifests for this venue, so a new candidate here would duplicate prior work.
