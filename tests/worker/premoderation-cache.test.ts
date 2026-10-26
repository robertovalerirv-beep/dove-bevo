import { env, exports } from "cloudflare:workers";
import { beforeEach, expect, it } from "vitest";
import { getCellSnapshot, invalidateCellSnapshot } from "../../src/worker/lib/db";
import { ORIGIN } from "./access-jwt";

const cell = "u0nd9";
const url = `${ORIGIN}/api/prices/${cell}`;
const oldBody = JSON.stringify({
  p: [],
  u: [["u8", "Approved Bar", 1, 45.46, 9.19]],
  pend: [["u17", "Unreviewed Name", 1, 45.46, 9.19, 2]],
  h: [],
  g: [],
});
beforeEach(async () => {
  await env.DB.batch(
    ["cell_snapshot", "venues_user", "prices_current", "venues_hidden", "venues_verified"].map(
      (t) => env.DB.prepare(`DELETE FROM ${t}`),
    ),
  );
  await caches.default.delete(new Request(url));
});

it("a fresh legacy D1 snapshot cannot publish its unreviewed name", async () => {
  await env.DB.prepare("INSERT INTO cell_snapshot (cell, v, at, body) VALUES (?, 7, ?, ?)")
    .bind(cell, Date.now(), oldBody)
    .run();
  const body = await getCellSnapshot(env.DB, cell);
  expect(body).not.toContain("Unreviewed Name");
  expect(JSON.parse(body)).toMatchObject({ pend: [] });
  expect(body).toContain("Approved Bar");
  // Privacy conversion must not reset the independent write version.
  expect(
    (await env.DB.prepare("SELECT v FROM cell_snapshot WHERE cell = ?").bind(cell).first())?.v,
  ).toBe(7);
});

it("a still-live legacy edge response is sanitized before the public API returns it", async () => {
  await caches.default.put(
    new Request(url),
    new Response(oldBody, {
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=60" },
    }),
  );
  expect(await (await caches.default.match(new Request(url)))?.text()).toContain("Unreviewed Name");
  const response = await exports.default.fetch(url);
  const body = await response.text();
  expect(response.status).toBe(200);
  expect(body).not.toContain("Unreviewed Name");
  expect(JSON.parse(body)).toMatchObject({ pend: [] });
  expect(body).toContain("Approved Bar");
});

it("a real snapshot rebuild cannot refill a version invalidated while its table read was in flight", async () => {
  await env.DB.batch([
    env.DB.prepare("INSERT INTO cell_snapshot (cell, v, at, body) VALUES (?, 7, 0, NULL)").bind(
      cell,
    ),
    env.DB.prepare(
      "INSERT INTO venues_user (id, name, kind, lat, lon, cell, status) VALUES (8, 'Approved Bar', 1, 45.46, 9.19, ?, 'approved')",
    ).bind(cell),
  ]);
  // Real D1 reads/writes, with a deterministic writer interleaved after the table read.
  const concurrent = {
    prepare: env.DB.prepare.bind(env.DB),
    batch: async (statements: D1PreparedStatement[]) => {
      const result = await env.DB.batch(statements);
      await env.DB.prepare("UPDATE venues_user SET status = 'removed' WHERE id = 8").run();
      await invalidateCellSnapshot(env.DB, cell);
      return result;
    },
  } as D1Database;
  expect(await getCellSnapshot(concurrent, cell)).toContain("Approved Bar");
  expect(
    await env.DB.prepare("SELECT v, body FROM cell_snapshot WHERE cell = ?").bind(cell).first(),
  ).toEqual({ v: 8, body: null });
  expect(await getCellSnapshot(env.DB, cell)).not.toContain("Approved Bar");
});
