import { env, exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import type { CellPrices } from "../../src/shared/api-types";
import { createSession } from "../../src/worker/lib/session";
import { accessJwt, call, ORIGIN } from "./access-jwt";

const cell = async (id: string) =>
  (await exports.default.fetch(`${ORIGIN}/api/prices/${id}`)).json<CellPrices>();

beforeEach(async () => {
  await env.DB.batch(
    [
      "venues_hidden",
      "venues_user",
      "prices_current",
      "price_obs",
      "counters",
      "dedup",
      "reports",
    ].map((t) => env.DB.prepare(`DELETE FROM ${t}`)),
  );
});

describe("admin protection (M5-02, D-19)", () => {
  it("403 without a valid Access JWT: missing, forged, wrong audience, wrong issuer, expired", async () => {
    const now = Math.floor(Date.now() / 1000);
    const bad = [
      null,
      "not.a.jwt",
      await accessJwt({}, true),
      await accessJwt({ aud: ["other-app"] }),
      await accessJwt({ iss: "https://evil.cloudflareaccess.com" }),
      await accessJwt({ exp: now - 10 }),
    ];
    for (const jwt of bad) {
      const response = await call("overview", jwt);
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ error: { code: "forbidden" } });
    }
    expect((await call("hide", null, { venue: "n2420779240", cell: "u0nd9" })).status).toBe(403);
  });

  it("200 with a valid JWT", async () => {
    const response = await call("overview", await accessJwt());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ venues: [], hidden: [], prices: [], reports: [] });
  });

  it("admin writes still need the service Origin", async () => {
    const response = await exports.default.fetch(`${ORIGIN}/api/admin/unhide`, {
      method: "POST",
      headers: {
        Origin: "https://evil.example",
        "Content-Type": "application/json",
        "Cf-Access-Jwt-Assertion": await accessJwt(),
      },
      body: JSON.stringify({ venue: "n1" }),
    });
    expect(response.status).toBe(403);
  });
});

describe("admin bar corrections", () => {
  it("bar reports wait for the admin: listed with their cell, closed by delete or dismiss", async () => {
    const report = async (venue: string, reason: string, ip: string) => {
      const { token } = await createSession("test-session-hmac-key");
      return exports.default.fetch(`${ORIGIN}/api/reports`, {
        method: "POST",
        headers: {
          Origin: ORIGIN,
          "Content-Type": "application/json",
          Cookie: `__Host-sid=${token}`,
          "CF-Connecting-IP": ip,
        },
        body: JSON.stringify({ venue, cell: "u0nd9", reason }),
      });
    };
    expect((await report("n2420779240", "not_exists", "198.51.100.1")).status).toBe(200);
    expect((await report("n2420779240", "closed", "198.51.100.2")).status).toBe(200);
    expect((await report("n13001337602", "wrong_info", "198.51.100.3")).status).toBe(200);
    const jwt = await accessJwt();
    const overview = async () =>
      (
        await (
          await call("overview", jwt)
        ).json<{
          reports: { venue_key: string; cell: string; reasons: string; n: number }[];
        }>()
      ).reports;
    const first = await overview();
    expect(first).toHaveLength(2);
    expect(first[0]).toMatchObject({ venue_key: "n2420779240", cell: "u0nd9", n: 2 });
    expect(first[0]?.reasons.split(",").sort()).toEqual(["closed", "not_exists"]);
    // Nothing is hidden by the reports alone.
    expect((await cell("u0nd9")).h).toEqual([]);

    expect((await call("hide", jwt, { venue: "n2420779240", cell: "u0nd9" })).status).toBe(200);
    expect((await call("reports/dismiss", jwt, { venue: "n13001337602" })).status).toBe(200);
    expect(await overview()).toEqual([]);
  });

  it("hides an OSM entry that is not a bar: listed in the cell as hidden, no new prices, restorable", async () => {
    const jwt = await accessJwt();
    expect((await call("hide", jwt, { venue: "n2420779240", cell: "u0nd9" })).status).toBe(200);
    expect((await cell("u0nd9")).h).toEqual(["n2420779240"]);
    const overview = await (
      await call("overview", jwt)
    ).json<{
      hidden: { venue_key: string; name: string }[];
    }>();
    expect(overview.hidden[0]).toMatchObject({ venue_key: "n2420779240", name: "Bistrot Duomo" });

    const { token } = await createSession("test-session-hmac-key");
    const price = await exports.default.fetch(`${ORIGIN}/api/prices`, {
      method: "POST",
      headers: {
        Origin: ORIGIN,
        "Content-Type": "application/json",
        Cookie: `__Host-sid=${token}`,
      },
      body: JSON.stringify({
        venue: "n2420779240",
        cell: "u0nd9",
        source: "manual",
        items: [{ drink: "spritz", hh: 0, price_cents: 700 }],
      }),
    });
    expect(price.status).toBe(400);

    expect((await call("unhide", jwt, { venue: "n2420779240" })).status).toBe(200);
    expect((await cell("u0nd9")).h).toEqual([]);
  });

  it("refuses to hide a key that is not in that cell's file", async () => {
    expect((await call("hide", await accessJwt(), { venue: "n1", cell: "u0nd9" })).status).toBe(
      404,
    );
  });

  it("adds a missing bar, approved and on the map at once; then removes it", async () => {
    const jwt = await accessJwt();
    const added = await call("venues", jwt, {
      name: "Bar Nuovo",
      kind: 1,
      lat: 45.4642,
      lon: 9.19,
    });
    expect(added.status).toBe(200);
    const { key, cell: id } = await added.json<{ key: string; cell: string }>();
    expect(id).toBe("u0nd9");
    expect((await cell(id)).u).toEqual([[key, "Bar Nuovo", 1, 45.4642, 9.19]]);

    const bad = [
      { name: "B", kind: 1, lat: 45.46, lon: 9.19 },
      { name: "Bar", kind: 9, lat: 45.46, lon: 9.19 },
      { name: "Bar", kind: 1, lat: 48.9, lon: 2.35 }, // Paris
      { name: "Bar", kind: 1, lat: 45.46, lon: 9.19, extra: 1 },
    ];
    for (const body of bad) expect((await call("venues", jwt, body)).status).toBe(400);

    expect((await call(`venues/${key.slice(1)}/status`, jwt, { status: "removed" })).status).toBe(
      200,
    );
    expect((await cell(id)).u).toEqual([]);
  });

  it("decides on a price under review", async () => {
    await env.DB.prepare(
      `INSERT INTO prices_current (venue_key, drink, hh, cell, city, price_cents, observed_on, confirmations, status, source)
       VALUES ('n2420779240', 'spritz', 0, 'u0nd9', 1, 750, '2026-10-10', 0, 'review', 'manual')`,
    ).run();
    const jwt = await accessJwt();
    const key = { venue: "n2420779240", drink: "spritz", hh: 0 };
    expect((await cell("u0nd9")).p).toEqual([]);
    expect((await call("prices/status", jwt, { ...key, status: "active" })).status).toBe(200);
    expect((await cell("u0nd9")).p).toHaveLength(1);
    // Only prices in review or quarantine can be decided.
    expect((await call("prices/status", jwt, { ...key, status: "removed" })).status).toBe(404);
  });
});
