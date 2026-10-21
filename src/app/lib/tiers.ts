// Price tiers against the cell median (D-12) and zone coverage (SPEC 7.1), from data already loaded.
import {
  EMPTY_ZONE_SHARE,
  STALE_DAYS,
  TIER_CHEAP_BELOW,
  TIER_MIN_PRICES,
  TIER_PRICEY_ABOVE,
} from "../../shared/config";
import { bestPrice } from "../../shared/prices";
import type { PriceRow } from "../../shared/api-types";

/** What the tiers need of a bar (the full `Venue` lives in data.ts, which needs Vite). */
interface Venue {
  cell: string;
  pending: boolean;
  prices: PriceRow[];
}

export type Tier = "affare" | "giusto" | "salato" | "neutro";

export function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/** Active normal-hours prices (cents) of a drink in a cell, one per bar. */
export function cellPrices(venues: Venue[], cell: string, drink: string): number[] {
  const cents: number[] = [];
  for (const v of venues) {
    if (v.cell !== cell || v.pending) continue;
    const p = v.prices.find((r) => r[1] === drink && r[2] === 0 && r[6] === 0);
    if (p) cents.push(p[3]);
  }
  return cents;
}

/** Median of the active normal-hours prices of a drink in a cell, null under 5 (D-12). */
export function cellMedian(venues: Venue[], cell: string, drink: string): number | null {
  const cents = cellPrices(venues, cell, drink);
  return cents.length >= TIER_MIN_PRICES ? medianOf(cents) : null;
}

/** "In zona va da X a Y": min, max and median, only with at least 5 prices (MB-10). */
export function cellRange(
  venues: Venue[],
  cell: string,
  drink: string,
): { min: number; max: number; median: number } | null {
  const cents = cellPrices(venues, cell, drink);
  if (cents.length < TIER_MIN_PRICES) return null;
  return { min: Math.min(...cents), max: Math.max(...cents), median: medianOf(cents) };
}

/** Distinct prices already seen in a cell, most common first (then cheaper), at most `limit`. */
export function seenPrices(venues: Venue[], cell: string, drink: string, limit = 6): number[] {
  const counts = new Map<number, number>();
  for (const c of cellPrices(venues, cell, drink)) counts.set(c, (counts.get(c) ?? 0) + 1);
  return [...counts]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, limit)
    .map(([c]) => c)
    .sort((a, b) => a - b);
}

export function tierOf(cents: number, median: number | null): Tier {
  if (median === null) return "neutro";
  if (cents < median * TIER_CHEAP_BELOW) return "affare";
  if (cents > median * TIER_PRICEY_ABOVE) return "salato";
  return "giusto";
}

/** Whole days between two "YYYY-MM-DD" dates; more than STALE_DAYS means "da confermare". */
export function isStale(observedOn: string, today: string): boolean {
  const days = (Date.parse(today) - Date.parse(observedOn)) / 86_400_000;
  return days > STALE_DAYS;
}

export interface Coverage {
  withPrice: number;
  total: number;
  empty: boolean;
}

/** "X bar of N here have a price": same rule as the pins, so the two numbers always agree. */
export function coverage(venues: Venue[], drinks: readonly string[]): Coverage {
  const withPrice = venues.filter((v) => bestPrice(v, drinks)).length;
  const total = venues.length;
  return { withPrice, total, empty: total > 0 && withPrice / total < EMPTY_ZONE_SHARE };
}
