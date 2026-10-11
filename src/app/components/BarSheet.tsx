import { useEffect, useState } from "preact/hooks";
import type { PriceRow, VenuePrices } from "../../shared/api-types";
import { it } from "../i18n/it";
import { loadCell, loadVenuePrices, type Venue } from "../lib/data";
import { formatDate, formatPrice, formatSize } from "../lib/format";
import { directionsUrl } from "../lib/geo";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";

interface Props {
  venueKey: string;
  cell: string;
  onVenue: (venue: Venue) => void;
  onClose: () => void;
}

function PriceItem({ row }: { row: PriceRow }) {
  const [, drink, size, hh, cents, day, confirmations, , fromPhoto] = row;
  const name = [it.drinks[drink] ?? drink, formatSize(size), hh ? it.bar.happyHour : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <li class="price">
      <span class="price__name">{name}</span>
      <span class="price__value">{formatPrice(cents)}</span>
      <span class="price__meta">
        {formatDate(day)} · {it.bar.confirmations(confirmations)}
      </span>
      {fromPhoto === 1 && <span class="price__ai">{it.bar.aiLabel}</span>}
    </li>
  );
}

/** Bar page `/bar/<key>?c=<cell>` (SPEC 7.2): read-only in M1. */
export function BarSheet({ venueKey, cell, onVenue, onClose }: Props) {
  const [venue, setVenue] = useState<Venue | null | undefined>(undefined);
  const [prices, setPrices] = useState<VenuePrices | null>(null);
  const [pricesFailed, setPricesFailed] = useState(false);
  useEffect(() => {
    void loadCell(cell)
      .then((venues) => {
        const found = venues.find((v) => v.key === venueKey) ?? null;
        setVenue(found);
        if (found) onVenue(found);
      })
      .catch(() => {
        setVenue(null);
      });
    loadVenuePrices(venueKey)
      .then(setPrices)
      .catch(() => {
        setPricesFailed(true);
      });
  }, [venueKey, cell]);

  if (venue === undefined) {
    return (
      <Sheet title={it.bar.loading} onClose={onClose}>
        <p class="hint" aria-live="polite">
          {it.bar.loading}
        </p>
      </Sheet>
    );
  }
  if (venue === null) {
    return (
      <Sheet title={it.bar.notFound} onClose={onClose}>
        <p class="hint">{it.bar.notFound}</p>
      </Sheet>
    );
  }
  const active = prices?.p.filter((p) => p[7] === 0) ?? [];
  const review = prices?.p.filter((p) => p[7] === 1) ?? [];
  return (
    <Sheet title={venue.name} onClose={onClose}>
      <p class="bar__kind">{[it.kinds[venue.kind], venue.city].filter(Boolean).join(" · ")}</p>
      {venue.addr && <p class="bar__addr">{venue.addr}</p>}
      <a
        class="btn btn--secondary"
        tabIndex={0}
        href={directionsUrl(venue.lat, venue.lon)}
        target="_blank"
        rel="noopener noreferrer"
      >
        <Icon name="directions" />
        {it.bar.directions}
      </a>
      <h3 class="section-title">{it.bar.prices}</h3>
      {pricesFailed && <p class="hint">{it.bar.pricesError}</p>}
      {prices && active.length === 0 && <p class="hint">{it.bar.noPrices}</p>}
      <ul class="prices">
        {active.map((row) => (
          <PriceItem key={`${row[1]}${String(row[2])}${String(row[3])}`} row={row} />
        ))}
      </ul>
      {review.length > 0 && (
        <>
          <h3 class="section-title">{it.bar.inReview}</h3>
          <p class="hint">{it.bar.inReviewHelp}</p>
          <ul class="prices">
            {review.map((row) => (
              <PriceItem key={`${row[1]}${String(row[2])}${String(row[3])}`} row={row} />
            ))}
          </ul>
        </>
      )}
    </Sheet>
  );
}
