import { createScheduledController } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import worker from "../../src/worker/index";
import { romeDay } from "../../src/worker/lib/day";
import { createSession } from "../../src/worker/lib/session";

const ORIGIN = "https://dovebevo.example";
const BAR = "n2420779240";
const price = { venue: BAR, cell: "u0nd9", drink: "spritz", size_ml: 0, hh: 0 };

async function newSession() {
  return `__Host-sid=${(await createSession("test-session-hmac-key")).token}`;
}
const post = (path: string, body: unknown, cookie: string, ip = "203.0.113.5") =>
  exports.default.fetch(`${ORIGIN}${path}`, {
    method: "POST",
    headers: {
      Origin: ORIGIN,
      "Content-Type": "application/json",
      Cookie: cookie,
      "CF-Connecting-IP": ip,
    },
    body: JSON.stringify(body),
  });

beforeEach(async () => {
  await env.DB.batch([
    ...["prices_current", "price_obs", "counters", "dedup", "reports"].map((t) =>
      env.DB.prepare(`DELETE FROM ${t}`),
    ),
    env.DB.prepare(
      `INSERT INTO prices_current (venue_key, drink, size_ml, hh, cell, city, price_cents, observed_on, confirmations, status, source)
       VALUES ('n2420779240', 'spritz', 0, 0, 'u0nd9', 1, 750, '2026-10-10', 0, 'active', 'manual')`,
    ),
  ]);
});

describe("POST /api/reports (M2-13)", () => {
  it("accepts only the closed reasons", async () => {
    const cookie = await newSession();
    expect((await post("/api/reports", { ...price, reason: "spam" }, cookie)).status).toBe(400);
    expect(
      (await post("/api/reports", { ...price, reason: "wrong_price", note: "x" }, cookie)).status,
    ).toBe(400);
    expect(
      await (await post("/api/reports", { ...price, reason: "wrong_price" }, cookie)).json(),
    ).toEqual({
      status: "reported",
    });
  });

  it("one per session per price; the fourth distinct report moves the price to review", async () => {
    const me = await newSession();
    await post("/api/reports", { ...price, reason: "wrong_price" }, me);
    expect(
      await (await post("/api/reports", { ...price, reason: "offensive" }, me)).json(),
    ).toEqual({
      status: "already",
    });
    for (let i = 0; i < 2; i++)
      await post(
        "/api/reports",
        { ...price, reason: "wrong_price" },
        await newSession(),
        `198.51.100.${String(i)}`,
      );
    let row = await env.DB.prepare("SELECT status FROM prices_current WHERE venue_key = ?")
      .bind(BAR)
      .first<{ status: string }>();
    expect(row?.status).toBe("active"); // 3 reports: still active
    await post(
      "/api/reports",
      { ...price, reason: "wrong_price" },
      await newSession(),
      "198.51.100.9",
    );
    row = await env.DB.prepare("SELECT status FROM prices_current WHERE venue_key = ?")
      .bind(BAR)
      .first<{ status: string }>();
    expect(row?.status).toBe("review");
    const cell: { p: unknown[][] } = await (
      await exports.default.fetch(`${ORIGIN}/api/prices/u0nd9`)
    ).json();
    expect(cell.p.filter((p) => p[0] === BAR)).toEqual([]);
  });

  it("reports on a bar (closed, not existing, wrong info) without a price", async () => {
    const body = { venue: BAR, cell: "u0nd9", reason: "closed" };
    expect(await (await post("/api/reports", body, await newSession())).json()).toEqual({
      status: "reported",
    });
    expect((await post("/api/reports", { ...body, venue: "n1" }, await newSession())).status).toBe(
      400,
    );
  });
});

describe("daily cleanup (M2-15)", () => {
  it("deletes counters and dedup older than 2 days and keeps the others", async () => {
    const day = (offset: number) => romeDay(new Date(Date.now() - offset * 86_400_000));
    await env.DB.batch(
      [0, 1, 2, 3, 10].flatMap((d) => [
        env.DB.prepare("INSERT INTO counters (k, day, n) VALUES (?, ?, 1)").bind(
          `c${String(d)}`,
          day(d),
        ),
        env.DB.prepare("INSERT INTO dedup (k, day) VALUES (?, ?)").bind(`d${String(d)}`, day(d)),
      ]),
    );
    await worker.scheduled(createScheduledController(), env);
    const counters = await env.DB.prepare("SELECT k FROM counters ORDER BY k").all<{ k: string }>();
    const dedup = await env.DB.prepare("SELECT k FROM dedup ORDER BY k").all<{ k: string }>();
    expect(counters.results.map((r) => r.k)).toEqual(["c0", "c1", "c2"]);
    expect(dedup.results.map((r) => r.k)).toEqual(["d0", "d1", "d2"]);
  });
});
