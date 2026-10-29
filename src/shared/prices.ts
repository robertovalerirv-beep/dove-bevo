import type { PriceRow } from "./api-types";

/** Median of a list of prices (0 for an empty list); the input is not changed. */
export function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/** Price shown for a drink: the normal one, else the happy-hour one (D-13). Active only. */
export function shownPrice(venue: { prices: PriceRow[] }, drink: string): PriceRow | undefined {
  const rows = venue.prices.filter((p) => p[1] === drink && p[6] === 0);
  return rows.find((p) => p[2] === 0) ?? rows.find((p) => p[2] === 1);
}

/**
 * The cheapest shown price among the chosen drinks (the map pin with several drinks selected); on a
 * tie the most recent one. Undefined if the bar has none of them.
 */
export function bestPrice(
  venue: { prices: PriceRow[] },
  drinks: readonly string[],
): PriceRow | undefined {
  let best: PriceRow | undefined;
  for (const drink of drinks) {
    const row = shownPrice(venue, drink);
    if (row && (!best || row[3] < best[3] || (row[3] === best[3] && row[4] > best[4]))) best = row;
  }
  return best;
}
