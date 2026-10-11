// MapLibre wrapper (SPEC 4, 7.1). Loaded with a dynamic import in parallel with the shell.
// The worker is served by us (no blob: workers, CSP worker-src 'self').
import { AttributionControl, Map as MapLibre, setWorkerUrl, type GeoJSONSource } from "maplibre-gl";
import type { ExpressionSpecification, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { it } from "../i18n/it";

setWorkerUrl(workerUrl);

const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
const TILEJSON_URL = "https://tiles.openfreemap.org/planet";
const { openFreeMap, openMapTiles, openStreetMap } = it.map.attribution;
const ATTRIBUTION =
  `<a href="https://openfreemap.org" target="_blank" rel="noopener">${openFreeMap}</a> ` +
  `<a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">${openMapTiles}</a> ` +
  `<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">${openStreetMap}</a>`;
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
}

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Reads a design token: map overlays use the light price tokens in both themes (MASTER). */
const token = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

async function loadStyle(): Promise<StyleSpecification> {
  // Style and TileJSON in parallel: the TileJSON is inlined so the attribution is exactly ours.
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
        attribution: ATTRIBUTION,
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

/** Stretchable pill image for price labels (icon-text-fit). */
function pillImage(): ImageData {
  const [w, h, r] = [64, 48, 22];
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new ImageData(w, h);
  ctx.beginPath();
  // Rounded rectangle by arcs: roundRect() is missing before Safari 16.
  const [x0, y0, x1, y1] = [2, 2, w - 2, h - 2];
  ctx.moveTo(x0 + r, y0);
  ctx.arcTo(x1, y0, x1, y1, r);
  ctx.arcTo(x1, y1, x0, y1, r);
  ctx.arcTo(x0, y1, x0, y0, r);
  ctx.arcTo(x0, y0, x1, y0, r);
  ctx.closePath();
  ctx.fillStyle = token("--map-pill-bg");
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = token("--map-pill-border");
  ctx.stroke();
  return ctx.getImageData(0, 0, w, h);
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
    this.map.addControl(new AttributionControl({ compact: false }), "bottom-left");
    this.ready = new Promise((resolve) => {
      this.map.on("load", () => {
        this.addLayers();
        resolve();
      });
    });
  }

  static async create(container: HTMLElement): Promise<VenueMap> {
    const map = new VenueMap(container, await loadStyle());
    await map.ready;
    return map;
  }

  private addLayers() {
    const map = this.map;
    const text = token("--map-pill-text");
    const border = token("--map-pill-border");
    const bg = token("--map-pill-bg");
    map.addImage("pill", pillImage(), {
      pixelRatio: 2,
      stretchX: [[22, 42]],
      stretchY: [[22, 26]],
      content: [14, 8, 50, 40],
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
        "circle-color": bg,
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
      paint: { "text-color": text },
    });
    map.addLayer({
      id: "venue-dot",
      type: "circle",
      source: "venues",
      filter: isVenue,
      paint: {
        "circle-radius": 5,
        "circle-color": bg,
        "circle-stroke-color": border,
        "circle-stroke-width": 2,
      },
    });
    map.addLayer({
      id: "venue-price",
      type: "symbol",
      source: "prices",
      layout: {
        "icon-image": "pill",
        "icon-text-fit": "both",
        "text-field": ["get", "label"],
        "text-font": FONT,
        "text-size": TEXT_SIZE,
      },
      paint: { "text-color": text },
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
    this.map.on("idle", () => {
      const features = this.map.queryRenderedFeatures({ layers: ["venue-price"] });
      listener([...new Set(features.map((f) => String(f.properties.label)))].sort());
    });
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

  setVenues(points: VenuePoint[]) {
    const collection = (list: VenuePoint[]) => ({
      type: "FeatureCollection" as const,
      features: list.map((p) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [p.lon, p.lat] },
        properties: { key: p.key, cell: p.cell, label: p.label },
      })),
    });
    void this.map
      .getSource<GeoJSONSource>("venues")
      ?.setData(collection(points.filter((p) => !p.label)));
    void this.map
      .getSource<GeoJSONSource>("prices")
      ?.setData(collection(points.filter((p) => p.label)));
  }

  moveTo(lat: number, lon: number, zoom: number) {
    const target = { center: [lon, lat] as [number, number], zoom };
    if (reducedMotion()) this.map.jumpTo(target);
    else this.map.flyTo({ ...target, duration: 800 });
  }
}
