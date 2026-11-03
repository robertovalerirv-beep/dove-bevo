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
import {
  loadMenuPage,
  menuMoney,
  mobileMenuVenue,
  type MenuPage,
  type MenuOffer,
  type MenuFee,
} from "../menu-v2";
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
function menuOfferContext(offer: MenuOffer): string {
  if (offer.context.kind === "happy_hour")
    return ["Happy hour", offer.context.condition].filter(Boolean).join(" · ");
  if (offer.context.kind === "conditional")
    return offer.context.condition ? `Solo con: ${offer.context.condition}` : "Prezzo condizionato";
  return offer.context.condition ?? "";
}

function menuFeeAmount(fee: MenuFee): string {
  if (fee.kind === "percent")
    return `${new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 }).format((fee.rate_bps ?? 0) / 100)}% sul conto`;
  const amount = menuMoney(
    fee.amount_minor ?? 0,
    fee.currency ?? "EUR",
    fee.currency_exponent ?? 2,
  );
  const basis = {
    person: "a persona",
    table: "a tavolo",
    bill: "sul conto",
    unspecified: "base non specificata",
  }[fee.basis];
  return `${amount} ${basis}`;
}

export function BarSheet({ venueKey, cell, actions, focus, tier, onVenue, onClose }: Props) {
  const [venue, setVenue] = useState<Venue | null | undefined>(undefined);
  const [prices, setPrices] = useState<VenuePrices | null>(null);
  const [pricesFailed, setPricesFailed] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [menu, setMenu] = useState<MenuPage | null>(null);
  const [menuLoading, setMenuLoading] = useState(true);
  const [menuFailed, setMenuFailed] = useState(false);
  const [menuMoreBusy, setMenuMoreBusy] = useState(false);
  const [menuAttempt, setMenuAttempt] = useState(0);
  const menuAbort = useRef<AbortController | null>(null);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    menuAbort.current = controller;
    setVenue(undefined);
    setPrices(null);
    setPricesFailed(false);
    setMenu(null);
    setMenuLoading(true);
    setMenuFailed(false);
    setMenuMoreBusy(false);
    void Promise.allSettled([
      loadCell(cell),
      loadMenuPage(venueKey, cell, null, controller.signal),
    ]).then(([legacy, online]) => {
      if (!active) return;
      const found =
        legacy.status === "fulfilled"
          ? (legacy.value.find((v) => v.key === venueKey && !v.pending) ?? null)
          : null;
      const page = online.status === "fulfilled" ? online.value : null;
      if (online.status === "rejected") setMenuFailed(true);
      setMenu(page);
      setMenuLoading(false);
      const selected =
        found ?? (page && venueKey.startsWith("m") ? mobileMenuVenue(page.venue) : null);
      setVenue(selected);
      if (selected) onVenue(selected);
    });
    if (!venueKey.startsWith("m"))
      void loadVenuePrices(venueKey)
        .then((value) => {
          if (active) setPrices(value);
        })
        .catch(() => {
          if (active) setPricesFailed(true);
        });
    return () => {
      active = false;
      controller.abort();
    };
  }, [venueKey, cell, menuAttempt]);

  async function loadMoreMenu() {
    const after = menu?.next_after;
    const controller = menuAbort.current;
    if (!after || !controller || menuMoreBusy) return;
    setMenuMoreBusy(true);
    setMenuFailed(false);
    try {
      const page = await loadMenuPage(venueKey, cell, after, controller.signal);
      if (!page) throw new Error("Menu vanished");
      if (controller.signal.aborted) return;
      const existing = new Set(menu.offers.map((offer) => offer.id));
      if (page.offers.some((offer) => existing.has(offer.id)))
        throw new Error("Duplicate menu page");
      setMenu((previous) =>
        previous?.next_after === after
          ? { ...page, offers: [...previous.offers, ...page.offers] }
          : previous,
      );
    } catch {
      if (!controller.signal.aborted) setMenuFailed(true);
    } finally {
      if (!controller.signal.aborted) setMenuMoreBusy(false);
    }
  }

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
    if (venueKey.startsWith("m"))
      return (
        <Sheet title="Menu temporaneamente non disponibile" onClose={onClose}>
          <div class="mobile-menu-v2__error" role="alert">
            <p>Non riusciamo a caricare questo locale al momento.</p>
            <button
              type="button"
              class="btn btn--secondary"
              onClick={() => {
                setMenuAttempt((value) => value + 1);
              }}
            >
              Riprova
            </button>
          </div>
        </Sheet>
      );
    return (
      <Sheet title={it.bar.notFound} onClose={onClose}>
        <p class="hint">{it.bar.notFound}</p>
      </Sheet>
    );
  }
  const isFocus = (p: PriceRow) => focus.includes(p[1]);
  const active = [...(prices?.p.filter((p) => p[6] === 0) ?? [])].sort(
    (a, b) => Number(isFocus(b)) - Number(isFocus(a)),
  );
  const shown = showAll ? active : active.slice(0, VISIBLE_ROWS);
  const review = prices?.p.filter((p) => p[6] === 1) ?? [];
  const venueKind = venueKey.startsWith("m") && venue.kind === 0 ? "Locale" : it.kinds[venue.kind];
  return (
    <Sheet title={venue.name} onClose={onClose} bare>
      <div class="scontrino mobile-venue">
        <DrinkHero drink={active[0]?.[1] ?? focus[0] ?? "spritz"} />
        <div class="scontrino__paper">
          <p class="bar__kind">{[venueKind, venue.city].filter(Boolean).join(" · ")}</p>
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
          {prices && active.length === 0 && !menu?.offers.length && (
            <p class="hint">{it.bar.noPrices}</p>
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
                featured={index === 0}
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
          {menuLoading && (
            <p class="hint" role="status">
              Caricamento menu online…
            </p>
          )}
          {menu && (menu.offers.length > 0 || menu.fees.length > 0) && (
            <section class="mobile-menu-v2" aria-label="Prezzi dal menu online">
              <div class="mobile-menu-v2__heading">
                <h3>Dal menu del locale</h3>
                <span>{menu.stored_offer_count} prezzi</span>
              </div>
              <p class="mobile-menu-v2__disclaimer">
                Prezzi del drink indicati nel menu, non il totale pagato. Le condizioni e i
                supplementi sono separati.
              </p>
              <ul class="mobile-menu-v2__offers">
                {menu.offers.map((offer) => (
                  <li key={offer.id} class="mobile-menu-v2__offer">
                    <span class="mobile-menu-v2__name">{offer.name}</span>
                    <strong class="mobile-menu-v2__amount">
                      {menuMoney(offer.amount_minor, offer.currency, offer.currency_exponent)}
                    </strong>
                    <span class="mobile-menu-v2__meta">
                      {[
                        offer.serving.label ??
                          (offer.serving.ml ? `${String(offer.serving.ml)} ml` : ""),
                        menuOfferContext(offer),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    <a
                      href={offer.source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="mobile-menu-v2__source"
                    >
                      Menu verificato il {offer.source.checked_on}
                    </a>
                  </li>
                ))}
              </ul>
              {menu.next_after && (
                <button
                  type="button"
                  class="btn btn--secondary mobile-menu-v2__more"
                  disabled={menuMoreBusy}
                  onClick={() => void loadMoreMenu()}
                >
                  {menuMoreBusy ? "Caricamento…" : "Vedi altri drink"}
                </button>
              )}
              <div class="mobile-menu-v2__fees">
                <h4>Coperto e supplementi</h4>
                {menu.fees.length > 0 && (
                  <ul>
                    {menu.fees.map((fee) => (
                      <li key={fee.id}>
                        <span>{fee.label}</span>
                        <strong>{menuFeeAmount(fee)}</strong>
                        {fee.applicability === "conditional" && fee.condition && (
                          <small>Solo se: {fee.condition}</small>
                        )}
                        {fee.applicability === "unknown" && (
                          <small>Applicazione da verificare</small>
                        )}
                        <a href={fee.source.url} target="_blank" rel="noopener noreferrer">
                          Fonte verificata il {fee.source.checked_on}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                {menu.fee_coverage.status === "unknown" && (
                  <p>Eventuali costi aggiuntivi non sono stati verificati.</p>
                )}
                {menu.fee_coverage.status === "documented_partial" && (
                  <p>Questi supplementi sono documentati; potrebbero essercene altri.</p>
                )}
                {menu.fee_coverage.status === "explicit_no_fee" && (
                  <p>Il menu consultato dichiara che non ci sono supplementi.</p>
                )}
              </div>
            </section>
          )}
          {menuFailed && (
            <div class="mobile-menu-v2__error" role="alert">
              <p>
                {venueKey.startsWith("m")
                  ? "Menu online non disponibile. Riprova tra poco."
                  : "Menu online non disponibile. I prezzi segnalati dalle persone restano visibili."}
              </p>
              <button
                type="button"
                class="btn btn--secondary"
                onClick={() => {
                  if (menu?.next_after) void loadMoreMenu();
                  else setMenuAttempt((value) => value + 1);
                }}
              >
                Riprova menu
              </button>
            </div>
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
          {!venue.key.startsWith("m") && (
            <button
              type="button"
              class="btn btn--primary"
              onClick={() => {
                actions.addHere(venue);
              }}
            >
              {it.actions.addHere}
            </button>
          )}
          {venue.key.startsWith("m") && (
            <p class="hint">
              Puoi consultare i prezzi del menu. Le segnalazioni dei clienti per questo locale
              saranno disponibili presto.
            </p>
          )}
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
        {!venue.key.startsWith("m") && (
          <button
            type="button"
            class="btn btn--ghost"
            onClick={() => {
              actions.report(venue, null);
            }}
          >
            {it.actions.reportBar}
          </button>
        )}
        {venue.key.startsWith("m") && (
          <a
            class="btn btn--ghost"
            href={`mailto:dovebevo@gmail.com?subject=${encodeURIComponent(`Segnalazione locale ${venue.key}`)}&body=${encodeURIComponent(`${venue.name} · ${venue.city} · ${venue.key}`)}`}
          >
            Segnala un problema con il locale
          </a>
        )}
        <AppLegalLinks />
      </div>
    </Sheet>
  );
}
