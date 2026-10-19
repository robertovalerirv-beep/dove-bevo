// Theme by time of day (SPEC D-27, ADR 0025): Bancone (light) by day, Fuori orario (dark) from
// 21:30 to 06:00 on the device clock. The phone's own dark setting is NOT followed: someone with a
// dark phone would never see the light theme, which is the main one (docs/brand/01-strategia.md).
// public/theme.js repeats this rule for the first paint (CSP forbids an inline script);
// tests/unit/theme.test.ts keeps the two identical.

export type Theme = "light" | "dark";

/** Minutes from midnight at which Fuori orario starts (21:30) and ends (06:00). */
export const DARK_FROM = 21 * 60 + 30;
export const DARK_UNTIL = 6 * 60;

const minutesOf = (date: Date): number => date.getHours() * 60 + date.getMinutes();

export function themeAt(date: Date): Theme {
  const minutes = minutesOf(date);
  return minutes >= DARK_FROM || minutes < DARK_UNTIL ? "dark" : "light";
}

/** Milliseconds until the theme changes next (never less than a second: no tight timer loop). */
export function msToNextChange(date: Date): number {
  const minutes = minutesOf(date);
  const target = themeAt(date) === "dark" ? DARK_UNTIL : DARK_FROM;
  const wait = (((target - minutes) % 1440) + 1440) % 1440; // minutes, always > 0 here
  const ms = wait * 60_000 - date.getSeconds() * 1000 - date.getMilliseconds();
  return Math.max(ms, 1000);
}
