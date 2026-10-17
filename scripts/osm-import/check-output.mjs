// Validates an import output directory and prints the counts for the job log (SPEC 5.1, M1-03).
// Usage: node scripts/osm-import/check-output.mjs <data/<DATA_VERSION> dir>
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
if (!dir) {
  console.error("Usage: check-output.mjs <dir>");
  process.exit(2);
}
const MAX_FILES = 15_000;
const MAX_BYTES = 1_000_000;
const problems = [];
const fail = (message) => problems.push(message);

const cells = readdirSync(join(dir, "v")).filter((f) => f.endsWith(".json"));
let bars = 0;
let largest = 0;
for (const name of cells) {
  if (!/^[0-9b-hjkmnp-z]{5}\.json$/.test(name)) fail(`${name}: not a geohash5 file name`);
  const path = join(dir, "v", name);
  largest = Math.max(largest, statSync(path).size);
  const file = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(file.c) || !Array.isArray(file.v)) fail(`${name}: missing c or v`);
  for (const row of file.v ?? []) {
    const [key, label, kind, lat, lon, addr, ci] = row;
    const ok =
      row.length === 7 &&
      /^[nwr]\d+$/.test(key) &&
      typeof label === "string" &&
      label.length > 0 &&
      [0, 1, 2, 3, 4].includes(kind) &&
      typeof lat === "number" &&
      typeof lon === "number" &&
      typeof addr === "string" &&
      Number.isInteger(ci) &&
      ci >= -1 &&
      ci < file.c.length;
    if (!ok) fail(`${name}: bad row ${JSON.stringify(row)}`);
    bars++;
  }
}
const places = JSON.parse(readFileSync(join(dir, "places.json"), "utf8"));
if (!Array.isArray(places) || places.some((p) => p.length !== 5)) fail("places.json: bad rows");
if (!readFileSync(join(dir, "LICENSE.txt"), "utf8").includes("ODbL")) fail("LICENSE.txt: no ODbL");
// Search fragments (ADR 0024): [key, name, lat, lon, cityId] rows, names of [a-z0-9_] only.
const fragments = readdirSync(join(dir, "s")).filter((f) => f.endsWith(".json"));
for (const name of fragments) {
  const path = join(dir, "s", name);
  largest = Math.max(largest, statSync(path).size);
  if (!/^(index|[a-z0-9_]{2,3})\.json$/.test(name)) fail(`s/${name}: bad file name`);
  const rows = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(rows)) fail(`s/${name}: not an array`);
  else if (name !== "index.json") {
    for (const row of rows) {
      const [key, label, lat, lon, city] = row;
      const ok =
        row.length === 5 &&
        /^[nwr]\d+$/.test(key) &&
        typeof label === "string" &&
        typeof lat === "number" &&
        typeof lon === "number" &&
        Number.isInteger(city) &&
        city >= 0;
      if (!ok) fail(`s/${name}: bad row ${JSON.stringify(row)}`);
    }
  }
}
const total = cells.length + fragments.length + 2;
if (total > MAX_FILES) fail(`${total} files, more than ${MAX_FILES}`);
if (largest > MAX_BYTES) fail(`largest file ${largest} bytes, more than ${MAX_BYTES}`);

console.log(
  `bars: ${bars} · cell files: ${cells.length} · search files: ${fragments.length} · places: ${places.length}`,
);
console.log(`files: ${total} (max ${MAX_FILES}) · largest: ${largest} bytes (max ${MAX_BYTES})`);
if (problems.length > 0) {
  console.error(problems.slice(0, 20).join("\n"));
  process.exit(1);
}
