#!/usr/bin/env bash
# OSM import pipeline (SPEC 5.1): PBF → osmium filter/export → static files.
# Usage: scripts/osm-import/import.sh <file.osm.pbf> <public/data dir> [DATA_VERSION]
# Prints the DATA_VERSION (date of the PBF replication timestamp) on the last line.
set -euo pipefail

pbf="$1"
out="$2"
version="${3:-}"
if [[ -z "$version" ]]; then
  stamp="$(osmium fileinfo -g header.option.osmosis_replication_timestamp "$pbf")"
  version="$(echo "${stamp:0:10}" | tr -d -)"
fi
[[ "$version" =~ ^([0-9]{8}|fixture)$ ]] || { echo "Bad DATA_VERSION: '$version'" >&2; exit 1; }

tmp="$(mktemp -d)"
trap 'rm -r "$tmp"' EXIT

osmium tags-filter --overwrite -o "$tmp/filtered.osm.pbf" "$pbf" \
  nwr/amenity=bar,pub,biergarten,nightclub n/place=city,town
osmium export --overwrite -f geojsonseq --add-unique-id=type_id \
  -o "$tmp/features.geojsonseq" "$tmp/filtered.osm.pbf"
node scripts/osm-import/build.mjs "$tmp/features.geojsonseq" "$out/$version" "$version" >&2
node scripts/osm-import/check-output.mjs "$out/$version" >&2
echo "$version"
