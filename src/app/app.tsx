import { render } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { Place } from "../shared/api-types";
import { DEFAULT_CHIP, MAP_CHIPS, type ChipId } from "../shared/catalog";
import { APP_NAME } from "../shared/config";
import { encodeGeohash, visibleCells } from "../shared/geohash";
import type { PriceRow } from "../shared/api-types";
import { distanceMeters, searchKey } from "../shared/venue";
import { AddPriceSheet, type Draft, type Prefill } from "./components/AddPriceSheet";
import { BarSheet, type BarActions } from "./components/BarSheet";
import { PinPanel } from "./components/PinPanel";
import { ProposeSheet, type Proposal } from "./components/ProposeSheet";
import { ReportSheet, type Reason } from "./components/ReportSheet";
import { Toast, type StampInfo } from "./components/Toast";
import { drinkIcon, Icon } from "./components/Icon";
import { ListSheet } from "./components/ListSheet";
import type { Cheap, SearchSheet as SearchSheetType } from "./components/SearchSheet";
import { it } from "./i18n/it";
import { invalidateCell, loadCell, ServiceBusy, shownPrice, type Venue } from "./lib/data";
import { blockedHelp, locate, positionGranted } from "./lib/locate";
import { ensureSession, postWithSession } from "./lib/session";
import { formatPrice, formatSize, formatStampDay, todayRome } from "./lib/format";
import { installMode, promptInstall } from "./lib/install";
import { addPrices, priceCount, stampReached } from "./lib/usage";
import { cellMedian, coverage, isStale, tierOf } from "./lib/tiers";
import { holdableTimeout, type HoldableTimer } from "./lib/timer";
import type { MapView, VenueMap } from "./lib/maplibre-map";

const MIN_ZOOM_CELLS = 13;

/** The topmost open sheet: while a modal sheet is open, everything outside it is inert. */
/** Same names as the drink grid of "Aggiungi prezzo"; the size only where the drink has several. */
function chipLabel(c: (typeof MAP_CHIPS)[number]): string {
  const several = MAP_CHIPS.filter((o) => o.drink === c.drink).length > 1;
  return [it.drinks[c.drink] ?? c.drink, several ? formatSize(c.size) : ""].join(" ").trim();
}

function topLayer(): HTMLElement {
  const open = document.querySelectorAll<HTMLElement>("dialog.sheet[open]");
  return open[open.length - 1] ?? document.body;
}

/** Element living outside Preact's tree, so it can move into whichever sheet is on top. */
function floating(className: string, role?: string): HTMLDivElement {
  const element = document.createElement("div");
  element.className = className;
  if (role) element.setAttribute("role", role);
  return element;
}
/** Centre of the start view (the Italy picture), used when nothing better is known (D-16). */
const ITALY_CENTER = { lat: 41.85, lon: 12.6 };

/** Pin placement: the map must be this close to point at one building. */
const PIN_MIN_ZOOM = 16;
/** The pin must be moved at least this far from where the map started (that may be the device's position). */
const PIN_MIN_MOVE_M = 10;
/** Known bars this close to the pin, with a similar name, are offered as "È uno di questi?". */
const SIMILAR_METERS = 150;
const SIMILAR_MAX = 3;
const KEY = /^[nwru][1-9]\d{0,14}$/;
const CELL = /^[0-9b-hjkmnp-z]{5}$/;

/** `/?at=lat,lon`: the admin's city rows open the map there (a view only, nothing is sent). */
function parseAt(): [number, number, number] | null {
  const m = /^(-?\d{1,2}(?:\.\d{1,5})?),(-?\d{1,3}(?:\.\d{1,5})?)$/.exec(
    new URLSearchParams(location.search).get("at") ?? "",
  );
  const lat = Number(m?.[1]);
  const lon = Number(m?.[2]);
  return m && lat >= 35 && lat <= 48 && lon >= 6 && lon <= 19 ? [lat, lon, 14] : null;
}

type Route = { name: "map" } | { name: "bar"; key: string; cell: string };

function parseRoute(): Route {
  const match = /^\/bar\/([^/]+)$/.exec(location.pathname);
  const cell = new URLSearchParams(location.search).get("c") ?? "";
  if (match?.[1] && KEY.test(match[1]) && CELL.test(cell))
    return { name: "bar", key: match[1], cell };
  return { name: "map" };
}

type CellsState = "idle" | "too-many" | "loading" | "error" | "busy" | "ready";

/** Prices saved for one bar, sent together as one request after the 10 s of "Annulla" (D-15). */
interface PendingSave {
  drafts: Draft[];
  timer: HoldableTimer;
  sent: boolean;
}

type Proposing =
  | { step: "form"; name: string }
  | ({
      step: "pin";
      sending: boolean;
      touched: boolean;
      start: { lat: number; lon: number } | null;
    } & Proposal);

interface Props {
  loadMap: () => Promise<typeof import("./lib/maplibre-map")>;
}

export function App({ loadMap }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<VenueMap | null>(null);
  // The map as soon as it exists: handlers of a render that is a moment old still see `map` as null,
  // and a move asked in that window would be stored for a creation that already happened.
  const mapRef = useRef<VenueMap | null>(null);
  // A move asked before the map is ready (fast tap, slow network) is applied when it is.
  const [initialAt] = useState(parseAt);
  const pendingMove = useRef<[number, number, number] | null>(initialAt);
  const [ready, setReady] = useState(false);
  const [pricesShown, setPricesShown] = useState<string[]>([]);
  const [view, setView] = useState<MapView | null>(null);
  const [route, setRoute] = useState<Route>(parseRoute);
  const [sheet, setSheet] = useState<"search" | "list" | null>(null);
  const [searchHint, setSearchHint] = useState<string | undefined>();
  const [adding, setAdding] = useState<{ prefill: Prefill | null } | null>(null);
  const [addOrigin, setAddOrigin] = useState<{ lat: number; lon: number } | null>(null);
  const [proposing, setProposing] = useState<Proposing | null>(null);
  const [reporting, setReporting] = useState<{ venue: Venue; row: PriceRow | null } | null>(null);
  const [toast, setToast] = useState<{
    text: string;
    stamp?: StampInfo;
    undo?: () => void;
    more?: { label: string; run: () => void };
  } | null>(null);
  const [barVersion, setBarVersion] = useState(0); // reloads the bar page after a contribution
  // Both stay in the page and follow the topmost sheet, so they are never under an inert backdrop.
  const turnstileHost = useMemo(() => floating("turnstile-host"), []);
  const toastRegion = useMemo(() => floating("toast-region", "status"), []);
  const toastTimer = useRef<HoldableTimer | null>(null);
  const pendingSave = useRef<PendingSave | null>(null);
  const flewToBar = useRef(false);
  const [chip, setChip] = useState<ChipId>(DEFAULT_CHIP.id);
  const [venues, setVenues] = useState<Map<string, Venue>>(new Map());
  const [cellsState, setCellsState] = useState<CellsState>("idle");
  const [attempt, setAttempt] = useState(0); // "Riprova" after a cell error
  const [position, setPosition] = useState<{ lat: number; lon: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [mapFailed, setMapFailed] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [invite, setInvite] = useState<"prompt" | "ios" | null>(null);
  useEffect(() => {
    const update = () => {
      setOnline(navigator.onLine);
    };
    addEventListener("online", update);
    addEventListener("offline", update);
    return () => {
      removeEventListener("online", update);
      removeEventListener("offline", update);
    };
  }, []);
  // MapLibre starts on the first gesture or action that needs it (ADR 0014); until then a static
  // picture of the same view keeps the first load light.
  const [mapWanted, setMapWanted] = useState(initialAt !== null);
  const ensureMap = () => {
    setMapWanted(true);
  };
  const selected = MAP_CHIPS.find((c) => c.id === chip) ?? DEFAULT_CHIP;

  // Map: created once, when first wanted.
  useEffect(() => {
    if (!mapWanted) return;
    let cancelled = false;
    void loadMap()
      .then(({ VenueMap }) => (container.current ? VenueMap.create(container.current) : null))
      .then((created) => {
        if (!created || cancelled) return;
        created.onMove(setView);
        created.onRendered(setPricesShown);
        created.onVenueClick((key, cell) => {
          navigate(`/bar/${key}?c=${cell}`);
        });
        setView(created.view());
        mapRef.current = created;
        if (pendingMove.current) created.moveTo(...pendingMove.current);
        pendingMove.current = null;
        setMap(created);
        setReady(true); // create() resolves once the style is in: the tiles may still be coming
      })
      .catch(() => {
        setMapFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [mapWanted]);

  // Going to the background is not a cancellation: send the pending price now (D-15).
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden" && pendingSave.current)
        void send(pendingSave.current);
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
    };
  }, []);

  useEffect(() => {
    const onPop = () => {
      setRoute(parseRoute());
    };
    addEventListener("popstate", onPop);
    return () => {
      removeEventListener("popstate", onPop);
    };
  }, []);

  function navigate(path: string) {
    history.pushState({ inApp: true }, "", path);
    setSheet(null);
    setRoute(parseRoute());
  }

  // Cells: from zoom 13, at most 12 visible cells; each downloaded once per visit (SPEC 5.4).
  useEffect(() => {
    if (!view || view.zoom < MIN_ZOOM_CELLS) {
      setCellsState("idle");
      return;
    }
    const cells = visibleCells(view);
    if (!cells) {
      setCellsState("too-many");
      return;
    }
    let current = true;
    setCellsState("loading");
    Promise.all(cells.map(loadCell))
      .then((lists) => {
        if (!current) return;
        mergeVenues(lists.flat());
        setCellsState("ready");
      })
      .catch((error: unknown) => {
        if (current) setCellsState(error instanceof ServiceBusy ? "busy" : "error");
      });
    return () => {
      current = false;
    };
  }, [view, attempt]);

  // A "Vicino a me" message belongs to the view it was shown on: moving the map clears it.
  useEffect(() => {
    setMessage((current) => (current === it.map.locating ? current : null));
  }, [view?.lat, view?.lon, view?.zoom]);

  // Proposed bars (pending) are offered only when choosing the bar of a price (D-05).
  const everyVenue = useMemo(() => [...venues.values()], [venues]);
  const allVenues = useMemo(() => everyVenue.filter((v) => !v.pending), [everyVenue]);
  const inView = useMemo(
    () =>
      view && view.zoom >= MIN_ZOOM_CELLS
        ? allVenues.filter(
            (v) =>
              v.lat >= view.south &&
              v.lat <= view.north &&
              v.lon >= view.west &&
              v.lon <= view.east,
          )
        : [],
    [allVenues, view],
  );

  // Tier of every priced bar against the median of its cell (D-12); colours only with 5+ prices.
  const zoneCoverage = useMemo(
    () => coverage(inView, selected.drink, selected.size),
    [inView, selected],
  );
  const tiersActive = useMemo(
    () =>
      inView.some((v) => {
        const price = shownPrice(v, selected.drink, selected.size);
        return price && cellMedian(allVenues, v.cell, selected.drink, selected.size) !== null;
      }),
    [inView, allVenues, selected],
  );

  useEffect(() => {
    const today = todayRome();
    const medians = new Map<string, number | null>();
    map?.setVenues(
      allVenues.map((v) => {
        const price = shownPrice(v, selected.drink, selected.size);
        const label = price
          ? `${formatPrice(price[4])}${price[3] === 1 ? ` ${it.bar.happyHour}` : ""}`
          : "";
        if (!medians.has(v.cell)) {
          medians.set(v.cell, cellMedian(allVenues, v.cell, selected.drink, selected.size));
        }
        return {
          key: v.key,
          cell: v.cell,
          lat: v.lat,
          lon: v.lon,
          label,
          // The median is of normal-hours prices: a happy-hour-only price stays neutral (D-13).
          tier: price && price[3] === 0 ? tierOf(price[4], medians.get(v.cell) ?? null) : "neutro",
          stale: price ? isStale(price[5], today) : false,
        };
      }),
    );
  }, [map, allVenues, selected]);

  // The search code is its own chunk, downloaded when the sheet is first opened (M4-16).
  const [SearchComponent, setSearchComponent] = useState<typeof SearchSheetType | null>(null);
  useEffect(() => {
    if (sheet !== "search" || SearchComponent) return;
    void import("./components/SearchSheet").then((m) => {
      setSearchComponent(() => m.SearchSheet);
    });
  }, [sheet, SearchComponent]);

  // «I più economici qui»: the cheapest prices of the chosen drink in the visible area (M4-04).
  const cheapest = useMemo<Cheap[]>(
    () =>
      inView
        .flatMap((venue) => {
          const row = shownPrice(venue, selected.drink, selected.size);
          return row ? [{ venue, cents: row[4], day: row[5] }] : [];
        })
        .sort((a, b) => a.cents - b.cents || (a.day < b.day ? 1 : a.day > b.day ? -1 : 0))
        .slice(0, 10),
    [inView, selected],
  );

  const zoomedIn = view !== null && view.zoom >= MIN_ZOOM_CELLS;
  // The bar whose sheet is open is the crown cork on the map (brand, MB-07).
  useEffect(() => {
    map?.setSelected(route.name === "bar" ? route.key : null);
  }, [map, route, allVenues]);
  // A zone where almost nobody has a price yet invites the first one (D-28, MB-13).
  const emptyZone = zoomedIn && cellsState === "ready" && zoneCoverage.empty;
  // The message of "Vicino a me" (searching, not found, denied) is shown at any zoom: it ends as
  // soon as the map moves (see the effect above), then the cell status is back.
  const shownMessage = message;
  const status =
    (online ? null : it.map.offline) ??
    (mapFailed ? it.map.mapError : null) ??
    shownMessage ??
    (mapWanted && !ready
      ? it.map.loadingMap
      : !zoomedIn
        ? it.map.zoomIn
        : cellsState === "too-many"
          ? it.map.tooManyCells
          : cellsState === "loading"
            ? it.map.loading
            : cellsState === "busy"
              ? it.map.busy
              : cellsState === "error"
                ? it.map.loadError
                : it.map.coverage(zoneCoverage.withPrice, zoneCoverage.total));

  // The coverage bar of the brand (Copertura): only beside the coverage sentence itself.
  const showMeter = status === it.map.coverage(zoneCoverage.withPrice, zoneCoverage.total);
  const meterWidth =
    zoneCoverage.total && zoneCoverage.withPrice
      ? Math.max(10, Math.round((60 * zoneCoverage.withPrice) / zoneCoverage.total))
      : 0;

  /** Back to the map: a real "back" when we opened the bar, otherwise replace (MASTER: predictable back). */
  function closeBar() {
    if ((history.state as { inApp?: boolean } | null)?.inApp) {
      history.back();
      return;
    }
    history.replaceState(null, "", "/");
    setRoute(parseRoute());
  }

  function mergeVenues(list: Venue[]) {
    setVenues((previous) => {
      const next = new Map(previous);
      for (const venue of list) next.set(venue.key, venue);
      return next;
    });
  }

  /**
   * Opens "Aggiungi prezzo" (SPEC 7.3): the nearest bars come from the position if already granted,
   * else the map centre (D-16); the cells around that point are downloaded if not loaded yet.
   * Only cell ids leave the device (SPEC 14).
   */
  function openAdd(prefill: Prefill | null) {
    // A plain notice («Annullato», an error) must not stay over the bars of the new sheet; a toast with
    // «Annulla» or «Aggiungi un altro drink» belongs to a price still waiting and stays.
    if (toast && !toast.undo && !toast.more) {
      toastTimer.current?.clear();
      setToast(null);
    }
    setAdding({ prefill });
    if (prefill?.venue) return;
    void (async () => {
      let origin =
        position ?? (view && view.zoom >= MIN_ZOOM_CELLS ? { lat: view.lat, lon: view.lon } : null);
      if (!position && (await positionGranted())) {
        const found = await locate();
        if (found.ok) {
          origin = { lat: found.lat, lon: found.lon };
          setPosition(origin);
        }
      }
      origin ??= view ? { lat: view.lat, lon: view.lon } : ITALY_CENTER;
      setAddOrigin(origin);
      const around = visibleCells({
        south: origin.lat - 0.03,
        north: origin.lat + 0.03,
        west: origin.lon - 0.04,
        east: origin.lon + 0.04,
      });
      const lists = await Promise.all((around ?? []).map((c) => loadCell(c).catch(() => [])));
      mergeVenues(lists.flat());
    })();
  }

  const host = () => {
    const layer = topLayer();
    if (turnstileHost.parentElement !== layer) layer.append(turnstileHost);
    return turnstileHost;
  };

  function showToast(
    text: string,
    undo?: () => void,
    ms = 4000,
    more?: { label: string; run: () => void },
    stamp?: StampInfo,
  ) {
    toastTimer.current?.clear();
    setToast({ text, undo, more, stamp });
    toastTimer.current = holdableTimeout(() => {
      setToast(null);
    }, ms);
  }

  /** While the toast is pointed at or focused, neither it nor the pending send times out. */
  function holdToast(held: boolean) {
    for (const timer of [toastTimer.current, pendingSave.current?.timer]) {
      if (held) timer?.hold();
      else timer?.release();
    }
  }

  // The toast region follows the topmost sheet and sits just above the attribution (SPEC 2.8).
  useEffect(() => {
    const layer = topLayer();
    if (toastRegion.parentElement !== layer) layer.append(toastRegion);
    const attribution = document.querySelector(".map__attribution");
    if (attribution) {
      const above = window.innerHeight - attribution.getBoundingClientRect().top;
      toastRegion.style.setProperty("--toast-bottom", `${String(Math.round(above) + 8)}px`);
    }
    const hadFocus = toastRegion.contains(document.activeElement);
    render(
      toast ? (
        <Toast
          text={toast.text}
          stamp={toast.stamp}
          onUndo={toast.undo}
          more={toast.more}
          onHold={holdToast}
        />
      ) : null,
      toastRegion,
    );
    // "Annulla" just disappeared under the focus: give it back to a sensible place (WCAG 2.4.3).
    if (hadFocus && !toastRegion.contains(document.activeElement)) {
      const fallback =
        layer === document.body
          ? document.querySelector<HTMLElement>(".bottom__primary")
          : layer.querySelector<HTMLElement>("h2");
      fallback?.focus();
    }
  });

  const drinkLabel = (code: string) => (it.drinks[code] ?? code).toLowerCase();

  function reopen(draft: Draft, error: string) {
    setAdding({
      prefill: {
        venue: draft.venue,
        drink: draft.drink,
        size: draft.size,
        hh: draft.hh,
        error,
        text: (draft.cents / 100).toFixed(2).replace(".", ","),
      },
    });
  }

  /** Sends a saved price: after the 10 s of "Annulla" or when the page goes to the background (D-15). */
  async function send(entry: PendingSave) {
    if (entry.sent) return;
    entry.sent = true;
    entry.timer.clear();
    if (pendingSave.current === entry) pendingSave.current = null;
    const [first] = entry.drafts;
    if (!first) return;
    const { venue } = first;
    try {
      const response = await postWithSession(
        host(),
        "/api/prices",
        {
          venue: venue.key,
          cell: venue.cell,
          source: "manual",
          items: entry.drafts.map((d) => ({
            drink: d.drink,
            size_ml: d.size,
            hh: d.hh,
            price_cents: d.cents,
          })),
        },
        true,
      );
      if (response.status === 429) {
        reopen(first, it.add.quota);
        return;
      }
      if (!response.ok) {
        reopen(first, it.add.network);
        return;
      }
      const { results } = (await response.json()) as {
        results: { status: string; code?: string }[];
      };
      const rejected = results.findIndex((r) => r.status === "rejected");
      const bad = entry.drafts[rejected];
      if (bad) {
        reopen(
          bad,
          results[rejected]?.code === "under_review"
            ? it.add.underReview
            : it.add.outOfRange(drinkLabel(bad.drink)),
        );
        return;
      }
      if (results.some((r) => r.status === "quarantined")) showToast(it.add.quarantined);
      else if (results.some((r) => r.status === "confirmed")) {
        showToast(
          results.every((r) => r.code === "already") ? it.add.alreadyThere : it.add.confirmedSame,
        );
      }
      invalidateCell(venue.cell);
      setAttempt((n) => n + 1);
      setBarVersion((n) => n + 1);
    } catch {
      reopen(first, it.add.network);
    }
  }

  /** Saves a price; more drinks for the same bar join the same request (one POST, one "Annulla"). */
  function save(draft: Draft) {
    setAdding(null);
    const previous = pendingSave.current;
    const joins = previous && !previous.sent && previous.drafts[0]?.venue.key === draft.venue.key;
    if (previous && !joins) void send(previous); // another bar: the earlier prices go now
    previous?.timer.clear();
    const entry: PendingSave = {
      drafts: joins ? [...previous.drafts, draft] : [draft],
      timer: holdableTimeout(() => void send(entry), 10_000),
      sent: false,
    };
    pendingSave.current = entry;
    // The Timbro: today's date, the stamp line, Copertura +1 when this bar had no price for the
    // chosen drink in the zone, and the Tessera when a stamp is reached (MB-11, MB-12).
    const today = todayRome();
    const before = priceCount();
    const after = addPrices(1, today);
    const lines: string[] = [it.add.stamp];
    const hadPrice = Boolean(shownPrice(draft.venue, selected.drink, selected.size));
    if (!hadPrice && inView.some((v) => v.key === draft.venue.key))
      lines.push(it.add.coverageUp(zoneCoverage.withPrice + 1, zoneCoverage.total));
    // The second price, once: the moment someone shows they will come back (M4-09).
    if (before === 1 && after === 2) setInvite(installMode());
    const step = stampReached(before, after);
    const tessera = (step && it.tessera.messages[step]) || it.tessera.count(after);
    // Android only; Safari has no vibrate().
    (navigator as { vibrate?: (ms: number) => boolean }).vibrate?.(20);
    showToast(
      it.add.saved,
      () => {
        entry.timer.clear();
        entry.sent = true;
        addPrices(-1, today);
        if (pendingSave.current === entry) pendingSave.current = null;
        showToast(it.add.undone);
      },
      10_000,
      {
        label: it.add.another,
        run: () => {
          entry.timer.hold(); // the batch waits while the next drink is typed
          openAdd({ venue: draft.venue });
        },
      },
      { day: formatStampDay(), lines, count: after, tessera },
    );
    // Turnstile only now, at the first contribution (M2-02), during the 10 s window; after the
    // add sheet has closed, so its host lands in the layer that stays open.
    setTimeout(() => {
      ensureSession(host()).catch(() => undefined);
    }, 0);
  }

  // ---- "Non trovi il bar?" (SPEC 7.5): name and kind, then a pin on the map ----

  /** The panel that held the focus is gone: the main action is the natural place to land (WCAG 2.4.3). */
  function focusPrimary() {
    setTimeout(() => {
      document.querySelector<HTMLElement>(".bottom__primary")?.focus();
    }, 0);
  }

  function startProposal(name = "") {
    setAdding(null);
    setProposing({ step: "form", name });
  }

  function startPin(proposal: Proposal) {
    // Where the bar list was centred: the position if known, else the map centre (D-16).
    const at = position ?? (view && view.zoom >= MIN_ZOOM_CELLS ? view : null);
    const start = at ? { lat: at.lat, lon: at.lon } : null;
    setProposing({ step: "pin", sending: false, touched: false, start, ...proposal });
    if (at) moveTo(at.lat, at.lon, 17);
    else ensureMap();
  }

  const pinning = proposing?.step === "pin" ? proposing : null;
  // The pin is the user's own once the map has been moved away from where it started; without a
  // known start (no position, map far out) any touch of the map counts.
  // A fix that arrives after the pin step began moves the map onto the device: the current position
  // is checked too, not only the one the pin step started from.
  const awayFromDevice =
    !position ||
    view === null ||
    distanceMeters(view.lat, view.lon, position.lat, position.lon) >= PIN_MIN_MOVE_M;
  const pinPlaced = !pinning
    ? false
    : awayFromDevice &&
      (pinning.start
        ? view !== null &&
          distanceMeters(view.lat, view.lon, pinning.start.lat, pinning.start.lon) >= PIN_MIN_MOVE_M
        : pinning.touched);
  const similar = useMemo(() => {
    if (!pinning || !view) return [];
    const wanted = searchKey(pinning.name);
    return everyVenue
      .filter((v) => {
        const known = searchKey(v.name);
        return (
          distanceMeters(view.lat, view.lon, v.lat, v.lon) <= SIMILAR_METERS &&
          (known.includes(wanted) || wanted.includes(known))
        );
      })
      .slice(0, SIMILAR_MAX);
  }, [pinning?.name, view, everyVenue]);

  /** Sends the confirmed pin (the bar's position, never the device's) and goes on to its price. */
  async function sendProposal() {
    // The pin must be placed by the user: the map starts on the device position, so it has to be
    // moved away from it before sending (SPEC 14: the bar's position, not the user's).
    if (!pinning || !pinPlaced || !view || view.zoom < PIN_MIN_ZOOM) return;
    const { name, kind } = pinning;
    const lat = Math.round(view.lat * 1e5) / 1e5;
    const lon = Math.round(view.lon * 1e5) / 1e5;
    setProposing({ ...pinning, sending: true });
    const retry = () => {
      setProposing({ ...pinning, sending: false });
    };
    try {
      const response = await postWithSession(host(), "/api/venues", { name, kind, lat, lon });
      if (response.ok) {
        const { key, cell } = (await response.json()) as { key: string; cell: string };
        const venue: Venue = {
          key,
          name,
          kind,
          lat,
          lon,
          addr: "",
          city: "",
          cell,
          prices: [],
          pending: true,
        };
        mergeVenues([venue]);
        invalidateCell(cell);
        setProposing(null);
        showToast(it.propose.thanks, undefined, 8000);
        openAdd({ venue });
      } else if (response.status === 409) {
        const { key } = (await response.json()) as { key: string | null };
        const known = everyVenue.find((v) => v.key === key);
        setProposing(null);
        if (known) {
          showToast(it.propose.exists);
          openAdd({ venue: known });
        } else {
          showToast(key ? it.propose.exists : it.propose.rejected);
          focusPrimary();
        }
      } else {
        showToast(
          response.status === 429
            ? it.propose.quota
            : response.status === 503
              ? it.errors.busy
              : it.propose.failed,
        );
        retry();
      }
    } catch {
      showToast(it.propose.failed);
      retry();
    }
  }

  const barActions: BarActions = {
    confirm: async (row) => {
      const response = await postWithSession(host(), "/api/prices/confirm", {
        venue: row[0],
        drink: row[1],
        size_ml: row[2],
        hh: row[3],
      });
      if (!response.ok) throw new Error(String(response.status));
      const body = (await response.json()) as { status: string; confirmations: number };
      return { count: body.confirmations, counted: body.status === "confirmed" };
    },
    changed: (venue, row) => {
      openAdd({ venue, drink: row[1], size: row[2], hh: row[3] });
    },
    report: (venue, row) => {
      setReporting({ venue, row });
    },
    addHere: (venue) => {
      openAdd({ venue });
    },
  };

  async function sendReport(target: { venue: Venue; row: PriceRow | null }, reason: Reason) {
    setReporting(null);
    const price = target.row
      ? { drink: target.row[1], size_ml: target.row[2], hh: target.row[3] }
      : {};
    try {
      const response = await postWithSession(host(), "/api/reports", {
        venue: target.venue.key,
        cell: target.venue.cell,
        reason,
        ...price,
      });
      if (!response.ok) throw new Error(String(response.status));
      const body = (await response.json()) as { status: string };
      showToast(
        body.status === "already"
          ? it.report.already
          : target.row && (reason === "wrong_price" || reason === "offensive")
            ? it.report.thanks
            : it.report.thanksBar,
      );
    } catch {
      showToast(it.actions.failed);
    }
  }

  function moveTo(lat: number, lon: number, zoom: number) {
    const current = mapRef.current;
    if (current) current.moveTo(lat, lon, zoom);
    else {
      pendingMove.current = [lat, lon, zoom];
      ensureMap();
    }
  }

  async function nearMe() {
    setMessage(it.map.locating);
    ensureMap(); // load the map while the position is being found
    const found = await locate();
    if (found.ok) {
      // Kept in memory on the device only (SPEC 14).
      setPosition({ lat: found.lat, lon: found.lon });
      setMessage(null);
      moveTo(found.lat, found.lon, 15);
    } else {
      // The way out is the city search, opened for the user with what can be done on this device.
      setMessage(it.map.position[found.reason]);
      setSearchHint(
        found.reason === "denied" ? it.map.position.deniedHelp[blockedHelp()] : undefined,
      );
      setSheet("search");
    }
  }

  function goToPlace(place: Place) {
    setSheet(null);
    setMessage(null);
    moveTo(place[2], place[3], 14);
  }

  return (
    <div class="app">
      <header class="top">
        <div class="top__row">
          <h1 class="brand">
            <img class="brand__mark" src="/brand/simbolo.svg" alt="" width="28" height="34" />
            <span class="sr-only">{APP_NAME}</span>
          </h1>
          <button
            type="button"
            class="btn search-field"
            onClick={() => {
              setSearchHint(undefined);
              setSheet("search");
              ensureMap(); // warm the map up while the user types
            }}
          >
            <Icon name="search" />
            {it.search.open}
          </button>
          <button
            type="button"
            class="btn icon-btn"
            aria-label={it.map.nearMe}
            onClick={() => void nearMe()}
          >
            <Icon name="locate" />
          </button>
        </div>
        <div class="chips" role="group" aria-label={it.map.drinks}>
          {MAP_CHIPS.map((c) => (
            <button
              key={c.id}
              type="button"
              class="chip"
              aria-pressed={c.id === chip}
              onClick={() => {
                setChip(c.id);
              }}
            >
              <Icon name={drinkIcon(c.drink)} />
              {chipLabel(c)}
            </button>
          ))}
        </div>
      </header>

      <main class="main">
        <section
          class="map"
          aria-label={it.map.region}
          data-zoom={view ? view.zoom.toFixed(1) : ""}
          data-center={view ? `${view.lat.toFixed(5)},${view.lon.toFixed(5)}` : ""}
          data-ready={ready ? "true" : "false"}
          data-selected={route.name === "bar" ? route.key : ""}
          data-prices-shown={pricesShown.join("|")}
          onPointerDown={() => {
            if (pinning && !pinning.touched) setProposing({ ...pinning, touched: true });
          }}
          onKeyDown={() => {
            if (pinning && !pinning.touched) setProposing({ ...pinning, touched: true });
          }}
        >
          <div ref={container} class="map__canvas" />
          {!ready && (
            <button
              type="button"
              class="map__preview"
              aria-label={it.map.explore}
              onPointerDown={ensureMap}
              onClick={ensureMap}
            >
              <picture>
                <source media="(prefers-color-scheme: dark)" srcset="/map-italia-dark.jpg" />
                <img src="/map-italia-light.jpg" alt="" width={780} height={1276} />
              </picture>
            </button>
          )}
          {zoomedIn && tiersActive && !pinning && (
            <ul class="legend" aria-label={it.map.legend}>
              {(["affare", "giusto", "salato"] as const).map((t) => (
                <li key={t} class={`legend__item legend__item--${t}`}>
                  <span aria-hidden="true">
                    {t === "affare" ? "↓" : t === "giusto" ? "=" : "↑"}
                  </span>{" "}
                  {it.map.tiers[t]}
                </li>
              ))}
            </ul>
          )}
          {pinning && <div class="map__cross" aria-hidden="true" data-testid="pin-mark" />}
          <p class="map__status" data-testid="map-status" role="status">
            {showMeter && (
              <svg class="meter" viewBox="0 0 64 14" aria-hidden="true">
                <rect class="meter__fill" x="2" y="2" height="10" rx="5" width={meterWidth} />
                <rect class="meter__track" x="1" y="1" width="62" height="12" rx="6" />
              </svg>
            )}
            {status}
          </p>
          {/* Attributions in the shell: always visible, even before MapLibre loads (SPEC 2.8). */}
          <p class="map__attribution">
            <a href="https://openfreemap.org" target="_blank" rel="noopener" tabIndex={0}>
              {it.map.attribution.openFreeMap}
            </a>{" "}
            <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener" tabIndex={0}>
              {it.map.attribution.openMapTiles}
            </a>{" "}
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noopener"
              tabIndex={0}
            >
              {it.map.attribution.openStreetMap}
            </a>
          </p>
          {zoomedIn && cellsState === "error" && !message && (
            <button
              type="button"
              class="btn btn--secondary map__retry"
              onClick={() => {
                setAttempt((n) => n + 1);
              }}
            >
              {it.map.retry}
            </button>
          )}
        </section>
      </main>

      {/* While the pin is placed the bar stays in the layout (hidden, inert) and the panel lies over
          it: the map must not change height, or its centre moves and the pin looks already placed. */}
      <div class="bottom-slot">
        <nav class="bottom" aria-label={it.map.actions} inert={pinning ? true : undefined}>
          {invite && (
            <div class="bottom__invite" role="region" aria-label={it.install.action}>
              <p>{invite === "ios" ? it.install.ios : it.install.prompt}</p>
              <div class="bottom__invite-actions">
                {invite === "prompt" && (
                  <button
                    type="button"
                    class="btn btn--secondary"
                    onClick={() => {
                      setInvite(null);
                      void promptInstall();
                    }}
                  >
                    {it.install.action}
                  </button>
                )}
                <button
                  type="button"
                  class="btn btn--ghost"
                  onClick={() => {
                    setInvite(null);
                  }}
                >
                  {invite === "ios" ? it.install.ok : it.install.dismiss}
                </button>
              </div>
            </div>
          )}
          {emptyZone && <p class="bottom__empty">{it.map.emptyZone}</p>}
          <button
            type="button"
            class="btn btn--primary bottom__primary"
            onClick={() => {
              openAdd(null);
            }}
          >
            {it.add.open}
          </button>
          {emptyZone && (
            <>
              <button
                type="button"
                class="btn btn--secondary"
                onClick={() => {
                  startProposal();
                }}
              >
                {it.add.addMissing}
              </button>
              {"share" in navigator && (
                <button
                  type="button"
                  class="btn btn--secondary"
                  onClick={() => {
                    navigator
                      .share({ title: APP_NAME, url: location.origin })
                      .catch(() => undefined);
                  }}
                >
                  {it.map.shareMap}
                </button>
              )}
            </>
          )}
          <button
            type="button"
            class={
              emptyZone && !("share" in navigator)
                ? "btn btn--secondary bottom__wide"
                : "btn btn--secondary"
            }
            onClick={() => {
              setSheet("list");
            }}
          >
            <Icon name="list" />
            {it.map.list}
          </button>
        </nav>
        {pinning && (
          <PinPanel
            name={pinning.name}
            close={view !== null && view.zoom >= PIN_MIN_ZOOM}
            placed={pinPlaced}
            sending={pinning.sending}
            similar={similar}
            onPick={(venue) => {
              setProposing(null);
              openAdd({ venue });
            }}
            onConfirm={() => void sendProposal()}
            onCancel={() => {
              setProposing(null);
              focusPrimary();
            }}
          />
        )}
      </div>
      {sheet === "search" && SearchComponent && (
        <SearchComponent
          origin={position ?? (view ? { lat: view.lat, lon: view.lon } : null)}
          cheapest={cheapest}
          drink={chipLabel(selected)}
          hint={searchHint}
          onPlace={goToPlace}
          onBar={(hit) => {
            // The static fragment knows the bar; the cell is where it lies (ADR 0024).
            moveTo(hit[2], hit[3], 17);
            flewToBar.current = true;
            navigate(`/bar/${hit[0]}?c=${encodeGeohash(hit[2], hit[3], 5)}`);
          }}
          onCheap={(v) => {
            navigate(`/bar/${v.key}?c=${v.cell}`);
          }}
          onPropose={(name) => {
            setSheet(null);
            startProposal(name);
          }}
          onClose={() => {
            setSheet(null);
          }}
        />
      )}
      {sheet === "list" && (
        <ListSheet
          venues={inView}
          drink={selected.drink}
          size={selected.size}
          position={position}
          onOpen={(v) => {
            navigate(`/bar/${v.key}?c=${v.cell}`);
          }}
          onClose={() => {
            setSheet(null);
          }}
        />
      )}
      {route.name === "bar" && (
        <BarSheet
          key={`${route.key}:${String(barVersion)}`}
          venueKey={route.key}
          cell={route.cell}
          actions={barActions}
          focus={{ drink: selected.drink, size: selected.size }}
          tier={(row) =>
            row[3] === 0
              ? tierOf(row[4], cellMedian(allVenues, route.cell, row[1], row[2]))
              : "neutro"
          }
          onVenue={(v) => {
            // A search already flew to the bar (zoom 17): the page must not move the map again.
            if (flewToBar.current) flewToBar.current = false;
            else if (!view || view.zoom < MIN_ZOOM_CELLS) moveTo(v.lat, v.lon, 16);
          }}
          onClose={closeBar}
        />
      )}
      {adding && (
        <AddPriceSheet
          venues={everyVenue}
          origin={addOrigin}
          prefill={adding.prefill}
          onSave={save}
          onPropose={() => {
            startProposal();
          }}
          onClose={() => {
            setAdding(null);
            pendingSave.current?.timer.release(); // a held batch (another drink) goes on
          }}
        />
      )}
      {proposing?.step === "form" && (
        <ProposeSheet
          initialName={proposing.name}
          onNext={startPin}
          onClose={() => {
            setProposing(null);
          }}
        />
      )}
      {reporting && (
        <ReportSheet
          onPrice={reporting.row !== null}
          onSend={(reason) => void sendReport(reporting, reason)}
          onClose={() => {
            setReporting(null);
          }}
        />
      )}
    </div>
  );
}
