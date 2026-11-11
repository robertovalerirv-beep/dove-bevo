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
import { DrinkVoteButton, DrinkVotesProvider } from "./DrinkVotes";
import {
  loadMenuPage,
  loadMobileCell,
  menuMoney,
  mobileMenuVenue,
  type MenuPage,
  type MenuFee,
  type MenuOffer,
} from "../menu-v2";
import { CustomerPricesV2 } from "./CustomerPricesV2";
import { NativeSaveAction, savedDrinkKey, useNativeSavedDrinks } from "../native-saved-drinks";
import {
  menuOfferMatchesFocus,
  mobileFocus,
  mobileOfferFocus,
  mobileOfferIdPattern,
  mobileOfferSaveURL,
  mobileDrinkSaveURL,
  mobilePath,
  validCategory,
} from "../routes";
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
  nativeDrinkSave,
  savedDrinkKeys,
  featured = false,
}: {
  row: PriceRow;
  venue: Venue;
  actions: BarActions;
  inReview: boolean;
  tier: Tier;
  nativeDrinkSave: boolean;
  savedDrinkKeys: ReadonlySet<string>;
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
      {!inReview && validCategory(drink) && (
        <span class="mobile-menu-v2__quick-actions mobile-price__quick-actions">
          {nativeDrinkSave && (
            <NativeSaveAction
              href={mobileDrinkSaveURL(venue.key, venue.cell, drink, hh ? "happy_hour" : "normal")}
              name={name}
              venue={venue.name}
              keys={savedDrinkKeys}
            />
          )}
          <DrinkVoteButton
            target={{ kind: "legacy", drink, band: hh ? "happy_hour" : "normal" }}
            name={`${name} da ${venue.name}`}
          />
        </span>
      )}
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
        aria-label={
          currentLang() === "en"
            ? `${expanded ? "Hide" : "Show"} price actions for ${name}: ${inReview ? "confirm or report" : "confirm, change or report"}`
            : `${expanded ? "Nascondi" : "Mostra"} le azioni per ${name}: ${inReview ? "conferma o segnala" : "conferma, modifica o segnala"} il prezzo`
        }
        onClick={() => {
          setExpanded(!expanded);
        }}
      >
        {currentLang() === "en"
          ? expanded
            ? "Hide actions"
            : "Price actions"
          : expanded
            ? "Chiudi azioni"
            : "Azioni prezzo"}
        <span class="mobile-price__chevron" aria-hidden="true" />
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
  const savedDrinkKeys = useNativeSavedDrinks();
  const [venue, setVenue] = useState<Venue | null | undefined>(undefined);
  const [nativeOfferSave, setNativeOfferSave] = useState(
    () =>
      typeof window !== "undefined" &&
      (window as Window & { DoveBevoNativeOfferSave?: boolean }).DoveBevoNativeOfferSave === true,
  );
  const [nativeDrinkSave, setNativeDrinkSave] = useState(false);
  const [prices, setPrices] = useState<VenuePrices | null>(null);
  const [pricesFailed, setPricesFailed] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [menu, setMenu] = useState<MenuPage | null>(null);
  const [menuLoading, setMenuLoading] = useState(true);
  const [menuFailed, setMenuFailed] = useState(false);
  const [menuMoreBusy, setMenuMoreBusy] = useState(false);
  const [menuAttempt, setMenuAttempt] = useState(0);
  const [mapSample, setMapSample] = useState<MenuOffer | null>(null);
  const menuAbort = useRef<AbortController | null>(null);
  useEffect(() => {
    const updateNative = () => {
      setNativeOfferSave(
        (window as Window & { DoveBevoNativeOfferSave?: boolean }).DoveBevoNativeOfferSave === true,
      );
      setNativeDrinkSave(
        (window as Window & { DoveBevoNativeDrinkSave?: boolean }).DoveBevoNativeDrinkSave === true,
      );
    };
    window.addEventListener("dovebevo-native-ready", updateNative);
    updateNative();
    return () => {
      window.removeEventListener("dovebevo-native-ready", updateNative);
    };
  }, []);
  const savedFocus =
    typeof location !== "undefined" &&
    mobilePath(location) === "/bar/" + venueKey &&
    new URLSearchParams(location.search).get("c") === cell
      ? mobileFocus(location)
      : null;
  const savedOfferFocus =
    typeof location !== "undefined" &&
    mobilePath(location) === "/bar/" + venueKey &&
    new URLSearchParams(location.search).get("c") === cell
      ? mobileOfferFocus(location)
      : null;
  const matchesMenu = (offer: MenuPage["offers"][number]) =>
    savedOfferFocus !== null
      ? offer.id === savedOfferFocus
      : savedFocus !== null && menuOfferMatchesFocus(offer, savedFocus);
  const focusKey = focus.join(",");
  useEffect(() => {
    setMapSample(null);
    if (savedOfferFocus !== null || savedFocus !== null || focus.length === 0) return;
    let active = true;
    const readMapSample = () => {
      void loadMobileCell(cell, focus)
        .then((venues) => {
          if (!active) return;
          const selected: (Venue & { mobileMenuSamples?: MenuOffer[] }) | undefined = venues.find(
            (row) => row.key === venueKey,
          );
          const samples = selected?.mobileMenuSamples ?? [];
          const sample = focus
            .map((category) =>
              samples.find(
                (offer) => offer.category === category && offer.context.kind === "regular",
              ),
            )
            .find((offer) => offer !== undefined);
          setMapSample(sample ?? null);
        })
        .catch(() => {
          if (active) setMapSample(null);
        });
    };
    const onCellReady = (event: Event) => {
      const detail: unknown = (event as CustomEvent<unknown>).detail;
      if (typeof detail === "object" && detail !== null && "cell" in detail && detail.cell === cell)
        readMapSample();
    };
    window.addEventListener("dovebevo:menu-cell-ready", onCellReady);
    readMapSample();
    return () => {
      active = false;
      window.removeEventListener("dovebevo:menu-cell-ready", onCellReady);
    };
  }, [cell, venueKey, focusKey, savedFocus?.drink, savedFocus?.hh, savedOfferFocus]);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    menuAbort.current = controller;
    const timeout = setTimeout(() => {
      controller.abort();
    }, 6000);
    setVenue(undefined);
    setPrices(null);
    setPricesFailed(false);
    setMenu(null);
    setMenuLoading(true);
    setMenuFailed(false);
    setMenuMoreBusy(false);

    // Legacy venues must open as soon as their existing cell arrives, even if the
    // independent v2 menu request stalls. M keys still need their registry menu.
    void loadCell(cell)
      .then((legacy) => {
        if (!active || venueKey.startsWith("m")) return;
        const found = legacy.find((row) => row.key === venueKey && !row.pending) ?? null;
        setVenue(found);
        if (found) onVenue(found);
      })
      .catch(() => {
        if (active && !venueKey.startsWith("m")) setVenue(null);
      });
    void loadMenuPage(venueKey, cell, null, controller.signal)
      .then((page) => {
        if (!active) return;
        setMenu(page);
        setMenuLoading(false);
        if (venueKey.startsWith("m")) {
          const selected = page ? mobileMenuVenue(page.venue) : null;
          setVenue(selected);
          if (selected) onVenue(selected);
        }
      })
      .catch(() => {
        if (!active) return;
        setMenuFailed(true);
        setMenuLoading(false);
        if (venueKey.startsWith("m")) setVenue(null);
      })
      .finally(() => {
        clearTimeout(timeout);
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
      clearTimeout(timeout);
      controller.abort();
    };
  }, [venueKey, cell, menuAttempt]);
  async function loadMoreMenu() {
    const after = menu?.next_after;
    const controller = menuAbort.current;
    if (!after || !controller || menuMoreBusy) return;
    setMenuMoreBusy(true);
    setMenuFailed(false);
    const pageController = new AbortController();
    const cancelPage = () => {
      pageController.abort();
    };
    controller.signal.addEventListener("abort", cancelPage, { once: true });
    const timeout = setTimeout(cancelPage, 6000);
    try {
      const page = await loadMenuPage(venueKey, cell, after, pageController.signal);
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
      clearTimeout(timeout);
      controller.signal.removeEventListener("abort", cancelPage);
      if (!controller.signal.aborted) setMenuMoreBusy(false);
    }
  }

  // A map/list menu price or saved drink can be on a later bounded menu page.
  useEffect(() => {
    const lookingForSaved = savedFocus !== null || savedOfferFocus !== null;
    const lookingForMap = !lookingForSaved && mapSample !== null;
    if (
      (!lookingForSaved && !lookingForMap) ||
      !menu?.next_after ||
      menuMoreBusy ||
      menuFailed ||
      (lookingForSaved
        ? menu.offers.some(matchesMenu)
        : menu.offers.some((offer) => offer.id === mapSample?.id))
    )
      return;
    void loadMoreMenu();
  }, [
    menu,
    menuMoreBusy,
    menuFailed,
    savedFocus?.drink,
    savedFocus?.hh,
    savedOfferFocus,
    mapSample?.id,
  ]);

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
            <p>I dettagli del locale sono temporaneamente indisponibili. Riprova tra poco.</p>
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
  const matchesSaved = (p: PriceRow) =>
    savedFocus !== null && p[1] === savedFocus.drink && p[2] === savedFocus.hh;
  const active = [...(prices?.p.filter((p) => p[6] === 0) ?? [])].sort(
    (a, b) =>
      Number(matchesSaved(b)) - Number(matchesSaved(a)) || Number(isFocus(b)) - Number(isFocus(a)),
  );
  const savedFound = active.some(matchesSaved);
  const menuFound = menu?.offers.some(matchesMenu) ?? false;
  const featuredOffer =
    savedOfferFocus !== null && menuFound
      ? menu?.offers.find(matchesMenu)
      : savedFocus !== null && !savedFound && menuFound
        ? menu?.offers.find(matchesMenu)
        : savedOfferFocus === null &&
            savedFocus === null &&
            !active.some(isFocus) &&
            mapSample !== null
          ? menu?.offers.find((offer) => offer.id === mapSample.id)
          : undefined;
  const savedMissing =
    savedFocus &&
    !savedFound &&
    !menuFound &&
    !menuLoading &&
    !menuFailed &&
    !menu?.next_after &&
    (venueKey.startsWith("m") || prices !== null);
  const savedOfferMissing =
    savedOfferFocus !== null && !menuLoading && !menuFailed && !menuFound && !menu?.next_after;
  const focusedSaveAction =
    savedOfferFocus !== null
      ? mobileOfferSaveURL(venueKey, cell, savedOfferFocus)
      : savedFocus !== null
        ? mobileDrinkSaveURL(
            venueKey,
            cell,
            savedFocus.drink,
            savedFocus.hh ? "happy_hour" : "normal",
          )
        : null;
  const focusedKey = focusedSaveAction === null ? null : savedDrinkKey(focusedSaveAction);
  const focusedIsSaved = focusedKey !== null && savedDrinkKeys.has(focusedKey);
  const shown = showAll ? active : active.slice(0, VISIBLE_ROWS);
  const review = prices?.p.filter((p) => p[6] === 1) ?? [];
  const venueKind = venueKey.startsWith("m") && venue.kind === 0 ? "Locale" : it.kinds[venue.kind];
  const heroOffer = menu?.offers.find(matchesMenu);
  const heroDrink =
    savedOfferFocus !== null
      ? (heroOffer?.category ?? null)
      : savedFocus !== null
        ? savedFound || heroOffer
          ? savedFocus.drink
          : null
        : (active.find(isFocus)?.[1] ??
          menu?.offers.find((offer) => offer.category && focus.includes(offer.category))
            ?.category ??
          active[0]?.[1] ??
          menu?.offers.find((offer) => offer.category)?.category ??
          null);
  const menuSection =
    menu && menu.stored_offer_count > 0 && menu.offers.length > 0 ? (
      <section key="venue-menu" class="mobile-menu-v2" aria-label="Prezzi dal menu online">
        <div class="mobile-menu-v2__heading">
          <h3>Dal menu del locale</h3>
          <span>{menu.stored_offer_count} prezzi</span>
        </div>
        <p class="mobile-menu-v2__disclaimer">
          Prezzi del drink indicati nel menu, non il totale pagato. Le condizioni e i supplementi
          sono separati.
        </p>
        <CustomerPricesV2
          key={`${venueKey}:${cell}`}
          menu={menu}
          venue={{ key: venueKey, cell, country: "IT" }}
          focus={savedFocus}
          offerFocus={savedOfferFocus}
          spotlightOfferId={featuredOffer?.id ?? null}
          mapFocus={focus}
          mapOfferId={mapSample?.id ?? null}
          hasLegacyPrices={active.length > 0}
        />
        {menu.next_after && (
          <button
            type="button"
            class="btn btn--secondary mobile-menu-v2__more"
            disabled={menuMoreBusy}
            onClick={() => void loadMoreMenu()}
          >
            {menuMoreBusy
              ? "Caricamento…"
              : menuFailed
                ? "Riprova altri drink"
                : "Vedi altri drink"}
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
                  {fee.applicability === "unknown" && <small>Applicazione da verificare</small>}
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
    ) : null;
  const sheet = (
    <Sheet title={venue.name} onClose={onClose} bare>
      <div class="scontrino mobile-venue">
        <DrinkHero drink={heroDrink} />
        <div class="scontrino__paper">
          <header class="mobile-venue__identity">
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
          </header>
          <div class="mobile-menu-v2__spotlight-slot">
            {featuredOffer && (
              <section class="mobile-menu-v2" aria-label="Prezzo selezionato dal menu online">
                <h3 class="section-title">
                  {focusedIsSaved ? "Drink salvato" : "Drink selezionato"}
                </h3>
                <ul class="mobile-menu-v2__offers">
                  <li
                    class="mobile-menu-v2__offer mobile-menu-v2__offer--focused"
                    data-testid="featured-menu-price"
                  >
                    <span class="mobile-menu-v2__name">
                      {featuredOffer.name}
                      <small class="mobile-menu-v2__provenance">Prezzo da menu</small>
                    </span>
                    <strong class="mobile-menu-v2__amount">
                      {menuMoney(
                        featuredOffer.amount_minor,
                        featuredOffer.currency,
                        featuredOffer.currency_exponent,
                      )}
                    </strong>
                    <small class="mobile-menu-v2__meta">
                      {[
                        featuredOffer.serving.label ??
                          (featuredOffer.serving.ml
                            ? `${String(featuredOffer.serving.ml)} ml`
                            : ""),
                        featuredOffer.context.kind === "happy_hour"
                          ? ["Happy hour", featuredOffer.context.condition]
                              .filter(Boolean)
                              .join(" · ")
                          : featuredOffer.context.kind === "conditional"
                            ? featuredOffer.context.condition
                              ? `Solo con: ${featuredOffer.context.condition}`
                              : "Prezzo condizionato"
                            : (featuredOffer.context.condition ?? ""),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                    <div class="mobile-menu-v2__quick-actions">
                      {nativeOfferSave && mobileOfferIdPattern.test(featuredOffer.id) && (
                        <NativeSaveAction
                          href={mobileOfferSaveURL(venueKey, cell, featuredOffer.id)}
                          name={featuredOffer.name}
                          venue={venue.name}
                          keys={savedDrinkKeys}
                        />
                      )}
                      {mobileOfferIdPattern.test(featuredOffer.id) && (
                        <DrinkVoteButton
                          target={{ kind: "offer", id: featuredOffer.id }}
                          name={`${featuredOffer.name} da ${venue.name}`}
                        />
                      )}
                    </div>
                    <small class="mobile-menu-v2__meta">
                      Prezzo del drink da menu, non totale pagato. Supplementi separati.
                    </small>
                    <a
                      class="mobile-menu-v2__source"
                      href={featuredOffer.source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Menu verificato il {featuredOffer.source.checked_on}
                    </a>
                  </li>
                </ul>
              </section>
            )}
          </div>
          {active.length > 0 && (
            <h3 class="section-title">
              {featuredOffer
                ? currentLang() === "en"
                  ? "Prices reported by customers"
                  : "Prezzi segnalati dai clienti"
                : it.bar.prices}
            </h3>
          )}
          {pricesFailed && (
            <p class="hint" role="alert">
              {it.bar.pricesError}
            </p>
          )}
          {prices && active.length === 0 && !menu?.offers.length && (
            <p class="hint">{it.bar.noPrices}</p>
          )}
          {savedMissing && (
            <p class="hint" role="status" data-testid="saved-drink-unavailable">
              Il prezzo {focusedIsSaved ? "salvato" : "selezionato"} per questo drink e orario non è
              più disponibile. Gli altri prezzi del locale sono qui sotto.
            </p>
          )}
          {savedOfferMissing && (
            <p class="hint" role="status" data-testid="saved-offer-unavailable">
              Questo drink selezionato non è più disponibile nel menu verificato. Gli altri prezzi
              del locale sono qui sotto.
            </p>
          )}
          <ul class="prices">
            {shown.flatMap((row, index) => [
              index === 1 && !featuredOffer && (
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
                nativeDrinkSave={nativeDrinkSave}
                savedDrinkKeys={savedDrinkKeys}
                featured={index === 0 && !featuredOffer && (!savedFocus || savedFound)}
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
          {menuSection}
          {menu && (menu.stored_offer_count === 0 || menu.offers.length === 0) && (
            <CustomerPricesV2
              key={`${venueKey}:${cell}`}
              menu={menu}
              venue={{ key: venueKey, cell, country: "IT" }}
              focus={savedFocus}
              offerFocus={savedOfferFocus}
              mapFocus={focus}
              mapOfferId={mapSample?.id ?? null}
              hasLegacyPrices={active.length > 0}
            />
          )}
          {!menuLoading && !menu && !venueKey.startsWith("m") && (
            <CustomerPricesV2
              key={`${venueKey}:${cell}`}
              menu={null}
              venue={{ key: venueKey, cell, country: "IT" }}
              focus={savedFocus}
              offerFocus={savedOfferFocus}
              mapFocus={focus}
              mapOfferId={mapSample?.id ?? null}
              hasLegacyPrices={active.length > 0}
            />
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
        </div>
        {review.length > 0 && (
          <>
            <h3 class="section-title">{it.bar.inReview}</h3>
            <p class="hint">{it.bar.inReviewHelp}</p>
            {savedOfferMissing && (
              <p class="hint" role="status" data-testid="saved-offer-unavailable">
                Questo drink selezionato non è più disponibile nel menu verificato. Gli altri prezzi
                del locale sono qui sotto.
              </p>
            )}
            <ul class="prices">
              {review.map((row) => (
                <PriceItem
                  key={rowId(row)}
                  row={row}
                  venue={venue}
                  actions={actions}
                  inReview
                  tier="neutro"
                  nativeDrinkSave={nativeDrinkSave}
                  savedDrinkKeys={savedDrinkKeys}
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
  return (
    <DrinkVotesProvider key={`${venueKey}:${cell}`} venueKey={venueKey} cell={cell}>
      {sheet}
    </DrinkVotesProvider>
  );
}
