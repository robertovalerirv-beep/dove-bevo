import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { checkConfig } from "../../scripts/check-config.ts";

type Config = { env: Record<string, Record<string, unknown>> };
const real = ts.parseConfigFileTextToJson("wrangler.jsonc", readFileSync("wrangler.jsonc", "utf8"))
  .config as Config;
const workflows = {
  "deploy-staging.yml": readFileSync(".github/workflows/deploy-staging.yml", "utf8"),
};
const clone = () => structuredClone(real);

describe("deploy configuration guard (ADR 0021)", () => {
  it("accepts the real wrangler.jsonc and the real deploy workflow", () => {
    expect(checkConfig(real, workflows)).toEqual([]);
  });

  it("rejects an environment that inherits nothing it needs", () => {
    const config = clone();
    delete config.env.staging?.ratelimits;
    delete (config.env.staging?.vars as Record<string, unknown>).ACCESS_AUD;
    expect(checkConfig(config, workflows)).toEqual([
      "env.staging: var ACCESS_AUD missing or empty",
      "env.staging: ratelimits RATE_LIMITER missing",
      "env.staging: ratelimits READ_LIMITER missing",
    ]);
  });

  it("rejects secrets written as vars and development placeholders", () => {
    const config = clone();
    Object.assign(config.env.staging?.vars as object, {
      SESSION_HMAC_KEY: "local-dev-only-session-key",
      TURNSTILE_HOSTNAME: "example.com",
      TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
    });
    const problems = checkConfig(config, workflows);
    expect(problems).toContain("env.staging: SESSION_HMAC_KEY must be a Worker secret, not a var");
    expect(problems).toContain("env.staging: var SESSION_HMAC_KEY holds a development placeholder");
    expect(problems).toContain(
      "env.staging: var TURNSTILE_HOSTNAME holds a development placeholder",
    );
    expect(problems).toContain("env.staging: TURNSTILE_SITE_KEY is the Cloudflare test key");
  });

  it("rejects the local limits and the local database id", () => {
    const config = clone();
    const staging = config.env.staging as unknown as {
      ratelimits: { simple: { limit: number } }[];
      d1_databases: { database_id: string }[];
    };
    const [limiter] = staging.ratelimits;
    const [database] = staging.d1_databases;
    if (!limiter || !database) throw new Error("staging config changed shape");
    limiter.simple.limit = 3000;
    database.database_id = "00000000-0000-4000-8000-000000000000";
    const problems = checkConfig(config, workflows);
    expect(problems).toContain(
      "env.staging: ratelimits RATE_LIMITER limit must be a number up to 200",
    );
    expect(problems).toContain("env.staging: d1_databases DB has the local placeholder id");
  });

  it("rejects a deploy that does not name its environment, or names one that does not exist", () => {
    expect(checkConfig(real, { "d.yml": "run: npx wrangler deploy --var DATA_VERSION:1" })).toEqual(
      ["d.yml: wrangler deploy without CLOUDFLARE_ENV"],
    );
    expect(
      checkConfig(real, { "d.yml": "CLOUDFLARE_ENV: production\nrun: wrangler deploy" }),
    ).toEqual(["d.yml: CLOUDFLARE_ENV production is not an env of wrangler.jsonc"]);
  });

  it("rejects a config without any environment", () => {
    expect(checkConfig({}, {})).toEqual(["wrangler.jsonc: no env.* defined"]);
  });
});
