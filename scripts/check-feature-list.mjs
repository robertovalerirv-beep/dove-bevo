// Feature list guard (SPEC D-21): docs/feature_list.json may differ from the version
// tagged `spec-approved-10` (SPEC 1.9, approved by Roberto) only in the `passes` field. Usage: node scripts/check-feature-list.mjs
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { compareFeatureLists } from "./feature-list.ts";

const FILE = "docs/feature_list.json";
const TAG = "spec-approved-10";

const base = JSON.parse(execFileSync("git", ["show", `${TAG}:${FILE}`], { encoding: "utf8" }));
const current = JSON.parse(readFileSync(FILE, "utf8"));
const problems = compareFeatureLists(base, current);
if (problems.length > 0) {
  console.error(`${FILE} differs from ${TAG} beyond "passes":\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
const passing = current.filter((f) => f.passes === true).length;
console.log(`${FILE} ok: only "passes" changed (${passing}/${current.length} passing).`);
