// Deploy configuration guard: staging and production must not run on the development placeholders of
// wrangler.jsonc, and a deploy workflow must name its environment. Usage: node scripts/check-config.mjs
import { existsSync, readdirSync, readFileSync } from "node:fs";
import ts from "typescript";
import { checkConfig } from "./check-config.ts";
import { MOBILE_PREVIEW_CONFIG_PATH } from "./mobile-preview-config.ts";

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
const preview = existsSync(MOBILE_PREVIEW_CONFIG_PATH)
  ? JSON.parse(readFileSync(MOBILE_PREVIEW_CONFIG_PATH, "utf8"))
  : undefined;
const problems = checkConfig(config, workflows, preview);
if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(
  `wrangler.jsonc: ${Object.keys(config.env).join(", ")} stand on their own, no placeholders; deploys name their environment.`,
);
