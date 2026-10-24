import { env, exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import type { CellPrices } from "../../src/shared/api-types";
import { forgetCellCache } from "../../src/worker/lib/cell-cache";
import { getCellSnapshot, SNAPSHOT_SQL, SNAPSHOT_TTL_MS } from "../../src/worker/lib/db";
import { createSession } from "../../src/worker/lib/session";
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

  it("a real contribution through POST /api/prices adds at most 10 rows, the snapshot included", async () => {
    await read(); // the snapshot exists before the contribution
    const tables = ["price_obs", "prices_current", "cell_snapshot", "counters", "dedup"];
    const total = async () => {
      let n = 0;
      for (const t of tables)
        n +=
          (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${t}`).first<{ n: number }>())?.n ?? 0;
      return n;
    };
    const before = await total();
    const { token } = await createSession("test-session-hmac-key");
    const response = await exports.default.fetch(`${ORIGIN}/api/prices`, {
      method: "POST",
      headers: {
        Origin: ORIGIN,
        "Content-Type": "application/json",
        Cookie: `__Host-sid=${token}`,
        "CF-Connecting-IP": "203.0.113.50",
      },
      body: JSON.stringify({
        venue: "n2420779240",
        cell: CELL,
        source: "manual",
        items: [{ drink: "spritz", hh: 0, price_cents: 750 }],
      }),
    });
    expect(response.status).toBe(200);
    const row = await env.DB.prepare("SELECT body FROM cell_snapshot WHERE cell = ?")
      .bind(CELL)
      .first<{ body: string | null }>();
    expect(row?.body).toBeNull(); // the change emptied the snapshot
    expect((await total()) - before).toBeLessThanOrEqual(10);
  });
});
