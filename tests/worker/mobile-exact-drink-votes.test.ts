import { env } from "cloudflare:workers";
import { createExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { encodeGeohash } from "../../src/shared/geohash";
import type {
  ExactDrinkAreaVotes,
  ExactDrinkTarget,
  ExactDrinkVenueVotes,
  ExactDrinkVote,
} from "../../src/shared/mobile-exact-drink-votes";
import worker from "../../src/worker/index";

const ORIGIN = "https://dovebevo.example";
const ITALY = { key: "n2420779240", cell: "u0nd9" };
const LONDON = { key: "n910000001", cell: "gcpvj" };
const TODAY = new Date().toISOString().slice(0, 10);
const EUROPE_CATALOG = {
  schema_version: 1,
  version: "test-exact-europe-v1",
  venues: [
    {
      ...LONDON,
      name: "Fixture European Bar",
      kind: 1,
      lat: 51.5074,
      lon: -0.1278,
      city: "London",
      country: "GB",
      currency: "GBP",
      google: {
        url: "https://www.google.com/maps/place/Fixture",
        review_count: 101,
        checked_on: TODAY,
      },
    },
  ],
};
const VOTER = "719576dd-2184-49e9-831d-bc2de0c5f542";
let address = 0;
const target = (drink = "spritz", band: "normal" | "happy_hour" = "normal") =>
  ({ kind: "legacy", drink, band }) as const;
const path = (venue: { key: string; cell: string }) =>
  `/api/mobile/v2/drink-votes/venues/${venue.key}?cell=${venue.cell}`;
const area = (cells = ITALY.cell, suffix = "") =>
  `/api/mobile/v2/drink-votes/area?cells=${cells}${suffix}`;
function europeanEnv(catalog: typeof EUROPE_CATALOG = EUROPE_CATALOG): Env {
  return {
    ...env,
    ASSETS: {
      fetch: async (input: RequestInfo | URL) => {
        const request = new Request(input);
        if (new URL(request.url).pathname === "/mobile-data/catalog.json")
          return Response.json(catalog);
        return env.ASSETS.fetch(request);
      },
    } as unknown as Env["ASSETS"],
  };
}
const europeTarget = (ml: number) =>
  ({
    kind: "europe",
    drink: "beer_draft",
    band: "normal",
    currency: "GBP",
    serving: { unit: "ml", ml },
  }) as const;
async function europePrice(
  ml: number,
  status = "active",
  venue = LONDON,
  currency: "EUR" | "GBP" = "GBP",
) {
  await env.DB.prepare(
    "INSERT INTO mobile_prices_current (venue_key,drink,hh,currency,serving_key,cell," +
      " amount_minor,observed_on,confirmed_on,confirmations,status,source_kind,source_id," +
      " revision,changed_at) VALUES (?1,'beer_draft',0,?2,?3,?4,?5,?6,NULL,0,?7," +
      " 'customer',NULL,?8,?9)",
  )
    .bind(
      venue.key,
      currency,
      `ml:${String(ml)}`,
      venue.cell,
      ml === 500 ? 650 : 400,
      TODAY,
      status,
      crypto.randomUUID(),
      `${TODAY}T00:00:00Z`,
    )
    .run();
}

async function request(
  route: string,
  body?: { target: ExactDrinkTarget; recommended: boolean },
  voter: string | null = VOTER,
  method = body ? "POST" : "GET",
  bindings: Env = env,
) {
  return worker.fetch(
    new Request(ORIGIN + route, {
      method,
      headers: {
        Origin: ORIGIN,
        "Content-Type": "application/json",
        "CF-Connecting-IP": `198.18.3.${String(++address % 250)}`,
        ...(voter ? { "X-DoveBevo-Voter": voter } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
    bindings,
    createExecutionContext(),
  );
}
async function json<T>(response: Response): Promise<T> {
  expect(response.status, await response.clone().text()).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  return response.json<T>();
}
async function price(drink = "spritz", hh = 0) {
  await env.DB.prepare(
    "INSERT INTO prices_current (venue_key,drink,hh,cell,city,price_cents,observed_on," +
      " confirmations,status,source) VALUES (?1,?2,?3,?4,1,650,'2026-11-04',0,'active','manual')",
  )
    .bind(ITALY.key, drink, hh, ITALY.cell)
    .run();
}
async function londonOffer(id = "fixture-offer") {
  const sourceId = `fixture-source-${id}`;
  await env.DB.prepare(
    "INSERT INTO mobile_menu_v2_venues" +
      " (venue_key,cell,name,kind,lat,lon,address,city,country,identity_kind,identity_url,identity_checked_on)" +
      " VALUES (?1,?2,'Fixture London Bar',1,51.5074,-0.1278,NULL,'London','GB','osm',?3,'2026-11-04')",
  )
    .bind(LONDON.key, LONDON.cell, "https://www.openstreetmap.org/node/910000001")
    .run();
  await env.DB.prepare(
    "INSERT INTO mobile_menu_v2_sources (id,venue_key,cell,source_url,source_text_sha256," +
      " source_checked_on,use_review_status,use_review_basis,use_review_reference,use_reviewed_on)" +
      " VALUES (?4,?1,?2,'https://official.example/menu',?3,'2026-11-04'," +
      " 'approved','Reviewed fixture','https://official.example/review','2026-11-04')",
  )
    .bind(LONDON.key, LONDON.cell, "a".repeat(64), sourceId)
    .run();
  await env.DB.prepare(
    "INSERT INTO mobile_menu_v2_offers (id,venue_key,cell,name,category,serving_label," +
      " serving_ml,amount_minor,currency,currency_exponent,price_context,condition_text,status,source_id)" +
      " VALUES (?1,?2,?3,'House special',NULL,'one glass',NULL,850,'GBP',2,'regular',NULL,'active',?4)",
  )
    .bind(id, LONDON.key, LONDON.cell, sourceId)
    .run();
  return id;
}
async function customerDrink(itemKey: string) {
  await env.DB.prepare(
    "INSERT INTO mobile_menu_v2_customer_entries" +
      " (id,venue_key,cell,item_key,item_kind,offer_id,name,category,serving_label,serving_ml," +
      " amount_minor,currency,currency_exponent,observed_on,status,previous_revision,changed_at)" +
      " VALUES (?1,?2,?3,?4,'new_drink',NULL,'House lager',NULL,'one pint',NULL," +
      " 650,'GBP',2,'2026-11-04','active',NULL,'2026-11-04T00:00:00Z')",
  )
    .bind(crypto.randomUUID(), LONDON.key, LONDON.cell, itemKey)
    .run();
}

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM mobile_europe_drink_votes"),
    env.DB.prepare("DELETE FROM mobile_exact_drink_votes"),
    env.DB.prepare("DELETE FROM mobile_prices_current"),
    env.DB.prepare("DELETE FROM mobile_menu_v2_customer_reports"),
    env.DB.prepare("DELETE FROM mobile_menu_v2_customer_decisions"),
    env.DB.prepare("DELETE FROM mobile_menu_v2_customer_entries"),
    env.DB.prepare("DELETE FROM mobile_menu_v2_offers"),
    env.DB.prepare("DELETE FROM mobile_menu_v2_venues"),
    env.DB.prepare("DELETE FROM venues_hidden"),
    env.DB.prepare("DELETE FROM mobile_venues_moderation"),
    env.DB.prepare("DELETE FROM prices_current"),
    env.DB.prepare("DELETE FROM counters"),
  ]);
});

describe("apps-only exact drink recommendation counts", () => {
  it("toggles a real legacy drink exactly and only stores a pair-scoped HMAC", async () => {
    await price();
    const empty = await json<ExactDrinkVenueVotes>(await request(path(ITALY), undefined, null));
    expect(empty.items).toEqual([]);
    const vote = { target: target(), recommended: true };
    const first = await json<ExactDrinkVote>(await request(path(ITALY), vote));
    expect(first).toEqual({ target: vote.target, count: 1, recommended: true });
    expect(await json<ExactDrinkVote>(await request(path(ITALY), vote))).toEqual(first);
    const publicSnapshot = await json<ExactDrinkVenueVotes>(
      await request(path(ITALY), undefined, null),
    );
    expect(publicSnapshot.items).toEqual([{ target: vote.target, count: 1, recommended: false }]);
    const ownSnapshot = await json<ExactDrinkVenueVotes>(await request(path(ITALY)));
    expect(ownSnapshot.items).toEqual([{ target: vote.target, count: 1, recommended: true }]);
    const persisted = await env.DB.prepare("SELECT claim FROM mobile_exact_drink_votes").first<{
      claim: string;
    }>();
    expect(persisted?.claim).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.stringify(persisted)).not.toContain(VOTER);
    expect(
      await json<ExactDrinkVote>(await request(path(ITALY), { ...vote, recommended: false })),
    ).toEqual({ target: vote.target, count: 0, recommended: false });
    expect(
      await json<ExactDrinkVote>(await request(path(ITALY), { ...vote, recommended: false })),
    ).toEqual({ target: vote.target, count: 0, recommended: false });
  });

  it("keeps votes distinct when a venue's verified cell changes", async () => {
    await londonOffer("cell-shift-offer");
    await env.DB.prepare(
      "INSERT INTO prices_current (venue_key,drink,hh,cell,city,price_cents,observed_on," +
        " confirmations,status,source) VALUES (?1,'spritz',0,?2,1,650,'2026-11-04',0,'active','manual')",
    )
      .bind(LONDON.key, LONDON.cell)
      .run();
    const vote = { target: target(), recommended: true };
    expect(await json<ExactDrinkVote>(await request(path(LONDON), vote))).toEqual({
      target: vote.target,
      count: 1,
      recommended: true,
    });

    const movedLatitude = 51.6;
    const moved = {
      key: LONDON.key,
      cell: encodeGeohash(movedLatitude, -0.1278, 5),
    };
    expect(moved.cell).not.toBe(LONDON.cell);
    await env.DB.prepare("UPDATE mobile_menu_v2_venues SET cell=?1,lat=?2 WHERE venue_key=?3")
      .bind(moved.cell, movedLatitude, LONDON.key)
      .run();
    await env.DB.prepare("UPDATE prices_current SET cell=?1 WHERE venue_key=?2 AND drink='spritz'")
      .bind(moved.cell, LONDON.key)
      .run();

    expect(await json<ExactDrinkVote>(await request(path(moved), vote))).toEqual({
      target: vote.target,
      count: 1,
      recommended: true,
    });
    const claims = await env.DB.prepare(
      "SELECT cell,claim FROM mobile_exact_drink_votes WHERE venue_key=?1 ORDER BY cell",
    )
      .bind(LONDON.key)
      .all<{ cell: string; claim: string }>();
    expect(claims.results).toHaveLength(2);
    expect(claims.results.map((row) => row.cell).sort()).toEqual([LONDON.cell, moved.cell].sort());
    expect(claims.results[0]?.claim).not.toBe(claims.results[1]?.claim);
  });

  it("requires a live row, exact cell, valid identity and valid installation before public writes", async () => {
    await price();
    const vote = { target: target(), recommended: true };
    for (const [route, body, voter] of [
      [path(ITALY).replace(ITALY.cell, "u0nd8"), vote, VOTER],
      [path(ITALY), { target: target("beer_draft"), recommended: true }, VOTER],
      [path(ITALY), vote, null],
      [
        path(ITALY),
        { target: { kind: "customer", id: "o" + "a".repeat(64) }, recommended: true },
        VOTER,
      ],
    ] as const) {
      expect(
        (await request(route, body as { target: ExactDrinkTarget; recommended: boolean }, voter))
          .status,
      ).toBeGreaterThanOrEqual(400);
    }
    expect(
      await env.DB.prepare("SELECT COUNT(*) AS n FROM mobile_exact_drink_votes").first("n"),
    ).toBe(0);
  });

  it("counts exact source-backed offers including category-null and real customer-only drinks", async () => {
    const offer = await londonOffer();
    const itemKey = "c" + "d".repeat(64);
    await customerDrink(itemKey);
    const offerTarget = { kind: "offer", id: offer } as const;
    const customerTarget = { kind: "customer", id: itemKey } as const;
    const empty = await json<ExactDrinkVenueVotes>(await request(path(LONDON), undefined, null));
    expect(empty.items).toEqual([]);
    await json<ExactDrinkVote>(
      await request(path(LONDON), { target: offerTarget, recommended: true }),
    );
    await json<ExactDrinkVote>(
      await request(path(LONDON), { target: customerTarget, recommended: true }),
    );
    const counts = await json<ExactDrinkVenueVotes>(await request(path(LONDON)));
    expect(counts.items).toEqual([
      { target: customerTarget, count: 1, recommended: true },
      { target: offerTarget, count: 1, recommended: true },
    ]);
    const feed = await json<ExactDrinkAreaVotes>(await request(area(LONDON.cell), undefined, null));
    expect(feed.items.map((row) => [row.venue.name, row.drink.name, row.count])).toEqual([
      ["Fixture London Bar", "House lager", 1],
      ["Fixture London Bar", "House special", 1],
    ]);
    expect(feed.items[1]?.drink.category).toBeNull();
    expect(JSON.stringify(feed)).not.toMatch(/amount_minor|currency|source_url|claim/);
  });

  it("stops displaying and accepting votes after an offer or customer drink is removed", async () => {
    const offer = await londonOffer("fixture-removed-offer");
    const itemKey = "c" + "e".repeat(64);
    await customerDrink(itemKey);
    const offerTarget = { kind: "offer", id: offer } as const;
    const customerTarget = { kind: "customer", id: itemKey } as const;
    for (const current of [offerTarget, customerTarget]) {
      await json<ExactDrinkVote>(
        await request(path(LONDON), { target: current, recommended: true }),
      );
    }
    await env.DB.prepare("UPDATE mobile_menu_v2_offers SET status='removed' WHERE id=?1")
      .bind(offer)
      .run();
    await env.DB.prepare(
      "UPDATE mobile_menu_v2_customer_entries SET status='removed',moderated_at='2026-11-04T01:00:00Z' WHERE item_key=?1",
    )
      .bind(itemKey)
      .run();
    const venue = await json<ExactDrinkVenueVotes>(await request(path(LONDON)));
    const feed = await json<ExactDrinkAreaVotes>(await request(area(LONDON.cell), undefined, null));
    expect(venue.items).toEqual([]);
    expect(feed.items).toEqual([]);
    for (const current of [offerTarget, customerTarget]) {
      expect((await request(path(LONDON), { target: current, recommended: true })).status).toBe(
        404,
      );
    }
  });

  it("returns area-ranked positive counts with bounded cursor and hides removed drinks and venues", async () => {
    await price("spritz");
    await price("negroni");
    await json<ExactDrinkVote>(
      await request(path(ITALY), { target: target("spritz"), recommended: true }),
    );
    await json<ExactDrinkVote>(
      await request(
        path(ITALY),
        { target: target("spritz"), recommended: true },
        crypto.randomUUID(),
      ),
    );
    await json<ExactDrinkVote>(
      await request(path(ITALY), { target: target("negroni"), recommended: true }),
    );
    const first = await json<ExactDrinkAreaVotes>(
      await request(area(`${ITALY.cell},${ITALY.cell}`, "&limit=1"), undefined, null),
    );
    expect(first.scope.cells).toEqual([ITALY.cell]);
    expect(first.items).toHaveLength(1);
    expect(first.items[0]?.target).toEqual(target("spritz"));
    expect(first.items[0]?.count).toBe(2);
    expect(first.next_after).toMatch(/^[A-Za-z0-9_-]+$/);
    const cursor = first.next_after;
    if (!cursor) throw new Error("Expected a cursor for the next page");
    expect((await request(area(LONDON.cell, `&limit=1&after=${cursor}`))).status).toBe(400);
    const second = await json<ExactDrinkAreaVotes>(
      await request(area(ITALY.cell, `&limit=1&after=${cursor}`), undefined, null),
    );
    expect(second.items.map((row) => row.target)).toEqual([target("negroni")]);
    expect(second.next_after).toBeNull();
    await env.DB.prepare("UPDATE prices_current SET status='removed' WHERE drink='negroni'").run();
    const afterRemoval = await json<ExactDrinkAreaVotes>(await request(area(), undefined, null));
    expect(afterRemoval.items.map((row) => row.target)).toEqual([target("spritz")]);
    await env.DB.prepare("INSERT INTO venues_hidden VALUES (?1,?2,'hidden','2026-11-04')")
      .bind(ITALY.key, ITALY.cell)
      .run();
    const hidden = await json<ExactDrinkAreaVotes>(await request(area(), undefined, null));
    expect(hidden.items).toEqual([]);
    expect((await request(path(ITALY))).status).toBe(404);
    expect(
      await env.DB.prepare("SELECT COUNT(*) AS n FROM mobile_exact_drink_votes").first("n"),
    ).toBe(3);
  });

  it("rejects malformed area scopes and cursors without exposing vote state", async () => {
    for (const route of [
      area("invalid"),
      area(ITALY.cell, "&unknown=x"),
      area(ITALY.cell, "&limit=51"),
      area(ITALY.cell, "&limit=01"),
      area(ITALY.cell, "&after=bogus"),
      area(Array(13).fill(ITALY.cell).join(",")),
    ])
      expect((await request(route, undefined, null)).status).toBe(400);
  });

  it("keeps different European servings independent and requires explicit read opt-in", async () => {
    await europePrice(300);
    await europePrice(500);
    const configured = europeanEnv();
    const narrow = europeTarget(300);
    const pint = europeTarget(500);
    for (const current of [narrow, pint]) {
      expect(
        await json<ExactDrinkVote>(
          await request(
            path(LONDON),
            { target: current, recommended: true },
            VOTER,
            "POST",
            configured,
          ),
        ),
      ).toEqual({ target: current, count: 1, recommended: true });
    }
    const stored = await env.DB.prepare(
      "SELECT serving_key,claim FROM mobile_europe_drink_votes ORDER BY serving_key",
    ).all<{ serving_key: string; claim: string }>();
    expect(stored.results.map((row) => row.serving_key)).toEqual(["ml:300", "ml:500"]);
    expect(stored.results[0]?.claim).toMatch(/^[0-9a-f]{32}$/);
    expect(stored.results[0]?.claim).not.toBe(stored.results[1]?.claim);
    expect(JSON.stringify(stored)).not.toContain(VOTER);
    expect(
      await json<ExactDrinkVenueVotes>(
        await request(path(LONDON), undefined, null, "GET", configured),
      ),
    ).toMatchObject({ items: [] });
    expect(
      await json<ExactDrinkAreaVotes>(
        await request(area(LONDON.cell), undefined, null, "GET", configured),
      ),
    ).toMatchObject({ items: [] });
    const venue = await json<ExactDrinkVenueVotes>(
      await request(`${path(LONDON)}&include_europe=1`, undefined, VOTER, "GET", configured),
    );
    expect(venue.items).toEqual([
      { target: narrow, count: 1, recommended: true },
      { target: pint, count: 1, recommended: true },
    ]);
    const feed = await json<ExactDrinkAreaVotes>(
      await request(area(LONDON.cell, "&include_europe=1"), undefined, null, "GET", configured),
    );
    expect(feed.items.map((row) => [row.target, row.drink.serving_label, row.count])).toEqual([
      [narrow, "300 ml", 1],
      [pint, "500 ml", 1],
    ]);
    expect(JSON.stringify(feed)).not.toMatch(/amount_minor|source_url|claim/);
    const first = await json<ExactDrinkAreaVotes>(
      await request(
        area(LONDON.cell, "&include_europe=1&limit=1"),
        undefined,
        null,
        "GET",
        configured,
      ),
    );
    expect(first.next_after).toMatch(/^[A-Za-z0-9_-]+$/);
    if (!first.next_after) throw new Error("Expected a cursor for the next European serving");
    expect(
      (
        await request(
          area(LONDON.cell, `&limit=1&after=${first.next_after}`),
          undefined,
          null,
          "GET",
          configured,
        )
      ).status,
    ).toBe(400);
    const second = await json<ExactDrinkAreaVotes>(
      await request(
        area(LONDON.cell, `&include_europe=1&limit=1&after=${first.next_after}`),
        undefined,
        null,
        "GET",
        configured,
      ),
    );
    expect(second.items).toHaveLength(1);
    expect(second.next_after).toBeNull();
  });

  it("shows European votes beside menu-v2 drinks when both catalogues share a venue", async () => {
    await londonOffer("overlap-offer");
    await europePrice(500);
    const configured = europeanEnv();
    const vote = { target: europeTarget(500), recommended: true };
    await json<ExactDrinkVote>(await request(path(LONDON), vote, VOTER, "POST", configured));
    const oldClient = await json<ExactDrinkVenueVotes>(
      await request(path(LONDON), undefined, VOTER, "GET", configured),
    );
    expect(oldClient.venue.name).toBe("Fixture London Bar");
    expect(oldClient.items).toEqual([]);
    const optIn = await json<ExactDrinkVenueVotes>(
      await request(`${path(LONDON)}&include_europe=1`, undefined, VOTER, "GET", configured),
    );
    expect(optIn.venue).toEqual(oldClient.venue);
    expect(optIn.items).toEqual([{ target: vote.target, count: 1, recommended: true }]);
    const feed = await json<ExactDrinkAreaVotes>(
      await request(area(LONDON.cell, "&include_europe=1"), undefined, null, "GET", configured),
    );
    expect(feed.items.map((item) => item.target)).toEqual([vote.target]);
  });

  it("skips a stale European vote after its venue becomes a static Italian venue", async () => {
    await europePrice(500);
    await europePrice(300, "active", ITALY, "EUR");
    await env.DB.prepare(
      "INSERT INTO mobile_europe_drink_votes" +
        " (venue_key,cell,drink,hh,currency,serving_key,claim)" +
        " VALUES (?1,?2,'beer_draft',0,'EUR','ml:300',?3)",
    )
      .bind(ITALY.key, ITALY.cell, "a".repeat(32))
      .run();
    const italyCatalog = {
      ...EUROPE_CATALOG,
      venues: [
        ...EUROPE_CATALOG.venues,
        {
          ...ITALY,
          name: "Former Mobile Bar",
          kind: 1,
          lat: 45.46353,
          lon: 9.18979,
          city: "Milano",
          country: "IT",
          currency: "EUR",
          google: {
            url: "https://www.google.com/maps/place/FixtureItalia",
            review_count: 101,
            checked_on: TODAY,
          },
        },
      ],
    };
    const configured = europeanEnv(italyCatalog);
    await json<ExactDrinkVote>(
      await request(
        path(LONDON),
        { target: europeTarget(500), recommended: true },
        VOTER,
        "POST",
        configured,
      ),
    );
    const feed = await json<ExactDrinkAreaVotes>(
      await request(
        area(`${LONDON.cell},${ITALY.cell}`, "&include_europe=1"),
        undefined,
        null,
        "GET",
        configured,
      ),
    );
    expect(feed.items.map((item) => item.venue.key)).toEqual([LONDON.key]);
    const oldClient = await json<ExactDrinkVenueVotes>(
      await request(path(ITALY), undefined, null, "GET", configured),
    );
    expect(oldClient.venue.name).toBe("Bistrot Duomo");
    const current = await json<ExactDrinkVenueVotes>(
      await request(`${path(ITALY)}&include_europe=1`, undefined, null, "GET", configured),
    );
    expect(current.items).toEqual([]);
    expect(
      (
        await request(
          path(ITALY),
          { target: { ...europeTarget(300), currency: "EUR" }, recommended: true },
          VOTER,
          "POST",
          configured,
        )
      ).status,
    ).toBe(404);
    expect(
      await env.DB.prepare("SELECT COUNT(*) AS n FROM mobile_europe_drink_votes").first("n"),
    ).toBe(2);
  });

  it("hides moderated European prices and venues while retaining claims for audit", async () => {
    await europePrice(500);
    const configured = europeanEnv();
    const vote = { target: europeTarget(500), recommended: true };
    await json<ExactDrinkVote>(await request(path(LONDON), vote, VOTER, "POST", configured));
    await env.DB.prepare("UPDATE mobile_prices_current SET status='review' WHERE venue_key=?1")
      .bind(LONDON.key)
      .run();
    expect(
      (
        await json<ExactDrinkVenueVotes>(
          await request(`${path(LONDON)}&include_europe=1`, undefined, null, "GET", configured),
        )
      ).items,
    ).toEqual([]);
    expect(
      (
        await json<ExactDrinkAreaVotes>(
          await request(area(LONDON.cell, "&include_europe=1"), undefined, null, "GET", configured),
        )
      ).items,
    ).toEqual([]);
    expect((await request(path(LONDON), vote, VOTER, "POST", configured)).status).toBe(404);
    await env.DB.prepare("UPDATE mobile_prices_current SET status='active' WHERE venue_key=?1")
      .bind(LONDON.key)
      .run();
    await env.DB.prepare("INSERT INTO mobile_venues_moderation VALUES (?1,'hidden','fixture')")
      .bind(LONDON.key)
      .run();
    expect(
      (await request(`${path(LONDON)}&include_europe=1`, undefined, null, "GET", configured))
        .status,
    ).toBe(404);
    expect(
      (
        await json<ExactDrinkAreaVotes>(
          await request(area(LONDON.cell, "&include_europe=1"), undefined, null, "GET", configured),
        )
      ).items,
    ).toEqual([]);
    expect((await request(path(LONDON), vote, VOTER, "POST", configured)).status).toBe(404);
    expect(
      await env.DB.prepare("SELECT COUNT(*) AS n FROM mobile_europe_drink_votes").first("n"),
    ).toBe(1);
  });

  it("rejects invalid European serving, currency and legacy collisions", async () => {
    await europePrice(500);
    const configured = europeanEnv();
    for (const candidate of [
      { ...europeTarget(500), currency: "EUR" },
      { ...europeTarget(500), serving: { unit: "drink" } },
      { ...europeTarget(500), serving: { unit: "ml", ml: 0 } },
    ]) {
      expect(
        (
          await request(
            path(LONDON),
            { target: candidate as ExactDrinkTarget, recommended: true },
            VOTER,
            "POST",
            configured,
          )
        ).status,
      ).toBeGreaterThanOrEqual(400);
    }
    await env.DB.prepare(
      "INSERT INTO prices_current (venue_key,drink,hh,cell,city,price_cents,observed_on," +
        " confirmations,status,source) VALUES (?1,'spritz',0,?2,1,650,?3,0,'active','manual')",
    )
      .bind(LONDON.key, LONDON.cell, TODAY)
      .run();
    expect(
      (
        await request(
          path(LONDON),
          { target: europeTarget(500), recommended: true },
          VOTER,
          "POST",
          configured,
        )
      ).status,
    ).toBe(404);
    expect(
      await env.DB.prepare("SELECT COUNT(*) AS n FROM mobile_europe_drink_votes").first("n"),
    ).toBe(0);
  });
});
