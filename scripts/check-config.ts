// Pure check behind scripts/check-config.mjs: every deployable environment of wrangler.jsonc must stand
// on its own (environments do not inherit bindings or vars) and must never carry the development
// placeholders of the top level (ADR 0021, red-team audit 22/10/2026).
import { createMobilePreviewConfig, MOBILE_PREVIEW_CONFIG_PATH } from "./mobile-preview-config.ts";
import { basename, resolve } from "node:path";
import { PREVIEW_WORKFLOW_SHA256, workflowDigest } from "./mobile-preview-deploy-policy.ts";

type Json = Record<string, unknown>;

const PLACEHOLDER = "local-dev-only";
const TURNSTILE_TEST_SECRET = "1x0000000000000000000000000000000AA";
const EMPTY_D1_ID = "00000000-0000-4000-8000-000000000000";
/** Public identifiers an environment must define itself (non-empty). */
const REQUIRED_VARS = [
  "DATA_VERSION",
  "TURNSTILE_SITE_KEY",
  "TURNSTILE_HOSTNAME",
  "ACCESS_TEAM_DOMAIN",
  "ACCESS_AUD",
];
/** Set with `wrangler secret` only (SPEC 13.6): never a var, so never in the repository. */
const SECRET_KEYS = ["SESSION_HMAC_KEY", "HASH_KEY", "TURNSTILE_SECRET"];
const LIMITERS = ["RATE_LIMITER", "READ_LIMITER"];
/** The local limit is 3.000: a real environment must be far stricter. */
const MAX_LIMIT = 200;

const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Exact disabled profile; a future enabled/routed profile requires its own reviewed change. */
export function checkMobilePreviewConfig(
  config: unknown,
  base: unknown,
  localProof = false,
): string[] {
  if (!isObject(config)) return ["mobile preview: configuration must be an object"];
  const databases = Array.isArray(config.d1_databases) ? config.d1_databases.filter(isObject) : [];
  const id = databases[0]?.database_id;
  if (typeof id !== "string") return ["mobile preview: explicit new database UUID missing"];
  let expected: Json;
  try {
    expected = createMobilePreviewConfig(id, base, localProof);
  } catch (error) {
    return [
      `mobile preview: ${error instanceof Error ? error.message : "invalid database configuration"}`,
    ];
  }
  const equal = (a: unknown, b: unknown): boolean => {
    if (isObject(a) && isObject(b)) {
      const keys = Object.keys(a);
      return keys.length === Object.keys(b).length && keys.every((key) => equal(a[key], b[key]));
    }
    if (Array.isArray(a) && Array.isArray(b))
      return a.length === b.length && a.every((entry: unknown, i) => equal(entry, b[i]));
    return a === b;
  };
  return [...new Set([...Object.keys(config), ...Object.keys(expected)])]
    .filter((key) => !equal(config[key], expected[key]))
    .map((key) => `mobile preview: ${key} differs from the reviewed disabled profile`);
}

/** The pinned Vite plugin adds these inert defaults. Any newly introduced binding fails closed. */
export function checkMobilePreviewBuildConfig(
  config: unknown,
  base: unknown,
  localProof = false,
): string[] {
  if (!isObject(config)) return ["mobile preview build: configuration must be an object"];
  const metadata: Json = {
    configPath: resolve(MOBILE_PREVIEW_CONFIG_PATH),
    userConfigPath: resolve(MOBILE_PREVIEW_CONFIG_PATH),
    topLevelName: "dovebevo-mobile-preview",
    definedEnvironments: [],
    jsx_factory: "React.createElement",
    jsx_fragment: "React.Fragment",
    rules: [{ type: "ESModule", globs: ["**/*.js", "**/*.mjs"] }],
    durable_objects: { bindings: [] },
    workflows: [],
    migrations: [],
    exports: {},
    kv_namespaces: [],
    cloudchamber: {},
    send_email: [],
    queues: { producers: [], consumers: [] },
    connect: [],
    r2_buckets: [],
    vectorize: [],
    ai_search_namespaces: [],
    ai_search: [],
    agent_memory: [],
    hyperdrive: [],
    services: [],
    analytics_engine_datasets: [],
    dispatch_namespaces: [],
    mtls_certificates: [],
    pipelines: [],
    k2: [],
    secrets_store_secrets: [],
    artifacts: [],
    unsafe_hello_world: [],
    flagship: [],
    worker_loaders: [],
    vpc_services: [],
    vpc_networks: [],
    logfwdr: { bindings: [] },
    python_modules: { exclude: ["**/*.pyc"] },
    dev: {
      ip: "127.0.0.1",
      local_protocol: "http",
      upstream_protocol: "http",
      enable_containers: true,
      generate_types: false,
    },
    no_bundle: true,
  };
  const normalized: Json = Object.fromEntries(
    Object.entries(config).filter(([key]) => !(key in metadata)),
  );
  const problems: string[] = [];
  for (const [key, value] of Object.entries(metadata)) {
    if (JSON.stringify(config[key]) !== JSON.stringify(value))
      problems.push(`mobile preview build: unexpected ${key}`);
  }
  if (normalized.main !== "index.js")
    problems.push("mobile preview build: unexpected Worker entry");
  normalized.main = "src/worker/index.ts";
  const assets = isObject(normalized.assets) ? normalized.assets : {};
  if (assets.directory !== "../client")
    problems.push("mobile preview build: unexpected assets directory");
  normalized.assets = { ...assets, directory: "./dist/client" };
  const databases = Array.isArray(normalized.d1_databases) ? normalized.d1_databases : [];
  normalized.d1_databases = databases.map((database: unknown) => {
    if (!isObject(database)) return database;
    if (database.migrations_dir !== "../../../migrations")
      problems.push("mobile preview build: unexpected migrations directory");
    return { ...database, migrations_dir: "migrations" };
  });
  normalized.$schema = "./node_modules/wrangler/config-schema.json";
  return [...problems, ...checkMobilePreviewConfig(normalized, base, localProof)];
}

export function checkConfig(
  config: unknown,
  workflows: Record<string, string>,
  standalonePreview?: unknown,
): string[] {
  const problems: string[] = [];
  const environments = isObject(config) && isObject(config.env) ? config.env : {};
  if (Object.keys(environments).length === 0) problems.push("wrangler.jsonc: no env.* defined");

  for (const [name, raw] of Object.entries(environments)) {
    const env = isObject(raw) ? raw : {};
    const vars = isObject(env.vars) ? env.vars : {};
    for (const key of REQUIRED_VARS) {
      if (typeof vars[key] !== "string" || vars[key] === "") {
        problems.push(`env.${name}: var ${key} missing or empty`);
      }
    }
    for (const key of SECRET_KEYS) {
      if (key in vars) problems.push(`env.${name}: ${key} must be a Worker secret, not a var`);
    }
    for (const [key, value] of Object.entries(vars)) {
      const text = String(value);
      if (text.includes(PLACEHOLDER) || text === TURNSTILE_TEST_SECRET || text === "example.com") {
        problems.push(`env.${name}: var ${key} holds a development placeholder`);
      }
    }
    const siteKey = vars.TURNSTILE_SITE_KEY;
    if (typeof siteKey === "string" && siteKey.startsWith("1x0000")) {
      problems.push(`env.${name}: TURNSTILE_SITE_KEY is the Cloudflare test key`);
    }

    const ratelimits = Array.isArray(env.ratelimits) ? env.ratelimits.filter(isObject) : [];
    for (const binding of LIMITERS) {
      const limiter = ratelimits.find((r) => r.name === binding);
      const limit = isObject(limiter?.simple) ? limiter.simple.limit : undefined;
      if (!limiter) problems.push(`env.${name}: ratelimits ${binding} missing`);
      else if (typeof limit !== "number" || limit > MAX_LIMIT) {
        problems.push(
          `env.${name}: ratelimits ${binding} limit must be a number up to ${String(MAX_LIMIT)}`,
        );
      }
    }

    const databases = Array.isArray(env.d1_databases) ? env.d1_databases.filter(isObject) : [];
    const db = databases.find((d) => d.binding === "DB");
    if (!db) problems.push(`env.${name}: d1_databases DB missing`);
    else if (typeof db.database_id !== "string" || db.database_id === EMPTY_D1_ID) {
      problems.push(`env.${name}: d1_databases DB has the local placeholder id`);
    }
  }

  if (standalonePreview !== undefined)
    problems.push(...checkMobilePreviewConfig(standalonePreview, config));

  // The preview helper is build-only: a Vite selector does not bind a later Wrangler deployment.
  // The separate deployment helper has an exact reviewed workflow and its own strict runtime target guard.
  for (const [file, text] of Object.entries(workflows)) {
    if (
      basename(file) === "mobile-preview-deploy.yml" ||
      text.includes("mobile-preview-deploy.mjs")
    ) {
      if (
        basename(file) !== "mobile-preview-deploy.yml" ||
        workflowDigest(text) !== PREVIEW_WORKFLOW_SHA256
      )
        problems.push(`${file}: differs from the reviewed standalone deployment workflow`);
    }
    if (!/wrangler\s+deploy/.test(text)) continue;
    const named = [...text.matchAll(/CLOUDFLARE_ENV:\s*["']?([\w-]+)/g)].map((m) => m[1] ?? "");
    if (named.length === 0) problems.push(`${file}: wrangler deploy without CLOUDFLARE_ENV`);
    for (const target of named) {
      if (!(target in environments)) {
        problems.push(`${file}: CLOUDFLARE_ENV ${target} is not an env of wrangler.jsonc`);
      }
    }
  }
  return problems;
}
