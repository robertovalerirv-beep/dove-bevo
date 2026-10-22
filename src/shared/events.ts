// Anonymous usage events (SPEC 12, D-06): the only things the client may report, as a closed list.
export const EVENT_NAMES = ["app_open", "price_added", "price_confirmed", "venue_viewed"] as const;
export type EventName = (typeof EVENT_NAMES)[number];

/** Days since the first use, bucketed so a single person cannot be told apart (SPEC 12). */
export const DAY_BUCKETS = ["0", "1-7", "8-30", "30+"] as const;
export type DayBucket = (typeof DAY_BUCKETS)[number];

export interface AppEvent {
  e: EventName;
  /**
   * Every value comes from a closed list, so the rows of metrics_daily stay bounded. `city` (SPEC 12)
   * is left out until it is used: it would have to be checked against the known OSM ids.
   */
  p?: { day_bucket?: DayBucket; source?: "manual"; drink?: string };
}

export interface EventsBody {
  events: AppEvent[];
}

/** A beacon carries at most this many events and 2 KB (D-06). */
export const MAX_EVENTS = 10;
export const EVENTS_BODY_LIMIT = 2048;
