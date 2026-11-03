import { env } from "cloudflare:workers";
import { createExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import worker from "../../src/worker/index";
import { createSession } from "../../src/worker/lib/session";
import { accessJwt } from "./access-jwt";

const ORIGIN = "https://dovebevo.example";
const TODAY = new Date().toISOString().slice(0, 10);
const FOREIGN = { key: "n910000001", cell: "gcpvj" };
let address = 0;
const ip = () => "198.19.1." + String(++address);
const cookie = async () => "__Host-sid=" + (await createSession("test-session-hmac-key")).token;
async function request(path: string, body?: unknown, session?: string, jwt?: string) {
  return worker.fetch(new Request(ORIGIN + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Origin: ORIGIN, "Content-Type": "application/json",
      "CF-Connecting-IP": ip(),
      ...(session ? { Cookie: session } : {}),
      ...(jwt ? { "Cf-Access-Jwt-Assertion": jwt } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), env, createExecutionContext());
}
async function foreign() {
  await env.DB.prepare(
    "INSERT INTO mobile_menu_v2_venues" +
    " (venue_key,cell,name,kind,lat,lon,address,city,country,identity_kind,identity_url,identity_checked_on)" +
    " VALUES (?1,?2,'Fixture London Bar',1,51.5074,-0.1278,NULL,'London','GB','osm',?3,?4)",
  ).bind(FOREIGN.key, FOREIGN.cell, "https://www.openstreetmap.org/node/910000001", TODAY).run();
}
async function owner(): Promise<{ key: string; cell: string }> {
  const cell = "u0nd9";
  const url = "https://owner.example/locations/fixture-milano";
  const address = "Via Esempio 12, Milano";
  const payload = "dovebevo-v2-owner-it\n" + url + "\n" + address.normalize("NFKC").toLowerCase();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  const fingerprint = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const key = "m" + fingerprint.slice(0, 24);
  await env.DB.prepare(
    "INSERT INTO mobile_menu_v2_venues" +
    " (venue_key,cell,name,kind,lat,lon,address,city,country,identity_kind,identity_url," +
    " identity_text_sha256,identity_geo_url,identity_geo_text_sha256,identity_geo_hash_basis," +
    " identity_fingerprint,identity_checked_on)" +
    " VALUES (?1,?2,'Fixture New Owner Bar',1,45.4464,9.2284,?3,'Milano','IT'," +
    " 'owner_verified',?4,?5,?6,?7,'raw_utf8',?8,?9)",
  ).bind(key, cell, address, url, "b".repeat(64),
    "https://www.openstreetmap.org/node/999000111", "c".repeat(64), fingerprint, TODAY).run();
  return { key, cell };
}
async function offer(venue: { key: string; cell: string }, currency: string) {
  const source = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO mobile_menu_v2_sources" +
    " (id,venue_key,cell,source_url,source_text_sha256,source_checked_on," +
    " use_review_status,use_review_basis,use_review_reference,use_reviewed_on)" +
    " VALUES (?1,?2,?3,'https://official.example/menu',?4,?5,'approved'," +
    " 'Fixture approved source','https://official.example/review',?5)",
  ).bind(source, venue.key, venue.cell, "a".repeat(64), TODAY).run();
  const id = "fixture-" + crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO mobile_menu_v2_offers" +
    " (id,venue_key,cell,name,category,serving_label,serving_ml,amount_minor,currency," +
    " currency_exponent,price_context,condition_text,status,source_id)" +
    " VALUES (?1,?2,?3,'Fixture spritz','spritz','glass',NULL,550,?4,2," +
    " 'regular',NULL,'active',?5)",
  ).bind(id, venue.key, venue.cell, currency, source).run();
  return id;
}
const offerBody = (venue: { key: string; cell: string }, id: string, currency: string, extra: object = {}) => ({
  kind: "menu_offer", venue_key: venue.key, cell: venue.cell, offer_id: id,
  amount_minor: 625, currency, currency_exponent: 2, expected_revision: null, ...extra,
});
const newBody = (venue: { key: string; cell: string }, extra: object = {}) => ({
  kind: "new_drink", venue_key: venue.key, cell: venue.cell,
  name: "House negroni", category: "negroni", serving_label: "glass", serving_ml: null,
  amount_minor: 950, currency: "EUR", currency_exponent: 2, expected_revision: null, ...extra,
});
type PublicRows = { rows: { revision: string; amount_minor: number; currency: string;
  source_kind: string; name: string }[] };
beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM mobile_menu_v2_customer_reports"),
    env.DB.prepare("DELETE FROM mobile_menu_v2_customer_decisions"),
    env.DB.prepare("DELETE FROM mobile_menu_v2_customer_entries"),
    env.DB.prepare("DELETE FROM mobile_menu_v2_offers"),
    env.DB.prepare("DELETE FROM mobile_menu_v2_venues"),
    env.DB.prepare("DELETE FROM venues_hidden"),
    env.DB.prepare("DELETE FROM mobile_venues_moderation"),
    env.DB.prepare("DELETE FROM counters"),
    env.DB.prepare("DELETE FROM dedup"),
  ]);
});

describe("app-only customer prices on vetted named menu venues", () => {
  it("records a GBP observation without changing the source menu or legacy tables", async () => {
    await foreign();
    const id = await offer(FOREIGN, "GBP");
    const signed = await cookie();
    const submitted = await request("/api/mobile/v2/customer-prices", offerBody(FOREIGN, id, "GBP"), signed);
    expect(submitted.status, await submitted.clone().text()).toBe(201);
    const revision = (await submitted.json<{ revision: string }>()).revision;
    const publicRead = await request("/api/mobile/v2/customer-prices/venues/" + FOREIGN.key + "?cell=" + FOREIGN.cell);
    expect(publicRead.status).toBe(200);
    expect(await publicRead.json<PublicRows>()).toMatchObject({
      rows: [{ revision, amount_minor: 625, currency: "GBP", source_kind: "customer" }],
    });
    expect(await env.DB.prepare("SELECT amount_minor FROM mobile_menu_v2_offers WHERE id=?1")
      .bind(id).first("amount_minor")).toBe(550);
    for (const table of ["prices_current", "mobile_prices_current"]) {
      expect(await env.DB.prepare("SELECT COUNT(*) FROM " + table + " WHERE venue_key=?1")
        .bind(FOREIGN.key).first("COUNT(*)")).toBe(0);
    }
    expect((await request("/api/mobile/v2/customer-prices", offerBody(FOREIGN, id, "EUR"), signed)).status)
      .toBe(400);
    expect((await request("/api/mobile/v2/customer-prices", offerBody(FOREIGN, id, "GBP",
      { amount_minor: 0 }), signed)).status).toBe(400);
    expect((await request("/api/mobile/v2/customer-prices", offerBody(FOREIGN, id, "GBP",
      { amount_minor: 700, expected_revision: crypto.randomUUID() }), signed)).status).toBe(409);
    const updated = await request("/api/mobile/v2/customer-prices", offerBody(FOREIGN, id, "GBP",
      { amount_minor: 700, expected_revision: revision }), signed);
    expect(updated.status, await updated.clone().text()).toBe(201);
    expect((await request("/api/mobile/v2/customer-prices/venues/" + FOREIGN.key + "?cell=" + FOREIGN.cell)
      .then((r) => r.json<PublicRows>())).rows[0]?.amount_minor).toBe(700);
  });

  it("holds a new named drink pending until admin moderation, with a usable owner-verified venue", async () => {
    const venue = await owner();
    const signed = await cookie();
    const submission = await request("/api/mobile/v2/customer-prices", newBody(venue), signed);
    expect(submission.status, await submission.clone().text()).toBe(202);
    const revision = (await submission.json<{ revision: string }>()).revision;
    const path = "/api/mobile/v2/customer-prices/venues/" + venue.key + "?cell=" + venue.cell;
    expect((await (await request(path)).json<PublicRows>()).rows).toEqual([]);
    expect((await request("/api/mobile/v2/customer-prices", newBody(venue), signed)).status).toBe(409);
    const jwt = await accessJwt();
    const decision = await request(
      "/api/admin/mobile/v2/customer-prices/entries/" + revision + "/decision",
      { decision: "approve" }, undefined, jwt,
    );
    expect(decision.status, await decision.clone().text()).toBe(200);
    expect((await (await request(path)).json<PublicRows>()).rows).toMatchObject([
      { revision, name: "House negroni", amount_minor: 950, currency: "EUR" },
    ]);
    expect(await env.DB.prepare("SELECT COUNT(*) FROM mobile_menu_v2_customer_decisions")
      .first("COUNT(*)")).toBe(1);
  });

  it("rejects bogus, hidden and moderated venues and unauthenticated writes", async () => {
    await foreign();
    const id = await offer(FOREIGN, "GBP");
    const body = offerBody(FOREIGN, id, "GBP");
    expect((await request("/api/mobile/v2/customer-prices", body)).status).toBe(401);
    const signed = await cookie();
    expect((await request("/api/mobile/v2/customer-prices", { ...body, venue_key: "m" + "0".repeat(24) }, signed)).status)
      .toBe(404);
    await env.DB.prepare("INSERT INTO venues_hidden(venue_key,cell,name,day) VALUES (?1,?2,'fixture',?3)")
      .bind(FOREIGN.key, FOREIGN.cell, TODAY).run();
    expect((await request("/api/mobile/v2/customer-prices", body, signed)).status).toBe(404);
    expect((await request("/api/mobile/v2/customer-prices/venues/" + FOREIGN.key + "?cell=" + FOREIGN.cell)).status)
      .toBe(404);
    await env.DB.prepare("DELETE FROM venues_hidden").run();
    await env.DB.prepare("INSERT INTO mobile_venues_moderation(venue_key,status,reason) VALUES (?1,'hidden','fixture')")
      .bind(FOREIGN.key).run();
    expect((await request("/api/mobile/v2/customer-prices", body, signed)).status).toBe(404);
  });

  it("reports an active observation and suppresses it after the moderation threshold", async () => {
    await foreign();
    const id = await offer(FOREIGN, "GBP");
    const signed = await cookie();
    const submission = await request("/api/mobile/v2/customer-prices", offerBody(FOREIGN, id, "GBP"), signed);
    expect(submission.status).toBe(201);
    const revision = (await submission.json<{ revision: string }>()).revision;
    const report = { venue_key: FOREIGN.key, cell: FOREIGN.cell, entry_id: revision, reason: "wrong_price" };
    for (let i = 0; i <= 3; i++) {
      const result = await request("/api/mobile/v2/customer-prices/report", report, await cookie());
      expect(result.status, await result.clone().text()).toBe(200);
    }
    const rows = await request("/api/mobile/v2/customer-prices/venues/" + FOREIGN.key + "?cell=" + FOREIGN.cell);
    expect((await rows.json<PublicRows>()).rows).toEqual([]);
  });
});
