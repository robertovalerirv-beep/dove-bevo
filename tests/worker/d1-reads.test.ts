import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

// M1-05: D1 reads of GET /api/prices/:cell stay proportional to the rows returned (ADR 0013).
const PRICES = 300; // a very dense cell: 100 bars × 3 drinks
const OTHER_CELL = 2000;

beforeAll(async () => {
  const rows = (cell: string, n: number, offset: number) =>
    Array.from({ length: n }, (_, i) =>
      env.DB.prepare(
        "INSERT INTO prices_current (venue_key, drink, size_ml, hh, cell, city, price_cents, observed_on, confirmations, status, source) VALUES (?, ?, 0, 0, ?, 1, 700, '2026-10-10', 0, 'active', 'manual')",
      ).bind(
        `n${String(offset + Math.floor(i / 3))}`,
        ["spritz", "negroni", "gin_tonic"][i % 3],
        cell,
      ),
    );
  await env.DB.batch([
    env.DB.prepare("DELETE FROM prices_current"),
    ...rows("u0nd9", PRICES, 0),
    ...rows("u0ndd", OTHER_CELL, 10_000),
  ]);
});

describe("D1 reads per cell request (M1-05)", () => {
  it("uses the pc_cell and vu_cell indexes", async () => {
    const plan = await env.DB.prepare(
      "EXPLAIN QUERY PLAN SELECT venue_key FROM prices_current WHERE cell = ?1 AND status IN ('active','quarantined')",
    )
      .bind("u0nd9")
      .all<{ detail: string }>();
    expect(plan.results.map((r) => r.detail).join(" ")).toMatch(/USING INDEX pc_cell/);
    const venuesPlan = await env.DB.prepare(
      "EXPLAIN QUERY PLAN SELECT id FROM venues_user WHERE cell = ?1 AND status IN ('approved','pending')",
    )
      .bind("u0nd9")
      .all<{ detail: string }>();
    expect(venuesPlan.results.map((r) => r.detail).join(" ")).toMatch(/INDEX vu_cell/);
  });

  it("reads about two rows per returned price, never the other cells", async () => {
    const result = await env.DB.prepare(
      `SELECT venue_key, drink, size_ml, hh, price_cents, observed_on, confirmations, status, source
       FROM prices_current WHERE cell = ?1 AND status IN ('active', 'quarantined')
       ORDER BY venue_key, drink, size_ml, hh`,
    )
      .bind("u0nd9")
      .all();
    expect(result.results).toHaveLength(PRICES);
    // Index entry + primary key per row, plus the final probe: about 2 per row, never the table.
    expect(result.meta.rows_read).toBeLessThanOrEqual(PRICES * 2 + 5);
  });
});

describe("D1 writes per contribution (M1-05, SPEC 8 write path)", () => {
  it("measures the rows written by one price: history insert + current upsert", async () => {
    const [obs, current] = await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO price_obs (venue_key, drink, size_ml, hh, price_cents, observed_on, source, status) VALUES ('n1', 'spritz', 0, 0, 750, '2026-10-11', 'manual', 'active')",
      ),
      env.DB.prepare(
        `INSERT INTO prices_current (venue_key, drink, size_ml, hh, cell, city, price_cents, observed_on, confirmations, status, source)
         VALUES ('n1', 'spritz', 0, 0, 'u0nd9', 1, 750, '2026-10-11', 0, 'active', 'manual')
         ON CONFLICT (venue_key, drink, size_ml, hh) DO UPDATE SET price_cents = excluded.price_cents,
           observed_on = excluded.observed_on, confirmations = 0, status = excluded.status, source = excluded.source`,
      ),
    ]);
    const written = (obs?.meta.rows_written ?? 0) + (current?.meta.rows_written ?? 0);
    expect(written).toBeLessThanOrEqual(6);
  });
});
