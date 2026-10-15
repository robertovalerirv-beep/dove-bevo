import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import type { Coverage } from "../../src/shared/api-types";
import { COVERAGE_SQL } from "../../src/worker/lib/db";
import { resetCoverageLimit } from "../../src/worker/routes/admin";
import { accessJwt, call } from "./access-jwt";

// M5-11…M5-13: admin coverage dashboard (ADR 0022).
const MILANO = 62505581;
const COMO = 62514000;

beforeEach(async () => {
  resetCoverageLimit();
  await env.DB.batch(
    ["venues_hidden", "venues_user", "prices_current", "price_obs", "counters", "dedup"].map((t) =>
      env.DB.prepare(`DELETE FROM ${t}`),
    ),
  );
});

function price(
  key: string,
  city: number | null,
  status = "active",
  day = "2026-10-10",
  drink = "spritz",
) {
  return env.DB.prepare(
    `INSERT INTO prices_current (venue_key, drink, size_ml, hh, cell, city, price_cents, observed_on, confirmations, status, source)
     VALUES (?1, ?2, 0, 0, 'u0nd9', ?3, 700, ?4, 0, ?5, 'manual')`,
  ).bind(key, drink, city, day, status);
}

const user = (id: number, status: string) =>
  env.DB.prepare(
    "INSERT INTO venues_user (id, name, kind, lat, lon, cell, status) VALUES (?1, 'Bar', 1, 45.46, 9.19, 'u0nd9', ?2)",
  ).bind(id, status);

async function coverage(): Promise<Coverage> {
  resetCoverageLimit();
  const response = await call("coverage", await accessJwt());
  expect(response.status).toBe(200);
  return response.json<Coverage>();
}

describe("GET /api/admin/coverage: access, headers, limit (M5-11)", () => {
  it("403 without a valid Access JWT", async () => {
    for (const jwt of [null, await accessJwt({}, true), await accessJwt({ aud: ["other-app"] })]) {
      const response = await call("coverage", jwt);
      expect(response.status).toBe(403);
    }
  });

  it("200 with no-store and the compact format; an empty map is all zeros", async () => {
    const response = await call("coverage", await accessJwt());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await response.json<Coverage>();
    expect(Date.parse(body.at)).not.toBeNaN();
    expect({ ...body, at: "" }).toEqual({
      at: "",
      active: 0,
      bars: 0,
      prices: 0,
      cities: [],
      none: [0, 0, ""],
    });
  });

  it("a second calculation within 10 s is answered 429 with Retry-After", async () => {
    const jwt = await accessJwt();
    expect((await call("coverage", jwt)).status).toBe(200);
    const again = await call("coverage", jwt);
    expect(again.status).toBe(429);
    expect(Number(again.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(Number(again.headers.get("Retry-After"))).toBeLessThanOrEqual(10);
    expect(await again.json()).toMatchObject({ error: { code: "rate_limited" } });
    resetCoverageLimit();
    expect((await call("coverage", jwt)).status).toBe(200);
  });
});

describe("what counts as a bar with a price (M5-12)", () => {
  it("only public bars with an active price: the definition of the map", async () => {
    await env.DB.batch([
      price("n1", MILANO),
      price("n1", MILANO, "active", "2026-10-12", "negroni"), // second price, same bar
      price("n2", MILANO, "quarantined"),
      price("n2", MILANO, "review", "2026-10-10", "negroni"),
      price("n2", MILANO, "removed", "2026-10-10", "prosecco"),
      price("n3", COMO), // hidden by the admin
      price("n4", COMO, "active", "2026-10-11"),
      price("u1", null), // approved user bar: no city
      price("u2", null), // pending: not public
      price("u3", null), // rejected: not public
      price("n5", null), // OSM bar with no city within 15 km
      user(1, "approved"),
      user(2, "pending"),
      user(3, "removed"),
      env.DB.prepare(
        "INSERT INTO venues_hidden (venue_key, cell, name, day) VALUES ('n3', 'u0nd9', 'Not a bar', '2026-10-10')",
      ),
    ]);
    const body = await coverage();
    expect(body.cities).toEqual([
      [MILANO, 1, 2, "2026-10-12"],
      [COMO, 1, 1, "2026-10-11"],
    ]);
    expect(body.none).toEqual([2, 2, "2026-10-10"]);
    expect(body.bars).toBe(4);
    expect(body.prices).toBe(5);
    // Every active row is read whatever its bar: this is the number the cost warning uses.
    expect(body.active).toBe(8);
    // Invariant: bars and prices per city plus "no city" add up to the national totals.
    expect(body.cities.reduce((s, c) => s + c[1], body.none[0])).toBe(body.bars);
    expect(body.cities.reduce((s, c) => s + c[2], body.none[1])).toBe(body.prices);
  });

  it("a second price on a covered bar adds a price, not a bar", async () => {
    await env.DB.batch([price("n1", MILANO)]);
    const before = await coverage();
    await env.DB.batch([price("n1", MILANO, "active", "2026-10-10", "negroni")]);
    const after = await coverage();
    expect(after.bars).toBe(before.bars);
    expect(after.prices).toBe(before.prices + 1);
  });

  it("quarantine and the admin's decisions change the count", async () => {
    await env.DB.batch([price("n1", MILANO, "quarantined"), user(7, "pending"), price("u7", null)]);
    expect((await coverage()).bars).toBe(0);

    const jwt = await accessJwt();
    const decide = async (path: string, body: unknown) => {
      resetCoverageLimit();
      expect((await call(path, jwt, body)).status).toBe(200);
    };
    await decide("prices/status", {
      venue: "n1",
      drink: "spritz",
      size_ml: 0,
      hh: 0,
      status: "active",
    });
    expect((await coverage()).bars).toBe(1); // out of quarantine: counts

    await decide("venues/7/status", { status: "approved" });
    expect((await coverage()).bars).toBe(2); // approved: its price is public

    await decide("venues/7/status", { status: "removed" });
    expect((await coverage()).bars).toBe(1); // removed: no longer counts

    await env.DB.prepare(
      "INSERT INTO venues_hidden (venue_key, cell, name, day) VALUES ('n1', 'u0nd9', 'x', '2026-10-10')",
    ).run();
    expect((await coverage()).bars).toBe(0); // "Togli dalla mappa"
    await decide("unhide", { venue: "n1" });
    expect((await coverage()).bars).toBe(1); // restored
  });

  it("cities are told apart by the stored OSM id, not by their position in places.json", async () => {
    await env.DB.batch([price("n1", MILANO), price("n9", COMO)]);
    const ids = (await coverage()).cities.map((c) => c[0]).sort((a, b) => a - b);
    expect(ids).toEqual([MILANO, COMO]);
  });
});

describe("cost of one calculation (M5-13, ADR 0022)", () => {
  it("scans prices_current once, with no temporary sort, at most one read per row", async () => {
    const rows = 5000;
    const drinks = ["spritz", "negroni", "gin_tonic", "beer_draft", "prosecco"];
    const statements = [];
    for (let i = 0; i < rows; i++) {
      statements.push(
        price(
          `n${String(Math.floor(i / 5))}`,
          100 + (Math.floor(i / 500) % 40),
          i % 30 === 0 ? "quarantined" : "active",
          "2026-10-10",
          drinks[i % 5],
        ),
      );
    }
    for (let i = 0; i < statements.length; i += 500)
      await env.DB.batch(statements.slice(i, i + 500));

    const plan = await env.DB.prepare(`EXPLAIN QUERY PLAN ${COVERAGE_SQL}`).all<{
      detail: string;
    }>();
    const text = plan.results.map((r) => r.detail).join(" | ");
    expect(text).toMatch(/SCAN prices_current/);
    expect(text).not.toMatch(/TEMP B-TREE/);

    const result = await env.DB.prepare(COVERAGE_SQL).all();
    expect(result.meta.rows_read).toBeLessThanOrEqual(rows + 10);
  }, 60_000);
});
