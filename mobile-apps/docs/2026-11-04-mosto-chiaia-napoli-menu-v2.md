# Mosto Chiaia: app-only live taplist snapshot

Checked on 2026-11-04. This is a proposed immutable menu-v2 snapshot for one existing Roberto venue. It is not a customer price report and has not been imported into production.

## Identity and source

- Existing published static venue: `n6449456089`, `sr60k`, `Mosto - Birra&Distillati`, kind `2`, `40.83504, 14.24118`, `Vico II Alabardieri 28`, Napoli. The importer `public_identity` check passed against the published `20261102` static cell.
- [Mosto's Chiaia location page](https://mosto.it/pages/dove-siamo) identifies the branch at Vico II Alabardieri 28. The brand's [MOSTO Linktree](https://linktr.ee/mostobirrerie) links `TAPLIST CHIAIA` directly to the branch-specific [live TapTally menu](https://taptal.ly/pubs/mostochiaia). The menu itself says `Mosto Chiaia` and lists the tap prices below. This is venue-published menu data, not a Google Maps price or an inferred price from reviews.
- Menu URL: `https://taptal.ly/pubs/mostochiaia`; `html_text_v1` SHA-256 `03f435422fe0e8744d1b34cd6f5f3dd9e31c4f5ed136cc91801ba997151e03e7`. Two independent fetches had the same normalized visible-text hash. The source is live and can rotate; a changed hash must stop the protected audit and prompt a new reviewed snapshot.
- Manifest: `3def3442dc16fe69dd3bc5da8dc12f48f2860cf3cbc169c7e9e76ac24fc101f9.json`, exact-file SHA-256 `3def3442dc16fe69dd3bc5da8dc12f48f2860cf3cbc169c7e9e76ac24fc101f9`.

## Factual offers

Each of the first ten taps explicitly lists three EUR prices: S €5, M €6, L €7. These letters are preserved as serving labels; the menu gives no volume, so `serving_ml` remains unknown. The eleventh tap states `Gin Tonic alla Spina`, 33cl, €8. This makes 31 offers. The beer styles, brewers, alcohol percentages and source images are not copied into the seed.

| Tap | Menu name | Category | S | M | L |
| --- | --- | --- | ---: | ---: | ---: |
| 1 | Vergin Hell | Draft beer | €5 | €6 | €7 |
| 2 | Osanna | Draft beer | €5 | €6 | €7 |
| 3 | Bock | Draft beer | €5 | €6 | €7 |
| 4 | Amen | Draft beer | €5 | €6 | €7 |
| 5 | Jamila | Draft beer | €5 | €6 | €7 |
| 6 | Queen Elizabeth | Draft beer | €5 | €6 | €7 |
| 7 | Almyrós | Draft beer | €5 | €6 | €7 |
| 8 | Crucifixio | Draft beer | €5 | €6 | €7 |
| 9 | Monaghan | Draft beer | €5 | €6 | €7 |
| 10 | Barry's Bitter | Draft beer | €5 | €6 | €7 |

The taplist has no explicit mandatory-fee statement, so the manifest records no fee row and does **not** claim fee-free service. The offers have `regular` context because the visible taplist gives no happy-hour, meal or other condition. A current price can differ after tap rotation; `source_checked_on` is the snapshot date.

## Guarded route

Only the two app-only files in this change are proposed. No website, backend, static catalogue, customer observation or public venue data is edited by this draft. An independent reviewer should check the current owner-linked taplist and exact branch identity. After merge, the separately authorized protected audit must re-fetch this exact menu hash and inspect conflicts; the later seed requires its successful receipt. A merged manifest alone does not publish 31 offers to users.
