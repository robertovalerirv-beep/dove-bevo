import { env, exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import type { CellPrices } from "../../src/shared/api-types";
import { forgetCell } from "../../src/worker/lib/cell-cache";
import { activePrices } from "../../src/worker/lib/db";
import { createSession } from "../../src/worker/lib/session";

// M3-11…M3-13 (v1.1, ADR 0019): a proposed bar is pending until the admin approves it.
const ORIGIN = "https://dovebevo.example";
// A point in the Duomo cell (u0nd9) with no bar of the same name nearby.
const POINT = { lat: 45.4651, lon: 9.1911 };

async function newSession(): Promise<string> {
  const { token } = await createSession("test-session-hmac-key");
  return `__Host-sid=${token}`;
}

let ipCounter = 0;
const nextIp = () => `203.0.113.${String(++ipCounter)}`;

function propose(body: unknown, cookie: string, ip = nextIp()) {
  return exports.default.fetch(`${ORIGIN}/api/venues`, {
    method: "POST",
    headers: {
      Origin: ORIGIN,
      "Content-Type": "application/json",
      Cookie: cookie,
      "CF-Connecting-IP": ip,
    },
    body: JSON.stringify(body),
  });
}

const bar = (name: string, extra: object = {}) => ({ name, kind: 1, ...POINT, ...extra });

async function cell(): Promise<CellPrices> {
  await caches.default.delete(new Request(`${ORIGIN}/api/prices/u0nd9`)); // the edge copy lasts 60 s
  return (await exports.default.fetch(`${ORIGIN}/api/prices/u0nd9`)).json();
}

beforeEach(async () => {
  await env.DB.batch(
    ["venues_user", "prices_current", "price_obs", "counters", "dedup"].map((t) =>
      env.DB.prepare(`DELETE FROM ${t}`),
    ),
  );
});

describe("POST /api/venues (M3-11, M3-12)", () => {
  it("stores a pending proposal, rounded to 5 decimals, in the cell of the pin", async () => {
    const response = await propose(
      bar("Bar Delle Prove", { lat: 45.465123456, lon: 9.191123456 }),
      await newSession(),
    );
    expect(response.status).toBe(200);
    const { key, cell: c } = await response.json<{ key: string; cell: string }>();
    expect(c).toBe("u0nd9");
    const row = await env.DB.prepare("SELECT * FROM venues_user WHERE id = ?")
      .bind(Number(key.slice(1)))
      .first();
    expect(row).toMatchObject({ status: "pending", lat: 45.46512, lon: 9.19112, confirmations: 1 });
  });

  it("a pending bar is listed for choosing but its prices are not public (M3-13)", async () => {
    const cookie = await newSession();
    const { key } = await (await propose(bar("Bar Delle Prove"), cookie)).json<{ key: string }>();
    const price = await exports.default.fetch(`${ORIGIN}/api/prices`, {
      method: "POST",
      headers: {
        Origin: ORIGIN,
        "Content-Type": "application/json",
        Cookie: cookie,
        "CF-Connecting-IP": nextIp(),
      },
      body: JSON.stringify({
        venue: key,
        cell: "u0nd9",
        source: "manual",
        items: [{ drink: "spritz", hh: 0, price_cents: 700 }],
      }),
    });
    expect(price.status).toBe(200);
    const before = await cell();
    expect(before.u).toEqual([]);
    expect(before.pend.map((v) => v[0])).toEqual([key]);
    expect(before.p).toEqual([]);

    const id = Number(key.slice(1));
    await env.DB.prepare("UPDATE venues_user SET status = 'approved' WHERE id = ?").bind(id).run();
    await forgetCell(env.DB, ORIGIN, "u0nd9"); // what the admin route does after approving
    const after = await cell();
    expect(after.u.map((v) => v[0])).toEqual([key]);
    expect(after.p.map((r) => r[0])).toEqual([key]);

    await env.DB.prepare("UPDATE venues_user SET status = 'removed' WHERE id = ?").bind(id).run();
    await forgetCell(env.DB, ORIGIN, "u0nd9");
    const gone = await cell();
    expect(gone.u).toEqual([]);
    expect(gone.p).toEqual([]);
  });

  it("the prices of a pending bar are not on its bar page and never move the median (security review)", async () => {
    const cookie = await newSession();
    const { key } = await (await propose(bar("Bar Invisibile"), cookie)).json<{ key: string }>();
    await env.DB.prepare(
      `INSERT INTO prices_current (venue_key, drink, hh, cell, city, price_cents, observed_on, confirmations, status, source)
       VALUES (?, 'spritz', 0, 'u0nd9', NULL, 700, '2026-10-10', 0, 'active', 'manual')`,
    )
      .bind(key)
      .run();
    await env.DB.prepare(
      `INSERT INTO price_obs (venue_key, drink, hh, price_cents, observed_on, source, status)
       VALUES (?, 'spritz', 0, 700, '2026-10-10', 'manual', 'active')`,
    )
      .bind(key)
      .run();
    const page = await exports.default.fetch(`${ORIGIN}/api/venues/${key}/prices`, {
      headers: { "CF-Connecting-IP": nextIp() },
    });
    expect(await page.json()).toEqual({ p: [], h: [] });
    expect(await activePrices(env.DB, "u0nd9", "spritz", 0)).toEqual([]);

    const id = Number(key.slice(1));
    await env.DB.prepare("UPDATE venues_user SET status = 'approved' WHERE id = ?").bind(id).run();
    expect(await activePrices(env.DB, "u0nd9", "spritz", 0)).toEqual([700]);
    const open = await exports.default.fetch(`${ORIGIN}/api/venues/${key}/prices`, {
      headers: { "CF-Connecting-IP": nextIp() },
    });
    const { p, h } = await open.json<{ p: unknown[]; h: unknown[] }>();
    expect([p.length, h.length]).toEqual([1, 1]);
  });

  it("rejects names with links, e-mail addresses, phone numbers and control characters", async () => {
    const cookie = await newSession();
    for (const name of [
      "Visita www.esempio.it",
      "https://x.example",
      "bar@esempio.it",
      "Bar 333 123 4567",
      "Bar\u0007Rosso",
      "A",
    ]) {
      expect((await propose(bar(name), cookie)).status, name).toBe(400);
    }
  });

  it("stores HTML as inert text and keeps coordinates inside Italy", async () => {
    const cookie = await newSession();
    const html = await propose(bar("<img src=x onerror=alert(1)>"), cookie);
    expect(html.status).toBe(200);
    expect((await propose(bar("Fuori", { lat: 10, lon: 10 }), cookie)).status).toBe(400);
    expect((await propose(bar("Extra", { admin: true }), cookie)).status).toBe(400);
    expect((await propose(bar("Tipo", { kind: 3 }), cookie)).status).toBe(400);
  });

  it("answers 409 with the key of a bar of OSM with the same name within 50 m", async () => {
    // Bistrot Duomo (n2420779240) is in the fixture cell u0nd9.
    const file = await (
      await env.ASSETS.fetch("https://assets.local/data/fixture/v/u0nd9.json")
    ).json<{ v: [string, string, number, number, number][] }>();
    const osm = file.v.find((v) => v[0] === "n2420779240");
    expect(osm).toBeDefined();
    const response = await propose(
      bar(osm?.[1].toUpperCase() ?? "", { lat: osm?.[3], lon: osm?.[4] }),
      await newSession(),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { code: "conflict" },
      key: "n2420779240",
    });
  });

  it("a duplicate of a pending bar answers 409 and counts one more independent proposer", async () => {
    const first = await (
      await propose(bar("Doppione"), await newSession())
    ).json<{ key: string }>();
    const again = await propose(bar("doppione"), await newSession(), "198.51.100.5");
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ key: first.key });
    const row = await env.DB.prepare("SELECT confirmations FROM venues_user WHERE id = ?")
      .bind(Number(first.key.slice(1)))
      .first<{ confirmations: number }>();
    expect(row?.confirmations).toBe(2);
    // No approval, ever, from proposals: still pending.
    const status = await env.DB.prepare("SELECT status FROM venues_user WHERE id = ?")
      .bind(Number(first.key.slice(1)))
      .first<{ status: string }>();
    expect(status?.status).toBe("pending");
  });

  it("the proposer repeating the proposal does not count as another person", async () => {
    const cookie = await newSession();
    const ip = nextIp();
    const first = await (await propose(bar("Solo Io"), cookie, ip)).json<{ key: string }>();
    expect((await propose(bar("Solo Io"), cookie, ip)).status).toBe(409);
    const row = await env.DB.prepare("SELECT confirmations FROM venues_user WHERE id = ?")
      .bind(Number(first.key.slice(1)))
      .first<{ confirmations: number }>();
    expect(row?.confirmations).toBe(1);
  });

  it("a recently rejected proposal blocks the same name at the same spot (no key)", async () => {
    const made = await (
      await propose(bar("Non Un Bar"), await newSession())
    ).json<{ key: string }>();
    await env.DB.prepare(
      "UPDATE venues_user SET status = 'removed', day = date('now') WHERE id = ?",
    )
      .bind(Number(made.key.slice(1)))
      .run();
    const response = await propose(bar("Non un bar"), await newSession(), "198.51.100.6");
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ key: null });
  });

  it("the sixth proposal of the day from one session is refused with 429", async () => {
    const cookie = await newSession();
    for (let i = 0; i < 5; i++) {
      const r = await propose(
        bar(`Bar numero ${String.fromCharCode(97 + i)}`, { lat: 45.4651 + i * 0.001 }),
        cookie,
      );
      expect(r.status).toBe(200);
    }
    const sixth = await propose(bar("Bar sesto", { lat: 45.4701 }), cookie);
    expect(sixth.status).toBe(429);
    expect(sixth.headers.get("retry-after")).not.toBeNull();
  });

  it("beyond 200 pending proposals the answer is a polite 503 (busy)", async () => {
    const rows = Array.from({ length: 200 }, (_, i) =>
      env.DB.prepare(
        "INSERT INTO venues_user (name, kind, lat, lon, cell, status, confirmations, day) VALUES (?, 1, 45.1, 9.1, 'u0nd0', 'pending', 1, date('now'))",
      ).bind(`Riempitivo ${String(i)}`),
    );
    await env.DB.batch(rows);
    const response = await propose(bar("Uno di troppo"), await newSession());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: "busy" } });
  });

  it("needs a session and an own origin (M2-04)", async () => {
    const noSession = await exports.default.fetch(`${ORIGIN}/api/venues`, {
      method: "POST",
      headers: { Origin: ORIGIN, "Content-Type": "application/json" },
      body: JSON.stringify(bar("Senza sessione")),
    });
    expect(noSession.status).toBe(401);
  });
});
