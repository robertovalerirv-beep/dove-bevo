import type { Price, Venue } from "./model";
import { servingKey, validServing } from "./model";

/**
 * Native-only command. Both phone apps must re-read the live venue row before
 * writing a private favourite. The ordered fields are part of the bridge ABI.
 */
export function europeDrinkSaveURL(venue: Venue, row: Price): string {
  if (
    row.venue !== venue.key ||
    row.cell !== venue.cell ||
    row.currency !== venue.currency ||
    !validServing(row.drink, row.serving)
  )
    throw new TypeError("Invalid European drink save identity");
  const params = new URLSearchParams([
    ["path", `/bar/${venue.key}`],
    ["c", venue.cell],
    ["save_europe", row.drink],
    ["band", row.hh ? "happy_hour" : "normal"],
    ["currency", row.currency],
    ["serving", servingKey(row.serving)],
  ]);
  return `/mobile/?${params.toString()}`;
}
