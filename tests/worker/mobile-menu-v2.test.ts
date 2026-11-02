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
    id: string; serving: { label: string | null; ml: number | null };
    amount_minor: number; currency: string; currency_exponent: number;
    source: { url: string; text_sha256: string; checked_on: string };
  }[];
  fees: {
    basis: string; amount_minor: number | null; currency: string | null;
    currency_exponent: number | null; rate_bps: number | null; applicability: string;
  }[];
  fee_coverage: { status: string };
}
interface Cell {
  coverage: { complete: boolean };
  venues: { key: string; matching_offer_count: number; sample_offers: { id: string }[] }[];
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
    " VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)"
  ).bind(
    id, key, cell, "https://official.example/test-menu", "a".repeat(64), TODAY,
    status, "Synthetic test source review", "https://official.example/test-review", TODAY,
  ).run();
  return id;
}
function addOffer(id: string, key: string, cell: string, sourceId: string, extra: {
  name?: string; category?: string | null; servingLabel?: string | null; ml?: number | null;
  amount?: number; currency?: string; exponent?: number; status?: string;
} = {}) {
  return env.DB.prepare(
    "INSERT INTO mobile_menu_v2_offers" +
    " (id,venue_key,cell,name,category,serving_label,serving_ml,amount_minor,currency," +
    " currency_exponent,price_context,condition_text,status,source_id)" +
    " VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,'regular',NULL,?11,?12)"
  ).bind(
    id, key, cell, extra.name ?? "Fixture beer", extra.category ?? "beer_draft",
    extra.servingLabel ?? null, extra.ml ?? null, extra.amount ?? 530,
    extra.currency ?? "EUR", extra.exponent ?? 2, extra.status ?? "active", sourceId,
  );
}
function addFee(id: string, key: string, cell: string, sourceId: string,
  value: {
    kind: "fixed" | "percent"; basis: string; amount?: number | null;
    currency?: string | null; exponent?: number | null; bps?: number | null;
    applicability?: string; condition?: string | null; status?: string;
  }) {
  return env.DB.prepare(
    "INSERT INTO mobile_menu_v2_fees" +
    " (id,venue_key,cell,label,fee_kind,basis,amount_minor,currency,currency_exponent," +
    " rate_bps,applicability,condition_text,status,source_id)" +
    " VALUES (?1,?2,?3,'Fixture service charge',?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)"
  ).bind(
    id, key, cell, value.kind, value.basis, value.amount ?? null,
    value.currency ?? null, value.exponent ?? null, value.bps ?? null,
    value.applicability ?? "unknown", value.condition ?? null,
    value.status ?? "active", sourceId,
  );
}
async function registerForeign() {
  await env.DB.prepare(
    "INSERT INTO mobile_menu_v2_venues" +
    " (venue_key,cell,name,kind,lat,lon,address,city,country,identity_url,identity_checked_on)" +
    " VALUES (?1,?2,'Fixture London Bar',1,51.5074,-0.1278,NULL,'London','GB',?3,?4)"
  ).bind(FOREIGN.key, FOREIGN.cell, "https://www.openstreetmap.org/node/910000001", TODAY).run();
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
        name: "Fixture Aperol beer", servingLabel: "33 cl", ml: 330, amount: 530,
      }),
      addOffer("fixture-campari", ITALY.key, ITALY.cell, sourceId, {
        name: "Fixture other beer", servingLabel: null, ml: null, amount: 550,
      }),
    ]);
    const response = await get("/api/mobile/v2/menu/venues/" + ITALY.key + "?cell=" + ITALY.cell);
    expect(response.status, await response.clone().text()).toBe(200);
    const body = await response.json<Detail>();
    expect(body).toMatchObject({
      schema_version: 2, price_scope: "menu_item_only",
      coverage: { complete: false, basis: "verified_source_items_only" },
      venue: { key: ITALY.key, name: "Bistrot Duomo", country: "IT" },
      stored_offer_count: 2, next_after: null,
      fee_coverage: { status: "unknown" },
    });
    expect(body.offers.map((row) => row.id)).toEqual(["fixture-aperol", "fixture-campari"]);
    expect(body.offers[1].serving).toEqual({ label: null, ml: null });
    expect(body.offers[0]).toMatchObject({
      amount_minor: 530, currency: "EUR", currency_exponent: 2,
      source: { url: "https://official.example/test-menu", text_sha256: "a".repeat(64), checked_on: TODAY },
    });
    const cell = await (await get("/api/mobile/v2/menu/cells/u0nd9?category=beer_draft")).json<Cell>();
    expect(cell.venues).toHaveLength(1);
    expect(cell.venues[0]).toMatchObject({
      key: ITALY.key, matching_offer_count: 2,
      sample_offers: [{ id: "fixture-aperol" }],
    });
    expect(cell.coverage.complete).toBe(false);
    const legacy = await (await get("/api/venues/" + ITALY.key + "/prices")).json<{ p: unknown[] }>();
    expect(legacy.p).toEqual([]);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM mobile_prices_current WHERE venue_key=?1")
      .bind(ITALY.key).first("n")).toBe(0);
  });

  it("keeps fixed and percentage fees separate and never infers an all-in price", async () => {
    const sourceId = await addSource(ITALY.key, ITALY.cell);
    await addOffer("fee-example-drink", ITALY.key, ITALY.cell, sourceId).run();
    await env.DB.batch([
      addFee("fee-cover", ITALY.key, ITALY.cell, sourceId, {
        kind: "fixed", basis: "unspecified", amount: 200, currency: "EUR", exponent: 2,
      }),
      addFee("fee-service", ITALY.key, ITALY.cell, sourceId, {
        kind: "percent", basis: "bill", bps: 1000, applicability: "conditional",
        condition: "Only when the documented condition applies",
      }),
    ]);
    await env.DB.prepare(
      "INSERT INTO mobile_menu_v2_fee_coverage(venue_key,cell,status,source_id)" +
      " VALUES (?1,?2,'documented_partial',?3)"
    ).bind(ITALY.key, ITALY.cell, sourceId).run();
    const response = await (await get("/api/mobile/v2/menu/venues/" + ITALY.key +
      "?cell=" + ITALY.cell)).json<Detail>();
    expect(response.offers[0].amount_minor).toBe(530);
    expect(response.fees).toEqual(expect.arrayContaining([
      expect.objectContaining({
        basis: "unspecified", amount_minor: 200, currency: "EUR",
        currency_exponent: 2, rate_bps: null, applicability: "unknown",
      }),
      expect.objectContaining({
        basis: "bill", amount_minor: null, currency: null,
        currency_exponent: null, rate_bps: 1000, applicability: "conditional",
      }),
    ]));
    expect(response.fee_coverage.status).toBe("documented_partial");
    expect(response).not.toHaveProperty("all_in_total");
    await expect(addFee("bad-percent", ITALY.key, ITALY.cell, sourceId, {
      kind: "percent", basis: "bill", bps: 1000, amount: 100, currency: "EUR",
    }).run()).rejects.toThrow();
    await expect(addOffer("zero-price", ITALY.key, ITALY.cell, sourceId, {
      amount: 0,
    }).run()).rejects.toThrow();
  });

  it("refuses to activate held sources and keeps source-use decisions immutable", async () => {
    const sourceId = await addSource(ITALY.key, ITALY.cell, "held");
    await expect(addOffer("held-active", ITALY.key, ITALY.cell, sourceId).run()).rejects.toThrow();
    await addOffer("held-review", ITALY.key, ITALY.cell, sourceId, { status: "review" }).run();
    await expect(env.DB.prepare(
      "UPDATE mobile_menu_v2_offers SET status='active' WHERE id='held-review'"
    ).run()).rejects.toThrow();
    await expect(addFee("held-fee", ITALY.key, ITALY.cell, sourceId, {
      kind: "percent", basis: "bill", bps: 1000,
    }).run()).rejects.toThrow();
    await expect(env.DB.prepare(
      "INSERT INTO mobile_menu_v2_fee_coverage VALUES (?1,?2,'explicit_no_fee',?3)"
    ).bind(ITALY.key, ITALY.cell, sourceId).run()).rejects.toThrow();
    await expect(env.DB.prepare(
      "UPDATE mobile_menu_v2_sources SET use_review_status='approved' WHERE id=?1"
    ).bind(sourceId).run()).rejects.toThrow();
    await expect(env.DB.prepare(
      "DELETE FROM mobile_menu_v2_sources WHERE id=?1"
    ).bind(sourceId).run()).rejects.toThrow();
    const detail = await (await get("/api/mobile/v2/menu/venues/" + ITALY.key +
      "?cell=" + ITALY.cell)).json<Detail>();
    expect(detail.offers).toEqual([]);
    expect(detail.fee_coverage.status).toBe("unknown");
    const post = await worker.fetch(new Request(ORIGIN + "/api/mobile/v2/menu/venues/" + ITALY.key, {
      method: "POST", headers: { Origin: ORIGIN },
    }), env, createExecutionContext());
    expect(post.status).toBe(404);
  });

  it("requires vetted venue identity and applies both existing venue blocks", async () => {
    const sourceId = await addSource(FOREIGN.key, FOREIGN.cell);
    await addOffer("foreign-offer", FOREIGN.key, FOREIGN.cell, sourceId, {
      currency: "GBP", amount: 750,
    }).run();
    const path = "/api/mobile/v2/menu/venues/" + FOREIGN.key + "?cell=" + FOREIGN.cell;
    expect((await get(path)).status).toBe(404);
    const unresolved = await (await get("/api/mobile/v2/menu/cells/" + FOREIGN.cell)).json<Cell>();
    expect(unresolved.venues).toEqual([]);
    expect(unresolved.unresolved_venues).toBe(1);
    await registerForeign(); // No Google review field or threshold.
    const detail = await (await get(path)).json<Detail>();
    expect(detail.venue).toMatchObject({ country: "GB", name: "Fixture London Bar" });
    expect(detail.offers[0]).toMatchObject({ currency: "GBP", amount_minor: 750 });
    await env.DB.prepare(
      "INSERT INTO venues_hidden(venue_key,cell,name,day) VALUES (?1,?2,'Fixture London Bar',?3)"
    ).bind(FOREIGN.key, FOREIGN.cell, TODAY).run();
    expect((await get(path)).status).toBe(404);
    expect((await (await get("/api/mobile/v2/menu/cells/" + FOREIGN.cell)).json<Cell>()).venues).toEqual([]);
    await env.DB.prepare("DELETE FROM venues_hidden WHERE venue_key=?1").bind(FOREIGN.key).run();
    await env.DB.prepare(
      "INSERT INTO mobile_venues_moderation(venue_key,status,reason)" +
      " VALUES (?1,'review','fixture moderation')"
    ).bind(FOREIGN.key).run();
    expect((await get(path)).status).toBe(404);
  });

  it("retrieves more than 500 named offers without truncation", async () => {
    await registerForeign();
    const sourceId = await addSource(FOREIGN.key, FOREIGN.cell);
    for (let start = 0; start < 501; start += 100) {
      const batch = [];
      for (let index = start; index < Math.min(start + 100, 501); index++) {
        batch.push(addOffer("item-" + String(index).padStart(4, "0"),
          FOREIGN.key, FOREIGN.cell, sourceId, {
            name: "Synthetic drink " + String(index), amount: 300 + index,
          }));
      }
      await env.DB.batch(batch);
    }
    const ids: string[] = [];
    let after: string | null = null;
    do {
      const path = "/api/mobile/v2/menu/venues/" + FOREIGN.key +
        "?cell=" + FOREIGN.cell + (after ? "&after=" + after : "");
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
});
