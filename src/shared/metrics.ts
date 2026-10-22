// Daily usage figures for /admin (SPEC 7.9, 12), summed from the rows of metrics_daily.
export interface MetricRow {
  day: string;
  event: string;
  prop: string;
  n: number;
}

export interface MetricsDay {
  day: string;
  /** Visits (app_open). */
  opens: number;
  /** Visits by someone who had used the app on an earlier day (day_bucket other than "0"). */
  returning: number;
  added: number;
  confirmed: number;
  viewed: number;
  /** Visits in which at least one price was entered. */
  contributed: number;
}

/**
 * An event with several props writes one row per prop, each +1, so the events are the rows of
 * one prop kind added up, or the largest kind; events without props are the "-" row.
 */
function count(rows: MetricRow[]): number {
  const kinds = new Map<string, number>();
  for (const { prop, n } of rows) {
    const kind = prop === "-" ? "-" : prop.slice(0, prop.indexOf(":"));
    kinds.set(kind, (kinds.get(kind) ?? 0) + n);
  }
  const bare = kinds.get("-") ?? 0;
  kinds.delete("-");
  return bare + Math.max(0, ...kinds.values());
}

/** One line per day with data, newest first. */
export function summarizeMetrics(rows: MetricRow[]): MetricsDay[] {
  const byDay = new Map<string, MetricRow[]>();
  for (const row of rows) byDay.set(row.day, [...(byDay.get(row.day) ?? []), row]);
  return [...byDay]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([day, all]) => {
      const of = (event: string) => all.filter((r) => r.event === event);
      return {
        day,
        opens: count(of("app_open")),
        returning: of("app_open")
          .filter((r) => r.prop.startsWith("day_bucket:") && r.prop !== "day_bucket:0")
          .reduce((sum, r) => sum + r.n, 0),
        added: count(of("price_added")),
        confirmed: count(of("price_confirmed")),
        viewed: count(of("venue_viewed")),
        contributed: count(of("visit_contributed")),
      };
    });
}
