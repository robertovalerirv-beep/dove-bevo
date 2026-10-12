#!/usr/bin/env bash
# Same as the CI job "OSM import on a test PBF" (needs osmium).
set -euo pipefail
tmp="$(mktemp -d)"
trap 'rm -r "$tmp"' EXIT
osmium cat tests/fixtures/osm/sample.osm -o "$tmp/sample.osm.pbf"
bash scripts/osm-import/import.sh "$tmp/sample.osm.pbf" "$tmp/data" fixture >/dev/null
node scripts/osm-import/compare-cell.mjs "$tmp/data/fixture/v/u0nd9.json" tests/fixtures/osm/expected-u0nd9.json
