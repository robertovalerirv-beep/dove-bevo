// Geohash encoder and visible-cell cover (SPEC 4, 5.4). Only cell ids leave the device (SPEC 14).
const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

export const CELL_PRECISION = 5;
export const MAX_VISIBLE_CELLS = 12;

export interface Bounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export function encodeGeohash(lat: number, lon: number, precision: number): string {
  let [latMin, latMax, lonMin, lonMax] = [-90, 90, -180, 180];
  let hash = "";
  let bits = 0;
  let value = 0;
  let evenBit = true; // bits alternate, longitude first
  while (hash.length < precision) {
    if (evenBit) {
      const mid = (lonMin + lonMax) / 2;
      value = value * 2 + (lon >= mid ? 1 : 0);
      if (lon >= mid) lonMin = mid;
      else lonMax = mid;
    } else {
      const mid = (latMin + latMax) / 2;
      value = value * 2 + (lat >= mid ? 1 : 0);
      if (lat >= mid) latMin = mid;
      else latMax = mid;
    }
    evenBit = !evenBit;
    if (++bits === 5) {
      hash += BASE32.charAt(value);
      bits = 0;
      value = 0;
    }
  }
  return hash;
}

/** Cells of CELL_PRECISION covering the bounds, or null when more than MAX_VISIBLE_CELLS. */
export function visibleCells(bounds: Bounds): string[] | null {
  if (![bounds.south, bounds.west, bounds.north, bounds.east].every(Number.isFinite)) return null;
  const totalBits = CELL_PRECISION * 5;
  const cellWidth = 360 / 2 ** Math.ceil(totalBits / 2);
  const cellHeight = 180 / 2 ** Math.floor(totalBits / 2);
  const firstLat = Math.floor((Math.max(bounds.south, -90) + 90) / cellHeight);
  const lastLat = Math.floor((Math.min(bounds.north, 90) + 90) / cellHeight);
  const firstLon = Math.floor((bounds.west + 180) / cellWidth);
  const lastLon = Math.floor((bounds.east + 180) / cellWidth);
  if ((lastLat - firstLat + 1) * (lastLon - firstLon + 1) > MAX_VISIBLE_CELLS) return null;

  const cells: string[] = [];
  for (let i = firstLat; i <= lastLat; i++) {
    for (let j = firstLon; j <= lastLon; j++) {
      const lat = Math.min((i + 0.5) * cellHeight - 90, 90);
      const lon = (j + 0.5) * cellWidth - 180;
      cells.push(encodeGeohash(lat, lon, CELL_PRECISION));
    }
  }
  return cells;
}
