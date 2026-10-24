import { env, exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CellPrices, Coverage } from "../../src/shared/api-types";
import { coverageSnapshot, forgetCoverage } from "../../src/worker/lib/coverage";
import { COVERAGE_SQL } from "../../src/worker/lib/db";
import { forgetCell } from "../../src/worker/lib/cell-cache";
import { resetCoverageLimit } from "../../src/worker/routes/admin";
import { accessJwt, call, ORIGIN } from "./access-jwt";

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
    `INSERT INTO prices_current (venue_key, drink, hh, cell, city, price_cents, observed_on, confirmations, status, source)
     VALUES (?1, ?2, 0, 'u0nd9', ?3, 700, ?4, 0, ?5, 'manual')`,
  ).bind(key, drink, city, day, status);
}

const user = (id: number, status: string, lat = 45.46, lon = 9.19) =>
  env.DB.prepare(
    "INSERT INTO venues_user (id, name, kind, lat, lon, cell, status) VALUES (?1, 'Bar', 1, ?3, ?4, 'u0nd9', ?2)",
  ).bind(id, status, lat, lon);

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
      users: [],
      members: [],
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
    // The refusal comes before any D1 access (M5-11).
    const batch = vi.spyOn(env.DB, "batch");
    const prepare = vi.spyOn(env.DB, "prepare");
    expect((await call("coverage", jwt)).status).toBe(429);
    expect(batch).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
    // Not vacuous: the same spy does see the D1 access of an allowed calculation.
    resetCoverageLimit();
    expect((await call("coverage", jwt)).status).toBe(200);
    expect(batch).toHaveBeenCalled();
    batch.mockRestore();
    prepare.mockRestore();
    resetCoverageLimit();
    expect((await call("coverage", jwt)).status).toBe(200);
  });
});

describe("what counts as a bar with a price (M5-12)", () => {
  it("only public bars with an active price: the definition of the map", async () => {
    await env.DB.batch([
      price("n10013246997", MILANO),
      price("n10013246997", MILANO, "active", "2026-10-12", "negroni"), // second price, same bar
      price("n10081337586", MILANO, "quarantined"),
      price("n10081337586", MILANO, "review", "2026-10-10", "negroni"),
      price("n10081337586", MILANO, "removed", "2026-10-10", "prosecco"),
      price("n10128978471", COMO), // hidden by the admin
      price("n10133027509", COMO, "active", "2026-10-11"),
      price("u1", null), // approved user bar: stored without a city, placed by its coordinates
      price("n13001337602", null), // OSM bar of the fixture whose row has no city: placed by its coordinates
      price("u2", null), // pending: not public
      price("u3", null), // rejected: not public
      price("n5", null), // a key that is in no static file: gone from OSM, not on the map
      user(1, "approved"),
      user(2, "pending"),
      user(3, "removed"),
      env.DB.prepare(
        "INSERT INTO venues_hidden (venue_key, cell, name, day) VALUES ('n10128978471', 'u0nd9', 'Not a bar', '2026-10-10')",
      ),
    ]);
    const body = await coverage();
    expect(body.cities).toEqual([
      [MILANO, 3, 4, "2026-10-12"],
      [COMO, 1, 1, "2026-10-11"],
    ]);
    expect(body.none).toEqual([0, 0, ""]);
    // Approved user bars count in the total of their city (the client adds them to places.json).
    expect(body.users).toEqual([[MILANO, 1]]);
    expect(body.bars).toBe(4);
    expect(body.prices).toBe(5);
    // Every active row is read whatever its bar: this is the number the cost warning uses.
    expect(body.active).toBe(9);
    // The bars behind the counts, for the admin's city list: [city or 0, key, cell], public ones only.
    expect([...body.members].sort((a, b) => a[1].localeCompare(b[1]))).toEqual([
      [MILANO, "n10013246997", "u0nd9"],
      [COMO, "n10133027509", "u0nd9"],
      [MILANO, "n13001337602", "u0nd9"],
      [MILANO, "u1", "u0nd9"],
    ]);
    for (const [id, bars] of body.cities.map((c) => [c[0], c[1]] as const))
      expect(body.members.filter((m) => m[0] === id)).toHaveLength(bars);
    // Invariant: bars and prices per city plus "no city" add up to the national totals.
    expect(body.cities.reduce((s, c) => s + c[1], body.none[0])).toBe(body.bars);
    expect(body.cities.reduce((s, c) => s + c[2], body.none[1])).toBe(body.prices);
  });

  it("a bar can never be left without a city: even one far from every place gets the nearest", async () => {
    await env.DB.batch([user(10, "approved", 41.9, 12.5), price("u10", null)]); // Rome, fixture is Milano only
    const body = await coverage();
    expect(body.none).toEqual([0, 0, ""]);
    expect(body.bars).toBe(1);
    expect(body.cities).toHaveLength(1);
    expect(body.cities[0]?.[1]).toBe(1);
  });

  it("a user bar without prices is counted in its city, still as a bar of the total", async () => {
    await env.DB.batch([user(11, "approved"), user(12, "pending")]);
    const body = await coverage();
    expect(body.users).toEqual([[MILANO, 1]]);
    expect(body.bars).toBe(0); // no price yet: not a bar with a price
  });

  it("a second price on a covered bar adds a price, not a bar", async () => {
    await env.DB.batch([price("n10013246997", MILANO)]);
    const before = await coverage();
    await env.DB.batch([price("n10013246997", MILANO, "active", "2026-10-10", "negroni")]);
    const after = await coverage();
    expect(after.bars).toBe(before.bars);
    expect(after.prices).toBe(before.prices + 1);
  });

  it("quarantine and the admin's decisions change the count", async () => {
    await env.DB.batch([
      price("n10013246997", MILANO, "quarantined"),
      user(7, "pending"),
      price("u7", null),
    ]);
    expect((await coverage()).bars).toBe(0);

    const jwt = await accessJwt();
    const decide = async (path: string, body: unknown) => {
      resetCoverageLimit();
      expect((await call(path, jwt, body)).status).toBe(200);
    };
    await decide("prices/status", {
      venue: "n10013246997",
      drink: "spritz",
      hh: 0,
      status: "active",
    });
    expect((await coverage()).bars).toBe(1); // out of quarantine: counts

    await decide("venues/7/status", { status: "approved" });
    expect((await coverage()).bars).toBe(2); // approved: its price is public

    await decide("venues/7/status", { status: "removed" });
    expect((await coverage()).bars).toBe(1); // removed: no longer counts

    await env.DB.prepare(
      "INSERT INTO venues_hidden (venue_key, cell, name, day) VALUES ('n10013246997', 'u0nd9', 'x', '2026-10-10')",
    ).run();
    expect((await coverage()).bars).toBe(0); // "Togli dalla mappa"
    await decide("unhide", { venue: "n10013246997" });
    expect((await coverage()).bars).toBe(1); // restored
  });

  it("a city is the stored OSM id of the place: the Worker never reads an index into places.json", async () => {
    await env.DB.batch([price("n10013246997", MILANO), price("n10171157780", COMO)]);
    const ids = (await coverage()).cities.map((c) => c[0]).sort((a, b) => a - b);
    expect(ids).toEqual([MILANO, COMO]);
  });
});

describe("city of a bar and the public cell read (ADR 0022)", () => {
  it("a bar moved to another place by a new import counts for the newest attribution", async () => {
    await env.DB.batch([
      price("n10013246997", COMO, "active", "2026-09-01", "spritz"),
      price("n10013246997", MILANO, "active", "2026-10-12", "negroni"),
    ]);
    const body = await coverage();
    expect(body.cities).toEqual([[MILANO, 1, 2, "2026-10-12"]]);
  });

  it("GET /api/prices/:cell leaves out the prices of hidden bars and still lists them in h", async () => {
    await env.DB.batch([
      price("n10013246997", MILANO),
      price("n10081337586", MILANO),
      env.DB.prepare(
        "INSERT INTO venues_hidden (venue_key, cell, name, day) VALUES ('n10081337586', 'u0nd9', 'Not a bar', '2026-10-10')",
      ),
    ]);
    const response = await exports.default.fetch(`${ORIGIN}/api/prices/u0nd9`);
    const body = await response.json<CellPrices>();
    expect(body.p.map((row) => row[0])).toEqual(["n10013246997"]);
    expect(body.h).toEqual(["n10081337586"]);
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

describe("the figures are kept for a minute (ADR 0025)", () => {
  it("a second read within the minute costs no D1 access; an admin change drops the figures", async () => {
    await env.DB.batch([price("n10013246997", MILANO)]);
    const first = await coverageSnapshot(env);
    expect(first.bars).toBe(1);

    await env.DB.batch([price("n10081337586", MILANO)]);
    const batch = vi.spyOn(env.DB, "batch");
    expect(await coverageSnapshot(env)).toBe(first); // same figures, nothing read
    expect(batch).not.toHaveBeenCalled();

    await forgetCell(env.DB, "https://dovebevo.example/api/admin/hide", "u0nd9"); // what every admin change calls
    expect((await coverageSnapshot(env)).bars).toBe(2);
    expect(batch).toHaveBeenCalled();
    batch.mockRestore();

    forgetCoverage();
    await env.DB.batch([price("n10128978471", MILANO)]);
    expect((await coverageSnapshot(env)).bars).toBe(3);
  });
});
