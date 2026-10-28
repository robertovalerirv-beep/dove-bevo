import { it } from "../i18n/lang";
import { bestPrice, type Venue } from "../lib/data";
import { formatDistance, formatPrice, todayRome } from "../lib/format";
import { compareListRows } from "../lib/list-order";
import { isStale } from "../lib/tiers";
import { distanceMeters } from "../../shared/venue";
import { Sheet } from "./Sheet";
import { VerifiedBadge } from "./Verified";

interface Props {
  venues: Venue[];
  /** The drinks chosen on the map: each bar shows the cheapest of them. */
  drinks: readonly string[];
  position: { lat: number; lon: number } | null;
  onOpen: (venue: Venue) => void;
  onClose: () => void;
}

/**
 * Accessible alternative to the map (SPEC 7.1): visible bars, keyboard and screen reader friendly.
 * Bars with «Gestore verificato» come first, marked «Sponsorizzato» (D-34, lib/list-order.ts).
 */
export function ListSheet({ venues, drinks, position, onOpen, onClose }: Props) {
  const today = todayRome();
  const rows = venues
    .map((venue) => ({
      venue,
      price: bestPrice(venue, drinks),
      meters: position ? distanceMeters(position.lat, position.lon, venue.lat, venue.lon) : null,
    }))
    .sort((a, b) =>
      compareListRows(
        {
          name: a.venue.name,
          verified: a.venue.verified,
          priced: Boolean(a.price),
          meters: a.meters,
        },
        {
          name: b.venue.name,
          verified: b.venue.verified,
          priced: Boolean(b.price),
          meters: b.meters,
        },
      ),
    );
  return (
    <Sheet title={it.list.title} onClose={onClose}>
      {rows.length === 0 && <p class="hint">{it.list.empty}</p>}
      <ul class="rows">
        {rows.map(({ venue, price, meters }) => (
          <li key={venue.key}>
            {/* Explicit tabindex: Safari/WebKit skips links on Tab by default. */}
            <a
              class="row"
              tabIndex={0}
              href={`/bar/${venue.key}?c=${venue.cell}`}
              onClick={(e) => {
                e.preventDefault();
                onOpen(venue);
              }}
            >
              <span class="row__name">{venue.name}</span>
              <span class={price ? "row__price" : "row__price row__price--none"}>
                {price
                  ? `${formatPrice(price[3])}${price[2] === 1 ? ` ${it.bar.happyHour}` : ""}`
                  : it.list.noPrice}
              </span>
              {venue.verified && (
                <span class="row__badge">
                  <VerifiedBadge />
                </span>
              )}
              <span class="row__meta">
                {[
                  it.kinds[venue.kind],
                  price && drinks.length > 1 ? it.drinks[price[1]] : "",
                  // The dashed pin of an old price, said in words (SPEC 7.1, M4-05).
                  price && isStale(price[4], today) ? it.bar.toConfirm : "",
                  meters === null ? "" : formatDistance(meters),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
