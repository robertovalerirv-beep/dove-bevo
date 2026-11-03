import { createHash } from "node:crypto";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const digest = (value: string) => createHash("sha256").update(value).digest("hex");

describe("migration 0012: app venue OSM evidence", () => {
  it("preserves the registry indexes and accepts only the stable OSM node basis", async () => {
    const indexes = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name IN ('mobile_menu_v2_venues_cell', 'mobile_menu_v2_owner_fingerprint') ORDER BY name",
    ).all<{ name: string }>();
    expect(indexes.results.map((row) => row.name)).toEqual([
      "mobile_menu_v2_owner_fingerprint",
      "mobile_menu_v2_venues_cell",
    ]);

    const fingerprint = digest("migration-0012-owner-fixture");
    const insert = env.DB.prepare(
      `INSERT INTO mobile_menu_v2_venues
       (venue_key, cell, name, kind, lat, lon, address, city, country,
        identity_kind, identity_url, identity_text_sha256, identity_geo_url,
        identity_geo_text_sha256, identity_geo_hash_basis, identity_fingerprint,
        identity_checked_on)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)`,
    );
    const values = [
      `m${fingerprint.slice(0, 24)}`,
      "sr2ye",
      "Migration fixture",
      0,
      41.9,
      12.5,
      "Via Test 1",
      "Roma",
      "IT",
      "owner_verified",
      "https://example.org/location",
      digest("owner-page-fixture"),
      "https://www.openstreetmap.org/node/1",
      digest("osm-node-fixture"),
      "osm_node_v1",
      fingerprint,
      "2026-11-03",
    ] as const;
    await insert.bind(...values).run();

    const stored = await env.DB.prepare(
      "SELECT identity_geo_hash_basis FROM mobile_menu_v2_venues WHERE venue_key = ?1",
    ).bind(values[0]).first<{ identity_geo_hash_basis: string }>();
    expect(stored?.identity_geo_hash_basis).toBe("osm_node_v1");

    const invalid = [...values];
    const invalidFingerprint = digest("migration-0012-invalid-fixture");
    invalid[0] = `m${invalidFingerprint.slice(0, 24)}`;
    invalid[14] = "unreviewed_basis";
    invalid[15] = invalidFingerprint;
    await expect(insert.bind(...invalid).run()).rejects.toThrow();
  });
});
