import { describe, expect, it } from "vitest";
import { mapWarmupMeta, mapWarmupPaths } from "../../scripts/map-warmup.ts";
import { warmupFiles } from "../../src/app/lib/map-warmup.ts";

// SPEC 1.12, MF-01: the build tells the page which files make the map (names carry a hash), the page
// fetches them ahead of time without running them.
const FILES = [
  "index.html",
  "assets/index-A.js",
  "assets/index-C.css",
  "assets/maplibre-map-DO15NJI-.js",
  "assets/maplibre-map-qvkd0SPb.css",
  "assets/maplibre-gl-worker-BrB25tGK.mjs",
  "assets/AdminPage-E.js",
];

describe("mapWarmupPaths", () => {
  it("finds the map chunk, its stylesheet and its worker, and nothing else", () => {
    expect(mapWarmupPaths(FILES)).toEqual([
      "/assets/maplibre-map-DO15NJI-.js",
      "/assets/maplibre-map-qvkd0SPb.css",
      "/assets/maplibre-gl-worker-BrB25tGK.mjs",
    ]);
  });

  it("gives nothing when the map chunk is not in the build", () => {
    expect(mapWarmupPaths(["assets/index-A.js", "assets/maplibre-map-X.css"])).toEqual([]);
  });
});

describe("mapWarmupMeta", () => {
  it("is a meta tag with the paths separated by a space", () => {
    expect(mapWarmupMeta(["/assets/a.js", "/assets/b.css"])).toBe(
      '<meta name="map-chunk" content="/assets/a.js /assets/b.css">',
    );
  });

  it("is empty when there is nothing to fetch", () => {
    expect(mapWarmupMeta([])).toBe("");
  });
});

describe("warmupFiles", () => {
  const content =
    "/assets/maplibre-map-A.js /assets/maplibre-map-B.css /assets/maplibre-gl-worker-C.mjs";

  it("lists the three files, in that order", () => {
    expect(warmupFiles(content, false)).toEqual(content.split(" "));
  });

  it("does nothing without the meta tag (development server) or with the data saver on", () => {
    expect(warmupFiles(null, false)).toEqual([]);
    expect(warmupFiles("", false)).toEqual([]);
    expect(warmupFiles(content, true)).toEqual([]);
  });

  it("ignores anything that is not a script or stylesheet path of this site", () => {
    expect(
      warmupFiles(
        "https://evil.example/x.js //evil.example/y.js /assets/ok.js javascript:1 /data/x.json /",
        false,
      ),
    ).toEqual(["/assets/ok.js"]);
  });
});
