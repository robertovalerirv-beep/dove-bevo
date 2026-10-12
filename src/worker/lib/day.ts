// Every "day" (price date, quotas, daily salt, AI budget) is the Europe/Rome calendar day (D-14).
const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "YYYY-MM-DD" in Europe/Rome. */
export const romeDay = (at: Date = new Date()) => formatter.format(at);
