import { env, exports } from "cloudflare:workers";
import { createExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CATALOG } from "../../src/shared/catalog";
import worker from "../../src/worker/index";
import { purgeOldKeys } from "../../src/worker/lib/db";
import { createSession } from "../../src/worker/lib/session";

const ORIGIN = "https://dovebevo.example";
const BAR = "n2420779240";
const CELL = "u0nd9";
const VOTER = "719576dd-2184-49e9-831d-bc2de0c5f542";
let sequence = 0;
const nextIp = () => `198.18.${String(Math.floor(++sequence / 250))}.${String(sequence % 250)}`;
const path = (venue = BAR, query = `c=${CELL}`) =>
  `/api/mobile/venues/${venue}/recommendations?${query}`;

interface Options {
  path?: string;
  headers?: Record<string, string>;
  bindings?: Partial<Env>;
}
async function request(
  method = "GET",
  voter: string | null = VOTER,
  body?: unknown,
  options: Options = {},
): Promise<Response> {
  const init = {
    method,
    headers: {
      Origin: ORIGIN,
      "Content-Type": "application/json",
      "CF-Connecting-IP": nextIp(),
      ...(voter === null ? {} : { "X-DoveBevo-Voter": voter }),
      ...options.headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
  const url = `${ORIGIN}${options.path ?? path()}`;
  return options.bindings
    ? worker.fetch(
        new Request(url, init),
        { ...env, ...options.bindings },
        createExecutionContext(),
      )
    : exports.default.fetch(url, init);
}
const choose = (recommended: boolean, voter = VOTER, options: Options = {}, drink = "spritz") =>
  request("POST", voter, { drink, recommended }, options);

// Only quota boundary tests bypass the real burst window, so 200 daily attempts need no sleep.
// The same route, global guards, real local D1 and daily quota code execute; burst is tested below.
const quotaBindings = { RATE_LIMITER: { limit: () => Promise.resolve({ success: true }) } };

interface Snapshot {
  venue_key: string;
  drinks: { drink: string; count: number; recommended: boolean }[];
}
async function snapshot(response: Response): Promise<Snapshot> {
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  const result: Snapshot = await response.json();
  expect(Object.keys(result).sort()).toEqual(["drinks", "venue_key"]);
  expect(result.venue_key).toBe(BAR);
  expect(result.drinks.map((row) => row.drink)).toEqual(CATALOG.map((drink) => drink.code));
  for (const row of result.drinks) {
    expect(Object.keys(row).sort()).toEqual(["count", "drink", "recommended"]);
    expect(Number.isSafeInteger(row.count) && row.count >= 0).toBe(true);
    expect(typeof row.recommended).toBe("boolean");
  }
  return result;
}

beforeEach(async () => {
  await env.DB.batch(
    [
      "mobile_recommendations",
      "counters",
      "dedup",
      "venues_hidden",
      "venues_user",
      "prices_current",
      "price_obs",
    ].map((table) => env.DB.prepare(`DELETE FROM ${table}`)),
  );
});

describe("native public drink recommendations", () => {
  it("returns all nine categories without an installation header", async () => {
    const result = await snapshot(await request("GET", null));
    expect(result.drinks.every((row) => row.count === 0 && !row.recommended)).toBe(true);
  });

  it("sets and removes one installation's vote idempotently without a browser session", async () => {
    for (const recommended of [true, true, false, false]) {
      const result = await snapshot(await request("POST", VOTER, { drink: "spritz", recommended }));
      expect(result.drinks.find((row) => row.drink === "spritz")).toEqual({
        drink: "spritz",
        count: recommended ? 1 : 0,
        recommended,
      });
    }
  });

  it("counts distinct installations on the same Wi-Fi and never removes another's vote", async () => {
    const other = crypto.randomUUID();
    const options = { headers: { "CF-Connecting-IP": nextIp() } };
    await snapshot(await choose(true, VOTER, options));
    const both = await snapshot(await choose(true, other, options));
    expect(both.drinks.find((r) => r.drink === "spritz")).toEqual({
      drink: "spritz",
      count: 2,
      recommended: true,
    });
    await snapshot(await choose(false, VOTER, options));
    const own = await snapshot(await request("GET", other));
    expect(own.drinks.find((r) => r.drink === "spritz")).toEqual({
      drink: "spritz",
      count: 1,
      recommended: true,
    });
    const publicRead = await snapshot(await request("GET", null));
    expect(publicRead.drinks.find((r) => r.drink === "spritz")).toEqual({
      drink: "spritz",
      count: 1,
      recommended: false,
    });
  });

  it("keeps a pair unique under concurrent identical additions and removals", async () => {
    const additions = await Promise.all(Array.from({ length: 12 }, () => choose(true)));
    for (const response of additions) {
      const own = await snapshot(response);
      expect(own.drinks.find((r) => r.drink === "spritz")).toEqual({
        drink: "spritz",
        count: 1,
        recommended: true,
      });
    }
    const removals = await Promise.all(Array.from({ length: 12 }, () => choose(false)));
    for (const response of removals) {
      const own = await snapshot(response);
      expect(own.drinks.find((r) => r.drink === "spritz")).toEqual({
        drink: "spritz",
        count: 0,
        recommended: false,
      });
    }
  });

  it("returns a transactionally matching snapshot for overlapping set/undo requests", async () => {
    const choices = Array.from({ length: 12 }, (_, i) => i % 2 === 0);
    const responses = await Promise.all(choices.map((recommended) => choose(recommended)));
    for (const [index, response] of responses.entries()) {
      const own = await snapshot(response);
      expect(own.drinks.find((r) => r.drink === "spritz")).toEqual({
        drink: "spritz",
        count: choices[index] ? 1 : 0,
        recommended: choices[index],
      });
    }
  });

  it("concurrent distinct installations each contribute exactly one shared vote", async () => {
    const voters = Array.from({ length: 10 }, () => crypto.randomUUID());
    const responses = await Promise.all(voters.map((voter) => choose(true, voter)));
    for (const response of responses) await snapshot(response);
    const result = await snapshot(await request());
    expect(result.drinks.find((r) => r.drink === "spritz")?.count).toBe(10);
  });

  it("isolates claims by venue and category, with no price or happy-hour identity", async () => {
    await snapshot(await choose(true));
    await snapshot(await choose(true, VOTER, {}, "water"));
    const other = await choose(true, VOTER, { path: path("n13001337602") });
    expect(other.status).toBe(200);
    const stored = await env.DB.prepare("SELECT claim FROM mobile_recommendations").all<{
      claim: string;
    }>();
    expect(new Set(stored.results.map((row) => row.claim)).size).toBe(3);
    expect(
      (await snapshot(await request())).drinks.filter((r) => r.recommended).map((r) => r.drink),
    ).toEqual(["spritz", "water"]);
    await choose(false);
    const otherRead = await request("GET", VOTER, undefined, { path: path("n13001337602") });
    const result: Snapshot = await otherRead.json();
    expect(result.drinks.find((r) => r.drink === "spritz")?.count).toBe(1);
  });

  it.each([
    "",
    "INVALID",
    VOTER.toUpperCase(),
    VOTER.replace("-49e9-", "-59e9-"),
    VOTER.replace("-831d-", "-731d-"),
    `${VOTER},${VOTER}`,
  ])("rejects malformed optional or required voter header: %s", async (voter) => {
    expect((await request("GET", voter)).status).toBe(400);
    expect((await choose(true, voter)).status).toBe(400);
  });

  it("requires a voter for POST and retains matching Origin, JSON, size and strict-schema guards", async () => {
    expect((await request("POST", null, { drink: "spritz", recommended: true })).status).toBe(400);
    expect(
      (await choose(true, VOTER, { headers: { Origin: "https://other.example" } })).status,
    ).toBe(403);
    expect((await choose(true, VOTER, { headers: { Origin: "" } })).status).toBe(403);
    expect((await choose(true, VOTER, { headers: { "Content-Type": "text/plain" } })).status).toBe(
      415,
    );
    for (const body of [
      { drink: "unknown", recommended: true },
      { drink: "spritz", recommended: 1 },
      { drink: "spritz" },
      { drink: "spritz", recommended: true, hh: 1 },
      { drink: "spritz", recommended: true, voter: VOTER },
      null,
    ]) {
      expect((await request("POST", VOTER, body)).status).toBe(400);
    }
    expect((await request("POST", VOTER, { padding: "x".repeat(17_000) })).status).toBe(413);
    expect(
      (
        await env.DB.prepare("SELECT COUNT(*) AS n FROM mobile_recommendations").first<{
          n: number;
        }>()
      )?.n,
    ).toBe(0);
  });

  it.each([
    path("n01"),
    path("n0"),
    path("n9999999999999999"),
    path(BAR, ""),
    path(BAR, `c=${CELL}&c=${CELL}`),
    path(BAR, `c=${CELL}&extra=1`),
    path(BAR, "c=U0ND9"),
    path(BAR, "c=abcde"),
  ])("rejects noncanonical venue/query input: %s", async (url) => {
    expect((await request("GET", VOTER, undefined, { path: url })).status).toBe(400);
    expect((await choose(true, VOTER, { path: url })).status).toBe(400);
  });

  it("returns unavailable, never zero success, for wrong-cell, hidden, unknown and unapproved venues", async () => {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO venues_hidden (venue_key, cell, name, day) VALUES (?1, ?2, 'Hidden', '2026-10-28')",
      ).bind(BAR, CELL),
      env.DB.prepare(
        "INSERT INTO venues_user (id, name, kind, lat, lon, cell, status) VALUES (41, 'Pending', 1, 45.46, 9.19, ?1, 'pending')",
      ).bind(CELL),
      env.DB.prepare(
        "INSERT INTO venues_user (id, name, kind, lat, lon, cell, status) VALUES (42, 'Removed', 1, 45.46, 9.19, ?1, 'removed')",
      ).bind(CELL),
      env.DB.prepare(
        "INSERT INTO venues_user (id, name, kind, lat, lon, cell, status) VALUES (43, 'Approved', 1, 45.46, 9.19, ?1, 'approved')",
      ).bind(CELL),
    ]);
    for (const url of [
      path(),
      path("n999999"),
      path("u999999"),
      path("u41"),
      path("u42"),
      path("n13001337602", "c=u0nd8"),
      path("u43", "c=u0nd8"),
    ]) {
      for (const method of ["GET", "POST"]) {
        const response = await request(
          method,
          VOTER,
          method === "POST" ? { drink: "spritz", recommended: true } : undefined,
          { path: url },
        );
        expect(response.status).toBe(404);
        expect(await response.json()).toMatchObject({ error: { code: "not_found" } });
      }
    }
    expect((await choose(true, VOTER, { path: path("u43") })).status).toBe(200);
    expect(
      (
        await env.DB.prepare("SELECT COUNT(*) AS n FROM mobile_recommendations").first<{
          n: number;
        }>()
      )?.n,
    ).toBe(1);
  });

  it("caps daily addition attempts at 50 per installation across IPs, but undo is exempt", async () => {
    for (let i = 0; i < 50; i++) expect((await choose(true)).status).toBe(200);
    const denied = await choose(true);
    expect(denied.status).toBe(429);
    expect(Number(denied.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect((await choose(false)).status).toBe(200);
    expect((await choose(false)).status).toBe(200);
    expect((await choose(true)).status).toBe(429);
    expect((await snapshot(await request())).drinks.find((r) => r.drink === "spritz")?.count).toBe(
      0,
    );
    expect((await choose(true, crypto.randomUUID())).status).toBe(200);
  }, 20_000);

  it("atomically enforces the installation limit under concurrent attempts", async () => {
    for (let i = 0; i < 49; i++) expect((await choose(true)).status).toBe(200);
    const responses = await Promise.all(Array.from({ length: 8 }, () => choose(true)));
    expect(responses.filter((r) => r.status === 200)).toHaveLength(1);
    expect(responses.filter((r) => r.status === 429)).toHaveLength(7);
    expect((await snapshot(await request())).drinks.find((r) => r.drink === "spritz")?.count).toBe(
      1,
    );
  }, 20_000);

  it("caps daily addition attempts at 200 per IP without using IP as voter uniqueness", async () => {
    const options = { bindings: quotaBindings, headers: { "CF-Connecting-IP": nextIp() } };
    const voters = Array.from({ length: 5 }, () => crypto.randomUUID());
    for (let i = 0; i < 200; i++)
      expect((await choose(true, voters[i % 5], options)).status).toBe(200);
    expect((await choose(true, crypto.randomUUID(), options)).status).toBe(429);
    expect((await choose(false, voters[0], options)).status).toBe(200);
    expect((await choose(true, voters[0], options)).status).toBe(429);
    const result = await snapshot(await request());
    expect(result.drinks.find((r) => r.drink === "spritz")?.count).toBe(4);
    expect((await choose(true, voters[0])).status).toBe(200); // New IP, installation still under 50.
  }, 30_000);

  it("does not exempt undo from the existing global burst limiter", async () => {
    const options = { headers: { "CF-Connecting-IP": nextIp() } };
    const responses = [];
    for (let i = 0; i < 25; i++) responses.push(await choose(false, VOTER, options));
    expect(responses.slice(0, 20).every((r) => r.status === 200)).toBe(true);
    expect(responses.slice(20).every((r) => r.status === 429)).toBe(true);
  });

  it("resets addition budgets on the Rome day boundary without resetting durable votes", async () => {
    const options = { bindings: quotaBindings, headers: { "CF-Connecting-IP": nextIp() } };
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-10-28T22:59:59Z")); // 23:59:59 in Rome.
      for (let i = 0; i < 50; i++) expect((await choose(true, VOTER, options)).status).toBe(200);
      expect((await choose(true, VOTER, options)).status).toBe(429);
      vi.setSystemTime(new Date("2026-10-28T23:00:00Z"));
      const result = await snapshot(await choose(true, VOTER, options));
      expect(result.drinks.find((row) => row.drink === "spritz")).toEqual({
        drink: "spritz",
        count: 1,
        recommended: true,
      });
      const days = await env.DB.prepare("SELECT DISTINCT day FROM counters ORDER BY day").all<{
        day: string;
      }>();
      expect(days.results.map((row) => row.day)).toEqual(["2026-10-28", "2026-10-29"]);
    } finally {
      vi.useRealTimers();
    }
  }, 20_000);

  it("retains real-secret and read-limit gates without requiring a WebView session", async () => {
    expect(
      (await choose(true, VOTER, { bindings: { HASH_KEY: "local-dev-only-hash-key" } })).status,
    ).toBe(503);
    const denied = await request("GET", VOTER, undefined, {
      bindings: { READ_LIMITER: { limit: () => Promise.resolve({ success: false }) } },
    });
    expect(denied.status).toBe(429);
    expect((await choose(true)).status).toBe(200);
    // Existing price writes still require their original HttpOnly session.
    expect(
      (
        await exports.default.fetch(`${ORIGIN}/api/prices/confirm`, {
          method: "POST",
          headers: {
            Origin: ORIGIN,
            "Content-Type": "application/json",
            "CF-Connecting-IP": nextIp(),
          },
          body: JSON.stringify({ venue: BAR, drink: "spritz", hh: 0 }),
        })
      ).status,
    ).toBe(401);
  });

  it("keeps recommendations across price replacement and transient-key cleanup, with no raw identity at rest", async () => {
    const ip = "203.0.113.219";
    await choose(true, VOTER, { headers: { "CF-Connecting-IP": ip } });
    const { token } = await createSession("test-session-hmac-key");
    for (const price_cents of [700, 750]) {
      const response = await exports.default.fetch(`${ORIGIN}/api/prices`, {
        method: "POST",
        headers: {
          Origin: ORIGIN,
          "Content-Type": "application/json",
          Cookie: `__Host-sid=${token}`,
          "CF-Connecting-IP": nextIp(),
        },
        body: JSON.stringify({
          venue: BAR,
          cell: CELL,
          source: "manual",
          items: [{ drink: "spritz", hh: 0, price_cents }],
        }),
      });
      expect(response.status).toBe(200);
    }
    const price = await env.DB.prepare(
      "SELECT price_cents, confirmations FROM prices_current WHERE venue_key = ?1",
    )
      .bind(BAR)
      .first();
    expect(price).toMatchObject({ price_cents: 750, confirmations: 0 });
    const stored = await env.DB.prepare("SELECT * FROM mobile_recommendations").all();
    const counters = await env.DB.prepare("SELECT * FROM counters").all();
    for (const raw of [VOTER, ip]) {
      expect(JSON.stringify(stored.results)).not.toContain(raw);
      expect(JSON.stringify(counters.results)).not.toContain(raw);
    }
    expect(stored.results).toHaveLength(1);
    expect(stored.results[0]).toMatchObject({ venue_key: BAR, drink: "spritz" });
    expect(stored.results[0]?.["claim"]).toMatch(/^[0-9a-f]{32}$/);
    await purgeOldKeys(env.DB, "9999-01-01");
    const result = await snapshot(await request());
    expect(result.drinks.find((r) => r.drink === "spritz")).toEqual({
      drink: "spritz",
      count: 1,
      recommended: true,
    });
    expect((await choose(false)).status).toBe(200);
  });
});
