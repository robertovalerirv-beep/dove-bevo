import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ciActions, ciCommands, parityProblems, steps } from "../../scripts/verify-steps.ts";

const WORKFLOWS = ".github/workflows";
const ci = readFileSync(`${WORKFLOWS}/ci.yml`, "utf8");

describe("verify runs what the CI runs", () => {
  it("has no command the CI runs and verify does not, nor the reverse", () => {
    expect(parityProblems(ci)).toEqual([]);
  });

  it("reads plain, block and chained commands of a workflow", () => {
    const sample = [
      "steps:",
      "  - run: npm ci",
      "  - name: Two commands",
      "    run: |",
      "      npx tsc --noEmit",
      "      node --test a.mjs",
      "  - name: Chained",
      "    run: |",
      "      status=0",
      "      npx lhci autorun || status=$?",
      "      node summary.mjs",
      "      exit $status",
      "  - uses: actions/checkout@abc # v1",
    ].join("\n");
    expect(ciCommands(sample)).toEqual([
      "npm ci",
      "npx tsc --noEmit",
      "node --test a.mjs",
      "npx lhci autorun",
      "node summary.mjs",
    ]);
    expect(ciActions(sample)).toEqual(["actions/checkout"]);
  });

  it("fails when the CI gets a command verify does not run", () => {
    const grown = `${ci}\n      - run: node scripts/a-new-check.mjs\n`;
    expect(parityProblems(grown)).toEqual([
      'the CI runs "node scripts/a-new-check.mjs" and verify does not (add a step or a ciOnly entry)',
    ]);
  });

  it("fails when the CI gets a new third-party action", () => {
    const grown = `${ci}\n      - uses: someone/scanner@0123456789abcdef\n`;
    expect(parityProblems(grown)).toEqual([
      "the CI uses the action someone/scanner: decide how verify covers it",
    ]);
  });

  it("fails when verify runs something the CI does not", () => {
    const shrunk = ci.replace("      - run: npm run lint\n", "");
    expect(parityProblems(shrunk)).toContain('verify runs "npm run lint" and the CI does not');
  });

  it("gives every step a distinct name (the resume cache is keyed by it)", () => {
    const names = steps.map((step) => step.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
