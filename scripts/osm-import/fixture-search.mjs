// Writes the search fragments of the fixture (tests/fixtures/data/s/) from its cell files, with the
// same code as the real import. Run after the fixture's cells change: node scripts/osm-import/fixture-search.mjs
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { buildSearchIndex } from "./osm.ts";

const dir = "tests/fixtures/data";
const entries = [];
for (const name of readdirSync(`${dir}/v`)) {
  const file = JSON.parse(readFileSync(`${dir}/v/${name}`, "utf8"));
  for (const [key, label, , lat, lon, , ci] of file.v)
    entries.push([key, label, lat, lon, ci >= 0 ? file.c[ci][0] : 0]);
}
rmSync(`${dir}/s`, { recursive: true, force: true });
mkdirSync(`${dir}/s`, { recursive: true });
const files = buildSearchIndex(entries);
for (const [path, content] of files) writeFileSync(`${dir}/${path}`, content);
console.log(`${entries.length} bars → ${files.size} search files`);
