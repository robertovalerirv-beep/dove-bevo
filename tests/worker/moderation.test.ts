import { env, exports } from "cloudflare:workers";
import { beforeEach, expect, it } from "vitest";
import { createSession } from "../../src/worker/lib/session";
import { romeDay } from "../../src/worker/lib/day";
import { accessJwt, call, ORIGIN } from "./access-jwt";

const key = { venue: "n2420779240", drink: "spritz", hh: 0 };
const cell = "u0nd9";
beforeEach(async () => {
  await env.DB.batch([
    ...["prices_current", "price_obs", "reports", "counters", "dedup", "cell_snapshot"].map((t) =>
      env.DB.prepare(`DELETE FROM ${t}`),
    ),
    env.DB.prepare(`INSERT INTO prices_current
      (venue_key, drink, hh, cell, price_cents, observed_on, status, source)
      VALUES ('n2420779240', 'spritz', 0, 'u0nd9', 750, '2026-10-10', 'active', 'manual')`),
  ]);
  await caches.default.delete(new Request(`${ORIGIN}/api/prices/${cell}`));
});

async function report(ip: string, reason = "offensive") {
  const { token } = await createSession("test-session-hmac-key");
  return exports.default.fetch(`${ORIGIN}/api/reports`, {
    method: "POST",
    headers: {
      Origin: ORIGIN,
      "Content-Type": "application/json",
      Cookie: `__Host-sid=${token}`,
      "CF-Connecting-IP": ip,
    },
    body: JSON.stringify({ ...key, cell, reason }),
  });
}
async function queue(jwt: string) {
  return (await (await call("overview", jwt)).json<{ prices: unknown[] }>()).prices;
}

it("the first offensive price report is actionable; removing it closes only its reports", async () => {
  const jwt = await accessJwt();
  expect((await report("198.51.100.41")).status).toBe(200);
  expect(await queue(jwt)).toEqual([
    expect.objectContaining({
      venue_key: key.venue,
      drink: key.drink,
      hh: 0,
      cell,
      status: "active",
      n: 1,
      reasons: "offensive",
      report_day: romeDay(),
      price_cents: 750,
    }),
  ]);
  await env.DB.prepare(
    "INSERT INTO reports (venue_key, reason, day, cell) VALUES (?, 'closed', ?, ?)",
  )
    .bind(key.venue, romeDay(), cell)
    .run();
  expect((await call("prices/status", null, { ...key, status: "removed" })).status).toBe(403);
  expect((await call("prices/status", jwt, { ...key, status: "removed" })).status).toBe(200);
  expect(await queue(jwt)).toEqual([]);
  const publicCell = await (
    await exports.default.fetch(`${ORIGIN}/api/prices/${cell}`)
  ).json<{ p: unknown[] }>();
  expect(publicCell.p).toEqual([]);
  expect(await env.DB.prepare("SELECT reason FROM reports").all()).toMatchObject({
    results: [{ reason: "closed" }],
  });
});

it("three reports remain active but review can be chosen explicitly without a fourth report", async () => {
  for (const ip of ["198.51.100.42", "198.51.100.43", "198.51.100.44"])
    expect((await report(ip, "wrong_price")).status).toBe(200);
  const jwt = await accessJwt();
  expect(await queue(jwt)).toEqual([expect.objectContaining({ status: "active", n: 3 })]);
  expect((await call("prices/status", jwt, { ...key, status: "review" })).status).toBe(200);
  expect(await queue(jwt)).toEqual([expect.objectContaining({ status: "review", n: 3 })]);
  expect((await call("prices/status", jwt, { ...key, status: "active" })).status).toBe(200);
  expect(await queue(jwt)).toEqual([]);
  expect((await env.DB.prepare("SELECT status FROM prices_current").first())?.status).toBe(
    "active",
  );
});

it("dismissing a reported active price keeps it public and preserves duplicate protection", async () => {
  expect((await report("198.51.100.45")).status).toBe(200);
  const jwt = await accessJwt();
  expect((await call("reports/dismiss", jwt, key)).status).toBe(200);
  expect(await queue(jwt)).toEqual([]);
  expect((await env.DB.prepare("SELECT status FROM prices_current").first())?.status).toBe(
    "active",
  );
  expect(await (await report("198.51.100.45")).json()).toEqual({ status: "already" });
  expect((await call("prices/status", jwt, { ...key, status: "removed" })).status).toBe(404);
});

it("incomplete or invalid price dismissal cannot silently dismiss a venue report", async () => {
  await env.DB.prepare(
    "INSERT INTO reports (venue_key, reason, day, cell) VALUES (?, 'offensive', ?, ?)",
  )
    .bind(key.venue, romeDay(), cell)
    .run();
  const jwt = await accessJwt();
  for (const target of [
    { venue: key.venue, drink: key.drink },
    { ...key, hh: 2 },
    { ...key, drink: "unknown" },
  ])
    expect((await call("reports/dismiss", jwt, target)).status).toBe(400);
  const overview = await (await call("overview", jwt)).json<{ reports: unknown[] }>();
  expect(overview.reports).toEqual([
    expect.objectContaining({
      venue_key: key.venue,
      status: "visible",
      reasons: "offensive",
      n: 1,
      day: romeDay(),
    }),
  ]);
});

it("legacy reports on an already removed price remain visible until dismissed", async () => {
  expect((await report("198.51.100.46")).status).toBe(200);
  await env.DB.prepare("UPDATE prices_current SET status = 'removed'").run();
  const jwt = await accessJwt();
  expect(await queue(jwt)).toEqual([expect.objectContaining({ status: "removed", n: 1 })]);
  expect((await call("reports/dismiss", jwt, key)).status).toBe(200);
  expect(await queue(jwt)).toEqual([]);
  expect((await env.DB.prepare("SELECT status FROM prices_current").first())?.status).toBe(
    "removed",
  );
});
