import { createExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import worker from "../../src/worker/index";
import {
  MOBILE_CALLBACK_URL,
  MOBILE_CLIENT_ID,
  type MobileAuthorizeResponse,
  type MobileRedeemResponse,
} from "../../src/shared/mobile";
import {
  createMobileSession,
  mobileHash,
  randomMobileValue,
  readMobileSession,
} from "../../src/worker/lib/mobile-auth";
import { createSession } from "../../src/worker/lib/session";
import {
  consumeMobileCode,
  purgeMobileCodes,
  storeMobileCode,
  type MobileCodeBinding,
} from "../../src/worker/lib/db";
import { hmacHex } from "../../src/worker/lib/hmac";
import { romeDay } from "../../src/worker/lib/day";

const ORIGIN = "https://dovebevo.example";
let ipCounter = 0;
function request(
  path: string,
  body: unknown,
  options: {
    headers?: Record<string, string>;
    bindings?: Partial<Env>;
    origin?: string;
    ip?: string;
    native?: boolean;
  } = {},
) {
  return worker.fetch(
    new Request(`${options.origin ?? ORIGIN}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": options.ip ?? `198.51.100.${String(++ipCounter)}`,
        ...(options.native === false
          ? { Origin: options.origin ?? ORIGIN }
          : { "X-Dovebevo-Native": "1" }),
        ...options.headers,
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    { ...env, MOBILE_PREVIEW_ENABLED: "true", ...options.bindings },
    createExecutionContext(),
  );
}
async function authorize(options: Parameters<typeof request>[2] = {}) {
  const verifier = randomMobileValue();
  const challenge = await mobileHash(verifier);
  const nonce = randomMobileValue();
  const body = {
    token: `ok-mobile:${challenge}:${randomMobileValue()}`,
    codeChallenge: challenge,
    nonce,
    clientId: MOBILE_CLIENT_ID,
  };
  const response = await request("/api/mobile/authorize", body, { ...options, native: false });
  expect(response.status).toBe(200);
  const result = await response.json<MobileAuthorizeResponse>();
  expect(result.state).toBe(nonce);
  expect(response.headers.has("Set-Cookie")).toBe(false);
  return { code: result.code, codeVerifier: verifier, nonce, clientId: MOBILE_CLIENT_ID };
}
beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM mobile_auth_codes"),
    env.DB.prepare("DELETE FROM counters"),
    env.DB.prepare("DELETE FROM metrics_daily"),
  ]);
});
const call = (path: string, enabled = true) =>
  worker.fetch(
    new Request(`${ORIGIN}${path}`),
    { ...env, MOBILE_PREVIEW_ENABLED: enabled ? "true" : "false" },
    createExecutionContext(),
  );

describe("mobile preview boundary", () => {
  it("is disabled by default", async () => {
    expect((await call("/api/mobile/config", false)).status).toBe(404);
  });
  it("gates every preview POST before origin, auth or secret checks", async () => {
    for (const path of [
      "authorize",
      "session",
      "events",
      "prices",
      "reports",
      "venues",
      "unknown",
    ]) {
      const response = await request(
        `/api/mobile/${path}`,
        {},
        { bindings: { MOBILE_PREVIEW_ENABLED: undefined } },
      );
      expect(response.status).toBe(404);
    }
  });
  it("publishes the fixed preview protocol only when explicitly enabled", async () => {
    const response = await call("/api/mobile/config");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      clientId: MOBILE_CLIENT_ID,
      challengePath: "/mobile-auth",
    });
    expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false);
  });
  it("keeps canonical public reads available without any cookie or bearer", async () => {
    for (const path of [
      "/api/prices/u0nd9",
      "/api/venues/approved",
      "/api/venues/n2420779240/prices",
      "/api/session",
    ]) {
      const response = await call(path, false);
      expect(response.status).toBe(200);
      expect(response.headers.has("Set-Cookie")).toBe(false);
      expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false);
    }
  });
  it("does not expose business reads or unreviewed/trailing/encoded aliases", async () => {
    expect((await call("/api/mobile/prices/u0nd9")).status).toBe(404);
    for (const path of [
      "/api/mobile/prices/",
      "/api/mobile/%70rices",
      "/api/mobile/prices/other",
    ]) {
      expect((await request(path, {}, { native: false })).status).toBe(404);
      expect((await request(path, {})).status).toBe(403);
    }
    expect((await request("/api/mobileevil/prices", {})).status).toBe(403);
  });
});

describe("mobile authorization and redemption", () => {
  it("issues no cookie, stores only hashed proof material, consumes once and issues a separate bearer", async () => {
    const proof = await authorize();
    const rows = await env.DB.prepare("SELECT * FROM mobile_auth_codes").all();
    expect(rows.results).toHaveLength(1);
    const stored = JSON.stringify(rows.results);
    for (const raw of [proof.code, proof.codeVerifier, proof.nonce])
      expect(stored).not.toContain(raw);
    const response = await request("/api/mobile/session", proof);
    expect(response.status).toBe(200);
    const session = await response.json<MobileRedeemResponse>();
    expect(session.expiresIn).toBe(1800);
    expect(await readMobileSession(env.SESSION_HMAC_KEY, session.token, ORIGIN)).toBeTruthy();
    expect(response.headers.has("set-cookie")).toBe(false);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect((await env.DB.prepare("SELECT * FROM mobile_auth_codes").all()).results).toHaveLength(0);
    expect((await request("/api/mobile/session", proof)).status).toBe(401);
  });
  it("accepts only one of two concurrent redeemers", async () => {
    const proof = await authorize();
    const responses = await Promise.all([
      request("/api/mobile/session", proof),
      request("/api/mobile/session", proof),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 401]);
  });
  it("rejects wrong verifier, nonce, audience, environment and expired code", async () => {
    const proof = await authorize();
    expect(
      (await request("/api/mobile/session", { ...proof, codeVerifier: randomMobileValue() }))
        .status,
    ).toBe(401);
    expect(
      (await request("/api/mobile/session", { ...proof, nonce: randomMobileValue() })).status,
    ).toBe(401);
    expect((await request("/api/mobile/session", { ...proof, clientId: "other" })).status).toBe(
      400,
    );
    expect(
      (await request("/api/mobile/session", proof, { origin: "https://other.example" })).status,
    ).toBe(403);
    await env.DB.prepare("UPDATE mobile_auth_codes SET expires_at = ?1")
      .bind(Date.now() - 1)
      .run();
    expect((await request("/api/mobile/session", proof)).status).toBe(401);
  });
  it("requires hosted same-origin submissions, valid Turnstile and exact challenge binding", async () => {
    const codeChallenge = await mobileHash(randomMobileValue());
    const body = {
      token: `ok-mobile:${codeChallenge}:${randomMobileValue()}`,
      codeChallenge,
      nonce: randomMobileValue(),
      clientId: MOBILE_CLIENT_ID,
    };
    expect((await request("/api/mobile/authorize", body)).status).toBe(403);
    expect(
      (
        await request("/api/mobile/authorize", body, {
          headers: { Origin: "https://evil.example" },
        })
      ).status,
    ).toBe(403);
    for (const token of [
      "bad",
      "ok-otherhost",
      "ok-otheraction",
      `ok-mobile:${randomMobileValue()}:wrong`,
      `ok-mobile:${codeChallenge}:wrong-host`,
      `ok-mobile:${codeChallenge}:wrong-action`,
    ]) {
      expect(
        (await request("/api/mobile/authorize", { ...body, token }, { native: false })).status,
      ).toBe(403);
    }
    expect(
      (
        await request(
          "/api/mobile/authorize",
          { ...body, callbackUrl: "evil://callback" },
          { native: false },
        )
      ).status,
    ).toBe(400);
  });
  it("retains the global burst limiter and real-secret guard", async () => {
    const denied = { limit: () => Promise.resolve({ success: false }) } as RateLimit;
    expect(
      (
        await request(
          "/api/mobile/events",
          { events: [{ e: "app_open" }] },
          { bindings: { RATE_LIMITER: denied } },
        )
      ).status,
    ).toBe(429);
    expect(
      (
        await request(
          "/api/mobile/session",
          {},
          { bindings: { SESSION_HMAC_KEY: "local-dev-only-placeholder" } },
        )
      ).status,
    ).toBe(503);
  });
  it("limits authorization attempts to five per minute and sixty per Rome day", async () => {
    const ip = "203.0.113.240";
    const body = {
      token: "bad",
      codeChallenge: randomMobileValue(),
      nonce: randomMobileValue(),
      clientId: MOBILE_CLIENT_ID,
    };
    for (let i = 0; i < 5; i++)
      expect((await request("/api/mobile/authorize", body, { ip, native: false })).status).toBe(
        403,
      );
    expect((await request("/api/mobile/authorize", body, { ip, native: false })).status).toBe(429);
    const dailyIp = "203.0.113.241";
    const day = romeDay();
    const key = await hmacHex(env.HASH_KEY, [day, "mobile-authorize", "day", dailyIp]);
    await env.DB.prepare("INSERT INTO counters (k, day, n) VALUES (?1, ?2, 60)")
      .bind(key, day)
      .run();
    expect(
      (await request("/api/mobile/authorize", body, { ip: dailyIp, native: false })).status,
    ).toBe(429);
  });
});

describe("mobile credential isolation and shared business handlers", () => {
  it("never accepts web cookies or web tokens on any native mutation", async () => {
    const web = await createSession(env.SESSION_HMAC_KEY);
    for (const path of ["prices", "prices/confirm", "reports", "venues"]) {
      expect(
        (
          await request(
            `/api/mobile/${path}`,
            {},
            { headers: { Cookie: `__Host-sid=${web.token}` } },
          )
        ).status,
      ).toBe(401);
      expect(
        (
          await request(
            `/api/mobile/${path}`,
            {},
            { headers: { Authorization: `Bearer ${web.token}` } },
          )
        ).status,
      ).toBe(401);
    }
  });
  it("rejects mobile tokens in all web/admin families and preserves web Origin checks", async () => {
    const session = await createMobileSession(env.SESSION_HMAC_KEY, ORIGIN);
    expect(
      (
        await request(
          "/api/prices",
          {},
          { native: false, headers: { Cookie: `__Host-sid=${session.token}` } },
        )
      ).status,
    ).toBe(401);
    for (const path of [
      "/api/prices",
      "/api/reports",
      "/api/venues",
      "/api/admin/hide",
      "/api/session",
      "/api/events",
    ]) {
      expect(
        (
          await request(
            path,
            {},
            { native: false, headers: { Authorization: `Bearer ${session.token}` } },
          )
        ).status,
      ).toBe(401);
      expect((await request(path, {})).status).toBe(403);
    }
  });
  it("requires native header, rejects foreign Origin and accepts an acknowledged anonymous price", async () => {
    const proof = await authorize();
    const session = await (
      await request("/api/mobile/session", proof)
    ).json<MobileRedeemResponse>();
    const headers = { Authorization: `Bearer ${session.token}` };
    const body = {
      venue: "n2420779240",
      cell: "u0nd9",
      source: "manual",
      items: [{ drink: "spritz", hh: 0, price_cents: 550 }],
    };
    expect((await request("/api/mobile/prices", body, { native: false, headers })).status).toBe(
      403,
    );
    expect(
      (
        await request("/api/mobile/prices", body, {
          headers: { ...headers, Origin: "https://evil.example" },
        })
      ).status,
    ).toBe(403);
    const result = await request("/api/mobile/prices", body, { headers });
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ results: [{ status: "active" }] });
    const observations = await env.DB.prepare("SELECT * FROM price_obs").all();
    expect(observations.results.length).toBeGreaterThan(0);
    const stored = JSON.stringify(observations.results);
    expect(stored).not.toContain(session.token);
    expect(stored).not.toContain(
      await readMobileSession(env.SESSION_HMAC_KEY, session.token, ORIGIN),
    );
    for (const path of ["prices/confirm", "reports", "venues"]) {
      expect((await request(`/api/mobile/${path}`, {}, { headers })).status).toBe(400);
    }
    expect(
      (
        await request(
          "/api/mobile/prices",
          { ...body, items: Array.from({ length: 31 }, () => body.items[0]) },
          { headers },
        )
      ).status,
    ).toBe(429);
  });
  it("rejects expired and environment-bound tokens before business payload validation", async () => {
    for (const session of [
      await createMobileSession(env.SESSION_HMAC_KEY, ORIGIN, Date.now() - 1801_000),
      await createMobileSession(env.SESSION_HMAC_KEY, "https://other.example"),
    ]) {
      expect(
        (
          await request(
            "/api/mobile/prices",
            {},
            { headers: { Authorization: `Bearer ${session.token}` } },
          )
        ).status,
      ).toBe(401);
    }
  });
});

describe("identifier-free native event ingress", () => {
  it("counts aggregate events without a session and rejects identifiers, cookies and bearers", async () => {
    const body = { events: [{ e: "app_open", p: { day_bucket: "1-7" } }] };
    expect((await request("/api/mobile/events", body)).status).toBe(204);
    expect(
      (await env.DB.prepare("SELECT event, prop, n FROM metrics_daily").all()).results,
    ).toEqual([{ event: "app_open", prop: "day_bucket:1-7", n: 1 }]);
    const credentialHeaders: Record<string, string>[] = [
      { Authorization: "Bearer anything" },
      { Cookie: "__Host-sid=anything" },
    ];
    for (const headers of credentialHeaders)
      expect((await request("/api/mobile/events", body, { headers })).status).toBe(401);
    expect((await request("/api/mobile/events", { ...body, session: "identifier" })).status).toBe(
      400,
    );
    expect(
      (
        await request("/api/mobile/events", {
          events: [{ e: "app_open", p: { id: "identifier" } }],
        })
      ).status,
    ).toBe(400);
    expect((await request("/api/mobile/events", "x".repeat(2049))).status).toBe(413);
    expect(
      (
        await request("/api/mobile/events", {
          events: Array.from({ length: 11 }, () => ({ e: "app_open" })),
        })
      ).status,
    ).toBe(400);
    expect(
      (await request("/api/mobile/events", body, { headers: { Origin: "null" } })).status,
    ).toBe(403);
  });
});

describe("bounded atomic mobile code storage", () => {
  it("leaves a database without the preview migration safe during cleanup", async () => {
    let metadataReads = 0;
    const unmigrated = {
      prepare: (sql: string) => {
        expect(sql).toContain("sqlite_master");
        metadataReads++;
        return { first: () => Promise.resolve(null) };
      },
    } as unknown as D1Database;
    await purgeMobileCodes(unmigrated);
    expect(metadataReads).toBe(1);
  });
  const binding = (): MobileCodeBinding => ({
    codeHash: randomMobileValue(),
    challengeHash: randomMobileValue(),
    nonceHash: randomMobileValue(),
    audience: MOBILE_CLIENT_ID,
    callback: MOBILE_CALLBACK_URL,
    environment: ORIGIN,
    expiresAt: Date.now() + 120000,
  });
  it("enforces the 1000 cap atomically, keeps environments separate and reclaims expired state", async () => {
    await env.DB.prepare(
      `WITH RECURSIVE codes(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM codes WHERE n < 999)
      INSERT INTO mobile_auth_codes SELECT CAST(n AS TEXT), 'challenge', 'nonce', ?1, ?2, ?3, ?4 FROM codes`,
    )
      .bind(MOBILE_CLIENT_ID, MOBILE_CALLBACK_URL, ORIGIN, Date.now() + 120000)
      .run();
    expect(
      (
        await Promise.all([storeMobileCode(env.DB, binding()), storeMobileCode(env.DB, binding())])
      ).sort(),
    ).toEqual([false, true]);
    expect(
      await storeMobileCode(env.DB, { ...binding(), environment: "https://other.example" }),
    ).toBe(true);
    await env.DB.prepare("UPDATE mobile_auth_codes SET expires_at = 1 WHERE environment = ?1")
      .bind(ORIGIN)
      .run();
    expect(await storeMobileCode(env.DB, binding())).toBe(true);
    expect((await env.DB.prepare("SELECT * FROM mobile_auth_codes").all()).results).toHaveLength(2);
  });
  it("purges expired codes during scheduled cleanup and immediately deletes a consumed code", async () => {
    const live = binding();
    await storeMobileCode(env.DB, live);
    await storeMobileCode(env.DB, { ...binding(), expiresAt: Date.now() - 1000 });
    // Turning off preview routes must not turn off deletion of already issued transient state.
    await worker.scheduled({} as ScheduledController, { ...env, MOBILE_PREVIEW_ENABLED: "false" });
    expect((await env.DB.prepare("SELECT * FROM mobile_auth_codes").all()).results).toHaveLength(1);
    for (const mismatch of [
      { environment: "https://other.example" },
      { audience: "other-client" },
      { callback: "evil://callback" },
    ])
      expect(await consumeMobileCode(env.DB, { ...live, ...mismatch })).toBe(false);
    expect(await consumeMobileCode(env.DB, live)).toBe(true);
    expect(await consumeMobileCode(env.DB, live)).toBe(false);
    await purgeMobileCodes(env.DB);
  });
  it("fails closed when authorization or redemption storage is unavailable", async () => {
    const failed = {
      prepare: (sql: string) => {
        if (sql.includes("mobile_auth_codes")) throw new Error("test storage failure");
        return env.DB.prepare(sql);
      },
      batch: (statements: D1PreparedStatement[]) => env.DB.batch(statements),
    } as unknown as D1Database;
    const challenge = randomMobileValue();
    const response = await request(
      "/api/mobile/authorize",
      {
        token: `ok-mobile:${challenge}:storage`,
        codeChallenge: challenge,
        nonce: randomMobileValue(),
        clientId: MOBILE_CLIENT_ID,
      },
      { native: false, bindings: { DB: failed } },
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: "busy" } });
    const proof = await authorize();
    const redeem = await request("/api/mobile/session", proof, { bindings: { DB: failed } });
    expect(redeem.status).toBe(503);
    expect(await redeem.json()).not.toHaveProperty("token");
  });
});
