import { publicFetch } from "./platform";
// Approved user bars for the name search (ADR 0025). The list is short and carries no query.
import type { ApprovedVenues } from "../../shared/api-types";
import type { Hit } from "./search-match";

/**
 * Approved user bars (not in the static files), read once per visit. A failure only leaves them out
 * of the results: the OSM bars are still found, and the next search tries again.
 */
let userBars: Promise<Hit[]> | null = null;
export function loadUserBars(): Promise<Hit[]> {
  userBars ??= publicFetch("/api/venues/approved")
    .then(async (response) => {
      const isJson = response.headers.get("content-type")?.includes("application/json") ?? false;
      if (!response.ok || !isJson) throw new Error("approved venues unavailable");
      const { v } = (await response.json()) as ApprovedVenues;
      return v.map(([key, name, , lat, lon]): Hit => [key, name, lat, lon, 0]);
    })
    .catch(() => {
      userBars = null;
      return [];
    });
  return userBars;
}
