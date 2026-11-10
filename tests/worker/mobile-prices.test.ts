import { env } from "cloudflare:workers";
import { createExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import worker from "../../src/worker/index";
import { checkedConfirmationNoop } from "../../src/worker/routes/mobile-prices";
import { createSession } from "../../src/worker/lib/session";
import { romeDay } from "../../src/worker/lib/day";
import { encodeGeohash } from "../../src/shared/geohash";
import {
  customerStatements,
  seedMobileMenuPrice,
  type MobilePriceRow,
  type TrustedMobileSeed,
} from "../../src/worker/routes/mobile-price-store";
import {
  servingKey,
  type MobileCatalog,
  type MobileCatalogVenue,
} from "../../src/worker/routes/mobile-price-catalog";

const ORIGIN = "https://dovebevo.example";
const TODAY = new Date().toISOString().slice(0, 10);
const london = {
  key: "n910000001",
  name: "Test London Bar",
  kind: 1,
  lat: 51.5074,
  lon: -0.1278,
  cell: "gcpvj",
  city: "London",
  country: "GB",
  currency: "GBP",
  google: { url: "https://www.google.com/maps/place/Test", review_count: 101, checked_on: TODAY },
} satisfies MobileCatalogVenue;
const paris = {
  ...london,
  key: "n910000002",
  name: "Test Paris Bar",
  lat: 48.8566,
  lon: 2.3522,
  cell: "u09tv",
  city: "Paris",
  country: "FR",
  currency: "EUR",
} satisfies MobileCatalogVenue;
const legacy = {
  ...london,
  key: "n2420779240",
  name: "Bistrot Duomo",
  lat: 45.46353,
  lon: 9.18979,
  cell: "u0nd9",
  city: "Milano",
  country: "IT",
  currency: "EUR",
} satisfies MobileCatalogVenue;
const catalog = {
  schema_version: 1,
  version: "test-europe-v1",
  venues: [london, paris, legacy],
} satisfies MobileCatalog;
const serving = { unit: "drink" as const };
let sequence = 0;
const nextIp = () => `198.19.${String(Math.floor(++sequence / 250))}.${String(sequence % 250)}`;
const cookie = async () => `__Host-sid=${(await createSession("test-session-hmac-key")).token}`;
function bindings(data: unknown = catalog): Env {
  return {
    ...env,
    ASSETS: {
      fetch: async (input: RequestInfo | URL) => {
        const request = new Request(input);
        if (new URL(request.url).pathname === "/mobile-data/catalog.json")
          return Response.json(data);
        return env.ASSETS.fetch(request);
      },
    } as unknown as Env["ASSETS"],
  };
}
interface Options {
  cookie?: string;
  ip?: string;
  headers?: Record<string, string>;
  bindings?: Env;
}
async function call(path: string, body?: unknown, options: Options = {}) {
  return worker.fetch(
    new Request(ORIGIN + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Origin: ORIGIN,
        "Content-Type": "application/json",
        "CF-Connecting-IP": options.ip ?? nextIp(),
        ...(options.cookie ? { Cookie: options.cookie } : {}),
        ...options.headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    options.bindings ?? bindings(),
    createExecutionContext(),
  );
}
const item = (amount_minor = 750, extra: object = {}) => ({
  drink: "spritz",
  hh: 0,
  serving,
  amount_minor,
  ...extra,
});
const body = (
  items: object[] = [item()],
  venue: MobileCatalogVenue = london,
  extra: object = {},
) => ({
  venue: venue.key,
  cell: venue.cell,
  currency: venue.currency,
  items,
  ...extra,
});
interface Snapshot {
  schema_version: 1;
  catalog_version: string;
  rows: MobilePriceRow[];
  hidden: string[];
  legacy_venues: string[];
}
async function read(venue: MobileCatalogVenue = london, configured = bindings()) {
  const response = await call(
    `/api/mobile/prices/venues/${venue.key}?cell=${venue.cell}`,
    undefined,
    { bindings: configured },
  );
  expect(response.status, await response.clone().text()).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  return response.json<Snapshot>();
}
async function onlyRow(venue: MobileCatalogVenue = london, configured = bindings()) {
  const result = await read(venue, configured);
  expect(result.rows).toHaveLength(1);
  const row = result.rows[0];
  if (!row) throw new Error("Expected one price");
  return row;
}
const seed = (venue: MobileCatalogVenue = london, extra: Partial<TrustedMobileSeed> = {}) => ({
  batch_id: "test-001",
  manifest_sha256: "a".repeat(64),
  catalog_version: catalog.version,
  venue: venue.key,
  cell: venue.cell,
  drink: "spritz",
  hh: 0 as const,
  currency: venue.currency,
  serving,
  amount_minor: 750,
  source_url: "https://official.example/menu",
  source_sha256: "b".repeat(64),
  source_checked_on: TODAY,
  menu_item: "Aperol Spritz",
  ...extra,
});
const confirmBody = (row: MobilePriceRow) => ({
  venue: row.venue,
  cell: row.cell,
  currency: row.currency,
  drink: row.drink,
  hh: row.hh,
  serving: row.serving,
  revision: row.revision,
});
beforeEach(async () => {
  // Immutable source audits deliberately remain; source IDs are content-addressed.
  await env.DB.batch(
    [
      "mobile_price_obs",
      "mobile_prices_current",
      "mobile_price_reports",
      "mobile_venues_moderation",
      "prices_current",
      "price_obs",
      "reports",
      "venues_hidden",
      "venues_user",
      "counters",
      "dedup",
    ].map((table) => env.DB.prepare(`DELETE FROM ${table}`)),
  );
});

describe("apps-only European price storage", () => {
  it("stores pounds without conversion, and keeps legacy price tables empty", async () => {
    const response = await call("/api/mobile/prices", body(), { cookie: await cookie() });
    expect(response.status, await response.clone().text()).toBe(200);
    expect(await response.json()).toEqual({ results: [{ status: "active" }] });
    const row = await onlyRow();
    expect(row).toMatchObject({
      currency: "GBP",
      amount_minor: 750,
      serving,
      observed_on: romeDay(),
      confirmed_on: null,
      confirmations: 0,
      provenance: {
        kind: "customer",
        source_url: null,
        source_checked_on: null,
        source_sha256: null,
        menu_item: null,
      },
    });
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM prices_current").first("n")).toBe(0);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM price_obs").first("n")).toBe(0);
  });
  it("preserves strict Origin, session and real-secret guards", async () => {
    const session = await cookie();
    expect((await call("/api/mobile/prices", body())).status).toBe(401);
    expect(
      (
        await call("/api/mobile/prices", body(), {
          cookie: session,
          headers: { Origin: "https://evil.example" },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call("/api/mobile/prices", body(), {
          cookie: session,
          bindings: { ...bindings(), HASH_KEY: "local-dev-only-key" },
        })
      ).status,
    ).toBe(503);
    expect((await read()).rows).toEqual([]);
  });
  it("meters both reads and writes with existing bindings", async () => {
    const configured = bindings();
    const fail = { limit: () => Promise.resolve({ success: false }) };
    expect(
      (
        await call(`/api/mobile/prices/cells/${london.cell}`, undefined, {
          bindings: { ...configured, READ_LIMITER: fail },
        })
      ).status,
    ).toBe(429);
    expect(
      (
        await call("/api/mobile/prices", body(), {
          cookie: await cookie(),
          bindings: { ...configured, RATE_LIMITER: fail },
        })
      ).status,
    ).toBe(429);
  });
  it.each([
    { source: "online_menu" },
    { observed_on: "2000-01-01" },
    { source_url: "https://official.example/menu" },
    { currency: "EUR" },
    { venue: "u7" },
    { cell: "u09tv" },
  ])("rejects client source/date claims and identity/currency mismatches %j", async (extra) => {
    expect(
      (await call("/api/mobile/prices", body([item()], london, extra), { cookie: await cookie() }))
        .status,
    ).toBe("cell" in extra ? 404 : 400);
    expect((await read()).rows).toEqual([]);
  });
  it.each([
    item(750, { drink: "beer_draft" }),
    item(750, { drink: "wine_glass" }),
    item(750, { serving: { unit: "drink", ml: 400 } }),
    item(750, { drink: "water", serving: { unit: "ml" } }),
    item(750, { drink: "beer_draft", serving: { unit: "ml", ml: 2001 } }),
  ])("rejects incompatible/ambiguous serving identities %j", async (value) => {
    expect(
      (await call("/api/mobile/prices", body([value]), { cookie: await cookie() })).status,
    ).toBe(400);
  });
  it("keeps 400ml and 568ml draft prices independent", async () => {
    const values = [
      item(600, { drink: "beer_draft", serving: { unit: "ml", ml: 400 } }),
      item(700, { drink: "beer_draft", serving: { unit: "ml", ml: 568 } }),
    ];
    expect(
      (await call("/api/mobile/prices", body(values), { cookie: await cookie() })).status,
    ).toBe(200);
    expect((await read()).rows.map((row) => [row.amount_minor, row.serving.ml])).toEqual([
      [600, 400],
      [700, 568],
    ]);
  });
  it("rejects duplicate batch identities and native-currency outliers", async () => {
    const session = await cookie();
    expect(
      (await call("/api/mobile/prices", body([item(), item()]), { cookie: session })).status,
    ).toBe(400);
    expect(
      await (await call("/api/mobile/prices", body([item(99999)]), { cookie: session })).json(),
    ).toEqual({ results: [{ status: "rejected", code: "out_of_range" }] });
  });
  it("binds confirmations to the viewed revision, prevents self/count duplicates, and preserves menu date semantics", async () => {
    expect(await seedMobileMenuPrice(bindings(), seed())).toBe("inserted");
    const initial = await onlyRow();
    expect(initial.observed_on).toBeNull();
    const session = await cookie(),
      ip = nextIp();
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        call("/api/mobile/prices/confirm", confirmBody(initial), { cookie: session, ip }),
      ),
    );
    expect(results.every((response) => response.status === 200)).toBe(true);
    const current = await onlyRow();
    expect(current.confirmations).toBe(1);
    expect(current.observed_on).toBeNull();
    expect(current.confirmed_on).toBe(romeDay());
    expect(current.provenance.source_checked_on).toBe(TODAY);
    const author = await cookie(),
      authorIp = nextIp();
    await call("/api/mobile/prices", body([item(800)]), { cookie: author, ip: authorIp });
    const updated = await onlyRow();
    expect(updated.provenance.kind).toBe("customer");
    expect(updated.provenance.source_url).toBeNull();
    expect(
      (await call("/api/mobile/prices/confirm", confirmBody(initial), { cookie: session })).status,
    ).toBe(409);
    expect(
      await (
        await call("/api/mobile/prices/confirm", confirmBody(updated), {
          cookie: author,
          ip: authorIp,
        })
      ).json(),
    ).toMatchObject({ status: "already", confirmations: 0 });
  });
  it("enforces the shared daily price quota across varying servings", async () => {
    const session = await cookie(),
      ip = nextIp(),
      configured = {
        ...bindings(),
        RATE_LIMITER: { limit: () => Promise.resolve({ success: true }) },
      };
    for (let index = 0; index < 30; index++)
      expect(
        (
          await call("/api/mobile/prices", body([item(750 + index)]), {
            cookie: session,
            ip,
            bindings: configured,
          })
        ).status,
      ).toBe(200);
    expect(
      (
        await call("/api/mobile/prices", body([item(900)]), {
          cookie: session,
          ip,
          bindings: configured,
        })
      ).status,
    ).toBe(429);
  });
  it("four independent price reports fence review rows against updates, confirmations and reads", async () => {
    await call("/api/mobile/prices", body(), { cookie: await cookie() });
    const row = await onlyRow();
    for (let index = 0; index < 4; index++)
      expect(
        (
          await call(
            "/api/mobile/prices/report",
            {
              venue: london.key,
              cell: london.cell,
              reason: "wrong_price",
              price: {
                drink: row.drink,
                hh: row.hh,
                currency: row.currency,
                serving: row.serving,
                revision: row.revision,
              },
            },
            { cookie: await cookie() },
          )
        ).status,
      ).toBe(200);
    expect((await read()).rows).toEqual([]);
    expect(
      await (
        await call("/api/mobile/prices", body([item(800)]), { cookie: await cookie() })
      ).json(),
    ).toEqual({ results: [{ status: "rejected", code: "under_review" }] });
    expect(
      (await call("/api/mobile/prices/confirm", confirmBody(row), { cookie: await cookie() }))
        .status,
    ).toBe(404);
  });
  it("returns exact legacy/hidden keys and cannot shadow legacy Italy through either writer", async () => {
    const snapshot = await read(legacy);
    expect(snapshot.legacy_venues).toEqual([legacy.key]);
    expect(
      (await call("/api/mobile/prices", body([item()], legacy), { cookie: await cookie() })).status,
    ).toBe(409);
    await expect(seedMobileMenuPrice(bindings(), seed(legacy))).rejects.toMatchObject({
      code: "conflict",
    });
    await env.DB.prepare("INSERT INTO venues_hidden(venue_key,cell,name,day) VALUES (?1,?2,?3,?4)")
      .bind(london.key, london.cell, london.name, TODAY)
      .run();
    expect((await read()).hidden).toEqual([london.key]);
    expect((await call("/api/mobile/prices", body(), { cookie: await cookie() })).status).toBe(404);
  });
  it("enforces moderation even when it arrives after request resolution", async () => {
    const key = {
      venue: london.key,
      drink: "spritz",
      hh: 0 as const,
      currency: "GBP" as const,
      serving,
    };
    const statements = customerStatements(env, key, {
      cell: london.cell,
      amount: 750,
      day: romeDay(),
      status: "active",
      revision: crypto.randomUUID(),
      previousRevision: null,
      changedAt: new Date().toISOString(),
    });
    await env.DB.prepare(
      "INSERT INTO mobile_venues_moderation VALUES (?1,'hidden','operator review')",
    )
      .bind(london.key)
      .run();
    const [result] = await env.DB.batch(statements);
    expect(result?.meta.changes).toBe(0);
    expect((await read()).hidden).toEqual([london.key]);
    expect((await read()).rows).toEqual([]);
  });
  it("quarantines by comparable currency/serving and excludes blocked peers", async () => {
    const extra = Array.from({ length: 5 }, (_, index) => ({
      ...london,
      key: `n${String(920000001 + index)}`,
      lat: 51.5074 + index * 0.0001,
    }));
    const configured = bindings({ ...catalog, venues: [...catalog.venues, ...extra] });
    for (const venue of extra)
      await seedMobileMenuPrice(configured, seed(venue, { amount_minor: 500 }));
    expect(
      await (
        await call("/api/mobile/prices", body([item(1500)]), {
          cookie: await cookie(),
          bindings: configured,
        })
      ).json(),
    ).toEqual({ results: [{ status: "quarantined" }] });
    expect((await onlyRow(london, configured)).status).toBe("quarantined");
  });
  it("does not quarantine against a different beer volume or blocked peer", async () => {
    const extra = Array.from({ length: 5 }, (_, index) => ({
      ...london,
      key: `n${String(930000001 + index)}`,
      lat: 51.5074 + index * 0.0001,
    }));
    const configured = bindings({ ...catalog, venues: [...catalog.venues, ...extra] });
    for (const venue of extra)
      await seedMobileMenuPrice(
        configured,
        seed(venue, { drink: "beer_draft", serving: { unit: "ml", ml: 400 }, amount_minor: 500 }),
      );
    expect(
      await (
        await call(
          "/api/mobile/prices",
          body([item(2000, { drink: "beer_draft", serving: { unit: "ml", ml: 568 } })]),
          { cookie: await cookie(), bindings: configured },
        )
      ).json(),
    ).toEqual({ results: [{ status: "active" }] });
    await env.DB.prepare("INSERT INTO mobile_venues_moderation VALUES (?1,'hidden','operator')")
      .bind(extra[0]?.key)
      .run();
    expect(
      await (
        await call(
          "/api/mobile/prices",
          body([item(2000, { drink: "beer_draft", serving: { unit: "ml", ml: 400 } })]),
          { cookie: await cookie(), bindings: configured },
        )
      ).json(),
    ).toEqual({ results: [{ status: "active" }] });
  });
  it("does not double count reports from new sessions on the same network", async () => {
    await call("/api/mobile/prices", body(), { cookie: await cookie() });
    const row = await onlyRow();
    const ip = nextIp();
    const payload = {
      venue: london.key,
      cell: london.cell,
      reason: "wrong_price",
      price: {
        drink: row.drink,
        hh: row.hh,
        currency: row.currency,
        serving: row.serving,
        revision: row.revision,
      },
    };
    expect(
      await (
        await call("/api/mobile/prices/report", payload, { cookie: await cookie(), ip })
      ).json(),
    ).toEqual({ status: "reported" });
    expect(
      await (
        await call("/api/mobile/prices/report", payload, { cookie: await cookie(), ip })
      ).json(),
    ).toEqual({ status: "already" });
    expect((await onlyRow()).status).toBe("active");
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM mobile_price_reports").first("n")).toBe(
      1,
    );
  });
  it("cannot overwrite a competing revision or create phantom history", async () => {
    await call("/api/mobile/prices", body(), { cookie: await cookie() });
    const original = await onlyRow();
    const key = {
      venue: london.key,
      drink: "spritz",
      hh: 0 as const,
      currency: "GBP" as const,
      serving,
    };
    const pending = customerStatements(env, key, {
      cell: london.cell,
      amount: 850,
      day: romeDay(),
      status: "active",
      revision: crypto.randomUUID(),
      previousRevision: original.revision,
      changedAt: new Date().toISOString(),
    });
    await call("/api/mobile/prices", body([item(800)]), { cookie: await cookie() });
    const [result] = await env.DB.batch(pending);
    expect(result?.meta.changes).toBe(0);
    expect((await onlyRow()).amount_minor).toBe(800);
    expect(
      await env.DB.prepare("SELECT COUNT(*) AS n FROM mobile_price_obs WHERE venue_key=?1")
        .bind(london.key)
        .first("n"),
    ).toBe(2);
  });
  it("a confirmation no-op rechecks revision and moderation before acknowledging", async () => {
    await call("/api/mobile/prices", body(), { cookie: await cookie() });
    const initial = await onlyRow();
    const key = {
      venue: london.key,
      drink: "spritz",
      hh: 0 as const,
      currency: "GBP" as const,
      serving,
    };
    await call("/api/mobile/prices", body([item(800)]), { cookie: await cookie() });
    await expect(
      checkedConfirmationNoop(bindings(), key, london.cell, initial.revision),
    ).rejects.toMatchObject({ code: "conflict" });
    const fresh = await onlyRow();
    await env.DB.prepare("INSERT INTO mobile_venues_moderation VALUES (?1,'hidden','operator')")
      .bind(london.key)
      .run();
    await expect(
      checkedConfirmationNoop(bindings(), key, london.cell, fresh.revision),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("trusted source seeding and catalog fail-closed boundary", () => {
  it("seeds an immutable provenance snapshot idempotently with zero invented observations/confirmations", async () => {
    expect(await seedMobileMenuPrice(bindings(), seed())).toBe("inserted");
    const row = await onlyRow();
    expect(row).toMatchObject({
      observed_on: null,
      confirmed_on: null,
      confirmations: 0,
      provenance: {
        kind: "online_menu",
        source_url: "https://official.example/menu",
        source_sha256: "b".repeat(64),
        source_checked_on: TODAY,
        menu_item: "Aperol Spritz",
      },
    });
    expect(await seedMobileMenuPrice(bindings(), seed())).toBe("skipped");
    expect(
      await env.DB.prepare("SELECT COUNT(*) AS n FROM mobile_price_obs WHERE venue_key=?1")
        .bind(london.key)
        .first("n"),
    ).toBe(1);
    await expect(
      env.DB.prepare("UPDATE mobile_menu_sources SET menu_item='tampered'").run(),
    ).rejects.toThrow();
    await expect(env.DB.prepare("DELETE FROM mobile_menu_sources").run()).rejects.toThrow();
  });
  it("never overwrites customer history, existing legacy rows, reports or source-version mismatches", async () => {
    await call("/api/mobile/prices", body(), { cookie: await cookie() });
    expect(await seedMobileMenuPrice(bindings(), seed({ ...london }, { amount_minor: 800 }))).toBe(
      "skipped",
    );
    await expect(
      seedMobileMenuPrice(bindings(), seed(paris, { catalog_version: "wrong-version" })),
    ).rejects.toMatchObject({ code: "bad_request" });
    await env.DB.prepare(
      "INSERT INTO mobile_price_reports(venue_key,target,revision,reason,day) VALUES (?1,?1,NULL,'closed',?2)",
    )
      .bind(paris.key, TODAY)
      .run();
    expect(await seedMobileMenuPrice(bindings(), seed(paris))).toBe("skipped");
    expect((await onlyRow()).amount_minor).toBe(750);
  });
  it("source insert never wins over an accepted customer write in a concurrent race", async () => {
    const session = await cookie();
    const [, response] = await Promise.all([
      seedMobileMenuPrice(bindings(), seed(london, { amount_minor: 700 })),
      call("/api/mobile/prices", body([item(800)]), { cookie: session }),
    ]);
    const result = await response.json<{ results: { status: string }[] }>();
    const row = await onlyRow();
    if (result.results[0]?.status === "active") {
      expect(row.amount_minor).toBe(800);
      expect(row.provenance.kind).toBe("customer");
    } else {
      expect(result.results[0]?.status).toBe("rejected");
      expect(row.amount_minor).toBe(700);
    }
  });
  it("source seeding cannot refill deleted current rows over retained customer history", async () => {
    await call("/api/mobile/prices", body(), { cookie: await cookie() });
    await env.DB.prepare("DELETE FROM mobile_prices_current WHERE venue_key=?1")
      .bind(london.key)
      .run();
    expect(await seedMobileMenuPrice(bindings(), seed())).toBe("skipped");
    expect((await read()).rows).toEqual([]);
  });
  it.each([
    { ...catalog, schema_version: 2 },
    { ...catalog, version: "bad/version" },
    { ...catalog, venues: [{ ...london, currency: "EUR" }] },
    { ...catalog, venues: [{ ...london, cell: "u09tv" }] },
    { ...catalog, venues: [{ ...london, key: "u7" }] },
    { ...catalog, venues: [{ ...london, google: { ...london.google, review_count: -1 } }] },
    { ...catalog, venues: [{ ...london, google: { ...london.google, review_count: 100.5 } }] },
    { ...catalog, venues: [{ ...london, google: { ...london.google, review_count: "100" } }] },
    { ...catalog, venues: [{ ...london, google: { ...london.google, review_count: true } }] },
    {
      ...catalog,
      venues: [{ ...london, google: { ...london.google, review_count: 100_000_001 } }],
    },
    {
      ...catalog,
      venues: [
        { ...london, google: { ...london.google, url: "https://official.example/reviews" } },
      ],
    },
    { ...catalog, venues: [london, london] },
    { ...catalog, venues: [{ ...london, name: "x".repeat(121) }] },
    { ...catalog, venues: [{ ...london, name: "Control\nName" }] },
    { ...catalog, venues: [{ ...london, name: "Control\u0085Name" }] },
    { ...catalog, venues: [{ ...london, name: "Bad\ud800Name" }] },
    { ...catalog, venues: [{ ...london, kind: 0 }] },
    { ...catalog, venues: [{ ...london, lat: 40.4168, lon: -3.7038, cell: "ezjmg" }] },
    { ...catalog, venues: [{ ...london, google: { ...london.google, url: "not a URL" } }] },
  ])("fails closed for malformed/unverified catalogue %j", async (value) => {
    const response = await call(`/api/mobile/prices/cells/${london.cell}`, undefined, {
      bindings: bindings(value),
    });
    expect(response.status).toBe(503);
  });
  it.each([0, 12, 100, 101, null, undefined])(
    "accepts verified venue with %j visible Google reviews",
    async (count) => {
      const google = {
        url: london.google.url,
        checked_on: TODAY,
        ...(count === undefined ? {} : { review_count: count }),
      };
      const response = await call(`/api/mobile/prices/cells/${london.cell}`, undefined, {
        bindings: bindings({ ...catalog, venues: [{ ...london, google }] }),
      });
      expect(response.status, await response.clone().text()).toBe(200);
    },
  );
  it("rejects HTML fallback, oversized bodies and future source dates", async () => {
    const configured = bindings();
    for (const response of [
      new Response("<html>fallback</html>", { headers: { "Content-Type": "text/html" } }),
      new Response(" ".repeat(2 * 1024 * 1024 + 1), {
        headers: { "Content-Type": "application/json" },
      }),
    ]) {
      const bad = {
        ...configured,
        ASSETS: { fetch: () => Promise.resolve(response.clone()) } as unknown as Env["ASSETS"],
      };
      expect(
        (await call(`/api/mobile/prices/cells/${london.cell}`, undefined, { bindings: bad }))
          .status,
      ).toBe(503);
    }
    await expect(
      seedMobileMenuPrice(configured, seed(london, { source_checked_on: "2999-01-01" })),
    ).rejects.toMatchObject({ code: "bad_request" });
  });
  it("Italian legacy asset failure is not proof that a venue is new", async () => {
    for (const legacyResponse of [
      new Response("<html>fallback</html>", { headers: { "Content-Type": "text/html" } }),
      Response.json({ c: [], v: "malformed" }),
    ]) {
      const configured = {
        ...bindings(),
        ASSETS: {
          fetch: (input: RequestInfo | URL) => {
            const request = new Request(input);
            return Promise.resolve(
              new URL(request.url).pathname === "/mobile-data/catalog.json"
                ? Response.json(catalog)
                : legacyResponse.clone(),
            );
          },
        } as unknown as Env["ASSETS"],
      };
      expect(
        (await call(`/api/mobile/prices/cells/${legacy.cell}`, undefined, { bindings: configured }))
          .status,
      ).toBe(503);
      expect(
        (
          await call("/api/mobile/prices", body([item()], legacy), {
            cookie: await cookie(),
            bindings: configured,
          })
        ).status,
      ).toBe(503);
    }
  });
  it("never aliases source/customer foreign keys or currency/serving amounts", async () => {
    await seedMobileMenuPrice(bindings(), seed());
    await expect(
      env.DB.prepare("UPDATE mobile_prices_current SET amount_minor=1 WHERE venue_key=?1")
        .bind(london.key)
        .run(),
    ).rejects.toThrow();
    expect(servingKey({ unit: "ml", ml: 568 })).not.toBe(servingKey({ unit: "ml", ml: 400 }));
    expect(encodeGeohash(london.lat, london.lon, 5)).toBe(london.cell);
  });
});
