import type { CellFile } from "../../shared/api-types";
import { getUserVenue } from "./db";
import { ApiError } from "./errors";

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
  const response = await env.ASSETS.fetch(
    `https://assets.local/data/${env.DATA_VERSION}/v/${cell}.json`,
  );
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw new ApiError("bad_request");
  const file: CellFile = await response.json();
  const row = file.v.find((v) => v[0] === venue);
  if (!row) throw new ApiError("bad_request");
  return { cell, city: file.c[row[6]]?.[0] ?? null };
}
