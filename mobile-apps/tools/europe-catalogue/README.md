# One-off European app catalogue

This is a conservative identity join, not a complete European import. The first reviewed cohort contains 24 venues: London 4, Paris 14, Madrid 6. Every accepted venue has more than 100 Google reviews in the retained 1 November 2026 public business snapshot, and a unique corroborating OpenStreetMap identity and coordinate. Other cities remain held, and a venue does not acquire a price merely by appearing here.

The owner approved an apps-only European catalogue and currency-aware shared price storage on 1 November 2026. Existing Italian catalogue and website contracts remain unchanged. Only OSM bars, pubs, beer gardens and nightclubs are accepted. Cafes and restaurants are held rather than silently relabelled as bars.

`build_catalogue.py` reads saved public facts and never accesses credentials, mutates OSM or writes public prices. Source counts must be nonfuture and at most seven days old at execution. Google business facts contain no customer reviews, contributor identities or photographs. Retained OSM responses are public map data, not customer contributions to Dove Bevo.

Run from the repository root:

```powershell
python -B -m unittest discover -s mobile-apps/tools/europe-catalogue -p 'test_*.py' -q
python -B mobile-apps/tools/europe-catalogue/build_catalogue.py --inputs mobile-apps/data/europe-catalogue-inputs-20261101 --output public/mobile-data/catalog.json --evidence mobile-apps/data/europe-catalogue-evidence-20261101.json
```

The committed cohort test uses the historical observation date so that verification remains reproducible after the live freshness window. A later live expansion needs fresh observations; the historical test does not refresh review counts.

Inputs retain exact bytes because their SHA-256 hashes are evidence pins. Generated catalogue bytes are also pinned by the separate menu importer. Formatting them changes those pins and requires review. OSM facts are © OpenStreetMap contributors, available under the [Open Database Licence](https://www.openstreetmap.org/copyright). Google URLs and review counts identify the checked public business listing; venue/menu prices are verified separately against official venue sources. The website's existing map attribution remains visible.
