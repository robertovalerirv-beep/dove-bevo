import { env } from "cloudflare:workers";
import type { D1Migration } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const { TEST_MIGRATIONS } = env as unknown as {
  TEST_MIGRATIONS: D1Migration[];
};
const oldMigration = TEST_MIGRATIONS.find((migration) => migration.name.startsWith("0013"));
const newMigration = TEST_MIGRATIONS.find((migration) => migration.name.startsWith("0014"));

describe("migration 0014: static Italian customer observations", () => {
  it("preserves existing entry, report, decision, sequence, indexes and offer FK", async () => {
    expect(oldMigration).toBeDefined();
    expect(newMigration).toBeDefined();
    // Recreate the exact previous schema in this isolated D1 fixture, then migrate
    // populated tables. No live database or public contribution is touched.
    await env.DB.batch([
      env.DB.prepare("DROP TABLE mobile_menu_v2_customer_reports"),
      env.DB.prepare("DROP TABLE mobile_menu_v2_customer_decisions"),
      env.DB.prepare("DROP TABLE mobile_menu_v2_customer_entries"),
    ]);
    await env.DB.batch((oldMigration?.queries ?? []).map((sql) => env.DB.prepare(sql)));

    const venue = "n910000001";
    const entry = crypto.randomUUID();
    const day = "2026-11-03";
    await env.DB.prepare(
      "INSERT INTO mobile_menu_v2_venues" +
        " (venue_key,cell,name,kind,lat,lon,address,city,country,identity_kind,identity_url,identity_checked_on)" +
        " VALUES (?1,'gcpvj','Fixture London Bar',1,51.5074,-0.1278,NULL,'London','GB','osm',?2,?3)",
    )
      .bind(venue, "https://www.openstreetmap.org/node/910000001", day)
      .run();
    await env.DB.prepare(
      "INSERT INTO mobile_menu_v2_customer_entries" +
        " (id,venue_key,cell,item_key,item_kind,offer_id,name,category,serving_label,serving_ml," +
        " amount_minor,currency,currency_exponent,observed_on,status,changed_at)" +
        " VALUES (?1,?2,'gcpvj',?3,'new_drink',NULL,'Fixture spritz','spritz','glass',NULL," +
        " 550,'GBP',2,?4,'pending',?5)",
    )
      .bind(entry, venue, "c" + "a".repeat(64), day, day + "T12:00:00Z")
      .run();
    await env.DB.prepare(
      "UPDATE mobile_menu_v2_customer_entries SET status='active',moderated_at=?2 WHERE id=?1",
    )
      .bind(entry, day + "T12:01:00Z")
      .run();
    await env.DB.prepare(
      "INSERT INTO mobile_menu_v2_customer_reports(entry_id,reason,day)" +
        " VALUES (?1,'wrong_price',?2)",
    )
      .bind(entry, day)
      .run();
    const before = await env.DB.prepare(
      "SELECT e.seq,e.id,e.venue_key,e.amount_minor,r.reason,d.decision" +
        " FROM mobile_menu_v2_customer_entries e" +
        " JOIN mobile_menu_v2_customer_reports r ON r.entry_id=e.id" +
        " JOIN mobile_menu_v2_customer_decisions d ON d.entry_id=e.id",
    ).all();

    await env.DB.batch((newMigration?.queries ?? []).map((sql) => env.DB.prepare(sql)));

    const after = await env.DB.prepare(
      "SELECT e.seq,e.id,e.venue_key,e.amount_minor,r.reason,d.decision" +
        " FROM mobile_menu_v2_customer_entries e" +
        " JOIN mobile_menu_v2_customer_reports r ON r.entry_id=e.id" +
        " JOIN mobile_menu_v2_customer_decisions d ON d.entry_id=e.id",
    ).all();
    expect(after.results).toEqual(before.results);
    expect((await env.DB.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
    const venueForeignKeys = await env.DB.prepare(
      'SELECT "table","from" FROM pragma_foreign_key_list(\'mobile_menu_v2_customer_entries\')',
    ).all<{ table: string; from: string }>();
    expect(venueForeignKeys.results).toEqual([
      { table: "mobile_menu_v2_offers", from: "offer_id" },
    ]);
    for (const child of ["mobile_menu_v2_customer_reports", "mobile_menu_v2_customer_decisions"]) {
      const references = await env.DB.prepare(
        `SELECT "table" FROM pragma_foreign_key_list('${child}')`,
      ).all<{ table: string }>();
      expect(references.results).toEqual([{ table: "mobile_menu_v2_customer_entries" }]);
    }
    const schema = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE name LIKE 'mobile_menu_v2_customer_%'" +
        " OR name='mobile_menu_v2_one_pending_new_drink' ORDER BY name",
    ).all<{ name: string }>();
    for (const name of [
      "mobile_menu_v2_customer_item",
      "mobile_menu_v2_customer_pending",
      "mobile_menu_v2_one_pending_new_drink",
      "mobile_menu_v2_customer_fact_immutable",
      "mobile_menu_v2_customer_decision_audit",
    ])
      expect(schema.results.map((row) => row.name)).toContain(name);

    await expect(
      env.DB.prepare("UPDATE mobile_menu_v2_customer_entries SET amount_minor=600 WHERE id=?1")
        .bind(entry)
        .run(),
    ).rejects.toThrow();
    const staticEntry = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO mobile_menu_v2_customer_entries" +
        " (id,venue_key,cell,item_key,item_kind,offer_id,name,category,serving_label,serving_ml," +
        " amount_minor,currency,currency_exponent,observed_on,status,changed_at)" +
        " VALUES (?1,'n2420779240','u0nd9',?2,'new_drink',NULL,'Fixture negroni'," +
        " 'negroni','glass',NULL,950,'EUR',2,?3,'pending',?4)",
    )
      .bind(staticEntry, "c" + "b".repeat(64), day, day + "T12:02:00Z")
      .run();
    const nextSeq = await env.DB.prepare(
      "SELECT seq FROM mobile_menu_v2_customer_entries WHERE id=?1",
    )
      .bind(staticEntry)
      .first<{ seq: number }>();
    expect(nextSeq?.seq).toBeGreaterThan((before.results[0] as { seq: number }).seq);
    await expect(
      env.DB.prepare(
        "INSERT INTO mobile_menu_v2_customer_entries" +
          " (id,venue_key,cell,item_key,item_kind,offer_id,name,category,serving_label,serving_ml," +
          " amount_minor,currency,currency_exponent,observed_on,status,changed_at)" +
          " VALUES (?1,'n2420779240','u0nd9',?2,'menu_offer','missing-offer'," +
          " 'Fixture beer','beer_draft','glass',NULL,500,'EUR',2,?3,'active',?4)",
      )
        .bind(crypto.randomUUID(), "o" + "c".repeat(64), day, day + "T12:03:00Z")
        .run(),
    ).rejects.toThrow();
  });
});
