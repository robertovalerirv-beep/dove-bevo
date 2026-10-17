// MapLibre wrapper (SPEC 4, 7.1). Loaded with a dynamic import in parallel with the shell.
// The worker is served by us (no blob: workers, CSP worker-src 'self').
import { Map as MapLibre, setWorkerUrl, type GeoJSONSource } from "maplibre-gl";
import type { ExpressionSpecification, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { it } from "../i18n/it";
import type { Tier } from "./tiers";

setWorkerUrl(workerUrl);

const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
const TILEJSON_URL = "https://tiles.openfreemap.org/planet";

const ITALY: [[number, number], [number, number]] = [
  [6.6, 36.6],
  [18.6, 47.1],
];
const FONT = ["Noto Sans Bold"];
const TEXT_SIZE = 14; // MASTER: no text under 14 px

export interface MapView {
  zoom: number;
  lat: number;
  lon: number;
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface VenuePoint {
  key: string;
  cell: string;
  lat: number;
  lon: number;
  /** Price text, "" when the bar has no price for the chosen drink. */
  label: string;
  /** Tier against the cell median (D-12): decides colour and glyph of the pin. */
  tier: Tier;
  /** Observed more than 90 days ago: dashed border, italic price, no shadow. */
  stale: boolean;
}

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Reads a design token: map overlays use the light price tokens in both themes (MASTER). */
const token = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

async function loadStyle(): Promise<StyleSpecification> {
  // Style and TileJSON in parallel (the attributions are rendered by the shell, see app.tsx).
  const [style, tileJson] = (await Promise.all(
    [STYLE_URL, TILEJSON_URL].map(
      async (url): Promise<unknown> => (await fetch(url)).json() as Promise<unknown>,
    ),
  )) as [StyleSpecification, { tiles: string[]; minzoom?: number; maxzoom?: number }];
  for (const [id, source] of Object.entries(style.sources)) {
    if (source.type === "vector" && source.url === TILEJSON_URL) {
      style.sources[id] = {
        type: "vector",
        tiles: tileJson.tiles,
        minzoom: tileJson.minzoom ?? 0,
        maxzoom: tileJson.maxzoom ?? 14,
      };
    }
  }
  // Italian place names where OpenMapTiles has them ("Milano", not "Milan").
  for (const layer of style.layers) {
    const field = layer.type === "symbol" ? JSON.stringify(layer.layout?.["text-field"] ?? "") : "";
    if (
      layer.type === "symbol" &&
      layer.layout &&
      field.includes("name") &&
      !field.includes("ref")
    ) {
      layer.layout["text-field"] = ["coalesce", ["get", "name:it"], ["get", "name"]];
    }
  }
  return style;
}

const GLYPH: Record<Tier, string> = { affare: "↓", giusto: "=", salato: "↑", neutro: "" };
const PIN_RATIO = 2;
const PIN_HEIGHT = 32;
const PIN_FONT_SIZE = 14;

/** Pin image names carry everything they depend on: `pin-<tier>-<stale 0|1>-<theme>-<label>`. */
function pinName(tier: Tier, stale: boolean, label: string): string {
  return `pin-${tier}-${stale ? "1" : "0"}-${theme()}-${label}`;
}

const theme = () => (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

/** Draws a price pill (glyph + price in Geist Mono) on a canvas, once per distinct pin (MASTER). */
function pinImage(tier: Tier, stale: boolean, label: string): ImageData {
  const text = `${GLYPH[tier]}${GLYPH[tier] ? " " : ""}${label}`;
  const font = `${stale ? "italic " : ""}600 ${String(PIN_FONT_SIZE)}px ${token("--font-mono")}`;
  const probe = document.createElement("canvas").getContext("2d");
  if (probe) probe.font = font;
  const textWidth = probe ? probe.measureText(text).width : text.length * 9;
  const shadow = stale ? 0 : 2;
  const w = Math.ceil(textWidth + 24 + shadow);
  const h = PIN_HEIGHT + shadow;
  const canvas = document.createElement("canvas");
  canvas.width = w * PIN_RATIO;
  canvas.height = h * PIN_RATIO;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new ImageData(canvas.width, canvas.height);
  ctx.scale(PIN_RATIO, PIN_RATIO);
  const ink = token("--ink");
  const fill = tier === "neutro" ? token("--map-pill-bg") : token(`--${tier}`);
  const on = tier === "neutro" ? token("--map-pill-text") : token(`--on-${tier}`);
  const pill = (x: number, y: number) => {
    const [x0, y0, x1, y1] = [x + 1, y + 1, x + w - shadow - 1, y + PIN_HEIGHT - 1];
    const r = (y1 - y0) / 2;
    ctx.beginPath();
    // Arcs instead of roundRect(): missing before Safari 16.
    ctx.moveTo(x0 + r, y0);
    ctx.arcTo(x1, y0, x1, y1, r);
    ctx.arcTo(x1, y1, x0, y1, r);
    ctx.arcTo(x0, y1, x0, y0, r);
    ctx.arcTo(x0, y0, x1, y0, r);
    ctx.closePath();
  };
  if (shadow) {
    pill(shadow, shadow);
    ctx.fillStyle = ink;
    ctx.fill();
  }
  pill(0, 0);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = ink;
  ctx.setLineDash(stale ? [4, 3] : []);
  ctx.stroke();
  ctx.font = font;
  ctx.fillStyle = on;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, (w - shadow) / 2, PIN_HEIGHT / 2 + 1);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

export class VenueMap {
  private readonly map: MapLibre;
  private readonly ready: Promise<void>;

  private constructor(container: HTMLElement, style: StyleSpecification) {
    this.map = new MapLibre({
      container,
      style,
      bounds: ITALY,
      attributionControl: false,
      maplibreLogo: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      locale: { "Map.Title": it.map.canvas },
    });
    this.map.touchZoomRotate.disableRotation();
    this.ready = new Promise((resolve) => {
      this.map.on("load", () => {
        this.addLayers();
        resolve();
      });
    });
  }

  static async create(container: HTMLElement): Promise<VenueMap> {
    // The pins are drawn on canvas: the mono font must be ready or they would use the fallback.
    await document.fonts
      .load(`600 ${String(PIN_FONT_SIZE)}px ${token("--font-mono")}`)
      .catch(() => []);
    const map = new VenueMap(container, await loadStyle());
    await map.ready;
    return map;
  }

  private addLayers() {
    const map = this.map;
    const ink = token("--ink");
    const bg = token("--bg");
    const border = token("--map-pill-border");
    const dotFill = token("--map-pill-bg");
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      this.redrawPins();
    });
    const empty = { type: "FeatureCollection" as const, features: [] };
    // Bars without a price are clustered; priced bars never are, so prices stay readable at any
    // zoom (SPEC 1: the map must not look empty) and are drawn above the clusters.
    map.addSource("venues", {
      type: "geojson",
      data: empty,
      cluster: true,
      clusterMaxZoom: 14,
      clusterRadius: 44,
    });
    map.addSource("prices", { type: "geojson", data: empty });
    const isCluster: ExpressionSpecification = ["has", "point_count"];
    const isVenue: ExpressionSpecification = ["!", isCluster];
    map.addLayer({
      id: "clusters",
      type: "circle",
      source: "venues",
      filter: isCluster,
      paint: {
        "circle-color": ink,
        "circle-stroke-color": border,
        "circle-stroke-width": 2,
        "circle-radius": ["step", ["get", "point_count"], 16, 20, 20, 100, 24],
      },
    });
    map.addLayer({
      id: "cluster-count",
      type: "symbol",
      source: "venues",
      filter: isCluster,
      layout: {
        "text-field": ["get", "point_count_abbreviated"],
        "text-font": FONT,
        "text-size": TEXT_SIZE,
        // A circle without its number is meaningless: always draw the count.
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: { "text-color": bg },
    });
    map.addLayer({
      id: "venue-dot",
      type: "circle",
      source: "venues",
      filter: isVenue,
      paint: {
        "circle-radius": 5,
        "circle-color": dotFill,
        "circle-stroke-color": border,
        "circle-stroke-width": 2,
      },
    });
    map.addLayer({
      id: "venue-price",
      type: "symbol",
      source: "prices",
      layout: { "icon-image": ["get", "pin"] },
    });
    // Invisible 48 px touch targets for bars and clusters (MASTER: target ≥ 48 px).
    for (const [id, source, filter] of [
      ["venue-hit", "venues", isVenue],
      ["price-hit", "prices", null],
      ["cluster-hit", "venues", isCluster],
    ] as const) {
      map.addLayer({
        id,
        type: "circle",
        source,
        ...(filter ? { filter } : {}),
        paint: { "circle-radius": 24, "circle-opacity": 0 },
      });
      map.on("mouseenter", id, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", id, () => (map.getCanvas().style.cursor = ""));
    }
    map.on("click", "cluster-hit", (e) => {
      const id = e.features?.[0]?.properties.cluster_id as number | undefined;
      const source = map.getSource<GeoJSONSource>("venues");
      if (id === undefined || !source) return;
      void source.getClusterExpansionZoom(id).then((zoom) => {
        this.moveTo(e.lngLat.lat, e.lngLat.lng, zoom);
      });
    });
  }

  view(): MapView {
    const b = this.map.getBounds();
    const center = this.map.getCenter();
    return {
      zoom: this.map.getZoom(),
      lat: center.lat,
      lon: center.lng,
      south: b.getSouth(),
      west: b.getWest(),
      north: b.getNorth(),
      east: b.getEast(),
    };
  }

  onMove(listener: (view: MapView) => void) {
    this.map.on("moveend", () => {
      listener(this.view());
    });
  }

  /** Price labels actually drawn after each render settles (exposed in the DOM for tests). */
  onRendered(listener: (labels: string[]) => void) {
    this.renderedListener = listener;
    this.map.on("idle", () => {
      this.reportRendered();
    });
  }

  private renderedListener: ((labels: string[]) => void) | null = null;

  private reportRendered() {
    const features = this.map.queryRenderedFeatures({ layers: ["venue-price"] });
    this.renderedListener?.([...new Set(features.map((f) => String(f.properties.label)))].sort());
  }

  onIdle(listener: () => void) {
    this.map.once("idle", listener);
  }

  onVenueClick(listener: (key: string, cell: string) => void) {
    for (const layer of ["venue-hit", "price-hit"]) {
      this.map.on("click", layer, (e) => {
        const props = e.features?.[0]?.properties;
        if (props) listener(String(props.key), String(props.cell));
      });
    }
  }

  private points: VenuePoint[] = [];

  /** After a theme change the pins are drawn again with the new tokens (no network involved). */
  private redrawPins() {
    for (const id of this.map.listImages()) if (id.startsWith("pin-")) this.map.removeImage(id);
    this.setVenues(this.points);
  }

  /** Draws the pin images a set of points needs, before the layer asks for them. */
  private ensurePins(points: VenuePoint[]) {
    for (const p of points) {
      if (!p.label) continue;
      const name = pinName(p.tier, p.stale, p.label);
      if (this.map.hasImage(name)) continue;
      this.map.addImage(name, pinImage(p.tier, p.stale, p.label), { pixelRatio: PIN_RATIO });
    }
  }

  setVenues(points: VenuePoint[]) {
    this.points = points;
    this.ensurePins(points);
    const collection = (list: VenuePoint[]) => ({
      type: "FeatureCollection" as const,
      features: list.map((p) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [p.lon, p.lat] },
        properties: {
          key: p.key,
          cell: p.cell,
          label: p.label,
          pin: p.label ? pinName(p.tier, p.stale, p.label) : "",
        },
      })),
    });
    void this.map
      .getSource<GeoJSONSource>("venues")
      ?.setData(collection(points.filter((p) => !p.label)));
    void this.map
      .getSource<GeoJSONSource>("prices")
      ?.setData(collection(points.filter((p) => p.label)));
    // "idle" (sources loaded and drawn) does not always fire again after setData in WebKit:
    // repaint, then report what is drawn.
    this.map.once("idle", () => {
      this.reportRendered();
    });
    this.map.triggerRepaint();
  }

  moveTo(lat: number, lon: number, zoom: number) {
    const target = { center: [lon, lat] as [number, number], zoom };
    if (reducedMotion()) this.map.jumpTo(target);
    else this.map.flyTo({ ...target, duration: 800 });
  }
}
