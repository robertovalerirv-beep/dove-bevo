import { describe, expect, it } from "vitest";
import {
  buildDataset,
  buildSearchIndex,
  ImportError,
  type OsmFeature,
  type SearchEntry,
} from "../../scripts/osm-import/osm.ts";
import { fragmentName, searchWords, significantWords, STOP_WORDS } from "../../src/shared/venue";

// M4-11 (ADR 0024): one normalisation for the import and the client, fragments by word prefix.
describe("search words", () => {
  it.each([
    ["Caffè", ["caffe"], []],
    ["l'Osteria", ["l", "osteria"], ["osteria"]],
    ["Bar Sport", ["bar", "sport"], ["sport"]],
    ["Più", ["piu"], ["piu"]],
    ["Trattoria da Mario", ["trattoria", "da", "mario"], ["trattoria", "mario"]],
    ["Caffè Roma", ["caffe", "roma"], ["roma"]],
    ["Bar & Co.", ["bar", "co"], []],
  ])("%s", (name, all, significant) => {
    expect(searchWords(name)).toEqual(all);
    expect(significantWords(name)).toEqual(significant);
  });
  it("has the stop words of the ADR", () => {
    expect([...STOP_WORDS].sort()).toEqual(
      "bar caffe cafe pub di da del della dei delle dal la il lo le gli the and e al alla ai in con"
        .split(" ")
        .sort(),
    );
  });
  it("file names have only [a-z0-9]", () => {
    expect(fragmentName("ca")).toBe("ca");
    expect(fragmentName("ñ1")).toBe("_1");
  });
});

const entry = (key: string, name: string): SearchEntry => [key, name, 45.46, 9.19, 10282];

describe("buildSearchIndex", () => {
  it("writes [key, name, lat, lon, cityId] under the 2-character prefix of each significant word", () => {
    const files = buildSearchIndex([entry("n1", "Caffè Roma"), entry("n2", "Bar Sport")]);
    expect([...files.keys()].sort()).toEqual(["s/index.json", "s/ro.json", "s/sp.json"]);
    expect(JSON.parse(files.get("s/ro.json") ?? "")).toEqual([
      ["n1", "Caffè Roma", 45.46, 9.19, 10282],
    ]);
    expect(JSON.parse(files.get("s/index.json") ?? "")).toEqual([]);
  });
  it("a bar appears once per fragment even with two words under the same prefix", () => {
    const files = buildSearchIndex([entry("n1", "Sporting Sport Club")]);
    expect(JSON.parse(files.get("s/sp.json") ?? "")).toHaveLength(1);
  });
  it("names made only of stop words are not indexed", () => {
    const files = buildSearchIndex([entry("n1", "Bar"), entry("n2", "Caffè"), entry("n3", "Pub")]);
    expect([...files.keys()]).toEqual(["s/index.json"]);
  });
  it("splits a prefix over the limit in 3 characters and lists it in the index", () => {
    // Names that do not compress: gzip must really exceed the limit.
    const token = (i: number) => ((i * 2654435761) >>> 0).toString(36);
    const rows = Array.from({ length: 300 }, (_, i) =>
      entry(
        `n${String(i + 1)}`,
        `${["caa", "cab", "cac"][i % 3] ?? ""}${token(i)} ${token(i + 999)}`,
      ),
    );
    const files = buildSearchIndex(rows, 3000);
    expect(JSON.parse(files.get("s/index.json") ?? "")).toEqual(["ca"]);
    expect([...files.keys()]).toEqual(
      expect.arrayContaining(["s/caa.json", "s/cab.json", "s/cac.json"]),
    );
    expect(files.has("s/ca.json")).toBe(false);
  });
  it("fails when a fragment is still over the limit", () => {
    const rows = Array.from({ length: 50 }, (_, i) =>
      entry(`n${String(i + 1)}`, `Zeta${"q".repeat(i + 40)}`),
    );
    expect(() => buildSearchIndex(rows, 200)).toThrow(ImportError);
  });
});

describe("buildDataset", () => {
  const point = (
    id: string,
    lat: number,
    lon: number,
    tags: Record<string, string>,
  ): OsmFeature => ({
    type: "Feature",
    id,
    geometry: { type: "Point", coordinates: [lon, lat] },
    properties: tags,
  });
  const features = [
    point("n10282", 45.4642, 9.19, { place: "city", name: "Milano" }),
    point("n1", 45.46421, 9.19001, { amenity: "bar", name: "Bar Sport" }),
    point("n2", 41.9028, 12.4964, { amenity: "bar", name: "Caffè Roma" }), // no city within 15 km
  ];
  it("adds the fragments, with the OSM id of the city (0 when none)", () => {
    const files = buildDataset(features, "20261016");
    expect(JSON.parse(files.get("s/sp.json") ?? "")).toEqual([
      ["n1", "Bar Sport", 45.46421, 9.19001, 10282],
    ]);
    expect(JSON.parse(files.get("s/ro.json") ?? "")).toEqual([
      ["n2", "Caffè Roma", 41.9028, 12.4964, 0],
    ]);
    expect(files.has("s/index.json")).toBe(true);
  });
  it("counts the fragments in the file limit", () => {
    expect(() => buildDataset(features, "20261016", { maxFiles: 3 })).toThrow(ImportError);
  });
});
