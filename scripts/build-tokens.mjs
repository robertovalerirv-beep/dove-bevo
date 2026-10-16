// Writes src/app/styles/tokens.css from docs/brand/tokens.json (SPEC 2.10, ADR 0023) and copies the
// kit fonts to public/fonts/. Runs before every build; tests/unit/tokens.test.ts fails on a stale file.
// Usage: node scripts/build-tokens.mjs
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { renderTokens } from "./tokens.ts";

const tokens = JSON.parse(readFileSync("docs/brand/tokens.json", "utf8"));
writeFileSync("src/app/styles/tokens.css", renderTokens(tokens));
mkdirSync("public/fonts", { recursive: true });
for (const font of tokens.type.fonts) {
  copyFileSync(`docs/brand/${font.file}`, `public/fonts/${font.file.replace(/^fonts\//, "")}`);
}
console.log("tokens.css and fonts written from docs/brand/tokens.json");
