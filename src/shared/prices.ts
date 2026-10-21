import type { PriceRow } from "./api-types";

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
