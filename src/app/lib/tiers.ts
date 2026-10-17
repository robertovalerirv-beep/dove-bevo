// Price tiers against the cell median (D-12) and zone coverage (SPEC 7.1), from data already loaded.
import {
  EMPTY_ZONE_SHARE,
  STALE_DAYS,
  TIER_CHEAP_BELOW,
  TIER_MIN_PRICES,
  TIER_PRICEY_ABOVE,
} from "../../shared/config";
import { shownPrice } from "../../shared/prices";
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

/** Median of the active normal-hours prices of a drink and size in a cell, null under 5 (D-12). */
export function cellMedian(
  venues: Venue[],
  cell: string,
  drink: string,
  size: number,
): number | null {
  const cents: number[] = [];
  for (const v of venues) {
    if (v.cell !== cell || v.pending) continue;
    const p = v.prices.find((r) => r[1] === drink && r[2] === size && r[3] === 0 && r[7] === 0);
    if (p) cents.push(p[4]);
  }
  return cents.length >= TIER_MIN_PRICES ? medianOf(cents) : null;
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
export function coverage(venues: Venue[], drink: string, size: number): Coverage {
  const withPrice = venues.filter((v) => shownPrice(v, drink, size)).length;
  const total = venues.length;
  return { withPrice, total, empty: total > 0 && withPrice / total < EMPTY_ZONE_SHARE };
}
