// Intentionally CI-only. No credentials are read until the exact push/owner gates pass.
import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { checkMobilePreviewBuildConfig } from "./check-config.ts";
import {
  PREVIEW_HOST,
  PREVIEW_NAME,
  PREVIEW_WORKFLOW_SHA256,
  workflowDigest,
  requirePreviewActivation,
  createPreviewDeploymentConfig,
  assertPreviewDeploymentConfig,
} from "./mobile-preview-deploy-policy.ts";

const object = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const demand = (ok, code) => {
  if (!ok) throw new Error(code);
};
const MAX_BYTES = 262144;

/** Bounded GET only, no raw provider error bodies, redirects, secret-detail endpoints or retries. */
export async function readPreviewApi(fetchImpl, token, path) {
  try {
    const response = await fetchImpl(`https://api.cloudflare.com/client/v4${path}`, {
      method: "GET",
      redirect: "error",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: globalThis.AbortSignal.timeout(20000),
    });
    if (!response.ok || Number(response.headers.get("content-length")) > MAX_BYTES) {
      await response.body?.cancel();
      throw new Error("READ_FAILED");
    }
    const reader = response.body?.getReader();
    demand(reader, "READ_FAILED");
    const chunks = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES) {
          await reader.cancel();
          throw new Error("READ_FAILED");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    demand(object(body) && body.success === true, "READ_FAILED");
    return body;
  } catch {
    throw new Error("PROVIDER_READ_FAILED");
  }
}

export async function readPreviewList(read, path, paginated = true) {
  const result = [];
  let total;
  for (let page = 1; page <= 3; page++) {
    const body = await read(
      paginated ? `${path}${path.includes("?") ? "&" : "?"}page=${page}&per_page=100` : path,
    );
    demand(Array.isArray(body.result) && body.result.every(object), "INVALID_LIST");
    result.push(...body.result);
    if (!paginated && body.result_info === undefined) return result;
    const info = body.result_info;
    demand(
      object(info) &&
        info.page === page &&
        Number.isSafeInteger(info.total_count) &&
        info.total_count >= 0 &&
        Number.isSafeInteger(info.per_page) &&
        info.per_page > 0 &&
        info.count === body.result.length &&
        body.result.length <= info.per_page &&
        (total === undefined || total === info.total_count),
      "INCOMPLETE_LIST",
    );
    total = info.total_count;
    if (result.length === total) return result;
    demand(
      paginated && result.length < total && body.result.length === info.per_page,
      "INCOMPLETE_LIST",
    );
  }
  throw new Error("INCOMPLETE_LIST");
}

function bindings(settings) {
  demand(
    object(settings) && Array.isArray(settings.bindings) && settings.bindings.every(object),
    "INVALID_BINDINGS",
  );
  demand(
    new Set(settings.bindings.map((b) => b.name)).size === settings.bindings.length,
    "DUPLICATE_BINDINGS",
  );
  return settings.bindings;
}

function routeConflicts(route) {
  if (route.script === PREVIEW_NAME || typeof route.pattern !== "string") return true;
  const host = route.pattern.replace(/^https?:\/\//, "").split("/")[0];
  if (!/^[a-z0-9.*-]+$/i.test(host)) return true;
  const matcher = new RegExp(`^${host.replaceAll(".", "\\.").replaceAll("*", ".*")}$`, "i");
  return matcher.test(PREVIEW_HOST);
}

function assertManagedWorker(settings, config, expectedSha) {
  const actual = bindings(settings);
  const expectedVars = { ...config.vars, MOBILE_PREVIEW_DEPLOYMENT_SHA: expectedSha };
  const names = new Set([
    ...Object.keys(expectedVars),
    "DB",
    "ASSETS",
    "RATE_LIMITER",
    "READ_LIMITER",
    ...config.secrets.required,
  ]);
  demand(
    actual.length === names.size && actual.every((b) => names.has(b.name)),
    "UNEXPECTED_WORKER_BINDINGS",
  );
  for (const [name, text] of Object.entries(expectedVars))
    demand(
      actual.some((b) => b.name === name && b.type === "plain_text" && b.text === text),
      "WORKER_OWNERSHIP_MISMATCH",
    );
  demand(
    actual.some(
      (b) => b.type === "d1" && b.name === "DB" && b.id === config.d1_databases[0].database_id,
    ),
    "WRONG_DATABASE_BINDING",
  );
  demand(
    actual.some((b) => b.type === "assets" && b.name === "ASSETS"),
    "WRONG_ASSETS_BINDING",
  );
  for (const name of config.secrets.required)
    demand(
      actual.some((b) => b.type === "secret_text" && b.name === name),
      "MISSING_WORKER_SECRET",
    );
  for (const limiter of config.ratelimits)
    demand(
      actual.some(
        (b) =>
          b.name === limiter.name &&
          b.type === "ratelimit" &&
          String(b.namespace_id) === limiter.namespace_id &&
          b.simple?.limit === limiter.simple.limit &&
          b.simple?.period === limiter.simple.period,
      ),
      "WRONG_RATE_BINDING",
    );
}

/** Identity/ownership readback only. Owner approval attests scopes; GETs do not prove write permission. */
export async function verifyPreviewResources(
  read,
  input,
  config,
  base,
  expectedSha = input.previousSha,
) {
  const accountPath = `/accounts/${input.account}`;
  const zonePath = `/zones/${input.zone}`;
  const zone = (await read(zonePath)).result;
  demand(
    zone?.id === input.zone &&
      zone.name === "dovebevo.com" &&
      zone.status === "active" &&
      zone.account?.id === input.account,
    "WRONG_ZONE_ACCOUNT",
  );
  const source = base?.env?.staging;
  const sourceDb = source?.d1_databases?.find((db) => db.binding === "DB");
  demand(
    source?.name === "dovebevo-staging" && sourceDb?.database_name === "dovebevo-staging",
    "INVALID_SOURCE_CONFIG",
  );
  const sourceSettings = (await read(`${accountPath}/workers/scripts/dovebevo-staging/settings`))
    .result;
  demand(
    bindings(sourceSettings).some(
      (b) => b.type === "d1" && b.name === "DB" && b.id === sourceDb.database_id,
    ),
    "WRONG_SOURCE_ACCOUNT",
  );
  const db = (await read(`${accountPath}/d1/database/${input.database}`)).result;
  demand(db?.uuid === input.database && db.name === PREVIEW_NAME, "WRONG_PREVIEW_DATABASE");
  // num_tables is deprecated and unreliable; fresh/preview-only ownership remains an owner attestation.
  const widgets = await readPreviewList(read, `${accountPath}/challenges/widgets`);
  const matches = widgets.filter((w) => w.sitekey === input.sitekey);
  demand(
    matches.length === 1 &&
      matches[0].name === "Dove bevo mobile preview" &&
      matches[0].domains?.length === 1 &&
      matches[0].domains[0] === PREVIEW_HOST &&
      matches[0].mode === "managed" &&
      matches[0].ephemeral_id === false &&
      matches[0].clearance_level === "no_clearance",
    "UNSAFE_WIDGET",
  );
  // This list endpoint omits widget secrets. Never call the widget detail endpoint.
  const scripts = await readPreviewList(read, `${accountPath}/workers/scripts`, false);
  demand(
    scripts.length <= 100 &&
      scripts.every((s) => /^[A-Za-z0-9_-]{1,63}$/.test(s.id)) &&
      new Set(scripts.map((s) => s.id)).size === scripts.length,
    "UNBOUNDED_WORKER_LIST",
  );
  const exists = scripts.some((s) => s.id === PREVIEW_NAME);
  demand(exists === (expectedSha !== "absent"), "WORKER_PRECONDITION_CHANGED");
  for (const script of scripts) {
    const settings =
      script.id === "dovebevo-staging"
        ? sourceSettings
        : (await read(`${accountPath}/workers/scripts/${script.id}/settings`)).result;
    if (script.id === PREVIEW_NAME) assertManagedWorker(settings, config, expectedSha);
    else
      demand(
        !bindings(settings).some(
          (b) =>
            (b.type === "d1" && b.id === input.database) ||
            (b.type === "ratelimit" &&
              config.ratelimits.some((r) => String(b.namespace_id) === r.namespace_id)),
        ),
        "SHARED_PREVIEW_BINDING",
      );
  }
  // Domains is an unpaginated SinglePage endpoint. Reject ambiguous pagination metadata.
  const domainsBody = await read(`${accountPath}/workers/domains`);
  demand(
    Array.isArray(domainsBody.result) && domainsBody.result.every(object),
    "INVALID_DOMAIN_LIST",
  );
  const domainInfo = domainsBody.result_info;
  if (domainInfo !== undefined)
    demand(
      object(domainInfo) &&
        (domainInfo.total_count === undefined ||
          domainInfo.total_count === domainsBody.result.length) &&
        (domainInfo.total_pages === undefined || domainInfo.total_pages <= 1),
      "INCOMPLETE_DOMAIN_LIST",
    );
  const domains = domainsBody.result.filter(
    (d) => d.hostname === PREVIEW_HOST || d.service === PREVIEW_NAME,
  );
  if (exists) {
    demand(
      domains.length === 1 &&
        domains[0].hostname === PREVIEW_HOST &&
        domains[0].service === PREVIEW_NAME &&
        domains[0].zone_id === input.zone &&
        domains[0].enabled === true &&
        domains[0].previews_enabled === false,
      "DOMAIN_PRECONDITION_CHANGED",
    );
    const subdomain = (await read(`${accountPath}/workers/scripts/${PREVIEW_NAME}/subdomain`))
      .result;
    demand(
      subdomain?.enabled === false && subdomain.previews_enabled === false,
      "UNEXPECTED_WORKERS_DEV",
    );
  } else demand(domains.length === 0, "DOMAIN_COLLISION");
  const routes = await readPreviewList(read, `${zonePath}/workers/routes`, false);
  demand(!routes.some(routeConflicts), "ROUTE_COLLISION");
  const dns = await readPreviewList(read, `${zonePath}/dns_records?name=${PREVIEW_HOST}`);
  if (!exists) demand(dns.length === 0, "DNS_COLLISION");
  else
    demand(
      dns.every((record) => record.name === PREVIEW_HOST && record.proxied === true),
      "DNS_PRECONDITION_CHANGED",
    );
}

export function requirePreviewSecrets(env) {
  const token = env.MOBILE_PREVIEW_API_TOKEN;
  const secrets = {
    SESSION_HMAC_KEY: env.MOBILE_PREVIEW_SESSION_HMAC_KEY,
    HASH_KEY: env.MOBILE_PREVIEW_HASH_KEY,
    TURNSTILE_SECRET: env.MOBILE_PREVIEW_TURNSTILE_SECRET,
  };
  demand(
    typeof token === "string" && token.length >= 20 && token.length <= 512 && !/\s/.test(token),
    "MISSING_DEDICATED_TOKEN",
  );
  demand(
    Object.values(secrets).every(
      (value) =>
        typeof value === "string" &&
        value.length >= 32 &&
        value.length <= 512 &&
        !/\s/.test(value) &&
        !/^(?:1x000|2x000|3x000|local-dev|test-)/.test(value),
    ),
    "MISSING_DEDICATED_SECRETS",
  );
  demand(
    new Set(Object.values(secrets)).size === 3 && !Object.values(secrets).includes(token),
    "REUSED_SECRET",
  );
  return { token, secrets };
}

/** Testable order: complete preflight, migrations, fresh preconditions, atomic secrets/code upload, readback. */
export async function executePreviewDeployment({
  read,
  input,
  config,
  base,
  root,
  mutate,
  report,
}) {
  assertPreviewDeploymentConfig(config, input, base, root);
  report("PREFLIGHT");
  await verifyPreviewResources(read, input, config, base);
  report("MIGRATIONS_STARTED");
  await mutate("migrations", config);
  report("MIGRATIONS_COMPLETED");
  await verifyPreviewResources(read, input, config, base);
  report("UPLOAD_STARTED");
  await mutate("deploy", config);
  report("UPLOAD_COMPLETED");
  await verifyPreviewResources(read, input, config, base, input.sha);
  report("PROVIDER_CONFIGURATION_VERIFIED");
}

async function main() {
  if (process.env.MOBILE_PREVIEW_DEPLOY_ENABLED !== "true") {
    console.log("MOBILE_PREVIEW_DEPLOY_DISABLED");
    return;
  }
  const headResult = spawnSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  demand(headResult.status === 0, "HEAD_UNAVAILABLE");
  const input = requirePreviewActivation(process.env, headResult.stdout.trim());
  demand(
    process.platform === "linux" && process.env.RUNNER_ENVIRONMENT === "github-hosted",
    "HOSTED_LINUX_REQUIRED",
  );
  demand(
    workflowDigest(readFileSync(".github/workflows/mobile-preview-deploy.yml", "utf8")) ===
      PREVIEW_WORKFLOW_SHA256,
    "UNREVIEWED_WORKFLOW",
  );
  demand(
    !readdirSync(".").some(
      (name) => /^\.env(?:\.|$)|^\.dev\.vars(?:\.|$)/.test(name) && !name.endsWith(".example"),
    ),
    "LOCAL_ENV_FILES_PRESENT",
  );
  const root = resolve(".");
  const parsed = ts.parseConfigFileTextToJson(
    "wrangler.jsonc",
    readFileSync("wrangler.jsonc", "utf8"),
  );
  demand(!parsed.error, "INVALID_SOURCE_CONFIG");
  const base = parsed.config;
  const config = createPreviewDeploymentConfig(input, base, root);
  const builtBytes = readFileSync(
    ".wrangler/mobile-preview-build/dovebevo_mobile_preview/wrangler.json",
  );
  demand(
    checkMobilePreviewBuildConfig(JSON.parse(builtBytes.toString("utf8")), base).length === 0,
    "INVALID_DISABLED_BUILD",
  );
  const proof = JSON.parse(readFileSync(".wrangler/mobile-preview-build-proof.json", "utf8"));
  demand(
    proof.localOnly === false &&
      proof.deployed === false &&
      proof.dataVersion === "fixture" &&
      proof.configSha256 === createHash("sha256").update(builtBytes).digest("hex") &&
      proof.workerSha256 === createHash("sha256").update(readFileSync(config.main)).digest("hex"),
    "INVALID_BUILD_PROOF",
  );
  const { token, secrets } = requirePreviewSecrets(process.env);
  demand(
    typeof process.env.RUNNER_TEMP === "string" && process.env.RUNNER_TEMP.startsWith("/"),
    "RUNNER_TEMP_REQUIRED",
  );
  const temporary = mkdtempSync(join(process.env.RUNNER_TEMP, "mobile-preview-deploy-"));
  const configPath = join(temporary, "wrangler.json");
  const secretPath = join(temporary, "secrets.json");
  let phase = "PREFLIGHT";
  try {
    writeFileSync(configPath, JSON.stringify(config), { flag: "wx", mode: 0o600 });
    const logPath = join(temporary, "wrangler.log");
    symlinkSync("/dev/null", logPath);
    const childEnv = {
      PATH: process.env.PATH,
      HOME: temporary,
      XDG_CONFIG_HOME: temporary,
      CI: "true",
      NO_COLOR: "1",
      CLOUDFLARE_API_TOKEN: token,
      CLOUDFLARE_ACCOUNT_ID: input.account,
      CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false",
      WRANGLER_SEND_METRICS: "false",
      WRANGLER_LOG_SANITIZE: "true",
      WRANGLER_LOG_PATH: logPath,
    };
    await executePreviewDeployment({
      read: (path) => readPreviewApi(globalThis.fetch, token, path),
      input,
      config,
      base,
      root,
      report: (next) => {
        phase = next;
        console.log(next);
      },
      mutate: (operation, checkedConfig) => {
        assertPreviewDeploymentConfig(checkedConfig, input, base, root);
        demand(
          readFileSync(configPath, "utf8") === JSON.stringify(checkedConfig),
          "CONFIG_CHANGED",
        );
        const args =
          operation === "migrations"
            ? ["d1", "migrations", "apply", "DB", "--remote", "--config", configPath]
            : ["deploy", "--config", configPath, "--secrets-file", secretPath];
        if (operation === "deploy")
          writeFileSync(secretPath, JSON.stringify(secrets), { flag: "wx", mode: 0o600 });
        try {
          const result = spawnSync(
            process.execPath,
            [resolve("node_modules/wrangler/bin/wrangler.js"), ...args],
            {
              env: childEnv,
              stdio: "ignore",
              timeout: 300000,
            },
          );
          demand(result.status === 0 && !result.error, "INTENDED_WRITE_FAILED");
        } finally {
          if (operation === "deploy") rmSync(secretPath, { force: true });
        }
      },
    });
  } catch {
    // No raw provider, CLI, request, environment or exception data reaches logs.
    console.error(`MOBILE_PREVIEW_FAILED_AT_${phase}; earlier intended writes may have completed`);
    process.exitCode = 1;
  } finally {
    // mkdtemp created this private directory under the hosted runner's temporary directory.
    rmSync(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error(
      "MOBILE_PREVIEW_STOPPED; consult the last phase and verify state before retrying",
    );
    process.exitCode = 1;
  });
}
