import { useEffect, useState } from "preact/hooks";
import type { PriceRow, VenuePrices } from "../../shared/api-types";
import { it } from "../i18n/it";
import { loadCell, loadVenuePrices, type Venue } from "../lib/data";
import { formatDate, formatPrice, formatSize } from "../lib/format";
import { directionsUrl } from "../lib/geo";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";

export interface BarActions {
  /** New count; `counted` is false when this person had already confirmed or is the author. */
  confirm: (row: PriceRow) => Promise<{ count: number; counted: boolean }>;
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

// Prices this tab has already confirmed: the button stays "Confermato" across reloads of the
// visit. Kept only in this tab (sessionStorage), never sent anywhere.
const CONFIRMED_KEY = "dovebevo-confirmed";
function confirmedHere(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(CONFIRMED_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}
function rememberConfirmed(id: string, counted: boolean) {
  try {
    const all = confirmedHere();
    all.add(`${id}|${counted ? "1" : "0"}`);
    sessionStorage.setItem(CONFIRMED_KEY, JSON.stringify([...all].slice(-200)));
  } catch {
    // Private mode or storage off: the server still counts once.
  }
}

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
  const [, drink, size, hh, cents, day, confirmations] = row;
  const id = `${row[0]}|${rowId(row)}|${String(cents)}`;
  const [count, setCount] = useState(confirmations);
  const [state, setState] = useState<"idle" | "busy" | "done" | "already" | "failed">(() => {
    const seen = confirmedHere();
    return seen.has(`${id}|1`) ? "done" : seen.has(`${id}|0`) ? "already" : "idle";
  });
  const name = [it.drinks[drink] ?? drink, formatSize(size), hh ? it.bar.happyHour : ""]
    .filter(Boolean)
    .join(" ");

  async function confirm() {
    if (state === "busy" || state === "done" || state === "already") return;
    setState("busy");
    try {
      const result = await actions.confirm(row);
      setCount(result.count);
      rememberConfirmed(id, result.counted);
      setState(result.counted ? "done" : "already");
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
      <span class="price__actions">
        <button
          type="button"
          class="btn btn--secondary"
          // aria-disabled keeps the focus on the button (WCAG 2.4.3); clicks are ignored above.
          aria-disabled={state === "idle" || state === "failed" ? undefined : "true"}
          onClick={() => void confirm()}
        >
          {state === "done"
            ? it.actions.confirmed
            : state === "already"
              ? it.actions.alreadyConfirmed
              : it.actions.confirm}
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
      {state === "already" && (
        <span class="hint price__note" role="status">
          {it.actions.alreadyHelp}
        </span>
      )}
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
