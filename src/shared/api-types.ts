// Compact formats shared by the import script, the Worker and the client (SPEC 5.1, 9.2, D-11).

/** Bar kind: 0 cafe, 1 bar, 2 pub, 3 biergarten, 4 nightclub. */
export type VenueKind = 0 | 1 | 2 | 3 | 4;

/** [key, name, kind, lat, lon, addr, ci]: `ci` indexes the file's city table, -1 if none. */
export type CellVenue = [string, string, VenueKind, number, number, string, number];

/** Static file `data/<DATA_VERSION>/v/<geohash5>.json`. */
export interface CellFile {
  /** [cityId (OSM node id of the place), name] */
  c: [number, string][];
  v: CellVenue[];
}

/** `places.json` row: [cityId, name, lat, lon, nBars], sorted by nBars descending. */
export type Place = [number, string, number, number, number];
