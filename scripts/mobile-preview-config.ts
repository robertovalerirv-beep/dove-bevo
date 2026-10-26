/** A source prerequisite only: this profile cannot enable or route the preview. */
export const LOCAL_PROOF_DATABASE_ID = "00000000-0000-4000-8000-000000000001";
export const MOBILE_PREVIEW_CONFIG_PATH = ".mobile-preview.wrangler.json";

type Json = Record<string, unknown>;
const object = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function existingIds(base: unknown, key: "d1_databases" | "ratelimits", field: string): string[] {
  if (!object(base)) throw new Error("Base configuration is required for isolation checks");
  const environments = object(base.env) ? Object.values(base.env) : [];
  return [base, ...environments].flatMap((entry) => {
    if (!object(entry) || !Array.isArray(entry[key])) return [];
    return entry[key].filter(object).map((binding) => String(binding[field]));
  });
}

export function createMobilePreviewConfig(databaseId: string, base: unknown, localProof = false) {
  if (localProof && databaseId !== LOCAL_PROOF_DATABASE_ID)
    throw new Error("A local-only build must use the reserved local-only database");
  if (!localProof && databaseId === LOCAL_PROOF_DATABASE_ID)
    throw new Error("The reserved local-only database cannot be used for deployment");
  if (
    !/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(databaseId) ||
    (!localProof && databaseId.startsWith("00000000-")) ||
    existingIds(base, "d1_databases", "database_id").some(
      (id) => id.toLowerCase() === databaseId.toLowerCase(),
    )
  ) {
    throw new Error(
      "An explicit new non-placeholder database UUID is required; live databases are forbidden",
    );
  }
  const namespaces = ["2026102601", "2026102602"] as const;
  if (
    existingIds(base, "ratelimits", "namespace_id").some((id) =>
      namespaces.some((reserved) => reserved === id),
    )
  )
    throw new Error("Preview rate-limit namespace collides with an existing configuration");
  return {
    $schema: "./node_modules/wrangler/config-schema.json",
    name: "dovebevo-mobile-preview",
    main: "src/worker/index.ts",
    compatibility_date: "2026-10-01",
    compatibility_flags: ["nodejs_compat"],
    workers_dev: false,
    preview_urls: false,
    assets: {
      directory: "./dist/client",
      binding: "ASSETS",
      not_found_handling: "single-page-application",
      run_worker_first: ["/api/*"],
    },
    triggers: { crons: ["0 * * * *"] },
    observability: {
      enabled: true,
      head_sampling_rate: 0.1,
      redact_query_string: true,
      logs: { invocation_logs: false },
    },
    vars: {
      DATA_VERSION: "fixture",
      TURNSTILE_SITE_KEY: "",
      TURNSTILE_HOSTNAME: "mobile-preview.dovebevo.com",
      ACCESS_TEAM_DOMAIN: "",
      ACCESS_AUD: "",
      MOBILE_PREVIEW_ENABLED: "false",
    },
    d1_databases: [
      {
        binding: "DB",
        database_name: "dovebevo-mobile-preview",
        database_id: databaseId.toLowerCase(),
        migrations_dir: "migrations",
      },
    ],
    ratelimits: [
      { name: "RATE_LIMITER", namespace_id: namespaces[0], simple: { limit: 20, period: 10 } },
      { name: "READ_LIMITER", namespace_id: namespaces[1], simple: { limit: 100, period: 60 } },
    ],
  };
}
