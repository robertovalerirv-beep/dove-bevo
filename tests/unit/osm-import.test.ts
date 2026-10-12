import { describe, expect, it } from "vitest";
import { buildDataset, ImportError, type OsmFeature } from "../../scripts/osm-import/osm.ts";
import type { CellFile, Place } from "../../src/shared/api-types";

const point = (id: string, lat: number, lon: number, tags: Record<string, string>): OsmFeature => ({
  type: "Feature",
  id,
  geometry: { type: "Point", coordinates: [lon, lat] },
  properties: tags,
});

// A 0.002° square around (45.4650, 9.1900): centroid (45.465, 9.19).
const square = (id: string, tags: Record<string, string>): OsmFeature => ({
  type: "Feature",
  id,
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [9.189, 45.464],
        [9.191, 45.464],
        [9.191, 45.466],
        [9.189, 45.466],
        [9.189, 45.464],
      ],
    ],
  },
  properties: tags,
});

const milano = point("n10282", 45.4642, 9.19, { place: "city", name: "Milano" });
const sesto = point("n555", 45.5363, 9.2328, { place: "town", name: "Sesto San Giovanni" });
const village = point("n777", 45.47, 9.2, { place: "village", name: "Borgo" });
const features = [
  milano,
  sesto,
  village,
  point("n1", 45.46421, 9.19001, {
    amenity: "bar",
    name: "Bar Duomo",
    "addr:street": "Piazza del Duomo",
    "addr:housenumber": "1",
  }),
  point("n2", 45.4643, 9.1902, { amenity: "pub", name: "The Pub" }),
  point("n3", 45.4644, 9.1903, { amenity: "bar" }), // no name: excluded
  point("n4", 45.4645, 9.1904, { amenity: "restaurant", name: "Trattoria" }), // not a bar
  square("w99", { amenity: "cafe", name: "Caffè Area" }),
  { ...square("r42", { amenity: "nightclub", name: "Club" }), id: "r42" },
  point("n5", 41.9028, 12.4964, { amenity: "biergarten", name: "Lontano" }), // > 15 km from places
];

const parse = (files: Map<string, string>, path: string): unknown => {
  const text = files.get(path);
  expect(text, path).toBeDefined();
  return JSON.parse(text ?? "");
};

describe("OSM import (M1-02)", () => {
  const files = buildDataset(features, "20261010");

  it("writes cell files in the D-11 format with correct keys", () => {
    const cell = parse(files, "v/u0nd9.json") as CellFile;
    expect(cell.c).toEqual([[10282, "Milano"]]);
    expect(cell.v).toEqual([
      ["n1", "Bar Duomo", 1, 45.46421, 9.19001, "Piazza del Duomo 1", 0],
      ["n2", "The Pub", 2, 45.4643, 9.1902, "", 0],
      ["r42", "Club", 4, 45.465, 9.19, "", 0],
      ["w99", "Caffè Area", 0, 45.465, 9.19, "", 0],
    ]);
  });

  it("uses -1 when no city or town is within 15 km", () => {
    const rome = [...files.entries()].find(([path]) => path.startsWith("v/sr2"));
    const cell = JSON.parse(rome?.[1] ?? "{}") as CellFile;
    expect(cell.c).toEqual([]);
    expect(cell.v[0]?.[6]).toBe(-1);
  });

  it("writes places.json with only cities and towns, by bar count", () => {
    expect(parse(files, "places.json") as Place[]).toEqual([
      [10282, "Milano", 45.4642, 9.19, 4],
      [555, "Sesto San Giovanni", 45.5363, 9.2328, 0],
    ]);
  });

  it("writes the ODbL license file", () => {
    expect(files.get("LICENSE.txt")).toMatch(/OpenStreetMap contributors/);
    expect(files.get("LICENSE.txt")).toMatch(/ODbL/);
  });

  it("fails above the file-count limit", () => {
    expect(() => buildDataset(features, "x", { maxFiles: 2 })).toThrow(ImportError);
  });

  it("fails when a file is larger than the size limit", () => {
    expect(() => buildDataset(features, "x", { maxFileBytes: 100 })).toThrow(/too large/);
  });

  it("fails on a bar outside Italy or with an overlong name", () => {
    const paris = point("n9", 48.8566, 2.3522, { amenity: "bar", name: "Paris" });
    expect(() => buildDataset([paris], "x")).toThrow(/outside Italy/);
    const long = point("n8", 45.4642, 9.19, { amenity: "bar", name: "x".repeat(121) });
    expect(() => buildDataset([long], "x")).toThrow(/name/);
  });
});

describe("osmium area ids", () => {
  it("maps area ids back to the OSM way or relation (a = 2·way, 2·relation + 1)", () => {
    const files = buildDataset(
      [
        milano,
        { ...square("x", { amenity: "cafe", name: "Area da via" }), id: "a200" },
        { ...square("x", { amenity: "nightclub", name: "Area da relazione" }), id: "a401" },
      ],
      "20261010",
    );
    const cell = JSON.parse(files.get("v/u0nd9.json") ?? "{}") as CellFile;
    expect(cell.v.map((v) => v[0])).toEqual(["r200", "w100"]);
  });
});
