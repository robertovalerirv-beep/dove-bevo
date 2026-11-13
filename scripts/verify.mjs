// Runs locally what CI runs (.github/workflows/ci.yml), in the same order, stopping at the first
// failure. Called by the git pre-push hook (.githooks/pre-push): nothing reaches GitHub red.
// Usage: npm run verify            (VERIFY_FRESH=1 npm run verify: ignore what already passed)
//
// The steps are in scripts/verify-steps.ts and tests/unit/ci-parity.test.ts fails when they drift from
// ci.yml. A step that passed on this exact commit is not run again after a later step failed: the
// result belongs to the code (the tree hash), not to the attempt, so a retry costs the steps that did not
// pass yet and not the whole run. Any change to any file starts again from the first step.
import { execSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { steps } from "./verify-steps.ts";

const CACHE_DIR = "node_modules/.cache/verify";
const CACHE_FILE = `${CACHE_DIR}/passed.json`;
const LOCK_FILE = `${CACHE_DIR}/running.pid`;
const MAX_BUFFER = 64 * 1024 * 1024;

/** A server left on 4173 makes Playwright and Lighthouse fail in confusing ways: check first. */
function portFree(port) {
  return new Promise((resolve) => {
    const server = createServer()
      .once("error", () => resolve(false))
      .once("listening", () => server.close(() => resolve(true)));
    server.listen(port, "127.0.0.1");
  });
}

function works(command) {
  try {
    execSync(command, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function git(...args) {
  const run = spawnSync("git", args, { encoding: "utf8" });
  return run.status === 0 ? run.stdout.trim() : null;
}

/** Two runs at once break each other (one port, one local database): refuse, do not guess. */
function takeLock() {
  mkdirSync(CACHE_DIR, { recursive: true });
  if (existsSync(LOCK_FILE)) {
    const pid = Number(readFileSync(LOCK_FILE, "utf8"));
    const alive = (() => {
      try {
        process.kill(pid, 0);
        return pid !== process.pid;
      } catch {
        return false;
      }
    })();
    if (alive) {
      console.error(
        `✗ Un altro verify è in corso (pid ${String(pid)}). Aspetta che finisca: due insieme si rompono a vicenda.`,
      );
      process.exit(1);
    }
  }
  writeFileSync(LOCK_FILE, String(process.pid));
  const release = () => rmSync(LOCK_FILE, { force: true });
  process.on("exit", release);
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, () => process.exit(130));
}

/**
 * The identity of the code under test: the tree of HEAD, when nothing else differs from it (the
 * screenshots the e2e tests rewrite do not count). Null when the working tree is dirty: then the
 * run tests something no commit holds, so nothing is remembered.
 */
function codeKey() {
  const dirty = git(
    "status",
    "--porcelain",
    "--untracked-files=normal",
    "--",
    ".",
    ":(exclude)docs/screenshots",
  );
  if (dirty === null || dirty !== "") return null;
  const tree = git("rev-parse", "HEAD^{tree}");
  return tree ? `${tree}|node ${process.version}` : null;
}

function loadPassed(key) {
  if (!key || process.env.VERIFY_FRESH) return {};
  try {
    const saved = JSON.parse(readFileSync(CACHE_FILE, "utf8"));
    return saved.key === key ? saved.passed : {};
  } catch {
    return {};
  }
}

function savePassed(key, passed) {
  if (key) writeFileSync(CACHE_FILE, JSON.stringify({ key, passed }, null, 2));
}

/** The command as the CI writes it, adapted to this platform: Python's name and cmd.exe's quotes. */
function localCommand(command, python) {
  let text = command.replace(/^python3 /, `${python} `);
  if (process.platform === "win32") text = text.replace(/'/g, '"');
  return text;
}

function pythonName() {
  for (const name of ["python3", "python"]) {
    const run = spawnSync(`${name} --version`, { shell: true, encoding: "utf8" });
    if (run.status === 0 && /Python 3\./.test(`${run.stdout}${run.stderr}`)) return name;
  }
  return null;
}

/** Tests that passed only on the retry: a bug to fix, not a habit. */
function flakyReport(output) {
  const lines = output.split("\n");
  const start = lines.findIndex((line) => /^\s*\d+ flaky/.test(line));
  if (start < 0) return "";
  const end = lines.findIndex((line, i) => i > start && /^\s*\d+ (passed|did not run)/.test(line));
  return lines.slice(start, end > start ? end : start + 8).join("\n");
}

function fail(name, output) {
  console.log("✗");
  // The cause is in the FIRST failure block ("  1) [webkit] › file › test", then its error), not in the
  // summary that ends the output: keep the whole output in a file and show that block (else the tail).
  mkdirSync("test-results", { recursive: true });
  writeFileSync("test-results/verify-last.log", output);
  const lines = output.split("\n");
  const first = lines.findIndex((line) => /^\s*1\) /.test(line));
  console.error((first >= 0 ? lines.slice(first, first + 60) : lines.slice(-60)).join("\n"));
  console.error("\nLog completo: test-results/verify-last.log");
  // The most common local cause, and it is not a bug: Playwright was updated (Dependabot) and its
  // browsers were not downloaded again. Say what to run instead of leaving a wall of failures.
  if (/Executable doesn't exist|npx playwright install/.test(output))
    console.error(
      "\n→ Mancano i browser di Playwright (o sono di una versione vecchia). Non è un errore del codice.\n" +
        "  Esegui:  npx playwright install chromium webkit\n  poi riprova il push.",
    );
  console.error(
    `\n✗ ${name} fallito: push bloccato. Correggi e riprova: i passi già verdi su questo codice non si rifanno.`,
  );
  process.exit(1);
}

if (!(await portFree(4173))) {
  console.error("✗ La porta 4173 è occupata (un preview rimasto acceso?). Chiudilo e riprova.");
  process.exit(1);
}
takeLock();

// The local database and rate limiter keep what the last run wrote (a verified bar left by an interrupted
// run made a list test fail): every run starts from nothing. Nothing else runs now, the lock and the port
// check above saw to that.
try {
  rmSync(".wrangler/state", { recursive: true, force: true });
} catch {
  console.log(
    "• .wrangler/state non si può svuotare (un processo lo usa): continuo, ma i dati locali non sono puliti.",
  );
}

const python = pythonName();
const key = codeKey();
const passed = loadPassed(key);
if (!key)
  console.log(
    "• Ci sono modifiche non committate: i passi verdi non verranno ricordati per un nuovo tentativo.",
  );
const env = { ...process.env, WRANGLER_SEND_METRICS: "false" };
const started = Date.now();
let resumed = 0;

for (const step of steps) {
  if (step.resumable && passed[step.name]) {
    console.log(
      `↷ ${step.name}… già verde su questo stesso codice (${String(passed[step.name])} s)`,
    );
    resumed++;
    continue;
  }
  if (step.command.startsWith("python3 ") && !python) {
    console.log(`▶ ${step.name}… ✗`);
    console.error(
      "La CI esegue questo passo con Python 3 e qui non c'è: installalo, non si può verificare altrove.",
    );
    process.exit(1);
  }
  const t = Date.now();
  process.stdout.write(`▶ ${step.name}… `);
  const command = localCommand(step.command, python);
  const attempt = () =>
    spawnSync(command, { shell: true, env, encoding: "utf8", maxBuffer: MAX_BUFFER });
  let run = attempt();
  // The tool failed, the code did not (a lost Lighthouse trace, about one run in three on a Windows
  // laptop): measure again. A low score is never retried and still blocks.
  if (step.retry) {
    const lost = new RegExp(step.retry.pattern);
    for (
      let again = 0;
      again < step.retry.times && run.status !== 0 && lost.test(`${run.stdout}${run.stderr}`);
      again++
    ) {
      process.stdout.write("(misura persa, riprovo) ");
      run = attempt();
    }
  }
  if (step.after)
    spawnSync(localCommand(step.after, python), { shell: true, env, stdio: "inherit" });
  const output = `${run.stdout}\n${run.stderr}`.trim();
  if (run.status !== 0) fail(step.name, output);
  const seconds = Math.round((Date.now() - t) / 1000);
  console.log(`✓ ${String(seconds)} s`);
  const flaky = flakyReport(output);
  if (flaky)
    console.log(`  ⚠ test ballerini (passati al secondo tentativo, da correggere):\n${flaky}`);
  if (step.resumable) {
    passed[step.name] = seconds;
    savePassed(key, passed);
  }
}

// What the CI does with tools that may be missing here: run them when present, and say so when not.
if (works("osmium --version")) {
  const run = spawnSync("bash scripts/osm-import/selftest.sh", { shell: true, stdio: "inherit" });
  if (run.status !== 0) process.exit(1);
} else {
  console.log(
    "• Import OSM: osmium non è installato qui. Lo esegue la CI (job «OSM import»); i test di unità lo coprono in parte.",
  );
}
if (works("gitleaks version")) {
  const base = git("merge-base", "HEAD", "origin/main") ?? "origin/main";
  const run = spawnSync(
    `gitleaks detect --source . --log-opts "${base}..HEAD" --redact --no-banner`,
    {
      shell: true,
      stdio: "inherit",
    },
  );
  if (run.status !== 0) process.exit(1);
} else {
  console.log(
    "• Scansione segreti: gitleaks non è installato qui. La esegue la CI (job «Secret scan»).",
  );
}

const total = Math.round((Date.now() - started) / 1000);
console.log(
  `✓ Tutto verde in ${String(total)} s (${String(steps.length - resumed)} passi eseguiti, ${String(resumed)} già verdi sullo stesso codice): come la CI.`,
);
