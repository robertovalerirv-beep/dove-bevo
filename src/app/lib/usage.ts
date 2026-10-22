import type { DayBucket } from "../../shared/events";
// What stays on the device about this person's use (SPEC 12, D-29): the day of the first use and
// how many prices they entered. Nothing else, nothing sent. Feeds the Tessera and, in F5, the
// install invitation.
const FIRST_USE = "dovebevo-first-use";
const PRICES = "dovebevo-prices";

/** Stamps of the Tessera: prices entered (D-29). */
export const TESSERA_STEPS = [1, 5, 10, 25, 50] as const;
export type TesseraStep = (typeof TESSERA_STEPS)[number];

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // private window or blocked storage: the app works without it
  }
};
const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // see read()
  }
};

export function priceCount(): number {
  const n = Number(read(PRICES));
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/** Adds (or, after "Annulla", takes back) entered prices; returns the new total. */
export function addPrices(delta: number, today: string): number {
  if (read(FIRST_USE) === null) write(FIRST_USE, today);
  const next = Math.max(0, priceCount() + delta);
  write(PRICES, String(next));
  return next;
}

/** The highest Tessera stamp passed when going from `before` to `after` prices, if any. */
export function stampReached(before: number, after: number): TesseraStep | null {
  const passed = TESSERA_STEPS.filter((s) => s > before && s <= after);
  return passed[passed.length - 1] ?? null;
}

/** Stamps the day of the first use (once) and buckets the days since then for the return metric (SPEC 12). */
export function dayBucket(today: string): DayBucket {
  const first = read(FIRST_USE);
  if (first === null) {
    write(FIRST_USE, today);
    return "0";
  }
  const days = Math.round((Date.parse(today) - Date.parse(first)) / 86_400_000);
  if (!(days > 0)) return "0";
  return days <= 7 ? "1-7" : days <= 30 ? "8-30" : "30+";
}
