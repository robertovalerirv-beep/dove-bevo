// Runs locally what CI runs (.github/workflows/ci.yml), in the same order, stopping at the first
// failure. Called by the git pre-push hook (.githooks/pre-push): nothing reaches GitHub red.
// Usage: npm run verify
import { execSync, spawnSync } from "node:child_process";
import { createServer } from "node:net";

const steps = [
  ["Lint", "npm run lint"],
  ["Formattazione", "npm run format:check"],
  ["Typecheck", "npm run typecheck"],
  ["Unit e worker", "npm run test"],
  ["Guardia della feature list", "node scripts/check-feature-list.mjs"],
  ["Policy dei workflow", "node scripts/check-workflows.mjs"],
  ["Configurazione di deploy", "node scripts/check-config.mjs"],
  ["npm audit", "npm audit --audit-level=high"],
  ["npm audit (produzione)", "npm audit --omit=dev --audit-level=low"],
  ["E2E (Chromium, WebKit) e sicurezza", "npx playwright test --workers=2"],
  ["Build", "npm run build"],
  ["Budget della shell", "node scripts/check-bundle-size.mjs"],
  ["Lighthouse (mediana di 3)", "npx --yes @lhci/cli@0.15.1 autorun"],
];

/** A server left on 4173 makes Playwright and Lighthouse fail in confusing ways: check first. */
function portFree(port) {
  return new Promise((resolve) => {
    const server = createServer()
      .once("error", () => resolve(false))
      .once("listening", () => server.close(() => resolve(true)));
    server.listen(port, "127.0.0.1");
  });
}

function hasOsmium() {
  try {
    execSync("osmium --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

if (!(await portFree(4173))) {
  console.error("✗ La porta 4173 è occupata (un preview rimasto acceso?). Chiudilo e riprova.");
  process.exit(1);
}

const env = { ...process.env, WRANGLER_SEND_METRICS: "false" };
const started = Date.now();
for (const [name, command] of steps) {
  const t = Date.now();
  process.stdout.write(`▶ ${name}… `);
  const run = spawnSync(command, {
    shell: true,
    env,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (run.status !== 0) {
    console.log("✗");
    console.error(`${run.stdout}\n${run.stderr}`.trim().split("\n").slice(-60).join("\n"));
    if (name.startsWith("Lighthouse"))
      spawnSync("node scripts/lighthouse-summary.mjs", { shell: true, stdio: "inherit" });
    console.error(`\n✗ ${name} fallito: push bloccato. Correggi e riprova.`);
    process.exit(1);
  }
  console.log(`✓ ${String(Math.round((Date.now() - t) / 1000))} s`);
}

if (hasOsmium()) {
  const run = spawnSync("bash scripts/osm-import/selftest.sh", { shell: true, stdio: "inherit" });
  if (run.status !== 0) process.exit(1);
} else {
  console.log(
    "• Import OSM con osmium: osmium non installato qui, verificato dai test di unità e in CI.",
  );
}
console.log(`✓ Tutto verde in ${String(Math.round((Date.now() - started) / 1000))} s: come la CI.`);
