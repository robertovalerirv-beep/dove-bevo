import type { CellFile } from "../../shared/api-types";
import { getUserVenue, isHidden } from "./db";
import { ApiError } from "./errors";

/** An OSM bar as listed in the static file of its cell (the client is never trusted), or null. */
export async function osmVenue(
  env: Env,
  venue: string,
  cell: string,
): Promise<{ name: string; city: number | null } | null> {
  const response = await env.ASSETS.fetch(
    `https://assets.local/data/${env.DATA_VERSION}/v/${cell}.json`,
  );
  if (!response.headers.get("content-type")?.includes("application/json")) return null;
  const file: CellFile = await response.json();
  const row = file.v.find((v) => v[0] === venue);
  return row ? { name: row[1], city: file.c[row[6]]?.[0] ?? null } : null;
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
