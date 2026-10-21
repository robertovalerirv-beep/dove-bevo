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

/** 120 → "120 m", 1234 → "1,2 km" */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${String(Math.round(meters / 10) * 10)} m`;
  return `${liters.format(Math.round(meters / 100) / 10)} km`;
}

const stampDay = new Intl.DateTimeFormat("it-IT", {
  day: "numeric",
  month: "short",
  timeZone: "Europe/Rome",
});

/** The date of the Timbro, like a postmark: "17 OTT" (day and month only, never the time). */
export const formatStampDay = (date = new Date()): string =>
  stampDay.format(date).replace(".", "").toUpperCase();

const romeDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" });

/** Today as "YYYY-MM-DD" in Europe/Rome (D-14). */
export const todayRome = (): string => romeDay.format(new Date());
