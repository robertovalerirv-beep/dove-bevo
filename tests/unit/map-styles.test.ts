import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import brand from "../../docs/brand/tokens.json" with { type: "json" };
import { MAP_STYLES } from "../../src/app/lib/map-styles.generated";
import { palette, type BaseStyle } from "../../scripts/map-styles";
import type { BrandTokens } from "../../scripts/tokens";

// MB-06 / D-27: the committed styles are the OpenFreeMap ones recoloured with the map-* tokens.
const tokens = brand as BrandTokens;
const load = (url: string) => {
  const text = readFileSync(`public${url}`, "utf8");
  return { text, style: JSON.parse(text) as BaseStyle & { glyphs: string; sprite: string } };
};

describe.each([
  ["light", "bancone"],
  ["dark", "fuori-orario"],
] as const)("MB-06 style %s", (theme, name) => {
  const url = MAP_STYLES[theme];
  const { text, style } = load(url);
  const c = palette(tokens, theme);

  it("is named by the hash of its content (immutable cache is safe)", async () => {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    const hash = [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 8);
    expect(url).toBe(`/map/${name}.${hash}.json`);
  });

  it("has no points of interest, shields, airports or minor road names", () => {
    const noise =
      /^(highway-name-path|highway-name-minor|highway_name_other|highway-shield|road_shield|road_oneway|airport|aeroway)/;
    expect(style.layers.map((l) => l.id).filter((id) => noise.test(id))).toEqual([]);
    expect(style.layers.some((l) => l["source-layer"] === "poi")).toBe(false);
  });

  it("uses only the map-* colours for land, water and labels", () => {
    const find = (id: string) => style.layers.find((l) => l.id === id);
    expect(find("background")?.paint?.["background-color"]).toBe(c.land);
    expect(find("water")?.paint?.["fill-color"]).toBe(c.water);
    const labels = style.layers.filter((l) => l.type === "symbol");
    expect(labels.length).toBeGreaterThan(0);
    for (const l of labels) expect(l.paint?.["text-color"]).toBe(c.label);
  });

  it("takes glyphs and sprite from tiles.openfreemap.org only", () => {
    expect(new URL(style.glyphs).host).toBe("tiles.openfreemap.org");
    expect(new URL(style.sprite).host).toBe("tiles.openfreemap.org");
  });

  // The Dark base asks for "circle-11", which the shared sprite does not have (MapLibre logs a
  // missing image and draws no dot). Names checked against ofm_f384/ofm.json on 01/11/2026.
  it("asks the sprite only for images it has", () => {
    const SPRITE = new Set(["circle_11", "circle_11_black"]);
    const names = style.layers
      .map((l) => l.layout?.["icon-image"])
      .filter((v) => v !== undefined)
      .flatMap((v) => JSON.stringify(v).match(/"[a-z][\w-]*"/g) ?? [])
      .map((s) => s.slice(1, -1))
      .filter((s) => s !== "step" && s !== "zoom");
    expect(new URL(style.sprite).pathname).toBe("/sprites/ofm_f384/ofm");
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) expect(SPRITE, name).toContain(name);
  });
});

it("public/map holds exactly the two styles", () => {
  expect(readdirSync("public/map").sort()).toEqual(
    Object.values(MAP_STYLES)
      .map((u) => u.replace("/map/", ""))
      .sort(),
  );
});
