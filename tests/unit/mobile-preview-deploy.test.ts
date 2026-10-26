import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { checkConfig, checkMobilePreviewConfig } from "../../scripts/check-config.ts";
import {
  PREVIEW_HOST,
  PREVIEW_NAME,
  PREVIEW_REF,
  PREVIEW_REPOSITORY,
  requirePreviewActivation,
  createPreviewDeploymentConfig,
  assertPreviewDeploymentConfig,
  type PreviewInputs,
} from "../../scripts/mobile-preview-deploy-policy.ts";

type Json = Record<string, unknown>;
type Read = (path: string) => Promise<Json>;
type Config = ReturnType<typeof createPreviewDeploymentConfig>;
const modulePath = "../../scripts/mobile-preview-deploy.mjs";
const { executePreviewDeployment, readPreviewApi, readPreviewList, requirePreviewSecrets } =
  (await import(modulePath)) as {
    executePreviewDeployment: (options: {
      read: Read;
      input: PreviewInputs;
      config: Config;
      base: unknown;
      root: string;
      mutate: (operation: string, config: Config) => Promise<void>;
      report: (phase: string) => void;
    }) => Promise<void>;
    readPreviewApi: (fetchImpl: typeof fetch, token: string, path: string) => Promise<Json>;
    readPreviewList: (read: Read, path: string, paginated?: boolean) => Promise<Json[]>;
    requirePreviewSecrets: (env: Record<string, string>) => unknown;
  };
const base = ts.parseConfigFileTextToJson("wrangler.jsonc", readFileSync("wrangler.jsonc", "utf8"))
  .config as {
  env: {
    staging: { d1_databases: { database_id: string }[]; vars: { TURNSTILE_SITE_KEY: string } };
  };
};
const sourceId = base.env.staging.d1_databases[0]?.database_id;
const input: PreviewInputs = {
  account: "a".repeat(32),
  zone: "b".repeat(32),
  database: "76543210-abcd-4abc-8abc-123456789abc",
  sitekey: "0x4FAKEPUBLICPREVIEWKEY123456",
  sha: "c".repeat(40),
  previousSha: "absent",
};
const env = {
  GITHUB_ACTIONS: "true",
  GITHUB_EVENT_NAME: "push",
  GITHUB_REPOSITORY: PREVIEW_REPOSITORY,
  GITHUB_REF: PREVIEW_REF,
  GITHUB_SHA: input.sha,
  MOBILE_PREVIEW_DEPLOY_ENABLED: "true",
  MOBILE_PREVIEW_APPROVED_SHA: input.sha,
  MOBILE_PREVIEW_OWNER_APPROVED_SHA: input.sha,
  MOBILE_PREVIEW_PREVIOUS_SHA: "absent",
  MOBILE_PREVIEW_ACCOUNT_ID: input.account,
  MOBILE_PREVIEW_ZONE_ID: input.zone,
  MOBILE_PREVIEW_DATABASE_ID: input.database,
  MOBILE_PREVIEW_TURNSTILE_SITE_KEY: input.sitekey,
};
const config = () => createPreviewDeploymentConfig(input, base, resolve("."));
const page = (result: Json[]) => ({
  success: true,
  result,
  result_info: { page: 1, per_page: 100, count: result.length, total_count: result.length },
});
function hostedBindings(profile: Config, sha = input.sha): Json[] {
  return [
    { type: "d1", name: "DB", id: input.database },
    { type: "assets", name: "ASSETS" },
    ...Object.entries({ ...profile.vars, MOBILE_PREVIEW_DEPLOYMENT_SHA: sha }).map(
      ([name, text]) => ({ type: "plain_text", name, text }),
    ),
    ...profile.secrets.required.map((name) => ({ type: "secret_text", name })),
    ...profile.ratelimits.map((r) => ({
      type: "ratelimit",
      name: r.name,
      namespace_id: r.namespace_id,
      simple: r.simple,
    })),
  ];
}
function scenario(override?: (path: string, body: Json) => Json, previousSha = "absent") {
  let deployed = previousSha !== "absent";
  let currentSha = previousSha;
  const profile = config();
  const report = vi.fn<(phase: string) => void>();
  const mutate = vi.fn((operation: string, checked: Config) => {
    expect(checked).toEqual(profile);
    if (operation === "deploy") {
      deployed = true;
      currentSha = input.sha;
    }
    return Promise.resolve();
  });
  const read = vi.fn<Read>((path) => {
    const url = new URL(path, "https://example.invalid");
    let body: Json;
    if (url.pathname === `/zones/${input.zone}`)
      body = {
        result: {
          id: input.zone,
          name: "dovebevo.com",
          status: "active",
          account: { id: input.account },
        },
      };
    else if (url.pathname.endsWith("/workers/scripts/dovebevo-staging/settings"))
      body = { result: { bindings: [{ type: "d1", name: "DB", id: sourceId }] } };
    else if (url.pathname.endsWith(`/d1/database/${input.database}`))
      body = { result: { uuid: input.database, name: PREVIEW_NAME } };
    else if (url.pathname.endsWith("/challenges/widgets"))
      body = page([
        {
          name: "Dove bevo mobile preview",
          sitekey: input.sitekey,
          domains: [PREVIEW_HOST],
          mode: "managed",
          ephemeral_id: false,
          clearance_level: "no_clearance",
        },
      ]);
    else if (url.pathname.endsWith("/workers/scripts"))
      body = { result: [{ id: "dovebevo-staging" }, ...(deployed ? [{ id: PREVIEW_NAME }] : [])] };
    else if (url.pathname.endsWith(`/workers/scripts/${PREVIEW_NAME}/settings`))
      body = { result: { bindings: hostedBindings(profile, currentSha) } };
    else if (url.pathname.endsWith("/workers/domains"))
      body = {
        result: deployed
          ? [
              {
                hostname: PREVIEW_HOST,
                service: PREVIEW_NAME,
                zone_id: input.zone,
                enabled: true,
                previews_enabled: false,
              },
            ]
          : [],
      };
    else if (url.pathname.endsWith("/subdomain"))
      body = { result: { enabled: false, previews_enabled: false } };
    else if (url.pathname.endsWith("/workers/routes")) body = { result: [] };
    else if (url.pathname.endsWith("/dns_records")) body = page([]);
    else if (url.pathname.endsWith("/settings")) body = { result: { bindings: [] } };
    else throw new Error("Unexpected endpoint");
    return Promise.resolve(override ? override(path, body) : body);
  });
  return {
    read,
    input: { ...input, previousSha },
    config: profile,
    base,
    root: resolve("."),
    mutate,
    report,
  };
}

describe("isolated preview deployment authorization and exact target", () => {
  it("accepts only the explicitly approved same-repository push", () => {
    expect(requirePreviewActivation(env, input.sha)).toEqual(input);
  });
  it.each([
    ["MOBILE_PREVIEW_DEPLOY_ENABLED", ""],
    ["MOBILE_PREVIEW_DEPLOY_ENABLED", "false"],
    ["MOBILE_PREVIEW_APPROVED_SHA", "d".repeat(40)],
    ["MOBILE_PREVIEW_OWNER_APPROVED_SHA", ""],
    ["GITHUB_EVENT_NAME", "pull_request"],
    ["GITHUB_EVENT_NAME", "workflow_dispatch"],
    ["GITHUB_REPOSITORY", "attacker/dove-bevo"],
    ["GITHUB_REF", "refs/heads/main"],
    ["GITHUB_SHA", "d".repeat(40)],
    ["MOBILE_PREVIEW_PREVIOUS_SHA", "latest"],
    ["MOBILE_PREVIEW_ACCOUNT_ID", "../other"],
    ["MOBILE_PREVIEW_ZONE_ID", ""],
    ["MOBILE_PREVIEW_TURNSTILE_SITE_KEY", "1x00000000000000000000AA"],
    ["CLOUDFLARE_ENV", "staging"],
    ["CLOUDFLARE_VITE_WRANGLER_CONFIG_PATH", "wrangler.jsonc"],
  ])("rejects altered or missing authorization %s", (key, value) => {
    expect(() => requirePreviewActivation({ ...env, [key]: value }, input.sha)).toThrow();
  });
  it("requires a database distinct from every root and named environment", () => {
    for (const database of [sourceId ?? "", "00000000-0000-4000-8000-000000000001", "not-a-uuid"]) {
      expect(() => createPreviewDeploymentConfig({ ...input, database }, base, ".")).toThrow();
    }
    const expanded = {
      ...base,
      env: {
        ...base.env,
        production: { d1_databases: [{ database_id: input.database.toUpperCase() }] },
      },
    };
    expect(() => createPreviewDeploymentConfig(input, expanded, ".")).toThrow();
  });
  it("rejects the live widget and rate namespace collisions", () => {
    expect(() =>
      createPreviewDeploymentConfig(
        { ...input, sitekey: base.env.staging.vars.TURNSTILE_SITE_KEY },
        base,
        ".",
      ),
    ).toThrow("SHARED_TURNSTILE_WIDGET");
    expect(() =>
      createPreviewDeploymentConfig(
        input,
        { ...base, ratelimits: [{ namespace_id: "2026102601" }] },
        ".",
      ),
    ).toThrow();
  });
  it.each([
    { name: "dovebevo-staging" },
    { workers_dev: true },
    { preview_urls: true },
    { routes: [{ pattern: "www.dovebevo.com", custom_domain: true }] },
    { env: { staging: {} } },
    { queues: { producers: [{ binding: "TASKS_QUEUE" }] } },
    { vars: { MOBILE_PREVIEW_ENABLED: "false" } },
    { main: "src/worker/index.ts" },
  ])("rejects any added or changed deployment field: %j", (changed) => {
    expect(() => {
      assertPreviewDeploymentConfig({ ...config(), ...changed }, input, base, resolve("."));
    }).toThrow("UNREVIEWED_DEPLOYMENT_CONFIG");
  });
  it("keeps the disabled build guard distinct and pins the entire new workflow", () => {
    expect(checkMobilePreviewConfig(config(), base).length).toBeGreaterThan(0);
    const file = ".github/workflows/mobile-preview-deploy.yml";
    const workflow = readFileSync(file, "utf8");
    expect(checkConfig(base, { [file]: workflow })).toEqual([]);
    for (const changed of [
      workflow.replace("push:", "pull_request:"),
      workflow.replace("persist-credentials: false", "persist-credentials: true"),
      workflow.replace("github.sha }}", "'main' }}"),
      workflow.replace("MOBILE_PREVIEW_API_TOKEN }}", "CLOUDFLARE_API_TOKEN }}"),
    ])
      expect(checkConfig(base, { [file]: changed }).length).toBeGreaterThan(0);
  });
  it("does not accept inherited legacy secrets", () => {
    expect(() =>
      requirePreviewSecrets({
        CLOUDFLARE_API_TOKEN: "x".repeat(40),
        SESSION_HMAC_KEY: "y".repeat(40),
      }),
    ).toThrow("MISSING_DEDICATED_TOKEN");
    expect(() =>
      requirePreviewSecrets({
        MOBILE_PREVIEW_API_TOKEN: "x".repeat(40),
        MOBILE_PREVIEW_SESSION_HMAC_KEY: "y".repeat(40),
        MOBILE_PREVIEW_HASH_KEY: "y".repeat(40),
        MOBILE_PREVIEW_TURNSTILE_SECRET: "z".repeat(40),
      }),
    ).toThrow("REUSED_SECRET");
  });
});

describe("provider preconditions and ordered intended writes", () => {
  it("updates an explicitly identified managed preview and verifies the new SHA", async () => {
    const options = scenario(undefined, "d".repeat(40));
    await expect(executePreviewDeployment(options)).resolves.toBeUndefined();
    expect(options.mutate).toHaveBeenCalledTimes(2);
  });
  it.each(["wrong-prior-sha", "wrong-database", "extra-binding", "missing-secret"])(
    "rejects an existing Worker with %s before migrations",
    async (change) => {
      const options = scenario((path, body) => {
        if (!path.endsWith(`/workers/scripts/${PREVIEW_NAME}/settings`)) return body;
        const values = hostedBindings(
          config(),
          change === "wrong-prior-sha" ? "e".repeat(40) : "d".repeat(40),
        );
        if (change === "wrong-database") values[0] = { type: "d1", name: "DB", id: sourceId };
        if (change === "extra-binding") values.push({ type: "kv_namespace", name: "UNEXPECTED" });
        return {
          result: {
            bindings:
              change === "missing-secret"
                ? values.filter((value) => value.name !== "HASH_KEY")
                : values,
          },
        };
      }, "d".repeat(40));
      await expect(executePreviewDeployment(options)).rejects.toThrow();
      expect(options.mutate).not.toHaveBeenCalled();
    },
  );
  it.each(["database", "rate namespace"])(
    "rejects another Worker sharing the preview %s",
    async (shared) => {
      const options = scenario((path, body) => {
        if (path.endsWith("/workers/scripts"))
          return { result: [{ id: "dovebevo-staging" }, { id: "other-worker" }] };
        if (path.endsWith("/other-worker/settings"))
          return {
            result: {
              bindings: [
                shared === "database"
                  ? { type: "d1", name: "OTHER_DB", id: input.database }
                  : { type: "ratelimit", name: "OTHER_RATE", namespace_id: "2026102601" },
              ],
            },
          };
        return body;
      });
      await expect(executePreviewDeployment(options)).rejects.toThrow("SHARED_PREVIEW_BINDING");
      expect(options.mutate).not.toHaveBeenCalled();
    },
  );
  it("migrates before upload, checks resources again, and reads configuration back", async () => {
    const options = scenario();
    await executePreviewDeployment(options);
    expect(options.mutate.mock.calls.map(([operation]) => operation)).toEqual([
      "migrations",
      "deploy",
    ]);
    expect(
      options.read.mock.calls.filter(([path]) => path === `/zones/${input.zone}`),
    ).toHaveLength(3);
    expect(options.report).toHaveBeenLastCalledWith("PROVIDER_CONFIGURATION_VERIFIED");
    expect(options.read.mock.calls.every(([path]) => !path.includes("/challenges/widgets/"))).toBe(
      true,
    );
  });
  it.each([
    [
      "wrong account",
      "/zones/",
      {
        result: {
          id: input.zone,
          name: "dovebevo.com",
          status: "active",
          account: { id: "f".repeat(32) },
        },
      },
    ],
    [
      "wrong source binding",
      "/dovebevo-staging/settings",
      { result: { bindings: [{ name: "DB", type: "d1", id: input.database }] } },
    ],
    ["wrong database", "/d1/database/", { result: { uuid: input.database, name: "production" } }],
    [
      "broad widget",
      "/challenges/widgets",
      page([
        {
          sitekey: input.sitekey,
          name: "Dove bevo mobile preview",
          domains: ["dovebevo.com"],
          mode: "managed",
          ephemeral_id: false,
          clearance_level: "no_clearance",
        },
      ]),
    ],
    [
      "Worker collision",
      "/workers/scripts",
      { result: [{ id: "dovebevo-staging" }, { id: PREVIEW_NAME }] },
    ],
    [
      "hostname collision",
      "/workers/domains",
      { result: [{ hostname: PREVIEW_HOST, service: "unrelated" }] },
    ],
    ["DNS collision", "/dns_records", page([{ name: PREVIEW_HOST, content: "somewhere" }])],
    [
      "wildcard route collision",
      "/workers/routes",
      { result: [{ pattern: "*.dovebevo.com/*", script: "production" }] },
    ],
  ] as const)("fails before writes for %s", async (_name, pathPart, body) => {
    const options = scenario((path, original) => (path.includes(pathPart) ? body : original));
    await expect(executePreviewDeployment(options)).rejects.toThrow();
    expect(options.mutate).not.toHaveBeenCalled();
  });
  it("allows an unrelated www route without broadening the preview host", async () => {
    const options = scenario((path, body) =>
      path.includes("/workers/routes")
        ? { result: [{ pattern: "www.dovebevo.com/*", script: "dovebevo-staging" }] }
        : body,
    );
    await expect(executePreviewDeployment(options)).resolves.toBeUndefined();
  });
  it("stops before upload after a migration permission failure", async () => {
    const options = scenario();
    options.mutate.mockRejectedValueOnce(new Error("INTENDED_WRITE_FAILED"));
    await expect(executePreviewDeployment(options)).rejects.toThrow("INTENDED_WRITE_FAILED");
    expect(options.mutate).toHaveBeenCalledTimes(1);
    expect(options.report).toHaveBeenLastCalledWith("MIGRATIONS_STARTED");
  });
  it("does not overwrite a Worker created between migration and upload", async () => {
    const options = scenario();
    options.mutate.mockImplementationOnce(() => {
      options.read.mockImplementationOnce(() =>
        Promise.reject(new Error("WORKER_PRECONDITION_CHANGED")),
      );
      return Promise.resolve();
    });
    await expect(executePreviewDeployment(options)).rejects.toThrow("WORKER_PRECONDITION_CHANGED");
    expect(options.mutate).toHaveBeenCalledTimes(1);
  });
  it("does not claim success when upload completed but readback disagrees", async () => {
    const options = scenario((path, body) =>
      path.includes("/subdomain") ? { result: { enabled: true, previews_enabled: false } } : body,
    );
    await expect(executePreviewDeployment(options)).rejects.toThrow("UNEXPECTED_WORKERS_DEV");
    expect(options.mutate).toHaveBeenCalledTimes(2);
    expect(options.report).toHaveBeenLastCalledWith("UPLOAD_COMPLETED");
  });
});

describe("bounded provider parsing", () => {
  it("rejects incomplete pagination instead of claiming absence", async () => {
    const read: Read = () =>
      Promise.resolve({
        ...page([]),
        result_info: { page: 1, count: 0, per_page: 100, total_count: 1 },
      });
    await expect(readPreviewList(read, "/list")).rejects.toThrow("INCOMPLETE_LIST");
  });
  it.each([
    new Response("private provider body", { status: 403 }),
    new Response("not json"),
    Response.json({ success: false, errors: [{ message: "private provider body" }] }),
    new Response("x".repeat(262145)),
  ])("sanitizes denial, invalid JSON, failure envelopes and oversized bodies", async (response) => {
    const fetchImpl = vi.fn<typeof fetch>(() => Promise.resolve(response));
    await expect(readPreviewApi(fetchImpl, "fake-only", "/zones/id")).rejects.toThrow(
      /^PROVIDER_READ_FAILED$/,
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/zones/id",
      expect.objectContaining({ method: "GET", redirect: "error" }),
    );
  });
});
