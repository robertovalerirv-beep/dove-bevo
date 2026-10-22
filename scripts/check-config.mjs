// Deploy configuration guard: staging and production must not run on the development placeholders of
// wrangler.jsonc, and a deploy workflow must name its environment. Usage: node scripts/check-config.mjs
import { readdirSync, readFileSync } from "node:fs";
import ts from "typescript";
import { checkConfig } from "./check-config.ts";

const DIR = ".github/workflows";
// wrangler.jsonc has comments and trailing commas: the TypeScript reader accepts both.
const { config, error } = ts.parseConfigFileTextToJson(
  "wrangler.jsonc",
  readFileSync("wrangler.jsonc", "utf8"),
);
if (error) {
  console.error("wrangler.jsonc cannot be read");
  process.exit(1);
}
const workflows = Object.fromEntries(
  readdirSync(DIR)
    .filter((f) => /\.ya?ml$/.test(f))
    .map((f) => [`${DIR}/${f}`, readFileSync(`${DIR}/${f}`, "utf8")]),
);
const problems = checkConfig(config, workflows);
if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(
  `wrangler.jsonc: ${Object.keys(config.env).join(", ")} stand on their own, no placeholders; deploys name their environment.`,
);
