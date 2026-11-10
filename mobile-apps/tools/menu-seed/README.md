# Offline menu evidence planner

This tool checks a bounded, locally prepared batch of menu evidence and writes a deterministic review report. It never downloads data, calls an API, executes SQL, changes a database, or publishes prices. Every report has `publication_blocked: true` and `public_imports: 0`; `evidence_qualified` means only that the supplied evidence passed these mechanical checks, not that it is authentic, current, legally usable, or approved for publication. No public contributions are made during testing.

The current backend boundary does not authorize menu price imports. The public price GET omits removed prices, history and moderation state; ordinary POST is unsuitable because it can fabricate a manual contribution or overwrite customer confirmations. Any future publication requires separate authorization and a guarded complete snapshot plus atomic preservation of all statuses and customer state. Worldwide comparison is not established; the Android 52 catalogue is Italy-bounded.

## Run

Requires Python 3.9 or later, standard library only. From the repository root:

```powershell
python -B mobile-apps/tools/menu-seed/planner.py --input <batch.json> --evidence-root <local-evidence-directory> --output-dir <new-report-directory>
python -B -m unittest discover -s mobile-apps/tools/menu-seed -p test_planner.py -v
```

The output directory must not already exist and its parent must exist. Validation failures exit 2. A successful run creates `report.json` and prints its digest and summary; it still cannot publish. Output is canonical UTF-8 JSON with a SHA-256 `plan_digest` calculated over the report before adding that field. `input_digest` uses the same serialization on the input object. Retain the exact input and pinned files securely for replay; do not commit actual source evidence or credentials.

## Batch v1

Input is strict JSON: unknown or duplicate fields, nonfinite numbers, excessive sizes, symlinks and path traversal are rejected. All fields shown below are required, including nulls. Paths are relative POSIX paths under the evidence root; each file has a unique path, lowercase SHA-256 and exact byte length. URL metadata must be public HTTPS without credentials, query or fragment. The program does not fetch or verify the URL, capture process, date, or rights. `checked_on` is the actual capture date, no later than `as_of`; optional `published_on` must be supported by its literal publication-labelled excerpt or the source is held.

```json
{
  "schema_version": 1,
  "batch_id": "review-001",
  "as_of": "2026-10-30",
  "catalogue": {
    "data_version": "20261028",
    "cells": [{"cell": "sr2yk", "path": "cell.json", "sha256": "<64 lowercase hex characters>", "bytes": 123}]
  },
  "sources": [{
    "id": "menu", "path": "menu.html", "sha256": "<64 lowercase hex characters>", "bytes": 123,
    "url": "https://example.com/menu", "media_type": "text/html", "representation": "raw_http",
    "checked_on": "2026-10-29", "published_on": null, "published_excerpt": null
  }, {
    "id": "google", "path": "google.txt", "sha256": "<64 lowercase hex characters>", "bytes": 123,
    "url": "https://www.google.com/maps/place/example", "media_type": "text/plain", "representation": "browser_visible_text",
    "checked_on": "2026-10-29", "published_on": null, "published_excerpt": null
  }],
  "candidates": [{
    "id": "candidate-1",
    "venue": {"cell": "sr2yk", "key": "n123", "name": "Example Bar", "address": "Example Street 1", "identity_source_id": "menu", "identity_excerpts": ["Example Bar", "Example Street 1"]},
    "review": {"kind": "google_visible", "source_id": "google", "excerpt": "Example Bar | Example Street 1 | 101 reviews", "count": 101},
    "prices": [{"id": "price-1", "drink": "negroni", "cents": 800, "currency": "EUR", "hh": 0, "item": "Negroni", "serving": "single", "context": "", "source_id": "menu", "excerpt": "Negroni €8.00", "amount_literal": "€8.00", "hh_excerpt": null}]
  }]
}
```

This is a schema illustration, not a runnable fixture: replace the placeholders, bytes, cell and excerpts with real, matching local files. The catalogue file is a pinned copy of the public JSON rendered in the browser, not proof of its HTTP origin. Its structure is `{"c":[[cityId,cityName]],"v":[[key,name,kind,lat,lon,address,cityIndex]]}`. City index may be `-1`; kinds are integers 0–4 (cafe, bar, pub, biergarten, nightclub). The key must be an existing OSM node, way or relation key and coordinates must encode to the declared geohash5. Name and address must match the catalogue and the supplied identity excerpts. Every price source, including a separately hosted menu, must itself contain those same literal identity excerpts; a shared hostname alone is insufficient. Matching normalizes accents, case and punctuation but retains address tokens such as unit numbers.

Menu HTML must be UTF-8 raw bytes and contain the literal normalized identity and price excerpts. The parser ignores scripts, styles and some inline hidden elements but does not execute JavaScript or CSS and cannot attest rendered visibility. PDFs are accepted as pinned evidence but always held because extraction is not audited. The review source must be a pinned Google capture with the same venue name and address. If a labelled review count is shown, supply its exact integer value from 0 to 100 million; there is no minimum. If the pinned capture has no labelled count, set `count` to `null` or omit it. A labelled count elsewhere in the same capture cannot be hidden by selecting a shorter excerpt. Publisher claims cannot establish Google evidence. Text capture and source URL remain user-supplied assertions, not independent provenance verification.

Price categories and inclusive EUR cent bounds are `beer_draft` 250–1200, `spritz` 250–1500, `negroni`, `sbagliato`, `gin_tonic`, `gin_lemon` 400–2000, `wine_glass` 200–1500, `alcohol_free` 200–1200 and `water` 50–600. No currency conversion occurs. Draft beer requires explicitly evidenced 400 ml; wine requires a glass. `hh` is integer 0 or 1; happy-hour rows need a same-source excerpt identifying item, amount and times. Ambiguous packages, ranges, large or shared servings, zero-alcohol conflicts and duplicate venue/category/happy-hour rows are held for review. Happy-hour clock values must be valid hours and minutes, and review-count thousands separators must use complete three-digit groups. The checks are deliberately conservative and cannot infer that an excerpt reflects a complete menu or guarantee a semantic match.
