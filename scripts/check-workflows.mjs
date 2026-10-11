// CI policy (SPEC 13.7, M0-08): third-party Actions pinned to a commit SHA and no
// pull_request_target trigger. Usage: node scripts/check-workflows.mjs
import { readdirSync, readFileSync } from "node:fs";

const DIR = ".github/workflows";
const problems = [];
for (const name of readdirSync(DIR).filter((f) => /\.ya?ml$/.test(f))) {
  const text = readFileSync(`${DIR}/${name}`, "utf8");
  if (text.includes("pull_request_target"))
    problems.push(`${name}: pull_request_target is forbidden`);
  for (const [, ref] of text.matchAll(/uses:\s*([^\s#]+)/g)) {
    if (!ref.startsWith("./") && !/@[0-9a-f]{40}$/.test(ref))
      problems.push(`${name}: ${ref} is not pinned to a SHA`);
  }
}
if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`${DIR}: all Actions pinned to SHAs, no pull_request_target.`);
