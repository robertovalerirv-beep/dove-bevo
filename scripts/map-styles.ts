// Map styles (SPEC D-27, ADR 0023): OpenFreeMap Positron/Dark recoloured with the `map-*` tokens,
// without minor-road labels, shields and airports. Pure: build-map-styles.mjs does the I/O.
import type { BrandTokens } from "./tokens.ts";

export type MapTheme = "light" | "dark";
interface Layer {
  id: string;
  type: string;
  source?: string;
  "source-layer"?: string;
  paint?: Record<string, unknown>;
  layout?: Record<string, unknown>;
  [key: string]: unknown;
}
export interface BaseStyle {
  sources: Record<string, unknown>;
  layers: Layer[];
  [key: string]: unknown;
}

/** Layers that add noise: minor road names, shields, airports, one-way arrows, house numbers. */
const DROP =
  /^(highway-name-path|highway-name-minor|highway_name_other|highway-shield|road_shield|road_oneway|airport|aeroway|housenumber|poi)/;
const GREEN = /^(park|landuse_park|landcover_wood)$/;
const CASING = /casing/;

export function palette(tokens: BrandTokens, theme: MapTheme) {
  const get = (name: string) => {
    const token = tokens.color.tokens.find((t) => t.name === name);
    if (!token) throw new Error(`token ${name} missing`);
    return token.value[theme];
  };
  return {
    land: get("map-land"),
    water: get("map-water"),
    park: get("map-park"),
    road: get("map-road"),
    label: get("map-label"),
  };
}

export function deriveStyle(base: BaseStyle, tokens: BrandTokens, theme: MapTheme): BaseStyle {
  const c = palette(tokens, theme);
  const layers = base.layers
    .filter((l) => !DROP.test(l.id))
    .map((l): Layer => {
      const paint = { ...l.paint };
      const set = (key: string, value: unknown) => {
        paint[key] = value;
      };
      if (l.type === "background") set("background-color", c.land);
      else if (l.type === "fill") {
        const color = l.id === "water" ? c.water : GREEN.test(l.id) ? c.park : c.land;
        set("fill-color", color);
        delete paint["fill-outline-color"];
      } else if (l.type === "line") {
        const sourceLayer = l["source-layer"];
        if (sourceLayer === "waterway") set("line-color", c.water);
        else if (sourceLayer === "boundary") set("line-color", c.label);
        else if (/^railway/.test(l.id)) set("line-color", c.label);
        else set("line-color", CASING.test(l.id) ? c.land : c.road);
      } else if (l.type === "symbol") {
        set("text-color", c.label);
        set("text-halo-color", c.land);
      }
      return { ...l, paint };
    });
  const used = new Set(layers.map((l) => l.source));
  const sources = Object.fromEntries(Object.entries(base.sources).filter(([id]) => used.has(id)));
  return { ...base, sources, layers };
}
