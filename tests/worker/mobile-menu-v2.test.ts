import { env } from "cloudflare:workers";
import { createExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import worker from "../../src/worker/index";

const ORIGIN = "https://dovebevo.example";
const TODAY = new Date().toISOString().slice(0, 10);
const ITALY = { key: "n2420779240", cell: "u0nd9" }; // Published fixture identity only.
const FOREIGN = { key: "n910000001", cell: "gcpvj" }; // Synthetic test identity, never imported.

interface Detail {
  schema_version: number;
  price_scope: string;
  coverage: { complete: boolean; basis: string };
  venue: { key: string; name: string; country: string };
  stored_offer_count: number;
  next_after: string | null;
  offers: {
    id: string;
    serving: { label: string | null; ml: number | null };
    amount_minor: number;
    currency: string;
    currency_exponent: number;
    source: { url: string; text_sha256: string; checked_on: string };
  }[];
  fees: {
    basis: string;
    amount_minor: number | null;
    currency: string | null;
    currency_exponent: number | null;
    rate_bps: number | null;
    applicability: string;
  }[];
  fee_coverage: { status: string };
}
interface Cell {
  category?: string | null;
  categories?: string[] | null;
  coverage: { complete: boolean };
  venues: {
    key: string;
    matching_offer_count: number;
    sample_offers: {
      id: string;
      category: string | null;
      serving: { label: string | null; ml: number | null };
      amount_minor: number;
      currency: string;
      context: { kind: string; condition: string | null };
      source: { url: string; text_sha256: string; checked_on: string };
    }[];
  }[];
  unresolved_venues: number;
}

async function get(path: string, bindings: Env = env) {
  return worker.fetch(new Request(ORIGIN + path), bindings, createExecutionContext());
}
async function addSource(key: string, cell: string, status: "approved" | "held" = "approved") {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO mobile_menu_v2_sources" +
      " (id,venue_key,cell,source_url,source_text_sha256,source_checked_on," +
      " use_review_status,use_review_basis,use_review_reference,use_reviewed_on)" +
      " VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
  )
    .bind(
      id,
      key,
      cell,
      "https://official.example/test-menu",
      "a".repeat(64),
      TODAY,
      status,
      "Synthetic test source review",
      "https://official.example/test-review",
      TODAY,
    )
    .run();
  return id;
}
function addOffer(
  id: string,
  key: string,
  cell: string,
  sourceId: string,
  extra: {
    name?: string;
    category?: string | null;
    servingLabel?: string | null;
    ml?: number | null;
    amount?: number;
    currency?: string;
    exponent?: number;
    status?: string;
  } = {},
) {
  return env.DB.prepare(
    "INSERT INTO mobile_menu_v2_offers" +
      " (id,venue_key,cell,name,category,serving_label,serving_ml,amount_minor,currency," +
      " currency_exponent,price_context,condition_text,status,source_id)" +
      " VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,'regular',NULL,?11,?12)",
  ).bind(
    id,
    key,
    cell,
    extra.name ?? "Fixture beer",
    extra.category ?? "beer_draft",
    extra.servingLabel ?? null,
    extra.ml ?? null,
    extra.amount ?? 530,
    extra.currency ?? "EUR",
    extra.exponent ?? 2,
    extra.status ?? "active",
    sourceId,
  );
}
function addFee(
  id: string,
  key: string,
  cell: string,
  sourceId: string,
  value: {
    kind: "fixed" | "percent";
    basis: string;
    amount?: number | null;
    currency?: string | null;
    exponent?: number | null;
    bps?: number | null;
    applicability?: string;
    condition?: string | null;
    status?: string;
  },
) {
  return env.DB.prepare(
    "INSERT INTO mobile_menu_v2_fees" +
      " (id,venue_key,cell,label,fee_kind,basis,amount_minor,currency,currency_exponent," +
      " rate_bps,applicability,condition_text,status,source_id)" +
      " VALUES (?1,?2,?3,'Fixture service charge',?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)",
  ).bind(
    id,
    key,
    cell,
    value.kind,
    value.basis,
    value.amount ?? null,
    value.currency ?? null,
    value.exponent ?? null,
    value.bps ?? null,
    value.applicability ?? "unknown",
    value.condition ?? null,
    value.status ?? "active",
    sourceId,
  );
}
async function registerForeign() {
  await env.DB.prepare(
    "INSERT INTO mobile_menu_v2_venues" +
      " (venue_key,cell,name,kind,lat,lon,address,city,country,identity_kind,identity_url,identity_checked_on)" +
      " VALUES (?1,?2,'Fixture London Bar',1,51.5074,-0.1278,NULL,'London','GB','osm',?3,?4)",
  )
    .bind(FOREIGN.key, FOREIGN.cell, "https://www.openstreetmap.org/node/910000001", TODAY)
    .run();
}
interface OwnerOptions {
  key?: string;
  fingerprint?: string;
  name?: string;
  lat?: number;
  lon?: number;
  address?: string | null;
  ownerUrl?: string;
  ownerHash?: string | null;
  geoUrl?: string | null;
  geoHash?: string | null;
  geoHashBasis?: string | null;
}
async function ownerRow(options: OwnerOptions = {}): Promise<string> {
  const ownerUrl = options.ownerUrl ?? "https://owner.example/locations/fixture-milano";
  const address = options.address === undefined ? "Via Esempio 12, Milano" : options.address;
  const normalizedAddress = (address ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLowerCase();
  const payload = "dovebevo-v2-owner-it\n" + ownerUrl + "\n" + normalizedAddress;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  const fingerprint =
    options.fingerprint ??
    Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const key = options.key ?? "m" + fingerprint.slice(0, 24);
  await env.DB.prepare(
    "INSERT INTO mobile_menu_v2_venues" +
      " (venue_key,cell,name,kind,lat,lon,address,city,country,identity_kind," +
      " identity_url,identity_text_sha256,identity_geo_url,identity_geo_text_sha256," +
      " identity_geo_hash_basis,identity_fingerprint,identity_checked_on)" +
      " VALUES (?1,?2,?3,1,?4,?5,?6,'Milano','IT','owner_verified'," +
      " ?7,?8,?9,?10,?11,?12,?13)",
  )
    .bind(
      key,
      ITALY.cell,
      options.name ?? "Fixture New Owner Bar",
      options.lat ?? 45.4464,
      options.lon ?? 9.2284,
      address,
      ownerUrl,
      options.ownerHash === undefined ? "b".repeat(64) : options.ownerHash,
      options.geoUrl === undefined
        ? "https://www.openstreetmap.org/node/999000111"
        : options.geoUrl,
      options.geoHash === undefined ? "c".repeat(64) : options.geoHash,
      options.geoHashBasis === undefined ? "raw_utf8" : options.geoHashBasis,
      fingerprint,
      TODAY,
    )
    .run();
  return key;
}

beforeEach(async () => {
  // Immutable source snapshots intentionally remain; every test uses a new UUID.
  await env.DB.batch([
    env.DB.prepare("DELETE FROM mobile_menu_v2_fee_coverage"),
    env.DB.prepare("DELETE FROM mobile_menu_v2_fees"),
    env.DB.prepare("DELETE FROM mobile_menu_v2_offers"),
    env.DB.prepare("DELETE FROM mobile_menu_v2_venues"),
    env.DB.prepare("DELETE FROM venues_hidden"),
    env.DB.prepare("DELETE FROM mobile_venues_moderation"),
  ]);
});

describe("app-only named menu v2", () => {
  it("keeps separate named drinks, unknown volume, original currency and legacy responses", async () => {
    const sourceId = await addSource(ITALY.key, ITALY.cell);
    await env.DB.batch([
      addOffer("fixture-aperol", ITALY.key, ITALY.cell, sourceId, {
        name: "Fixture Aperol beer",
        servingLabel: "33 cl",
        ml: 330,
        amount: 530,
      }),
      addOffer("fixture-campari", ITALY.key, ITALY.cell, sourceId, {
        name: "Fixture other beer",
        servingLabel: null,
        ml: null,
        amount: 550,
      }),
    ]);
    const response = await get("/api/mobile/v2/menu/venues/" + ITALY.key + "?cell=" + ITALY.cell);
    expect(response.status, await response.clone().text()).toBe(200);
    const body = await response.json<Detail>();
    expect(body).toMatchObject({
      schema_version: 2,
      price_scope: "menu_item_only",
      coverage: { complete: false, basis: "verified_source_items_only" },
      venue: { key: ITALY.key, name: "Bistrot Duomo", country: "IT" },
      stored_offer_count: 2,
      next_after: null,
      fee_coverage: { status: "unknown" },
    });
    expect(body.offers.map((row) => row.id)).toEqual(["fixture-aperol", "fixture-campari"]);
    expect(body.offers[1]?.serving).toEqual({ label: null, ml: null });
    expect(body.offers[0]).toMatchObject({
      amount_minor: 530,
      currency: "EUR",
      currency_exponent: 2,
      source: {
        url: "https://official.example/test-menu",
        text_sha256: "a".repeat(64),
        checked_on: TODAY,
      },
    });
    const cell = await (
      await get("/api/mobile/v2/menu/cells/u0nd9?category=beer_draft")
    ).json<Cell>();
    expect(cell.venues).toHaveLength(1);
    expect(cell.venues[0]).toMatchObject({
      key: ITALY.key,
      matching_offer_count: 2,
      sample_offers: [{ id: "fixture-aperol" }],
    });
    expect(cell.coverage.complete).toBe(false);
    const legacy = await (
      await get("/api/venues/" + ITALY.key + "/prices")
    ).json<{ p: unknown[] }>();
    expect(legacy.p).toEqual([]);
    expect(
      await env.DB.prepare("SELECT COUNT(*) AS n FROM mobile_prices_current WHERE venue_key=?1")
        .bind(ITALY.key)
        .first("n"),
    ).toBe(0);
  });

  it("reads several drink categories in one cell request without changing single-category results", async () => {
    const sourceId = await addSource(ITALY.key, ITALY.cell);
    await env.DB.batch([
      addOffer("multi-beer-high", ITALY.key, ITALY.cell, sourceId, {
        category: "beer_draft",
        amount: 600,
      }),
      addOffer("multi-beer-low", ITALY.key, ITALY.cell, sourceId, {
        category: "beer_draft",
        amount: 450,
      }),
      addOffer("multi-spritz", ITALY.key, ITALY.cell, sourceId, {
        category: "spritz",
        amount: 550,
      }),
      addOffer("multi-wine", ITALY.key, ITALY.cell, sourceId, {
        category: "wine_glass",
        amount: 700,
      }),
    ]);
    const multi = await (
      await get("/api/mobile/v2/menu/cells/" + ITALY.cell + "?categories=beer_draft,spritz")
    ).json<Cell>();
    expect(multi).toMatchObject({
      category: null,
      categories: ["beer_draft", "spritz"],
    });
    expect(multi.venues).toHaveLength(1);
    expect(multi.venues[0]?.matching_offer_count).toBe(3);
    expect(multi.venues[0]?.sample_offers).toMatchObject([
      { id: "multi-beer-low", category: "beer_draft", amount_minor: 450, currency: "EUR" },
      { id: "multi-spritz", category: "spritz", amount_minor: 550, currency: "EUR" },
    ]);
    const single = await (
      await get("/api/mobile/v2/menu/cells/" + ITALY.cell + "?category=beer_draft")
    ).json<Cell>();
    expect(single.venues[0]?.matching_offer_count).toBe(2);
    expect(single.venues[0]?.sample_offers.map((offer) => offer.id)).toEqual(["multi-beer-low"]);
    for (const query of [
      "categories=beer_draft,beer_draft",
      "categories=beer_draft,nope",
      "categories=",
      "category=beer_draft&categories=spritz",
    ]) {
      expect((await get("/api/mobile/v2/menu/cells/" + ITALY.cell + "?" + query)).status).toBe(400);
    }
  });

  it("samples a documented 400 ml draft beer ahead of a cheaper 250 ml beer", async () => {
    const sourceId = await addSource(ITALY.key, ITALY.cell);
    await env.DB.batch([
      addOffer("cheap-small", ITALY.key, ITALY.cell, sourceId, {
        name: "Fixture lager",
        servingLabel: "Piccola 25cl",
        ml: 250,
        amount: 400,
      }),
      addOffer("label-conflicts-with-volume", ITALY.key, ITALY.cell, sourceId, {
        name: "Fixture lager",
        servingLabel: "small",
        ml: 500,
        amount: 300,
      }),
      addOffer("mini-conflicts-with-volume", ITALY.key, ITALY.cell, sourceId, {
        name: "Fixture lager",
        servingLabel: "mini",
        ml: 500,
        amount: 150,
      }),
      addOffer("printed-25cl-conflicts-with-volume", ITALY.key, ITALY.cell, sourceId, {
        name: "Fixture lager",
        servingLabel: "Media 25 cl",
        ml: 500,
        amount: 100,
      }),
      addOffer("printed-70cl-conflicts-with-volume", ITALY.key, ITALY.cell, sourceId, {
        name: "Fixture lager",
        servingLabel: "Media 70cl",
        ml: 500,
        amount: 120,
      }),
      addOffer("printed-two-volumes-conflict", ITALY.key, ITALY.cell, sourceId, {
        name: "Fixture lager",
        servingLabel: "Media 40cl / 50cl",
        ml: 500,
        amount: 130,
      }),
      addOffer("printed-two-volumes-repeat", ITALY.key, ITALY.cell, sourceId, {
        name: "Fixture lager",
        servingLabel: "Media 50cl / 50cl",
        ml: 500,
        amount: 140,
      }),
      addOffer("medium-400ml", ITALY.key, ITALY.cell, sourceId, {
        name: "Fixture lager",
        servingLabel: "Media 40cl",
        ml: 400,
        amount: 600,
      }),
      addOffer("medium-500ml", ITALY.key, ITALY.cell, sourceId, {
        name: "Fixture stout",
        servingLabel: "0,5l",
        ml: 500,
        amount: 200,
      }),
      addOffer("spritz-cheap", ITALY.key, ITALY.cell, sourceId, {
        category: "spritz",
        amount: 450,
      }),
      addOffer("spritz-expensive", ITALY.key, ITALY.cell, sourceId, {
        category: "spritz",
        amount: 700,
      }),
    ]);
    await env.DB.prepare(
      "UPDATE mobile_menu_v2_offers SET price_context='happy_hour' WHERE id='medium-500ml'",
    ).run();
    const response = await get(
      "/api/mobile/v2/menu/cells/" + ITALY.cell + "?categories=beer_draft,spritz",
    );
    expect(response.status, await response.clone().text()).toBe(200);
    const cell = await response.json<Cell>();
    expect(cell.venues[0]?.matching_offer_count).toBe(11);
    expect(cell.venues[0]?.sample_offers).toMatchObject([
      {
        id: "medium-400ml",
        amount_minor: 600,
        currency: "EUR",
        serving: { label: "Media 40cl", ml: 400 },
        context: { kind: "regular", condition: null },
        source: {
          url: "https://official.example/test-menu",
          checked_on: TODAY,
        },
      },
      { id: "spritz-cheap", amount_minor: 450 },
    ]);
    const detail = await (
      await get("/api/mobile/v2/menu/venues/" + ITALY.key + "?cell=" + ITALY.cell)
    ).json<Detail>();
    expect(detail.offers.map((offer) => offer.id)).toEqual(
      expect.arrayContaining(["cheap-small", "medium-400ml"]),
    );
    expect(detail.stored_offer_count).toBe(11);
    await env.DB.batch([
      env.DB.prepare("UPDATE mobile_menu_v2_offers SET status='review' WHERE id='medium-400ml'"),
      env.DB.prepare(
        "UPDATE mobile_menu_v2_offers SET price_context='regular' WHERE id='medium-500ml'",
      ),
    ]);
    const litreLabel = await (
      await get("/api/mobile/v2/menu/cells/" + ITALY.cell + "?category=beer_draft")
    ).json<Cell>();
    expect(litreLabel.venues[0]?.sample_offers[0]).toMatchObject({
      id: "medium-500ml",
      serving: { label: "0,5l", ml: 500 },
    });
  });

  it("recognizes an unambiguous media label when volume is absent", async () => {
    const sourceId = await addSource(ITALY.key, ITALY.cell);
    await env.DB.batch([
      addOffer("piccola", ITALY.key, ITALY.cell, sourceId, {
        servingLabel: "piccola",
        amount: 400,
      }),
      addOffer("ambiguous", ITALY.key, ITALY.cell, sourceId, {
        servingLabel: "piccola/media",
        amount: 300,
      }),
      addOffer("large-ambiguous", ITALY.key, ITALY.cell, sourceId, {
        servingLabel: "media/grande",
        amount: 200,
      }),
      addOffer("pint-ambiguous", ITALY.key, ITALY.cell, sourceId, {
        servingLabel: "media/pinta",
        amount: 150,
      }),
      addOffer("printed-25cl-without-volume", ITALY.key, ITALY.cell, sourceId, {
        servingLabel: "Media 25 cl",
        amount: 100,
      }),
      addOffer("media", ITALY.key, ITALY.cell, sourceId, {
        servingLabel: "media",
        amount: 600,
      }),
      addOffer("medium", ITALY.key, ITALY.cell, sourceId, {
        servingLabel: "Medium",
        amount: 700,
      }),
    ]);
    const cell = await (
      await get("/api/mobile/v2/menu/cells/" + ITALY.cell + "?category=beer_draft")
    ).json<Cell>();
    expect(cell.venues[0]?.sample_offers[0]).toMatchObject({
      id: "media",
      amount_minor: 600,
      serving: { label: "media", ml: null },
    });
    await env.DB.prepare("DELETE FROM mobile_menu_v2_offers WHERE id='media'").run();
    const english = await (
      await get("/api/mobile/v2/menu/cells/" + ITALY.cell + "?category=beer_draft")
    ).json<Cell>();
    expect(english.venues[0]?.sample_offers[0]).toMatchObject({
      id: "medium",
      amount_minor: 700,
      serving: { label: "Medium", ml: null },
    });
  });

  it("recognizes a parenthesized media label without a structured volume", async () => {
    const sourceId = await addSource(ITALY.key, ITALY.cell);
    await env.DB.batch([
      addOffer("small", ITALY.key, ITALY.cell, sourceId, {
        servingLabel: "Piccola 25cl",
        ml: 250,
        amount: 400,
      }),
      addOffer("parenthesized-media", ITALY.key, ITALY.cell, sourceId, {
        servingLabel: "(Media)",
        amount: 600,
      }),
    ]);
    const cell = await (
      await get("/api/mobile/v2/menu/cells/" + ITALY.cell + "?category=beer_draft")
    ).json<Cell>();
    expect(cell.venues[0]?.sample_offers[0]).toMatchObject({
      id: "parenthesized-media",
      serving: { label: "(Media)", ml: null },
      amount_minor: 600,
    });
  });

  it("recognizes matching LT litre labels but rejects contradictory printed LT sizes", async () => {
    const sourceId = await addSource(ITALY.key, ITALY.cell);
    await env.DB.batch([
      addOffer("small-25cl", ITALY.key, ITALY.cell, sourceId, {
        servingLabel: "Piccola 25cl",
        ml: 250,
        amount: 400,
      }),
      addOffer("conflict-025lt", ITALY.key, ITALY.cell, sourceId, {
        servingLabel: "Media 0.25LT",
        ml: 500,
        amount: 100,
      }),
      addOffer("conflict-070lt", ITALY.key, ITALY.cell, sourceId, {
        servingLabel: "Media 0.70LT",
        ml: 500,
        amount: 120,
      }),
      addOffer("matching-040lt", ITALY.key, ITALY.cell, sourceId, {
        servingLabel: "MEDIA (0.40LT)",
        ml: 400,
        amount: 600,
      }),
      addOffer("matching-050lt", ITALY.key, ITALY.cell, sourceId, {
        servingLabel: "MEDIA (0,50LT)",
        ml: 500,
        amount: 700,
      }),
    ]);
    const path = "/api/mobile/v2/menu/cells/" + ITALY.cell + "?category=beer_draft";
    const first = await (await get(path)).json<Cell>();
    expect(first.venues[0]?.sample_offers[0]).toMatchObject({
      id: "matching-040lt",
      amount_minor: 600,
      serving: { label: "MEDIA (0.40LT)", ml: 400 },
    });
    await env.DB.prepare(
      "UPDATE mobile_menu_v2_offers SET status='review' WHERE id='matching-040lt'",
    ).run();
    const second = await (await get(path)).json<Cell>();
    expect(second.venues[0]?.sample_offers[0]).toMatchObject({
      id: "matching-050lt",
      amount_minor: 700,
      serving: { label: "MEDIA (0,50LT)", ml: 500 },
    });
  });

  it("does not invent a medium serving where the menu documents only small and unknown sizes", async () => {
    const sourceId = await addSource(ITALY.key, ITALY.cell);
    await env.DB.batch([
      addOffer("small-only", ITALY.key, ITALY.cell, sourceId, {
        servingLabel: "Piccola 25cl",
        ml: 250,
        amount: 400,
      }),
      addOffer("unknown-size", ITALY.key, ITALY.cell, sourceId, {
        servingLabel: null,
        ml: null,
        amount: 600,
      }),
    ]);
    const cell = await (
      await get("/api/mobile/v2/menu/cells/" + ITALY.cell + "?category=beer_draft")
    ).json<Cell>();
    expect(cell.venues[0]?.sample_offers[0]).toMatchObject({
      id: "small-only",
      amount_minor: 400,
      serving: { label: "Piccola 25cl", ml: 250 },
    });
    expect(cell.venues[0]?.matching_offer_count).toBe(2);
  });

  it("keeps fixed and percentage fees separate and never infers an all-in price", async () => {
    const sourceId = await addSource(ITALY.key, ITALY.cell);
    await addOffer("fee-example-drink", ITALY.key, ITALY.cell, sourceId).run();
    await env.DB.batch([
      addFee("fee-cover", ITALY.key, ITALY.cell, sourceId, {
        kind: "fixed",
        basis: "unspecified",
        amount: 200,
        currency: "EUR",
        exponent: 2,
      }),
      addFee("fee-service", ITALY.key, ITALY.cell, sourceId, {
        kind: "percent",
        basis: "bill",
        bps: 1000,
        applicability: "conditional",
        condition: "Only when the documented condition applies",
      }),
    ]);
    await env.DB.prepare(
      "INSERT INTO mobile_menu_v2_fee_coverage(venue_key,cell,status,source_id)" +
        " VALUES (?1,?2,'documented_partial',?3)",
    )
      .bind(ITALY.key, ITALY.cell, sourceId)
      .run();
    const response = await (
      await get("/api/mobile/v2/menu/venues/" + ITALY.key + "?cell=" + ITALY.cell)
    ).json<Detail>();
    expect(response.offers[0]?.amount_minor).toBe(530);
    expect(response.fees).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          basis: "unspecified",
          amount_minor: 200,
          currency: "EUR",
          currency_exponent: 2,
          rate_bps: null,
          applicability: "unknown",
        }),
        expect.objectContaining({
          basis: "bill",
          amount_minor: null,
          currency: null,
          currency_exponent: null,
          rate_bps: 1000,
          applicability: "conditional",
        }),
      ]),
    );
    expect(response.fee_coverage.status).toBe("documented_partial");
    expect(response).not.toHaveProperty("all_in_total");
    await expect(
      addFee("bad-percent", ITALY.key, ITALY.cell, sourceId, {
        kind: "percent",
        basis: "bill",
        bps: 1000,
        amount: 100,
        currency: "EUR",
      }).run(),
    ).rejects.toThrow();
    await expect(
      addOffer("zero-price", ITALY.key, ITALY.cell, sourceId, {
        amount: 0,
      }).run(),
    ).rejects.toThrow();
  });

  it("refuses to activate held sources and keeps source-use decisions immutable", async () => {
    const sourceId = await addSource(ITALY.key, ITALY.cell, "held");
    await expect(addOffer("held-active", ITALY.key, ITALY.cell, sourceId).run()).rejects.toThrow();
    await addOffer("held-review", ITALY.key, ITALY.cell, sourceId, {
      status: "review",
    }).run();
    await expect(
      env.DB.prepare(
        "UPDATE mobile_menu_v2_offers SET status='active' WHERE id='held-review'",
      ).run(),
    ).rejects.toThrow();
    await expect(
      addFee("held-fee", ITALY.key, ITALY.cell, sourceId, {
        kind: "percent",
        basis: "bill",
        bps: 1000,
      }).run(),
    ).rejects.toThrow();
    await expect(
      env.DB.prepare("INSERT INTO mobile_menu_v2_fee_coverage VALUES (?1,?2,'explicit_no_fee',?3)")
        .bind(ITALY.key, ITALY.cell, sourceId)
        .run(),
    ).rejects.toThrow();
    await expect(
      env.DB.prepare("UPDATE mobile_menu_v2_sources SET use_review_status='approved' WHERE id=?1")
        .bind(sourceId)
        .run(),
    ).rejects.toThrow();
    await expect(
      env.DB.prepare("DELETE FROM mobile_menu_v2_sources WHERE id=?1").bind(sourceId).run(),
    ).rejects.toThrow();
    const detail = await (
      await get("/api/mobile/v2/menu/venues/" + ITALY.key + "?cell=" + ITALY.cell)
    ).json<Detail>();
    expect(detail.offers).toEqual([]);
    expect(detail.fee_coverage.status).toBe("unknown");
    const post = await worker.fetch(
      new Request(ORIGIN + "/api/mobile/v2/menu/venues/" + ITALY.key, {
        method: "POST",
        headers: { Origin: ORIGIN },
      }),
      env,
      createExecutionContext(),
    );
    expect(post.status).toBe(404);
  });

  it("requires vetted venue identity and applies both existing venue blocks", async () => {
    const sourceId = await addSource(FOREIGN.key, FOREIGN.cell);
    await addOffer("foreign-offer", FOREIGN.key, FOREIGN.cell, sourceId, {
      currency: "GBP",
      amount: 750,
    }).run();
    const path = "/api/mobile/v2/menu/venues/" + FOREIGN.key + "?cell=" + FOREIGN.cell;
    expect((await get(path)).status).toBe(404);
    const unresolved = await (await get("/api/mobile/v2/menu/cells/" + FOREIGN.cell)).json<Cell>();
    expect(unresolved.venues).toEqual([]);
    expect(unresolved.unresolved_venues).toBe(1);
    await registerForeign(); // No Google review field or threshold.
    const detail = await (await get(path)).json<Detail>();
    expect(detail.venue).toMatchObject({
      country: "GB",
      name: "Fixture London Bar",
    });
    expect(detail.offers[0]).toMatchObject({
      currency: "GBP",
      amount_minor: 750,
    });
    await env.DB.prepare(
      "INSERT INTO venues_hidden(venue_key,cell,name,day) VALUES (?1,?2,'Fixture London Bar',?3)",
    )
      .bind(FOREIGN.key, FOREIGN.cell, TODAY)
      .run();
    expect((await get(path)).status).toBe(404);
    expect(
      (await (await get("/api/mobile/v2/menu/cells/" + FOREIGN.cell)).json<Cell>()).venues,
    ).toEqual([]);
    await env.DB.prepare("DELETE FROM venues_hidden WHERE venue_key=?1").bind(FOREIGN.key).run();
    await env.DB.prepare(
      "INSERT INTO mobile_venues_moderation(venue_key,status,reason)" +
        " VALUES (?1,'review','fixture moderation')",
    )
      .bind(FOREIGN.key)
      .run();
    expect((await get(path)).status).toBe(404);
  });

  it("retrieves more than 500 named offers without truncation", async () => {
    await registerForeign();
    const sourceId = await addSource(FOREIGN.key, FOREIGN.cell);
    for (let start = 0; start < 501; start += 100) {
      const batch = [];
      for (let index = start; index < Math.min(start + 100, 501); index++) {
        batch.push(
          addOffer("item-" + String(index).padStart(4, "0"), FOREIGN.key, FOREIGN.cell, sourceId, {
            name: "Synthetic drink " + String(index),
            amount: 300 + index,
          }),
        );
      }
      await env.DB.batch(batch);
    }
    const ids: string[] = [];
    let after: string | null = null;
    do {
      const path =
        "/api/mobile/v2/menu/venues/" +
        FOREIGN.key +
        "?cell=" +
        FOREIGN.cell +
        (after ? "&after=" + after : "");
      const response = await get(path);
      expect(response.status, await response.clone().text()).toBe(200);
      const body = await response.json<Detail>();
      expect(body.stored_offer_count).toBe(501);
      ids.push(...body.offers.map((row) => row.id));
      after = body.next_after;
    } while (after);
    expect(ids).toHaveLength(501);
    expect(new Set(ids).size).toBe(501);
    expect(ids[0]).toBe("item-0000");
    expect(ids.at(-1)).toBe("item-0500");
  });
  it("rejects unpageable offer IDs and can continue after every stored boundary ID", async () => {
    await registerForeign();
    const sourceId = await addSource(FOREIGN.key, FOREIGN.cell);
    for (const unsafe of ["A bad", "A/bad", "A?bad", "Aébad"]) {
      await expect(addOffer(unsafe, FOREIGN.key, FOREIGN.cell, sourceId).run()).rejects.toThrow();
    }
    await env.DB.batch([
      addOffer("A.-_:0", FOREIGN.key, FOREIGN.cell, sourceId),
      addOffer("Z-2", FOREIGN.key, FOREIGN.cell, sourceId),
    ]);
    const firstResponse = await get(
      "/api/mobile/v2/menu/venues/" + FOREIGN.key + "?cell=" + FOREIGN.cell + "&limit=1",
    );
    expect(firstResponse.status, await firstResponse.clone().text()).toBe(200);
    const first = await firstResponse.json<Detail>();
    expect(first.offers.map((offer) => offer.id)).toEqual(["A.-_:0"]);
    expect(first.next_after).toBe("A.-_:0");
    const secondResponse = await get(
      "/api/mobile/v2/menu/venues/" +
        FOREIGN.key +
        "?cell=" +
        FOREIGN.cell +
        "&limit=1&after=" +
        encodeURIComponent(first.next_after ?? ""),
    );
    expect(secondResponse.status, await secondResponse.clone().text()).toBe(200);
    const second = await secondResponse.json<Detail>();
    expect(second.offers.map((offer) => offer.id)).toEqual(["Z-2"]);
    expect(second.next_after).toBeNull();
  });

  it("shows an owner-verified Italian branch absent the static map, then hides a duplicate proposal", async () => {
    const key = await ownerRow();
    const sourceId = await addSource(key, ITALY.cell);
    await addOffer("owner-fixture-drink", key, ITALY.cell, sourceId).run();
    const path = "/api/mobile/v2/menu/venues/" + key + "?cell=" + ITALY.cell;
    const detailResponse = await get(path);
    expect(detailResponse.status, await detailResponse.clone().text()).toBe(200);
    const detail = await detailResponse.json<Detail>();
    expect(detail.venue).toMatchObject({
      key,
      country: "IT",
      identity_kind: "owner_verified",
      address: "Via Esempio 12, Milano",
    });
    expect(detail.offers).toHaveLength(1);
    const cell = await (
      await get("/api/mobile/v2/menu/cells/" + ITALY.cell + "?category=beer_draft")
    ).json<Cell>();
    expect(cell.venues.map((venue) => venue.key)).toEqual([key]);
    await env.DB.prepare(
      "INSERT INTO venues_user(name,kind,lat,lon,cell,status,confirmations,day)" +
        " VALUES ('Fixture New Owner Bar',1,45.4464,9.2284,?1,'pending',1,?2)",
    )
      .bind(ITALY.cell, TODAY)
      .run();
    expect((await get(path)).status).toBe(404);
    const blockedCell = await (await get("/api/mobile/v2/menu/cells/" + ITALY.cell)).json<Cell>();
    expect(blockedCell.venues).toEqual([]);
    expect(blockedCell.unresolved_venues).toBe(1);
  });

  it("suppresses a same-name user proposal across a geohash boundary", async () => {
    const key = await ownerRow({
      ownerUrl: "https://owner.example/locations/edge-fixture",
      name: "Fixture Edge Bar",
      lat: 45.4464,
      lon: 9.2284,
    });
    const sourceId = await addSource(key, ITALY.cell);
    await addOffer("edge-fixture-drink", key, ITALY.cell, sourceId).run();
    const path = "/api/mobile/v2/menu/venues/" + key + "?cell=" + ITALY.cell;
    expect((await get(path)).status).toBe(200);
    await env.DB.prepare(
      "INSERT INTO venues_user(name,kind,lat,lon,cell,status,confirmations,day)" +
        " VALUES ('Fixture Edge Bar',1,45.4464,9.2286,'u0ndd','pending',1,?1)",
    )
      .bind(TODAY)
      .run();
    // The neighbour is only about 16 metres away, although its geohash differs.
    expect((await get(path)).status).toBe(404);
    const list = await (await get("/api/mobile/v2/menu/cells/" + ITALY.cell)).json<Cell>();
    expect(list.venues).toEqual([]);
    expect(list.unresolved_venues).toBe(1);
  });

  it("rejects mismatched owner identity and suppresses an existing static OSM duplicate", async () => {
    await expect(ownerRow({ key: "m" + "0".repeat(24) })).rejects.toThrow();
    await expect(ownerRow({ address: null })).rejects.toThrow();
    await expect(ownerRow({ geoHash: null })).rejects.toThrow();
    await expect(ownerRow({ ownerUrl: "http://owner.example/branch" })).rejects.toThrow();
    const key = await ownerRow({
      ownerUrl: "https://owner.example/locations/duplicate",
      address: "Via Altro 99, Milano",
      name: "Bistrot Duomo",
      lat: 45.46353,
      lon: 9.18979,
    });
    const sourceId = await addSource(key, ITALY.cell);
    await addOffer("duplicate-fixture-drink", key, ITALY.cell, sourceId).run();
    expect((await get("/api/mobile/v2/menu/venues/" + key + "?cell=" + ITALY.cell)).status).toBe(
      404,
    );
    const cell = await (await get("/api/mobile/v2/menu/cells/" + ITALY.cell)).json<Cell>();
    expect(cell.venues).toEqual([]);
    expect(cell.unresolved_venues).toBe(1);
  });
});
