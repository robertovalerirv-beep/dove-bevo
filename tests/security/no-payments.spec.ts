import { expect, test } from "@playwright/test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// M3-18 (N1, N3): the user never pays and the app has no AI. No payment processor and no
// model provider appears in the code, in the dependencies or in the build.
const FORBIDDEN = /paddle|stripe|paypal|braintree|klarna|checkout|anthropic/i;
const ROOTS = ["src", "public", "dist", "package.json", "wrangler.jsonc", "index.html"];
const TEXT = /\.(ts|tsx|js|mjs|css|html|json|jsonc|txt|webmanifest|svg|map)$/;

function* files(path: string): Generator<string> {
  if (!existsSync(path)) return;
  if (statSync(path).isFile()) {
    yield path;
    return;
  }
  for (const name of readdirSync(path)) {
    if (name === "data") continue; // OpenStreetMap bar names, not our code
    yield* files(join(path, name));
  }
}

test("no payment processor and no AI provider in the code, dependencies and build", () => {
  const hits: string[] = [];
  for (const root of ROOTS)
    for (const file of files(root)) {
      if (!TEXT.test(file)) continue;
      const match = FORBIDDEN.exec(readFileSync(file, "utf8"));
      if (match) hits.push(`${file}: ${match[0]}`);
    }
  expect(hits).toEqual([]);
});
