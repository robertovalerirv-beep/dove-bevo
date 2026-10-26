import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  checkMobilePreviewBuildConfig,
  checkMobilePreviewConfig,
} from "../../scripts/check-config.ts";
import {
  createMobilePreviewConfig,
  LOCAL_PROOF_DATABASE_ID,
} from "../../scripts/mobile-preview-config.ts";

const base: unknown = ts.parseConfigFileTextToJson(
  "wrangler.jsonc",
  readFileSync("wrangler.jsonc", "utf8"),
).config;
// A synthetic valid UUID is supplied only to the pure config function; nothing is provisioned.
const NEW_DATABASE_ID = "76543210-abcd-4abc-8abc-123456789abc";
const fresh = () => createMobilePreviewConfig(NEW_DATABASE_ID, base);

describe("isolated disabled mobile Worker configuration", () => {
  it("has an explicit independent identity, fixture version and no public or admin route", () => {
    const config = fresh();
    expect(config.name).toBe("dovebevo-mobile-preview");
    expect(config.workers_dev).toBe(false);
    expect(config.preview_urls).toBe(false);
    expect(config.vars).toEqual({
      DATA_VERSION: "fixture",
      TURNSTILE_SITE_KEY: "",
      TURNSTILE_HOSTNAME: "mobile-preview.dovebevo.com",
      ACCESS_TEAM_DOMAIN: "",
      ACCESS_AUD: "",
      MOBILE_PREVIEW_ENABLED: "false",
    });
    expect(config.d1_databases).toEqual([
      {
        binding: "DB",
        database_name: "dovebevo-mobile-preview",
        database_id: NEW_DATABASE_ID,
        migrations_dir: "migrations",
      },
    ]);
    expect(config).not.toHaveProperty("env");
    expect(config).not.toHaveProperty("queues");
    expect(config).not.toHaveProperty("routes");
    expect(checkMobilePreviewConfig(config, base)).toEqual([]);
  });

  it.each([
    "",
    "not-a-uuid",
    "00000000-0000-4000-8000-000000000000",
    "d2d4f6d4-b2fb-435b-9f9e-a2961d9c9839",
    LOCAL_PROOF_DATABASE_ID,
  ])("refuses a missing, invalid, live or local-only database %s", (databaseId) => {
    expect(() => createMobilePreviewConfig(databaseId, base)).toThrow(/database/i);
  });

  it("compares against every existing environment's database, not only today's staging UUID", () => {
    const altered = structuredClone(base) as { env: Record<string, unknown> };
    altered.env.future = { d1_databases: [{ binding: "DB", database_id: NEW_DATABASE_ID }] };
    expect(() => createMobilePreviewConfig(NEW_DATABASE_ID, altered)).toThrow(/database/i);
  });

  it("permits the reserved UUID only for an explicit local build proof", () => {
    const config = createMobilePreviewConfig(LOCAL_PROOF_DATABASE_ID, base, true);
    expect(checkMobilePreviewConfig(config, base, true)).toEqual([]);
    expect(checkMobilePreviewConfig(config, base).join("\n")).toMatch(/local-only database/);
    expect(() => createMobilePreviewConfig(NEW_DATABASE_ID, base, true)).toThrow(/local-only/i);
  });

  it.each([
    ["name", "dovebevo-staging"],
    ["workers_dev", true],
    ["preview_urls", true],
    ["routes", [{ pattern: "mobile-preview.dovebevo.com", custom_domain: true }]],
    ["queues", {}],
    ["services", []],
    ["env", { staging: {} }],
    ["route", "www.dovebevo.com/*"],
  ])("fails closed when %s violates the disabled profile", (key, value) => {
    expect(checkMobilePreviewConfig({ ...fresh(), [key]: value }, base).length).toBeGreaterThan(0);
  });

  it.each([
    ["DATA_VERSION", "none"],
    ["MOBILE_PREVIEW_ENABLED", "true"],
    ["TURNSTILE_SITE_KEY", "1x00000000000000000000AA"],
    ["TURNSTILE_HOSTNAME", "www.dovebevo.com"],
    ["ACCESS_AUD", "live-admin-audience"],
    ["ACCESS_TEAM_DOMAIN", "live.cloudflareaccess.com"],
    ["TURNSTILE_SECRET", "secret-must-not-be-a-var"],
  ])("rejects unreviewed var %s", (key, value) => {
    const config = fresh();
    expect(
      checkMobilePreviewConfig({ ...config, vars: { ...config.vars, [key]: value } }, base).length,
    ).toBeGreaterThan(0);
  });

  it("rejects shared or duplicate rate-limit namespaces and changed limits", () => {
    for (const change of [
      { namespace_id: "1002" },
      { namespace_id: "2026102602" },
      { simple: { limit: 3000, period: 10 } },
    ]) {
      const config = fresh();
      const limiter = config.ratelimits[0];
      if (!limiter) throw new Error("Preview limiter missing");
      Object.assign(limiter, change);
      expect(checkMobilePreviewConfig(config, base).length).toBeGreaterThan(0);
    }
  });

  it("rejects added database bindings and unexpected nested configuration", () => {
    const config = fresh();
    const database = config.d1_databases[0];
    if (!database) throw new Error("Preview database missing");
    config.d1_databases.push({ ...database });
    expect(checkMobilePreviewConfig(config, base).join("\n")).toMatch(/database/);
    expect(
      checkMobilePreviewConfig(
        { ...fresh(), assets: { ...fresh().assets, directory: "docs/materiali" } },
        base,
      ).length,
    ).toBeGreaterThan(0);
  });

  it("validates an actual Vite flattened config captured with synthetic identifiers", () => {
    const built = JSON.parse(
      readFileSync("tests/fixtures/mobile-preview-wrangler.json", "utf8"),
    ) as Record<string, unknown>;
    built.configPath = resolve(".mobile-preview.wrangler.json");
    built.userConfigPath = resolve(".mobile-preview.wrangler.json");
    expect(checkMobilePreviewBuildConfig(built, base)).toEqual([]);
    for (const change of [
      { vars: { ...(built.vars as object), MOBILE_PREVIEW_ENABLED: "true" } },
      {
        queues: { producers: [{ binding: "TASKS_QUEUE", queue: "dovebevo-tasks" }], consumers: [] },
      },
      { services: [{ binding: "LIVE", service: "dovebevo-staging" }] },
      { assets: { ...(built.assets as object), directory: "../../../public" } },
      { routes: [{ pattern: "www.dovebevo.com/*" }] },
      { main: "../../../src/worker/index.ts" },
    ])
      expect(checkMobilePreviewBuildConfig({ ...built, ...change }, base).length).toBeGreaterThan(
        0,
      );
  });

  it("the build CLI refuses placeholders, live databases and inherited staging selection before building", () => {
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        ([key]) => !["CLOUDFLARE_ENV", "CLOUDFLARE_VITE_WRANGLER_CONFIG_PATH"].includes(key),
      ),
    );
    for (const databaseId of [LOCAL_PROOF_DATABASE_ID, "d2d4f6d4-b2fb-435b-9f9e-a2961d9c9839"]) {
      const result = spawnSync(
        process.execPath,
        ["scripts/mobile-preview-build.mjs", "--database-id", databaseId],
        { env, encoding: "utf8" },
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/database/i);
    }
    const inherited = spawnSync(
      process.execPath,
      ["scripts/mobile-preview-build.mjs", "--local-proof"],
      { env: { ...env, CLOUDFLARE_ENV: "staging" }, encoding: "utf8" },
    );
    expect(inherited.status).toBe(1);
    expect(inherited.stderr).toMatch(/Clear inherited Cloudflare/);
  });
});
