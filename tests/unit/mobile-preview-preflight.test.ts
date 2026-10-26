import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

type Check = { status: string; code: string };
type Report = {
  readiness: string;
  targetAccountMatchesExpectedSource: string;
  checks: Record<string, Check>;
  capabilities: Record<string, string>;
  provisioningAuthorized: boolean;
};
type Options = {
  configText: string;
  env: Record<string, string>;
  fetchImpl: typeof fetch;
};
const modulePath = "../../scripts/mobile-preview-preflight.mjs";
const { runPreflight } = (await import(modulePath)) as {
  runPreflight: (options: Options) => Promise<Report>;
};
const account = "a".repeat(32);
const zone = "b".repeat(32);
const database = "11111111-2222-4333-8444-555555555555";
const token = "test-only-ci-token-never-output";
const serverSecret = "server-returned-widget-secret-never-output";
const configText = JSON.stringify({
  env: {
    staging: {
      name: "dovebevo-staging",
      d1_databases: [{ binding: "DB", database_name: "dovebevo-staging", database_id: database }],
    },
  },
});
const env = { CLOUDFLARE_ACCOUNT_ID: account, CLOUDFLARE_API_TOKEN: token };
const page = (result: unknown[]) => ({
  success: true,
  result,
  result_info: { page: 1, per_page: 100, count: result.length, total_count: result.length },
});

function fixture(url: URL): Response {
  if (url.pathname.endsWith("/workers/scripts/dovebevo-staging/settings")) {
    return Response.json({
      success: true,
      result: { bindings: [{ type: "d1", name: "DB", id: database }] },
    });
  }
  if (url.pathname.endsWith(`/d1/database/${database}`)) {
    return Response.json({ success: true, result: { name: "dovebevo-staging", uuid: database } });
  }
  if (url.pathname === "/client/v4/zones") {
    return Response.json(
      page([{ id: zone, name: "dovebevo.com", status: "active", account: { id: account } }]),
    );
  }
  if (url.pathname.endsWith("/workers/scripts")) {
    return Response.json({ success: true, result: [{ id: "dovebevo-staging" }] });
  }
  if (url.pathname.endsWith("/challenges/widgets")) {
    return Response.json(page([{ name: "Unrelated private app", secret: serverSecret }]));
  }
  return Response.json(page([]));
}

function options(override?: (url: URL) => Response | Promise<Response>) {
  const fetchImpl = vi.fn<typeof fetch>((input, init) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );
    expect(url.origin).toBe("https://api.cloudflare.com");
    expect(init?.method).toBe("GET");
    expect(init?.redirect).toBe("error");
    expect(init?.body).toBeUndefined();
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    return Promise.resolve(override ? override(url) : fixture(url));
  });
  return { configText, env, fetchImpl };
}

function expectSanitized(report: Report) {
  const text = JSON.stringify(report);
  for (const privateValue of [
    account,
    zone,
    database,
    token,
    serverSecret,
    "Unrelated private app",
  ]) {
    expect(text).not.toContain(privateValue);
  }
  expect(Object.values(report.capabilities).every((value) => value === "UNKNOWN")).toBe(true);
  expect(report.provisioningAuthorized).toBe(false);
}

describe("read-only mobile preview Cloudflare readiness", () => {
  it("matches the tracked source, checks availability and keeps write capability unknown", async () => {
    const input = options();
    const report = await runPreflight(input);
    expect(report.readiness).toBe("PASS");
    expect(report.targetAccountMatchesExpectedSource).toBe("PASS");
    expect(Object.values(report.checks).every((check) => check.status === "PASS")).toBe(true);
    expect(input.fetchImpl).toHaveBeenCalledTimes(8);
    expectSanitized(report);
  });

  it.each([401, 403, 404, 429, 500])(
    "sanitizes HTTP %i bodies and stops before inventory reads",
    async (status) => {
      const input = options(() => new Response(`${token} ${serverSecret} ${account}`, { status }));
      const report = await runPreflight(input);
      expect(report.readiness).toBe("FAIL");
      expect(report.checks.sourceWorker?.code).toBe(
        status === 401 || status === 403 ? "READ_ACCESS_DENIED" : "HTTP_READ_FAILED",
      );
      expect(input.fetchImpl).toHaveBeenCalledTimes(1);
      expectSanitized(report);
    },
  );

  it("does not expose network error strings", async () => {
    const report = await runPreflight(
      options(() => Promise.reject(new Error(`${token} ${account}`))),
    );
    expect(report.checks.sourceWorker?.code).toBe("NETWORK_READ_FAILED");
    expectSanitized(report);
  });

  it("rejects mismatched staging bindings without querying other resources", async () => {
    const input = options(() => Response.json({ success: true, result: { bindings: [] } }));
    const report = await runPreflight(input);
    expect(report.targetAccountMatchesExpectedSource).toBe("FAIL");
    expect(input.fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("requires the tracked source database UUID and name in the CI account", async () => {
    const input = options((url) =>
      url.pathname.endsWith(`/d1/database/${database}`)
        ? Response.json({ success: true, result: { uuid: database, name: "other-database" } })
        : fixture(url),
    );
    const report = await runPreflight(input);
    expect(report.targetAccountMatchesExpectedSource).toBe("FAIL");
    expect(report.checks.sourceDatabase?.code).toBe("SOURCE_DATABASE_MISMATCH");
    expect(input.fetchImpl).toHaveBeenCalledTimes(2);
    expectSanitized(report);
  });

  it("rejects missing credentials and invalid tracked config without any network request", async () => {
    const input = options();
    expect((await runPreflight({ ...input, env: {} })).readiness).toBe("FAIL");
    expect((await runPreflight({ ...input, configText: "invalid" })).readiness).toBe("FAIL");
    expect(input.fetchImpl).not.toHaveBeenCalled();
  });

  it("fails safely on a zone from a different account", async () => {
    const report = await runPreflight(
      options((url) =>
        url.pathname === "/client/v4/zones"
          ? Response.json(
              page([
                {
                  id: zone,
                  name: "dovebevo.com",
                  status: "active",
                  account: { id: "c".repeat(32) },
                },
              ]),
            )
          : fixture(url),
      ),
    );
    expect(report.checks.zone?.status).toBe("FAIL");
    expect(report.checks.dnsNameAvailable?.status).toBe("UNKNOWN");
    expectSanitized(report);
  });

  it.each([
    ["/workers/scripts", "workerNameAvailable", { id: "dovebevo-mobile-preview" }],
    ["/d1/database", "databaseNameAvailable", { name: "dovebevo-mobile-preview" }],
    ["/workers/domains", "customDomainAvailable", { hostname: "mobile-preview.dovebevo.com" }],
    ["/dns_records", "dnsNameAvailable", { name: "mobile-preview.dovebevo.com" }],
    [
      "/challenges/widgets",
      "turnstileWidgetNameAvailable",
      { name: "Dove bevo mobile preview", secret: serverSecret },
    ],
  ] as const)("does not adopt a colliding %s resource", async (suffix, check, item) => {
    const report = await runPreflight(
      options((url) =>
        url.pathname.endsWith(suffix) ? Response.json(page([item])) : fixture(url),
      ),
    );
    expect(report.checks[check]?.status).toBe("FAIL");
    expect(report.checks[check]?.code).toBe("PLANNED_RESOURCE_OCCUPIED");
    expectSanitized(report);
  });

  it("marks partial pagination UNKNOWN and bounds the number of pages", async () => {
    const input = options((url) =>
      url.pathname.endsWith("/challenges/widgets")
        ? Response.json({
            success: true,
            result: [],
            result_info: {
              page: Number(url.searchParams.get("page")),
              per_page: 100,
              count: 0,
              total_count: 10000,
            },
          })
        : fixture(url),
    );
    const report = await runPreflight(input);
    expect(report.checks.turnstileWidgetNameAvailable?.status).toBe("UNKNOWN");
    expect(report.checks.turnstileWidgetNameAvailable?.code).toBe("PAGINATION_INCOMPLETE");
    expect(input.fetchImpl.mock.calls.length).toBeLessThanOrEqual(10);
    expectSanitized(report);
  });

  it("cannot declare availability with missing pagination metadata", async () => {
    const report = await runPreflight(
      options((url) =>
        url.pathname.endsWith("/challenges/widgets")
          ? Response.json({ success: true, result: [] })
          : fixture(url),
      ),
    );
    expect(report.checks.turnstileWidgetNameAvailable?.code).toBe("PAGINATION_INCOMPLETE");
  });

  it.each([
    undefined,
    {},
    { count: 0 },
    { total_count: 3 },
    { count: 0, total_count: 3 },
    { count: 0, page: 1, per_page: 20, total_count: 3, total_pages: 100 },
  ])("accepts the Worker Domains single-page contract with metadata %j", async (info) => {
    const input = options((url) => {
      if (!url.pathname.endsWith("/workers/domains")) return fixture(url);
      expect(url.searchParams.get("hostname")).toBe("mobile-preview.dovebevo.com");
      expect(url.searchParams.has("page")).toBe(false);
      expect(url.searchParams.has("per_page")).toBe(false);
      return Response.json({ success: true, result: [], result_info: info });
    });
    const report = await runPreflight(input);
    expect(report.checks.customDomainAvailable?.status).toBe("PASS");
    expect(report.readiness).toBe("PASS");
    expect(input.fetchImpl).toHaveBeenCalledTimes(8);
    expectSanitized(report);
  });

  it.each([401, 403])(
    "retains DNS HTTP %i denial after accepting valid Worker Domains count-only metadata",
    async (status) => {
      const report = await runPreflight(
        options((url) => {
          if (url.pathname.endsWith("/workers/domains")) {
            return Response.json({ success: true, result: [], result_info: { count: 0 } });
          }
          if (url.pathname.endsWith("/dns_records")) return new Response(serverSecret, { status });
          return fixture(url);
        }),
      );
      expect(report.checks.customDomainAvailable?.status).toBe("PASS");
      expect(report.checks.dnsNameAvailable).toEqual({
        status: "UNKNOWN",
        code: "READ_ACCESS_DENIED",
      });
      expect(report.readiness).toBe("FAIL");
      expectSanitized(report);
    },
  );

  it.each(["/d1/database", "/dns_records"])(
    "still requires pagination metadata for %s",
    async (suffix) => {
      const report = await runPreflight(
        options((url) =>
          url.pathname.endsWith(suffix)
            ? Response.json({ success: true, result: [] })
            : fixture(url),
        ),
      );
      const name = suffix === "/d1/database" ? "databaseNameAvailable" : "dnsNameAvailable";
      expect(report.checks[name]).toEqual({ status: "UNKNOWN", code: "PAGINATION_INCOMPLETE" });
      expect(report.readiness).toBe("FAIL");
      expectSanitized(report);
    },
  );

  it("detects a colliding Worker domain with optional metadata and unfiltered totals", async () => {
    const report = await runPreflight(
      options((url) =>
        url.pathname.endsWith("/workers/domains")
          ? Response.json({
              success: true,
              result: [{ hostname: "mobile-preview.dovebevo.com" }],
              result_info: { count: 1, total_count: 3 },
            })
          : fixture(url),
      ),
    );
    expect(report.checks.customDomainAvailable).toEqual({
      status: "FAIL",
      code: "PLANNED_RESOURCE_OCCUPIED",
    });
    expectSanitized(report);
  });

  it.each([undefined, null, {}, [null], [{ secret: serverSecret }]].map((result) => ({ result })))(
    "rejects malformed Worker domain result $result",
    async ({ result }) => {
      const report = await runPreflight(
        options((url) =>
          url.pathname.endsWith("/workers/domains")
            ? Response.json({ success: true, result, result_info: { count: 0 } })
            : fixture(url),
        ),
      );
      expect(report.checks.customDomainAvailable).toEqual({
        status: "UNKNOWN",
        code: "INVALID_API_RESPONSE",
      });
      expect(report.readiness).toBe("FAIL");
      expectSanitized(report);
    },
  );

  it.each(
    [null, [], { count: "0" }, { total_count: -1 }, { total_pages: 1.5 }].map((info) => ({ info })),
  )("rejects malformed Worker domain metadata $info", async ({ info }) => {
    const report = await runPreflight(
      options((url) =>
        url.pathname.endsWith("/workers/domains")
          ? Response.json({ success: true, result: [], result_info: info })
          : fixture(url),
      ),
    );
    expect(report.checks.customDomainAvailable).toEqual({
      status: "UNKNOWN",
      code: "INVALID_API_RESPONSE",
    });
    expect(report.readiness).toBe("FAIL");
    expectSanitized(report);
  });

  it("finds a widget collision on a later complete page without exposing widget fields", async () => {
    const input = options((url) => {
      if (!url.pathname.endsWith("/challenges/widgets")) return fixture(url);
      const current = Number(url.searchParams.get("page"));
      const result =
        current === 1
          ? Array.from({ length: 100 }, (_, i) => ({
              name: `Other widget ${String(i)}`,
              secret: serverSecret,
            }))
          : [{ name: "Dove bevo mobile preview", secret: serverSecret }];
      return Response.json({
        success: true,
        result,
        result_info: { page: current, per_page: 100, count: result.length, total_count: 101 },
      });
    });
    const report = await runPreflight(input);
    expect(report.checks.turnstileWidgetNameAvailable?.code).toBe("PLANNED_RESOURCE_OCCUPIED");
    expect(input.fetchImpl).toHaveBeenCalledTimes(9);
    expectSanitized(report);
  });

  it("stops after three full pages rather than claiming an unseen widget name is available", async () => {
    const input = options((url) => {
      if (!url.pathname.endsWith("/challenges/widgets")) return fixture(url);
      const current = Number(url.searchParams.get("page"));
      return Response.json({
        success: true,
        result: Array.from({ length: 100 }, (_, i) => ({
          name: `Other widget ${String(current * 100 + i)}`,
        })),
        result_info: { page: current, per_page: 100, count: 100, total_count: 301 },
      });
    });
    const report = await runPreflight(input);
    expect(report.checks.turnstileWidgetNameAvailable?.code).toBe("PAGINATION_INCOMPLETE");
    expect(input.fetchImpl).toHaveBeenCalledTimes(10);
    expectSanitized(report);
  });

  it("rejects malformed list items rather than inferring availability", async () => {
    const report = await runPreflight(
      options((url) =>
        url.pathname.endsWith("/challenges/widgets")
          ? Response.json(page([{ secret: serverSecret }]))
          : fixture(url),
      ),
    );
    expect(report.checks.turnstileWidgetNameAvailable?.code).toBe("INVALID_API_RESPONSE");
    expectSanitized(report);
  });

  it.each(["oversized", "malformed", "api-failure"])(
    "bounds and sanitizes %s responses",
    async (kind) => {
      const input = options(() =>
        kind === "oversized"
          ? new Response(serverSecret.repeat(20000))
          : kind === "malformed"
            ? new Response(serverSecret)
            : Response.json({ success: false, errors: [{ message: serverSecret }] }),
      );
      const report = await runPreflight(input);
      expect(report.readiness).toBe("FAIL");
      expectSanitized(report);
    },
  );

  it("clears abort timers after requests and aborts stalled reads", async () => {
    vi.useFakeTimers();
    try {
      await runPreflight(options());
      expect(vi.getTimerCount()).toBe(0);
      const input = options();
      input.fetchImpl.mockImplementation(
        (_input, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () => {
                reject(new Error(serverSecret));
              },
              {
                once: true,
              },
            );
          }),
      );
      const pending = runPreflight(input);
      await vi.advanceTimersByTimeAsync(20000);
      const report = await pending;
      expect(report.checks.sourceWorker?.code).toBe("READ_TIMEOUT");
      expect(vi.getTimerCount()).toBe(0);
      expectSanitized(report);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("mobile readiness workflow boundary", () => {
  it("runs one branch-scoped read-only job with credentials only in the final step", () => {
    const workflow = readFileSync(".github/workflows/mobile-preview-readiness.yml", "utf8");
    expect(workflow).toContain("branches: [codex/mobile-launch-20261026]");
    expect(workflow).toContain("persist-credentials: false");
    expect(workflow).toContain("npm ci --ignore-scripts");
    expect(workflow).toContain("contents: read");
    expect(workflow).toContain("timeout-minutes: 7");
    expect(workflow).not.toMatch(
      /pull_request|workflow_run|workflow_dispatch|wrangler\s+deploy|--remote|write-all/,
    );
    expect(workflow.match(/secrets\./g)).toHaveLength(2);
    const credentialStep = workflow.slice(
      workflow.indexOf("      - name: Read Cloudflare readiness"),
    );
    expect(credentialStep).toContain("CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}");
    expect(credentialStep).toContain("CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}");
    expect(credentialStep.match(/^ {6}- /gm)).toHaveLength(1);
  });
});
