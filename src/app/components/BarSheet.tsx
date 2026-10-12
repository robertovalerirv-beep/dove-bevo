import { useEffect, useState } from "preact/hooks";
import type { PriceRow, VenuePrices } from "../../shared/api-types";
import { it } from "../i18n/it";
import { loadCell, loadVenuePrices, type Venue } from "../lib/data";
import { formatDate, formatPrice, formatSize } from "../lib/format";
import { directionsUrl } from "../lib/geo";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";

export interface BarActions {
  /** Resolves with the new count, or null when this session had already confirmed. */
  confirm: (row: PriceRow) => Promise<number | null>;
  changed: (venue: Venue, row: PriceRow) => void;
  report: (venue: Venue, row: PriceRow | null) => void;
  addHere: (venue: Venue) => void;
}

interface Props {
  venueKey: string;
  cell: string;
  actions: BarActions;
  onVenue: (venue: Venue) => void;
  onClose: () => void;
}

const rowId = (row: PriceRow) => `${row[1]}|${String(row[2])}|${String(row[3])}`;

function PriceItem({
  row,
  venue,
  actions,
  inReview,
}: {
  row: PriceRow;
  venue: Venue;
  actions: BarActions;
  inReview: boolean;
}) {
  const [, drink, size, hh, cents, day, confirmations, , fromPhoto] = row;
  const [count, setCount] = useState(confirmations);
  const [state, setState] = useState<"idle" | "busy" | "done" | "failed">("idle");
  const name = [it.drinks[drink] ?? drink, formatSize(size), hh ? it.bar.happyHour : ""]
    .filter(Boolean)
    .join(" ");

  async function confirm() {
    if (state === "busy" || state === "done") return;
    setState("busy");
    try {
      const next = await actions.confirm(row);
      if (next !== null) setCount(next);
      setState("done");
    } catch {
      setState("failed");
    }
  }

  return (
    <li class="price">
      <span class="price__name">{name}</span>
      <span class="price__value">{formatPrice(cents)}</span>
      <span class="price__meta" aria-live="polite">
        {formatDate(day)} · {it.bar.confirmations(count)}
      </span>
      {fromPhoto === 1 && <span class="price__ai">{it.bar.aiLabel}</span>}
      <span class="price__actions">
        <button
          type="button"
          class="btn btn--secondary"
          // aria-disabled keeps the focus on the button (WCAG 2.4.3); clicks are ignored above.
          aria-disabled={state === "busy" || state === "done" ? "true" : undefined}
          onClick={() => void confirm()}
        >
          {state === "done" ? it.actions.confirmed : it.actions.confirm}
        </button>
        {!inReview && (
          <button
            type="button"
            class="btn btn--secondary"
            onClick={() => {
              actions.changed(venue, row);
            }}
          >
            {it.actions.changed}
          </button>
        )}
        <button
          type="button"
          class="btn btn--ghost"
          onClick={() => {
            actions.report(venue, row);
          }}
        >
          {it.actions.report}
        </button>
      </span>
      {state === "failed" && (
        <span class="error" role="alert">
          {it.actions.failed}
        </span>
      )}
    </li>
  );
}

/** Bar page `/bar/<key>?c=<cell>` (SPEC 7.2). */
export function BarSheet({ venueKey, cell, actions, onVenue, onClose }: Props) {
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
      <div class="bar__actions">
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
        <button
          type="button"
          class="btn btn--primary"
          onClick={() => {
            actions.addHere(venue);
          }}
        >
          {it.actions.addHere}
        </button>
      </div>
      <h3 class="section-title">{it.bar.prices}</h3>
      {pricesFailed && (
        <p class="hint" role="alert">
          {it.bar.pricesError}
        </p>
      )}
      {prices && active.length === 0 && <p class="hint">{it.bar.noPrices}</p>}
      <ul class="prices">
        {active.map((row) => (
          <PriceItem key={rowId(row)} row={row} venue={venue} actions={actions} inReview={false} />
        ))}
      </ul>
      {review.length > 0 && (
        <>
          <h3 class="section-title">{it.bar.inReview}</h3>
          <p class="hint">{it.bar.inReviewHelp}</p>
          <ul class="prices">
            {review.map((row) => (
              <PriceItem key={rowId(row)} row={row} venue={venue} actions={actions} inReview />
            ))}
          </ul>
        </>
      )}
      <button
        type="button"
        class="btn btn--ghost"
        onClick={() => {
          actions.report(venue, null);
        }}
      >
        {it.actions.reportBar}
      </button>
    </Sheet>
  );
}
