import { it } from "../i18n/it";
import { shownPrice, type Venue } from "../lib/data";
import { formatDistance, formatPrice } from "../lib/format";
import { distanceMeters } from "../lib/geo";
import { Sheet } from "./Sheet";

interface Props {
  venues: Venue[];
  drink: string;
  size: number;
  position: { lat: number; lon: number } | null;
  onOpen: (venue: Venue) => void;
  onClose: () => void;
}

/** Accessible alternative to the map (SPEC 7.1): visible bars, keyboard and screen reader friendly. */
export function ListSheet({ venues, drink, size, position, onOpen, onClose }: Props) {
  const rows = venues
    .map((venue) => ({
      venue,
      price: shownPrice(venue, drink, size),
      meters: position ? distanceMeters(position.lat, position.lon, venue.lat, venue.lon) : null,
    }))
    .sort((a, b) =>
      a.meters !== null && b.meters !== null
        ? a.meters - b.meters
        : Number(!a.price) - Number(!b.price) || a.venue.name.localeCompare(b.venue.name, "it"),
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
                  ? `${formatPrice(price[4])}${price[3] === 1 ? ` ${it.bar.happyHour}` : ""}`
                  : it.list.noPrice}
              </span>
              <span class="row__meta">
                {[it.kinds[venue.kind], meters === null ? "" : formatDistance(meters)]
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
