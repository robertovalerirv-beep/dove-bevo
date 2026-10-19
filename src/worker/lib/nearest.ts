// The nearest place of places.json to a point (ADR 0022, 0025). Pure: no Worker types.
import type { Place } from "../../shared/api-types";
import { distanceMeters } from "../../shared/venue";

export interface SortedPlace {
  place: Place;
  /** Position in places.json: the first of two equally near places wins, as in a plain scan. */
  index: number;
}

/** Lower bound of the metres in one degree of latitude (the true value is 111,195 m). */
const LAT_DEGREE_METERS = 111_000;

/**
 * The closest place however far (a bar always belongs to some city), found on the list sorted by
 * latitude: start at the bar's latitude and walk outwards, stopping when the next place is already
 * farther in latitude alone than the best one found. Same answer as a scan of all places, but only
 * the places around the bar are measured (ADR 0025).
 */
export function nearestPlace(
  sorted: readonly SortedPlace[],
  lat: number,
  lon: number,
): number | null {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if ((sorted[mid]?.place[2] ?? Infinity) < lat) low = mid + 1;
    else high = mid;
  }
  let down = low - 1;
  let up = low;
  let best: SortedPlace | null = null;
  let bestMeters = Infinity;
  for (;;) {
    const below = sorted[down];
    const above = sorted[up];
    const goDown =
      below !== undefined && (above === undefined || lat - below.place[2] <= above.place[2] - lat);
    const next = goDown ? below : above;
    if (!next) break;
    if (Math.abs(next.place[2] - lat) * LAT_DEGREE_METERS > bestMeters) break;
    if (goDown) down--;
    else up++;
    const meters = distanceMeters(lat, lon, next.place[2], next.place[3]);
    if (meters < bestMeters || (meters === bestMeters && next.index < (best?.index ?? Infinity))) {
      bestMeters = meters;
      best = next;
    }
  }
  return best ? best.place[0] : null;
}

/** The places sorted by latitude, with their place in the file for ties. */
export const sortByLatitude = (places: readonly Place[]): SortedPlace[] =>
  places
    .map((place, index): SortedPlace => ({ place, index }))
    .sort((a, b) => a.place[2] - b.place[2] || a.index - b.index);
