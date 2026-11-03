import { it } from "@site/app/i18n/lang";
import { bestPrice, type Venue } from "@site/app/lib/data";
import { formatDistance, formatPrice, todayRome } from "@site/app/lib/format";
import { compareListRows } from "@site/app/lib/list-order";
import { isStale } from "@site/app/lib/tiers";
import { Sheet } from "@site/app/components/Sheet";
import { VerifiedBadge } from "@site/app/components/Verified";
import { distanceMeters } from "@site/shared/venue";
import { mobileAllCount, mobileMenuPin } from "../menu-v2";

interface Props {
  venues: Venue[];
  drinks: readonly string[];
  position: { lat: number; lon: number } | null;
  onOpen: (venue: Venue) => void;
  onClose: () => void;
}

/** App-only list: unfiltered source counts never masquerade as drink prices. */
export function ListSheet({ venues, drinks, position, onOpen, onClose }: Props) {
  const today = todayRome();
  const rows = venues
    .map((venue) => {
      const price = bestPrice(venue, drinks);
      const menuPrice = drinks.length && !price ? mobileMenuPin(venue, drinks) : null;
      const count = drinks.length === 0 ? mobileAllCount(venue) : null;
      return {
        venue,
        price,
        menuPrice,
        count,
        meters: position ? distanceMeters(position.lat, position.lon, venue.lat, venue.lon) : null,
      };
    })
    .sort((a, b) =>
      compareListRows(
        {
          name: a.venue.name,
          verified: a.venue.verified,
          priced: Boolean(a.price || a.menuPrice || a.count),
          meters: a.meters,
        },
        {
          name: b.venue.name,
          verified: b.venue.verified,
          priced: Boolean(b.price || b.menuPrice || b.count),
          meters: b.meters,
        },
      ),
    );
  return (
    <Sheet title={it.list.title} onClose={onClose}>
      {rows.length === 0 && <p class="hint">{it.list.empty}</p>}
      <ul class="rows">
        {rows.map(({ venue, price, menuPrice, count, meters }) => {
          const summary = price
            ? `${formatPrice(price[3])}${price[2] === 1 ? ` ${it.bar.happyHour}` : ""}`
            : count
              ? count.kind === "menu"
                ? `${String(count.count)} ${count.count === 1 ? "voce" : "voci"} menu`
                : `${String(count.count)} ${count.count === 1 ? "prezzo segnalato" : "prezzi segnalati"}`
              : menuPrice
                ? menuPrice.replace(/ MENU$/, " · menu")
                : it.list.noPrice;
          return (
            <li key={venue.key}>
              <a
                class="row"
                tabIndex={0}
                href={`/bar/${venue.key}?c=${venue.cell}`}
                onClick={(event) => {
                  event.preventDefault();
                  onOpen(venue);
                }}
              >
                <span class="row__name">{venue.name}</span>
                <span
                  class={price || menuPrice || count ? "row__price" : "row__price row__price--none"}
                >
                  {summary}
                </span>
                {venue.verified && (
                  <span class="row__badge">
                    <VerifiedBadge />
                  </span>
                )}
                <span class="row__meta">
                  {[
                    venue.key.startsWith("m") && venue.kind === 0 ? "Locale" : it.kinds[venue.kind],
                    price && drinks.length > 1 ? it.drinks[price[1]] : "",
                    price && isStale(price[4], today) ? it.bar.toConfirm : "",
                    menuPrice || count?.kind === "menu" ? "Dal menu del locale" : "",
                    meters === null ? "" : formatDistance(meters),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
