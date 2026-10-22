// Pure check behind scripts/check-config.mjs: every deployable environment of wrangler.jsonc must stand
// on its own (environments do not inherit bindings or vars) and must never carry the development
// placeholders of the top level (ADR 0021, red-team audit 22/10/2026).
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

export function checkConfig(config: unknown, workflows: Record<string, string>): string[] {
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

  // A deploy builds for one named environment: without it the top level (placeholders) ships.
  for (const [file, text] of Object.entries(workflows)) {
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
