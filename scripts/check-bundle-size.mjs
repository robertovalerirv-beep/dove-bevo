// Shell budget (SPEC 15, M5-16): the HTML, JS and CSS the visitor downloads on opening the app
// ≤ 50 KB gzip, MapLibre excluded. Chunks loaded on request (admin, legal pages, search) are listed
// apart and not counted. Usage: node scripts/check-bundle-size.mjs
import { readdirSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { initialShellFiles } from "./bundle-size.ts";

const BUDGET = 50 * 1024;
const ROOT = "dist/client";
const read = (path) => readFileSync(`${ROOT}/${path}`, "utf8");
const gzip = (path) => gzipSync(readFileSync(`${ROOT}/${path}`)).length;

const shell = ["index.html", ...initialShellFiles(read("index.html"), read)];
let total = 0;
for (const file of shell) {
  const size = gzip(file);
  total += size;
  console.log(`${String(size).padStart(7)} B  ${file}`);
}
console.log(`${String(total).padStart(7)} B  initial shell (budget ${BUDGET} B)`);

const onRequest = readdirSync(`${ROOT}/assets`)
  .map((f) => `assets/${f}`)
  .filter((f) => /\.(js|css)$/.test(f) && !shell.includes(f) && !f.includes("maplibre"));
for (const file of onRequest)
  console.log(`${String(gzip(file)).padStart(7)} B  ${file} (on request)`);

if (total > BUDGET) {
  console.error("Initial shell exceeds the 50 KB gzip budget (SPEC 15).");
  process.exit(1);
}
