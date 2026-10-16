import type { PriceRow } from "./api-types";

/** Price shown for a drink and size: the normal one, else the happy-hour one (D-13). Active only. */
export function shownPrice(
  venue: { prices: PriceRow[] },
  drink: string,
  size: number,
): PriceRow | undefined {
  const rows = venue.prices.filter((p) => p[1] === drink && p[2] === size && p[7] === 0);
  return rows.find((p) => p[3] === 0) ?? rows.find((p) => p[3] === 1);
}
