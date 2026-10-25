// Opening hours of a verified bar (SPEC 1.9, D-34): written by the admin, shown as text on the bar page.
// One rule for the Worker (behind zod) and the admin form, so both refuse the same things.

/** A range of the day, "HH:MM" to "HH:MM"; a close before the open ends after midnight. */
export type HoursRange = [string, string];
/** A day: [] when closed, otherwise up to two ranges. */
export type DayHours = HoursRange[];
/** Seven days, Monday first. */
export type WeekHours = DayHours[];

export const DAYS_IN_WEEK = 7;
export const MAX_RANGES = 2;
export const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const isTime = (value: unknown): value is string => typeof value === "string" && TIME.test(value);

/** One day of the week: closed, or up to two ranges in order (MD-03). */
export function isValidDay(day: unknown): day is DayHours {
  if (!Array.isArray(day) || day.length > MAX_RANGES) return false;
  const ranges = day as unknown[];
  for (const [i, range] of ranges.entries()) {
    if (!Array.isArray(range) || range.length !== 2) return false;
    const [open, close] = range as unknown[];
    if (!isTime(open) || !isTime(close) || open === close) return false;
    // Only the last range of the day may run past midnight.
    if (close < open && i < ranges.length - 1) return false;
    const next = ranges[i + 1] as [string, string] | undefined;
    if (next && !(close < next[0])) return false; // in order, not touching
  }
  return true;
}

/** Seven days of up to two non-overlapping ranges each (MD-03). */
export function isValidWeek(value: unknown): value is WeekHours {
  return Array.isArray(value) && value.length === DAYS_IN_WEEK && value.every(isValidDay);
}

/** "18:00–02:00" */
export const rangeText = ([open, close]: HoursRange): string => `${open}–${close}`;
