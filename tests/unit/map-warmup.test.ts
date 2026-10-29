import { afterEach, describe, expect, it, vi } from "vitest";
import { mapWarmupMeta, mapWarmupPaths } from "../../scripts/map-warmup.ts";
import { warmUpMapWhenIdle, warmupFiles } from "../../src/app/lib/map-warmup.ts";

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

// ADR 0045: the download of the map waits for the largest contentful paint (the photo of the map), so it never
// shares the line with the picture the visitor is waiting for.
describe("warmUpMapWhenIdle", () => {
  const META =
    "/assets/maplibre-map-A.js /assets/maplibre-map-B.css /assets/maplibre-gl-worker-C.mjs";
  let paint: (() => void) | undefined;
  let fetched: string[];

  function page(observe: () => void) {
    fetched = [];
    paint = undefined;
    vi.useFakeTimers();
    vi.stubGlobal("window", globalThis);
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("document", {
      readyState: "complete",
      querySelector: () => ({ getAttribute: () => META }),
    });
    vi.stubGlobal("requestIdleCallback", (run: () => void) => {
      run();
    });
    vi.stubGlobal("fetch", (href: string) => {
      fetched.push(href);
      return Promise.resolve({ ok: false });
    });
    vi.stubGlobal(
      "PerformanceObserver",
      class {
        constructor(callback: (list: unknown, observer: { disconnect(): void }) => void) {
          paint = () => {
            callback({}, { disconnect: () => undefined });
          };
        }
        observe = observe;
        disconnect = () => undefined;
      },
    );
  }

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("fetches nothing before the paint, however long it takes", () => {
    page(() => undefined);
    warmUpMapWhenIdle();
    vi.advanceTimersByTime(60_000);
    expect(fetched).toEqual([]);
  });

  it("fetches the three files a moment after the paint, in an idle moment", () => {
    page(() => undefined);
    warmUpMapWhenIdle();
    paint?.();
    vi.advanceTimersByTime(299);
    expect(fetched).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(fetched).toEqual(META.split(" "));
  });

  it("waits 3 s and goes on where the browser does not report the paint", () => {
    page(() => {
      throw new TypeError("unsupported entry type");
    });
    warmUpMapWhenIdle();
    vi.advanceTimersByTime(2999);
    expect(fetched).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(fetched).toEqual(META.split(" "));
  });
});
