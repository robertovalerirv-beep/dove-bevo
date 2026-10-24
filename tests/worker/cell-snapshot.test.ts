import { env, exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import type { CellPrices } from "../../src/shared/api-types";
import { forgetCellCache } from "../../src/worker/lib/cell-cache";
import { getCellSnapshot, SNAPSHOT_SQL, SNAPSHOT_TTL_MS } from "../../src/worker/lib/db";
import { ORIGIN } from "./access-jwt";

// M3-20 (ADR 0020): a cell is read in one D1 row, however many prices it holds, and a change shows at once.
const PRICES = 300;
const CELL = "u0nd9";

const read = async (cell = CELL) =>
  (await exports.default.fetch(`${ORIGIN}/api/prices/${cell}`)).json<CellPrices>();

beforeEach(async () => {
  const insert = Array.from({ length: PRICES }, (_, i) =>
    env.DB.prepare(
      "INSERT INTO prices_current (venue_key, drink, hh, cell, city, price_cents, observed_on, confirmations, status, source) VALUES (?, ?, 0, ?, 1, 700, '2026-10-10', 0, 'active', 'manual')",
    ).bind(`n${String(Math.floor(i / 3) + 1)}`, ["spritz", "negroni", "gin_tonic"][i % 3], CELL),
  );
  await env.DB.batch([
    env.DB.prepare("DELETE FROM prices_current"),
    env.DB.prepare("DELETE FROM venues_user"),
    env.DB.prepare("DELETE FROM cell_snapshot"),
    ...insert,
  ]);
});

describe("cell snapshot (M3-20)", () => {
  it("with 300 prices in the cell a read costs at most 5 D1 rows once the snapshot is there", async () => {
    expect((await read()).p).toHaveLength(PRICES); // computes and stores
    const hit = await env.DB.prepare(SNAPSHOT_SQL).bind(CELL).all();
    expect(hit.results).toHaveLength(1);
    expect(hit.meta.rows_read).toBeLessThanOrEqual(5);
    // The route answers from it: same text, no table read (the snapshot is returned as it is).
    const text = await getCellSnapshot(env.DB, CELL);
    expect((JSON.parse(text) as CellPrices).p).toHaveLength(PRICES);
  });

  it("a change shows at once: the snapshot is emptied and rebuilt", async () => {
    expect((await read()).p).toHaveLength(PRICES);
    await env.DB.prepare(
      "UPDATE prices_current SET status = 'review' WHERE venue_key = 'n1'",
    ).run();
    // Still the old answer until the writer says the cell changed…
    expect((await read()).p).toHaveLength(PRICES);
    await forgetCellCache(env.DB, ORIGIN, CELL);
    // …then the new one, and stored again.
    expect((await read()).p).toHaveLength(PRICES - 3);
    const row = await env.DB.prepare("SELECT v, body FROM cell_snapshot WHERE cell = ?")
      .bind(CELL)
      .first<{ v: number; body: string | null }>();
    expect(row?.v).toBe(1);
    expect(row?.body).not.toBeNull();
  });

  it("a reader that started before a change never puts its old answer back", async () => {
    await read();
    await forgetCellCache(env.DB, ORIGIN, CELL); // v = 1, body empty
    // A slow reader had read v = 0 and computed the old answer: its store must not land.
    await env.DB.prepare(
      `INSERT INTO cell_snapshot (cell, v, at, body) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT (cell) DO UPDATE SET at = excluded.at, body = excluded.body WHERE cell_snapshot.v = ?2`,
    )
      .bind(CELL, 0, Date.now(), '{"p":[],"u":[],"pend":[],"h":[]}')
      .run();
    const row = await env.DB.prepare("SELECT body FROM cell_snapshot WHERE cell = ?")
      .bind(CELL)
      .first<{ body: string | null }>();
    expect(row?.body).toBeNull();
  });

  it("a snapshot older than the time limit is computed again", async () => {
    await read();
    await env.DB.prepare(
      "UPDATE prices_current SET status = 'review' WHERE venue_key = 'n2'",
    ).run();
    await env.DB.prepare("UPDATE cell_snapshot SET at = ?")
      .bind(Date.now() - SNAPSHOT_TTL_MS - 1)
      .run();
    expect((JSON.parse(await getCellSnapshot(env.DB, CELL)) as CellPrices).p).toHaveLength(
      PRICES - 3,
    );
  });

  it("an empty cell is not stored: nothing to save, nothing written", async () => {
    expect(await read("u0ndd")).toEqual({ p: [], u: [], pend: [], h: [] });
    const row = await env.DB.prepare("SELECT cell FROM cell_snapshot WHERE cell = 'u0ndd'").first();
    expect(row).toBeNull();
  });

  it("a contribution writes at most 10 rows, the snapshot included", async () => {
    const [obs, current, snap] = await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO price_obs (venue_key, drink, hh, price_cents, observed_on, source, status) VALUES ('n1', 'spritz', 0, 750, '2026-10-11', 'manual', 'active')",
      ),
      env.DB.prepare(
        `INSERT INTO prices_current (venue_key, drink, hh, cell, city, price_cents, observed_on, confirmations, status, source)
         VALUES ('n1', 'spritz', 0, 'u0nd9', 1, 750, '2026-10-11', 0, 'active', 'manual')
         ON CONFLICT (venue_key, drink, hh) DO UPDATE SET price_cents = excluded.price_cents`,
      ),
      env.DB.prepare(
        `INSERT INTO cell_snapshot (cell, v, at, body) VALUES ('u0nd9', 1, 0, NULL)
         ON CONFLICT (cell) DO UPDATE SET v = v + 1, at = 0, body = NULL`,
      ),
    ]);
    const written =
      (obs?.meta.rows_written ?? 0) +
      (current?.meta.rows_written ?? 0) +
      (snap?.meta.rows_written ?? 0);
    expect(written).toBeLessThanOrEqual(10);
  });
});
