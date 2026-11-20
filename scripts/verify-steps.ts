// The steps of `npm run verify` (scripts/verify.mjs) and the check that they are the steps of the CI
// (.github/workflows/ci.yml). One list, read by the script and by tests/unit/ci-parity.test.ts: a command
// added to the CI without being run here, or the other way round, fails a unit test.

export interface Step {
  name: string;
  /** Written as in ci.yml (python3, unquoted globs): verify.mjs adapts only what the platform needs. */
  command: string;
  /** Run after the command, passed or not, as in ci.yml (the Lighthouse summary). */
  after?: string;
  /** False when the result changes with the day and not with the code (new advisories). */
  resumable: boolean;
  /** The tool failed, the code did not (a lost Lighthouse trace): measure again, up to `times` times. */
  retry?: { pattern: string; times: number };
}

export const steps: readonly Step[] = [
  { name: "Lint", command: "npm run lint", resumable: true },
  { name: "Formattazione", command: "npm run format:check", resumable: true },
  { name: "Typecheck", command: "npm run typecheck", resumable: true },
  { name: "Unit e worker", command: "npm run test", resumable: true },
  {
    name: "Catalogo Europa: identità e fonti",
    command:
      "python3 -B -m unittest discover -s mobile-apps/tools/europe-catalogue -p 'test_*.py' -q",
    resumable: true,
  },
  {
    name: "Catalogo Europa: transazioni dei menu",
    command:
      "python3 -B -m unittest discover -s mobile-apps/tools/europe-menu-import -p 'test_*.py' -q",
    resumable: true,
  },
  {
    name: "Guardia della feature list",
    command: "node scripts/check-feature-list.mjs",
    resumable: true,
  },
  { name: "Policy dei workflow", command: "node scripts/check-workflows.mjs", resumable: true },
  { name: "Configurazione di deploy", command: "node scripts/check-config.mjs", resumable: true },
  { name: "npm audit", command: "npm audit --audit-level=high", resumable: false },
  {
    name: "npm audit (produzione)",
    command: "npm audit --omit=dev --audit-level=low",
    resumable: false,
  },
  {
    name: "App: interazioni della presentazione",
    command: "node --test mobile-apps/presentation/tests/*.test.mjs",
    resumable: true,
  },
  // CI retries a test twice (playwright.config.ts); here once, and verify.mjs prints what needed it.
  {
    name: "E2E (Chromium, WebKit) e sicurezza",
    command: "npx playwright test --workers=2 --retries=1",
    resumable: true,
  },
  {
    name: "App: tipi delle rotte mobile",
    command: "npx tsc -p mobile-apps/web/tsconfig.json --noEmit",
    resumable: true,
  },
  {
    name: "App: presentazione e rotte mobile",
    command:
      "node --test --test-concurrency=2 mobile-apps/web/tests/*.test.mjs mobile-apps/web/components/tests/components.test.mjs",
    resumable: true,
  },
  { name: "Build", command: "npm run build", resumable: true },
  { name: "Budget della shell", command: "node scripts/check-bundle-size.mjs", resumable: true },
  {
    name: "Lighthouse (mediana di 3)",
    command: "npx --yes @lhci/cli@0.15.1 autorun",
    after: "node scripts/lighthouse-summary.mjs",
    resumable: true,
    retry: { pattern: "NO_NAVSTART", times: 4 },
  },
];

/** What the CI does that cannot or need not run on this machine, each with the reason. */
export const ciOnly: readonly { command: string; reason: string }[] = [
  { command: "npm ci", reason: "verify runs on the dependencies already installed" },
  {
    command: "echo 'https://mirrors.edge.kernel.org/ubuntu' | sudo tee /etc/apt/apt-mirrors.txt",
    reason: "GitHub runner setup",
  },
  {
    command: "npx playwright install --with-deps chromium webkit",
    reason: "browser download: verify.mjs says what to run when they are missing",
  },
  {
    command: "sudo apt-get update && sudo apt-get install -y osmium-tool",
    reason: "GitHub runner setup",
  },
  {
    command: 'osmium cat tests/fixtures/osm/sample.osm -o "$RUNNER_TEMP/sample.osm.pbf"',
    reason: "run by scripts/osm-import/selftest.sh when osmium is installed",
  },
  {
    command:
      'scripts/osm-import/import.sh "$RUNNER_TEMP/sample.osm.pbf" "$RUNNER_TEMP/data" fixture',
    reason: "run by scripts/osm-import/selftest.sh when osmium is installed",
  },
  {
    command:
      'node scripts/osm-import/compare-cell.mjs "$RUNNER_TEMP/data/fixture/v/u0nd9.json" tests/fixtures/osm/expected-u0nd9.json',
    reason: "run by scripts/osm-import/selftest.sh when osmium is installed",
  },
];

/** Third-party actions of the CI that have no command to run here, each with the reason. */
export const ciOnlyActions: readonly { action: string; reason: string }[] = [
  {
    action: "gitleaks/gitleaks-action",
    reason: "secret scan: verify.mjs runs the gitleaks binary when it is installed",
  },
];

/** Plain glue of a multi-line `run:` block, not commands. */
const GLUE = [/^status=0$/, /^exit \$status$/];

/** The commands of every `run:` of a workflow, one per line of a block, glue and `|| status=$?` removed. */
export function ciCommands(workflow: string): string[] {
  const lines = workflow.split("\n");
  const found: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const match = /^(\s*)(?:- )?run:\s*(.*)$/.exec(line);
    if (!match) continue;
    const indent = (match[1] ?? "").length;
    const value = (match[2] ?? "").trim();
    const raw: string[] = [];
    if (value === "|" || value === ">") {
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j] ?? "";
        if (next.trim() !== "" && next.length - next.trimStart().length <= indent) break;
        raw.push(next);
      }
    } else {
      raw.push(value);
    }
    for (const entry of raw) {
      const command = entry
        .trim()
        .replace(/\s*\|\|\s*status=\$\?$/, "")
        .trim();
      if (command === "" || command.startsWith("#") || GLUE.some((glue) => glue.test(command)))
        continue;
      found.push(command);
    }
  }
  return found;
}

/** The third-party actions (`uses:`) of a workflow, without the version. */
export function ciActions(workflow: string): string[] {
  return [...workflow.matchAll(/^\s*-?\s*uses:\s*([^@\s]+)@/gm)].map((m) => m[1] ?? "");
}

const segments = (command: string) => command.split("&&").map((part) => part.trim());

/** True when a CI command is one of the commands of the step, or the step adds only flags to it. */
function runs(step: Step, ci: string): boolean {
  return [step.command, step.after ?? ""].some((command) =>
    segments(command).some((part) => part === ci || part.startsWith(`${ci} `)),
  );
}

/** Differences between the CI and the steps: commands the CI runs that verify does not, and the reverse. */
export function parityProblems(workflow: string): string[] {
  const problems: string[] = [];
  const allowed = new Set(ciOnly.map((entry) => entry.command));
  const commands = ciCommands(workflow);
  for (const ci of commands) {
    if (allowed.has(ci)) continue;
    if (!steps.some((step) => runs(step, ci)))
      problems.push(`the CI runs "${ci}" and verify does not (add a step or a ciOnly entry)`);
  }
  for (const entry of ciOnly)
    if (!commands.includes(entry.command))
      problems.push(`ciOnly lists "${entry.command}" and the CI does not run it any more`);
  for (const step of steps)
    for (const command of [step.command, step.after].filter((c): c is string => Boolean(c)))
      for (const part of segments(command))
        if (!commands.some((ci) => part === ci || part.startsWith(`${ci} `)))
          problems.push(`verify runs "${part}" and the CI does not`);
  const known = new Set([
    "actions/checkout",
    "actions/setup-node",
    ...ciOnlyActions.map((a) => a.action),
  ]);
  for (const action of ciActions(workflow))
    if (!known.has(action))
      problems.push(`the CI uses the action ${action}: decide how verify covers it`);
  return problems;
}
