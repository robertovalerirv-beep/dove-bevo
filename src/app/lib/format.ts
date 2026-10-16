// Italian formats for prices, dates and distances.
const euro = new Intl.NumberFormat("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = new Intl.DateTimeFormat("it-IT", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const liters = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 });

/** 750 → "7,50 €" */
export const formatPrice = (cents: number) => `${euro.format(cents / 100)} €`;

/** "2026-10-08" → "8 ott 2026" (date only, no time zone shift). */
export function formatDate(isoDay: string): string {
  const [y = 0, m = 1, d = 1] = isoDay.split("-").map(Number);
  return day.format(new Date(Date.UTC(y, m - 1, d)));
}

/** 400 → "0,4 l"; 0 (cocktail serving) → "" */
export const formatSize = (ml: number) => (ml > 0 ? `${liters.format(ml / 1000)} l` : "");

/** 120 → "120 m", 1234 → "1,2 km" */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${String(Math.round(meters / 10) * 10)} m`;
  return `${liters.format(Math.round(meters / 100) / 10)} km`;
}

const romeDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" });

/** Today as "YYYY-MM-DD" in Europe/Rome (D-14). */
export const todayRome = (): string => romeDay.format(new Date());
