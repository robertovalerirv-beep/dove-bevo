// Shell budget (SPEC 15): HTML + JS + CSS of dist/client ≤ 50 KB gzip, MapLibre excluded.
// Fonts are already compressed and not part of the shell. Usage: node scripts/check-bundle-size.mjs
import { readdirSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const BUDGET = 50 * 1024;
const ROOT = "dist/client";
const files = [
  "index.html",
  ...readdirSync(`${ROOT}/assets`)
    .filter((f) => /\.(js|css)$/.test(f) && !f.includes("maplibre"))
    .map((f) => `assets/${f}`),
];
let total = 0;
for (const file of files) {
  const size = gzipSync(readFileSync(`${ROOT}/${file}`)).length;
  total += size;
  console.log(`${String(size).padStart(7)} B  ${file}`);
}
console.log(`${String(total).padStart(7)} B  total (budget ${BUDGET} B)`);
if (total > BUDGET) {
  console.error("Shell exceeds the 50 KB gzip budget (SPEC 15).");
  process.exit(1);
}
