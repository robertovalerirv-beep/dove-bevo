// OSM import CLI (SPEC 5.1): GeoJSON-seq from `osmium export` → data/<DATA_VERSION>/ files.
// Usage: node scripts/osm-import/build.mjs <input.geojsonseq> <outDir> <dataVersion>
import { createReadStream, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { buildDataset, centroid, ImportError } from "./osm.ts";

const [input, outDir, dataVersion] = process.argv.slice(2);
if (!input || !outDir || !/^(\d{8}|fixture)$/.test(dataVersion ?? "")) {
  console.error("Usage: build.mjs <input.geojsonseq> <outDir> <YYYYMMDD|fixture>");
  process.exit(2);
}

const KEEP = ["name", "amenity", "place", "addr:street", "addr:housenumber"];
const started = Date.now();
const features = [];
// Stream line by line and keep only a point and the needed tags: Italy does not fit as full JSON.
for await (const raw of createInterface({ input: createReadStream(input), crlfDelay: Infinity })) {
  const line = (raw.startsWith("\u001e") ? raw.slice(1) : raw).trim(); // RFC 8142 separator
  if (!line) continue;
  const feature = JSON.parse(line);
  const point = feature.geometry ? centroid(feature.geometry) : null;
  if (!point) continue;
  const properties = {};
  for (const key of KEEP)
    if (feature.properties?.[key] !== undefined) properties[key] = feature.properties[key];
  features.push({
    type: "Feature",
    id: feature.id,
    geometry: { type: "Point", coordinates: [point[1], point[0]] },
    properties,
  });
}

try {
  const files = buildDataset(features, dataVersion);
  for (const [path, content] of files) {
    const target = join(outDir, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    `OSM import ${dataVersion}: ${files.size} files from ${features.length} features in ${seconds} s`,
  );
} catch (error) {
  if (error instanceof ImportError) {
    console.error(`OSM import failed: ${error.message}`);
    process.exit(1);
  }
  throw error;
}
