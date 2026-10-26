import { createExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach, expect, it } from "vitest";
import worker from "../../src/worker/index";
import { createSession } from "../../src/worker/lib/session";
import { createMobileSession } from "../../src/worker/lib/mobile-auth";
import { romeDay } from "../../src/worker/lib/day";
import { accessJwt, ORIGIN } from "./access-jwt";
import {
  isContributionRestricted,
  retainedRestrictionDays,
  restrictionExpiry,
} from "../../src/worker/lib/contribution-restrictions";
import { hmacHex } from "../../src/worker/lib/hmac";
import { clientIp } from "../../src/worker/lib/quota";
import { purgeContributionRestrictions } from "../../src/worker/lib/db";

const original = { venue: "n2420779240", drink: "spritz", hh: 0 };
let ipNumber = 0;
async function call(path: string, jwt: string | null, body?: unknown) {
  return worker.fetch(
    new Request(`${ORIGIN}/api/admin/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Origin: ORIGIN,
        "Content-Type": "application/json",
        "CF-Connecting-IP": `198.18.0.${String(++ipNumber)}`,
        ...(jwt ? { "Cf-Access-Jwt-Assertion": jwt } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
    createExecutionContext(),
  );
}
async function actor(native = false) {
  return {
    ...(await (native
      ? createMobileSession(env.SESSION_HMAC_KEY, ORIGIN)
      : createSession(env.SESSION_HMAC_KEY))),
    ip: `192.0.2.${String(++ipNumber)}`,
    native,
  };
}
function request(who: Awaited<ReturnType<typeof actor>>, path: string, body: unknown) {
  return worker.fetch(
    new Request(`${ORIGIN}/api/${who.native ? "mobile/" : ""}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": who.ip,
        ...(who.native
          ? { "X-Dovebevo-Native": "1", Authorization: `Bearer ${who.token}` }
          : { Origin: ORIGIN, Cookie: `__Host-sid=${who.token}` }),
      },
      body: JSON.stringify(body),
    }),
    { ...env, MOBILE_PREVIEW_ENABLED: "true" },
    createExecutionContext(),
  );
}
const price = (venue = original.venue, cents = 750) => ({
  venue,
  cell: "u0nd9",
  source: "manual",
  items: [{ drink: "spritz", hh: 0, price_cents: cents }],
});
beforeEach(async () => {
  await env.DB.batch(
    [
      "contribution_restrictions",
      "prices_current",
      "price_obs",
      "dedup",
      "counters",
      "reports",
      "venues_user",
    ].map((t) => env.DB.prepare(`DELETE FROM ${t}`)),
  );
  await env.DB.prepare(
    "INSERT INTO venues_user (id,name,kind,lat,lon,cell,status) VALUES (900, 'Other approved bar', 1,45.4,9.2,'u0nd9','approved')",
  ).run();
});

async function restrict(day = romeDay()) {
  return call("restrictions", await accessJwt(), { family: "price", ...original, day });
}
const candidate = (who: Awaited<ReturnType<typeof actor>>) => ({
  sid: who.id,
  ip: clientIp(new Request(ORIGIN, { headers: { "CF-Connecting-IP": who.ip } })),
});

it("matches the same session or normalized IPv6 network, but not both changed; all same-day writers are in the cohort", async () => {
  const a = { ...(await actor()), ip: "2001:db8:abcd:1234::1" };
  const b = await actor();
  expect((await request(a, "prices", price())).status).toBe(200);
  expect((await request(b, "prices", price(original.venue, 850))).status).toBe(200);
  expect((await restrict()).status).toBe(200);
  for (const who of [
    a,
    b,
    { ...a, ip: "192.0.2.252" },
    { ...(await actor()), ip: "2001:0db8:abcd:1234:ffff::2" },
  ]) {
    expect(await isContributionRestricted(env, candidate(who))).toBe(true);
  }
  const unrelated = await actor();
  expect(await isContributionRestricted(env, candidate(unrelated))).toBe(false);
  expect((await request(unrelated, "prices", price(original.venue, 900))).status).toBe(200);
  // Restricted actions do not spend quotas or add markers. Reads and reports stay available.
  const before = await env.DB.prepare("SELECT COUNT(*) AS n FROM counters").first();
  expect((await request(a, "prices/confirm", original)).status).toBe(429);
  expect(
    (await request(a, "venues", { name: "Nuovo Caffè", kind: 0, lat: 45.4, lon: 9.2 })).status,
  ).toBe(429);
  expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM counters").first()).toEqual(before);
});

it("confirmation-only and reporting-only participants are never included", async () => {
  const writer = await actor(),
    confirmer = await actor(),
    reporter = await actor();
  expect((await request(writer, "prices", price())).status).toBe(200);
  expect((await request(confirmer, "prices/confirm", original)).status).toBe(200);
  expect(
    (await request(reporter, "reports", { ...original, cell: "u0nd9", reason: "offensive" }))
      .status,
  ).toBe(200);
  expect((await restrict()).status).toBe(200);
  expect(await isContributionRestricted(env, candidate(writer))).toBe(true);
  expect(await isContributionRestricted(env, candidate(confirmer))).toBe(false);
  expect(await isContributionRestricted(env, candidate(reporter))).toBe(false);
});

it("proposal restrictions include duplicate proposers and the IP-only duplicate attempt", async () => {
  const a = await actor(),
    b = await actor();
  const proposal = { name: "Caffè delle Stelle", kind: 1, lat: 45.48012, lon: 9.22123 };
  const created = await request(a, "venues", proposal);
  expect(created.status).toBe(200);
  const { key: venue } = await created.json<{ key: string }>();
  expect((await request(b, "venues", proposal)).status).toBe(409);
  const changedIp = { ...a, ip: "192.0.2.251" };
  expect((await request(changedIp, "venues", proposal)).status).toBe(409);
  expect(
    (await call("restrictions", await accessJwt(), { family: "proposal", venue, day: romeDay() }))
      .status,
  ).toBe(200);
  for (const who of [a, b, { ...(await actor()), ip: changedIp.ip }]) {
    expect(await isContributionRestricted(env, candidate(who))).toBe(true);
    expect((await request(who, "prices", price())).status).toBe(429);
  }
  expect(await isContributionRestricted(env, candidate(await actor()))).toBe(false);
});

it("retained yesterday markers expire exactly at Rome midnight before cron, including DST", async () => {
  for (const [day, expected] of [
    ["2026-03-27", "2026-03-28T23:00:00Z"],
    ["2026-03-28", "2026-03-29T22:00:00Z"],
    ["2026-10-23", "2026-10-24T22:00:00Z"],
    ["2026-10-24", "2026-10-25T23:00:00Z"],
  ]) {
    expect(restrictionExpiry(day ?? "")).toBe(Date.parse(expected ?? ""));
  }
  const day = "2026-10-24",
    expiry = restrictionExpiry(day);
  const who = candidate(await actor());
  const marker = await hmacHex(env.HASH_KEY, [
    day,
    "author",
    "sid",
    who.sid,
    "n2420779240|spritz|0",
  ]);
  await env.DB.prepare("INSERT INTO dedup (k, day) VALUES (?, ?)").bind(marker, day).run();
  await env.DB.prepare(
    "INSERT INTO contribution_restrictions VALUES ('price', 'n2420779240|spritz|0', ?, ?)",
  )
    .bind(day, expiry)
    .run();
  expect(retainedRestrictionDays(expiry - 1)).toEqual(["2026-10-25", day]);
  expect(await isContributionRestricted(env, who, expiry - 1)).toBe(true);
  expect(await isContributionRestricted(env, who, expiry)).toBe(false);
  expect(
    (await env.DB.prepare("SELECT COUNT(*) AS n FROM contribution_restrictions").first())?.n,
  ).toBe(1);
  await purgeContributionRestrictions(env.DB, expiry);
  expect(
    (await env.DB.prepare("SELECT COUNT(*) AS n FROM contribution_restrictions").first())?.n,
  ).toBe(0);
});

it("purging dedup markers removes membership without creating replacement markers", async () => {
  const who = await actor();
  await request(who, "prices", price());
  await restrict();
  expect(await isContributionRestricted(env, candidate(who))).toBe(true);
  await env.DB.prepare("DELETE FROM dedup").run();
  expect(await isContributionRestricted(env, candidate(who))).toBe(false);
  expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM dedup").first())?.n).toBe(0);
});

it("admin rejects invalid days, arbitrary expiry and unknown targets; stores only public references", async () => {
  const who = await actor();
  await request(who, "prices", price());
  const jwt = await accessJwt(),
    ref = { family: "price", ...original, day: romeDay() };
  expect((await call("restrictions", null, ref)).status).toBe(403);
  for (const bad of [
    { ...ref, day: "2026-99-99" },
    { ...ref, day: "9999-01-01" },
    { ...ref, day: "2000-01-01" },
    { ...ref, expires_at: 9999999999999 },
    { ...ref, sid: who.id },
    { ...ref, family: "confirm" },
    { ...ref, hh: 2 },
  ])
    expect((await call("restrictions", jwt, bad)).status).toBe(400);
  expect((await call("restrictions", jwt, { ...ref, venue: "n999999999" })).status).toBe(404);
  expect((await call("restrictions", jwt, ref)).status).toBe(200);
  const { results } = await env.DB.prepare("SELECT * FROM contribution_restrictions").all();
  expect(results).toEqual([
    {
      family: "price",
      target: "n2420779240|spritz|0",
      day: romeDay(),
      expires_at: restrictionExpiry(romeDay()),
    },
  ]);
  const listed = await (await call("restrictions", jwt)).json();
  expect(JSON.stringify(listed)).not.toContain(who.id);
  expect(JSON.stringify(listed)).not.toContain(who.ip);
});

it("capacity is finite and atomic, duplicate requests cannot extend expiry, and revocation frees capacity", async () => {
  const jwt = await accessJwt(),
    day = romeDay();
  await env.DB.batch(
    Array.from({ length: 17 }, (_, i) =>
      env.DB.prepare(
        "INSERT INTO venues_user (id,name,kind,lat,lon,cell,status) VALUES (?, 'Capacity bar', 0,45.4,9.2,'u0nd9','pending')",
      ).bind(100 + i),
    ),
  );
  const refs = Array.from({ length: 17 }, (_, i) => ({
    family: "proposal",
    venue: `u${String(100 + i)}`,
    day,
  }));
  const results = await Promise.all(refs.map((ref) => call("restrictions", jwt, ref)));
  expect(results.filter((r) => r.status === 200)).toHaveLength(16);
  expect(results.filter((r) => r.status === 503)).toHaveLength(1);
  const overflow = refs[results.findIndex((r) => r.status === 503)];
  const accepted = refs[results.findIndex((r) => r.status === 200)];
  if (!accepted || !overflow) throw new Error("missing capacity outcome");
  const expiryBefore = await env.DB.prepare(
    "SELECT expires_at FROM contribution_restrictions WHERE target = ?",
  )
    .bind(accepted.venue)
    .first();
  expect((await call("restrictions", jwt, accepted)).status).toBe(200);
  expect(
    await env.DB.prepare("SELECT expires_at FROM contribution_restrictions WHERE target = ?")
      .bind(accepted.venue)
      .first(),
  ).toEqual(expiryBefore);
  expect(
    (await env.DB.prepare("SELECT COUNT(*) AS n FROM contribution_restrictions").first())?.n,
  ).toBe(16);
  expect((await call("restrictions/revoke", jwt, accepted)).status).toBe(200);
  expect((await call("restrictions", jwt, overflow)).status).toBe(200);
});

it("authentication and the burst gate reject before restriction D1 or bounded hashing work", async () => {
  const who = await actor();
  const blockedDb = {
    prepare() {
      throw new Error("restriction work must not run");
    },
  } as unknown as D1Database;
  const send = (token: string, allowed: boolean) =>
    worker.fetch(
      new Request(`${ORIGIN}/api/prices`, {
        method: "POST",
        headers: {
          Origin: ORIGIN,
          "Content-Type": "application/json",
          Cookie: `__Host-sid=${token}`,
        },
        body: JSON.stringify(price()),
      }),
      {
        ...env,
        DB: blockedDb,
        RATE_LIMITER: { limit: () => Promise.resolve({ success: allowed }) },
      },
      createExecutionContext(),
    );
  expect((await send("invalid", true)).status).toBe(401);
  const response = await send(who.token, false);
  expect(response.status).toBe(429);
  expect(await response.json()).toMatchObject({ error: { code: "rate_limited" } });
});

for (const native of [false, true]) {
  it(`an original ${native ? "native" : "web"} writer is restricted on a different target, until revoked`, async () => {
    const who = await actor(native);
    expect((await request(who, "prices", price())).status).toBe(200);
    const jwt = await accessJwt();
    const ref = { family: "price", ...original, day: romeDay() };
    expect((await call("restrictions", jwt, ref)).status).toBe(200);
    const rejected = await request(who, "prices", price("u900"));
    expect(rejected.status).toBe(429);
    expect(await rejected.json()).toMatchObject({ error: { code: "contribution_restricted" } });
    expect((await request(who, "prices/confirm", original)).status).toBe(429);
    expect(
      (await request(who, "venues", { name: "Altro Locale", kind: 1, lat: 45.4, lon: 9.2 })).status,
    ).toBe(429);
    expect(
      (await request(who, "reports", { ...original, cell: "u0nd9", reason: "wrong_price" })).status,
    ).toBe(200);
    expect((await call("restrictions/revoke", jwt, ref)).status).toBe(200);
    expect((await request(who, "prices", price("u900", 800))).status).toBe(200);
  });
}

it("the dedup membership lookup uses the primary key index", async () => {
  const plan = await env.DB.prepare(
    "EXPLAIN QUERY PLAN SELECT 1 FROM dedup WHERE k IN (?, ?) AND day IN (?, ?) LIMIT 1",
  )
    .bind("synthetic-a", "synthetic-b", "2026-10-26", "2026-10-25")
    .all<{ detail: string }>();
  expect(
    plan.results.some((r) =>
      /SEARCH dedup USING (?:COVERING INDEX|INDEX|PRIMARY KEY)/.test(r.detail),
    ),
  ).toBe(true);
});
