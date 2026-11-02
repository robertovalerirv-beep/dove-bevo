import { useEffect, useId, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { PriceRow, VenuePrices } from "@site/shared/api-types";
import { currentLang, it } from "@site/app/i18n/lang";
import { loadCell, loadVenuePrices, type Venue } from "@site/app/lib/data";
import { formatDate, formatPrice, todayRome } from "@site/app/lib/format";
import { isStale, type Tier } from "@site/app/lib/tiers";
import { directionsUrl } from "@site/app/lib/geo";
import { drinkIcon, Icon } from "@site/app/components/Icon";
import { AppLegalLinks } from "./AppLegalLinks";
import { Sheet } from "@site/app/components/Sheet";
import { HoursList, VerifiedBadge } from "@site/app/components/Verified";
import { drinkImage } from "@mobile/drink-images";
import { sharePresentation } from "../share-presentation";
import { DrinkHero } from "./DrinkHero";
import { mobileFocus, mobilePath } from "../routes";
import "./sheets.css";

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
  /** The drinks chosen on the map come first on the receipt. */
  focus: readonly string[];
  /** Tier of a price against its cell median (D-12), from the prices already loaded. */
  tier: (row: PriceRow) => Tier;
  onVenue: (venue: Venue) => void;
  onClose: () => void;
}

/** Rows visible on the receipt before "Vedi tutti" (brand, Scontrino). */
const VISIBLE_ROWS = 5;

const GLYPH = { affare: "↓", giusto: "=", salato: "↑" } as const;

const rowId = (row: PriceRow) => `${row[1]}|${String(row[2])}`;

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
  tier,
  featured = false,
}: {
  row: PriceRow;
  venue: Venue;
  actions: BarActions;
  inReview: boolean;
  tier: Tier;
  featured?: boolean;
}) {
  const [, drink, hh, cents, day, confirmations] = row;
  const id = `${row[0]}|${rowId(row)}|${String(cents)}`;
  const [count, setCount] = useState(confirmations);
  const [state, setState] = useState<"idle" | "busy" | "done" | "already" | "failed">(() => {
    const seen = confirmedHere();
    return seen.has(`${id}|1`) ? "done" : seen.has(`${id}|0`) ? "already" : "idle";
  });
  const name = [it.drinks[drink] ?? drink, hh ? it.bar.happyHour : ""].filter(Boolean).join(" ");
  const [expanded, setExpanded] = useState(false);
  const actionsId = useId();
  const toggle = useRef<HTMLButtonElement>(null);
  const controls = useRef<HTMLSpanElement>(null);
  const focusedToggle =
    typeof document !== "undefined" && toggle.current === document.activeElement;
  const focusedControls =
    typeof document !== "undefined" && controls.current?.contains(document.activeElement);
  useLayoutEffect(() => {
    if (featured && focusedToggle)
      controls.current
        ?.querySelector<HTMLButtonElement>('button:not([aria-disabled="true"])')
        ?.focus();
    else if (!featured && !expanded && focusedControls) toggle.current?.focus();
  }, [featured, expanded, focusedToggle, focusedControls]);
  const showActions = featured || expanded;
  const artwork = drinkImage(drink);

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
    <li
      class={`price mobile-price${featured ? " mobile-price--featured" : ""}${expanded ? " mobile-price--expanded" : ""}`}
      {...sharePresentation(
        featured && !inReview && row[0] === venue.key
          ? {
              venue: venue.key,
              venueName: venue.name,
              drink,
              drinkName: it.drinks[drink] ?? drink,
              hh,
              amountMinor: cents,
              currency: "EUR",
              serving: "",
              provenance: `${currentLang() === "en" ? "Price record date" : "Data del prezzo"}: ${formatDate(day)}`,
              confirmations: count,
              tier,
              location: venue.city,
            }
          : null,
      )}
    >
      <span class="price__icon">
        {artwork ? (
          <img src={artwork} width="1536" height="1024" alt="" decoding="async" loading="lazy" />
        ) : (
          <Icon name={drinkIcon(drink)} />
        )}
      </span>
      <span class="price__name">{name}</span>
      <span
        class={`price__value price__value--${tier}${isStale(day, todayRome()) ? " price__value--stale" : ""}`}
      >
        {tier !== "neutro" && (
          <>
            <span aria-hidden="true">{GLYPH[tier]} </span>
            <span class="sr-only">{it.map.tiers[tier]}: </span>
          </>
        )}
        {formatPrice(cents)}
      </span>
      <span class="price__meta" aria-live="polite">
        {formatDate(day)} · {it.bar.confirmations(count)}
        {isStale(day, todayRome()) && <span class="price__stale"> · {it.bar.toConfirm}</span>}
      </span>
      {featured && tier !== "neutro" && (
        <span class={`mobile-price__tier mobile-price__tier--${tier}`}>{it.map.tiers[tier]}</span>
      )}
      <button
        ref={toggle}
        type="button"
        class="mobile-price__toggle"
        hidden={featured}
        aria-expanded={expanded}
        aria-controls={actionsId}
        onClick={() => {
          setExpanded(!expanded);
        }}
      >
        {currentLang() === "en"
          ? expanded
            ? "Hide actions"
            : "Price actions"
          : expanded
            ? "Nascondi azioni"
            : "Azioni sul prezzo"}
        <span class="sr-only"> · {name}</span>
      </button>
      <span ref={controls} id={actionsId} class="price__actions" hidden={!showActions}>
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
export function BarSheet({ venueKey, cell, actions, focus, tier, onVenue, onClose }: Props) {
  const [venue, setVenue] = useState<Venue | null | undefined>(undefined);
  const [prices, setPrices] = useState<VenuePrices | null>(null);
  const [pricesFailed, setPricesFailed] = useState(false);
  const [showAll, setShowAll] = useState(false);
  useEffect(() => {
    void loadCell(cell)
      .then((venues) => {
        // A proposed bar is public only once the admin approved it (ADR 0019): not here by its link.
        const found = venues.find((v) => v.key === venueKey && !v.pending) ?? null;
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
  const requested =
    mobilePath(location) === `/bar/${venueKey}` &&
    new URLSearchParams(location.search).get("c") === cell
      ? mobileFocus(location)
      : null;
  const isFocus = (p: PriceRow) =>
    requested ? p[1] === requested.drink && p[2] === requested.hh : focus.includes(p[1]);
  const active = [...(prices?.p.filter((p) => p[6] === 0) ?? [])].sort(
    (a, b) => Number(isFocus(b)) - Number(isFocus(a)),
  );
  const shown = showAll ? active : active.slice(0, VISIBLE_ROWS);
  const requestedUnavailable = requested && !active.some(isFocus);
  const review = prices?.p.filter((p) => p[6] === 1) ?? [];
  return (
    <Sheet title={venue.name} onClose={onClose} bare>
      <div class="scontrino mobile-venue">
        <DrinkHero drink={requested?.drink ?? active[0]?.[1] ?? focus[0] ?? "spritz"} />
        <div class="scontrino__paper">
          <p class="bar__kind">{[it.kinds[venue.kind], venue.city].filter(Boolean).join(" · ")}</p>
          <h2 class="scontrino__name" tabIndex={-1}>
            {venue.name}
          </h2>
          {venue.verified && (
            <p class="bar__verified">
              <VerifiedBadge />
            </p>
          )}
          {venue.addr && <p class="bar__addr">{venue.addr}</p>}
          {/* The hours of a verified bar come before the prices (SPEC 7.2, D-34). */}
          {venue.verified && prices?.o && <HoursList hours={prices.o} />}
          <h3 class="section-title">{it.bar.prices}</h3>
          {pricesFailed && (
            <p class="hint" role="alert">
              {it.bar.pricesError}
            </p>
          )}
          {prices && active.length === 0 && <p class="hint">{it.bar.noPrices}</p>}
          {prices && requestedUnavailable && (
            <p class="hint" role="status" data-testid="saved-drink-unavailable">
              {currentLang() === "en"
                ? "Saved drink price unavailable"
                : "Prezzo del drink preferito non disponibile"}
              {`: ${it.drinks[requested.drink] ?? requested.drink} · ${requested.hh ? "Happy hour" : currentLang() === "en" ? "Normal" : "Normale"}.`}
            </p>
          )}
          <ul class="prices">
            {shown.flatMap((row, index) => [
              index === 1 && (
                <li key="other-prices" class="mobile-price-section" role="presentation">
                  {currentLang() === "en" ? "Other prices" : "Altri prezzi"}
                </li>
              ),
              <PriceItem
                key={rowId(row)}
                row={row}
                venue={venue}
                actions={actions}
                inReview={false}
                tier={tier(row)}
                featured={index === 0 && !requestedUnavailable}
              />,
            ])}
          </ul>
          {active.length > VISIBLE_ROWS && (
            <button
              type="button"
              class="btn btn--ghost"
              aria-expanded={showAll}
              onClick={() => {
                setShowAll(!showAll);
              }}
            >
              {showAll ? it.bar.seeLess : it.bar.seeAll(active.length)}
            </button>
          )}
          {active.length > 0 && (
            <p class="scontrino__foot">
              <span>{it.bar.receiptFoot}</span>
              <span>{it.bar.drinkCount(active.length)}</span>
            </p>
          )}
        </div>
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
        {review.length > 0 && (
          <>
            <h3 class="section-title">{it.bar.inReview}</h3>
            <p class="hint">{it.bar.inReviewHelp}</p>
            <ul class="prices">
              {review.map((row) => (
                <PriceItem
                  key={rowId(row)}
                  row={row}
                  venue={venue}
                  actions={actions}
                  inReview
                  tier="neutro"
                />
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
        <AppLegalLinks />
      </div>
    </Sheet>
  );
}
