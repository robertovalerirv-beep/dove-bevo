import type { CellFile, Place } from "../../shared/api-types";
import { distanceMeters, DUPLICATE_METERS, sameName } from "../../shared/venue";
import { getUserVenue, isHidden, venuesInCell } from "./db";
import { ApiError } from "./errors";

/** The static file of a cell, or null when the cell has no bars (the SPA fallback is HTML). */
export async function cellFile(env: Env, cell: string): Promise<CellFile | null> {
  const response = await env.ASSETS.fetch(
    `https://assets.local/data/${env.DATA_VERSION}/v/${cell}.json`,
  );
  if (!response.headers.get("content-type")?.includes("application/json")) return null;
  return await response.json();
}

/** places.json of the deployed data (cities and towns by OSM id), or [] if it is missing. */
export async function placesFile(env: Env): Promise<Place[]> {
  const response = await env.ASSETS.fetch(
    `https://assets.local/data/${env.DATA_VERSION}/places.json`,
  );
  if (!response.headers.get("content-type")?.includes("application/json")) return [];
  return await response.json();
}

/** An OSM bar as listed in the static file of its cell (the client is never trusted), or null. */
export async function osmVenue(
  env: Env,
  venue: string,
  cell: string,
): Promise<{ name: string; city: number | null } | null> {
  const file = await cellFile(env, cell);
  const row = file?.v.find((v) => v[0] === venue);
  return row && file ? { name: row[1], city: file.c[row[6]]?.[0] ?? null } : null;
}

/**
 * A known bar with the same name within 50 m: an OSM bar, or a proposed, approved or recently
 * rejected one (a rejection blocks the same proposal for 30 days). `key` is null for a rejection.
 */
export async function findDuplicate(
  env: Env,
  v: { name: string; lat: number; lon: number; cell: string },
  rejectedSince: string,
): Promise<{ key: string | null; pending: boolean } | null> {
  const near = (lat: number, lon: number) =>
    distanceMeters(v.lat, v.lon, lat, lon) < DUPLICATE_METERS;
  const osm = (await cellFile(env, v.cell))?.v.find(
    (r) => sameName(r[1], v.name) && near(r[3], r[4]),
  );
  if (osm) return { key: osm[0], pending: false };
  const user = (await venuesInCell(env.DB, v.cell)).find(
    (r) =>
      sameName(r.name, v.name) &&
      near(r.lat, r.lon) &&
      (r.status !== "removed" || (r.day ?? "") >= rejectedSince),
  );
  if (!user) return null;
  return {
    key: user.status === "removed" ? null : `u${String(user.id)}`,
    pending: user.status === "pending",
  };
}

/** Cell and city of a bar, from the static file for OSM bars or D1 for user bars (SPEC 8). */
export async function resolveVenue(
  env: Env,
  venue: string,
  cell: string,
): Promise<{ cell: string; city: number | null }> {
  if (venue.startsWith("u")) {
    const user = await getUserVenue(env.DB, Number(venue.slice(1)));
    if (user?.cell !== cell) throw new ApiError("bad_request");
    return { cell, city: null };
  }
  const found = await osmVenue(env, venue, cell);
  // Hidden by the admin (not a bar, closed): no new prices (ADR 0017).
  if (!found || (await isHidden(env.DB, venue))) throw new ApiError("bad_request");
  return { cell, city: found.city };
}
