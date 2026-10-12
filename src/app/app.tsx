import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { Place } from "../shared/api-types";
import { MAP_CHIPS, type ChipId } from "../shared/catalog";
import { APP_NAME } from "../shared/config";
import { visibleCells } from "../shared/geohash";
import type { PriceRow } from "../shared/api-types";
import { AddPriceSheet, type Draft, type Prefill } from "./components/AddPriceSheet";
import { BarSheet, type BarActions } from "./components/BarSheet";
import { ReportSheet, type Reason } from "./components/ReportSheet";
import { Toast } from "./components/Toast";
import { Icon } from "./components/Icon";
import { ListSheet } from "./components/ListSheet";
import { SearchSheet } from "./components/SearchSheet";
import { it } from "./i18n/it";
import { invalidateCell, loadCell, shownPrice, type Venue } from "./lib/data";
import { ensureSession, postWithSession } from "./lib/session";
import { formatPrice } from "./lib/format";
import type { MapView, VenueMap } from "./lib/maplibre-map";

const MIN_ZOOM_CELLS = 13;
/** Centre of the start view (the Italy picture), used when nothing better is known (D-16). */
const ITALY_CENTER = { lat: 41.85, lon: 12.6 };

/** True when the user already granted the position: reading it then shows no prompt. */
async function positionGranted(): Promise<boolean> {
  try {
    return (await navigator.permissions.query({ name: "geolocation" })).state === "granted";
  } catch {
    return false;
  }
}

function currentPosition(): Promise<{ lat: number; lon: number } | null> {
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        resolve({ lat: coords.latitude, lon: coords.longitude });
      },
      () => {
        resolve(null);
      },
      { timeout: 10_000, maximumAge: 60_000 },
    );
  });
}
const KEY = /^[nwru]\d{1,15}$/;
const CELL = /^[0-9b-hjkmnp-z]{5}$/;

type Route = { name: "map" } | { name: "bar"; key: string; cell: string };

function parseRoute(): Route {
  const match = /^\/bar\/([^/]+)$/.exec(location.pathname);
  const cell = new URLSearchParams(location.search).get("c") ?? "";
  if (match?.[1] && KEY.test(match[1]) && CELL.test(cell))
    return { name: "bar", key: match[1], cell };
  return { name: "map" };
}

type CellsState = "idle" | "too-many" | "loading" | "error" | "ready";

interface Props {
  loadMap: () => Promise<typeof import("./lib/maplibre-map")>;
}

export function App({ loadMap }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<VenueMap | null>(null);
  // A move asked before the map is ready (fast tap, slow network) is applied when it is.
  const pendingMove = useRef<[number, number, number] | null>(null);
  const [ready, setReady] = useState(false);
  const [pricesShown, setPricesShown] = useState<string[]>([]);
  const [view, setView] = useState<MapView | null>(null);
  const [route, setRoute] = useState<Route>(parseRoute);
  const [sheet, setSheet] = useState<"search" | "list" | null>(null);
  const [adding, setAdding] = useState<{ prefill: Prefill | null } | null>(null);
  const [addOrigin, setAddOrigin] = useState<{ lat: number; lon: number } | null>(null);
  const [reporting, setReporting] = useState<{ venue: Venue; row: PriceRow | null } | null>(null);
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null);
  const [barVersion, setBarVersion] = useState(0); // reloads the bar page after a contribution
  const turnstileHost = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const pendingSave = useRef<{ draft: Draft; timer: number; sent: boolean } | null>(null);
  const [chip, setChip] = useState<ChipId>(MAP_CHIPS[0].id);
  const [venues, setVenues] = useState<Map<string, Venue>>(new Map());
  const [cellsState, setCellsState] = useState<CellsState>("idle");
  const [attempt, setAttempt] = useState(0); // "Riprova" after a cell error
  const [position, setPosition] = useState<{ lat: number; lon: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [mapFailed, setMapFailed] = useState(false);
  // MapLibre starts on the first gesture or action that needs it (ADR 0014); until then a static
  // picture of the same view keeps the first load light.
  const [mapWanted, setMapWanted] = useState(false);
  const ensureMap = () => {
    setMapWanted(true);
  };
  const selected = MAP_CHIPS.find((c) => c.id === chip) ?? MAP_CHIPS[0];

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
        created.onIdle(() => {
          setReady(true);
        });
        created.onVenueClick((key, cell) => {
          navigate(`/bar/${key}?c=${cell}`);
        });
        setView(created.view());
        if (pendingMove.current) created.moveTo(...pendingMove.current);
        pendingMove.current = null;
        setMap(created);
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
      .catch(() => {
        if (current) setCellsState("error");
      });
    return () => {
      current = false;
    };
  }, [view, attempt]);

  const allVenues = useMemo(() => [...venues.values()], [venues]);
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

  useEffect(() => {
    map?.setVenues(
      allVenues.map((v) => {
        const price = shownPrice(v, selected.drink, selected.size);
        const label = price
          ? `${formatPrice(price[4])}${price[3] === 1 ? ` ${it.bar.happyHour}` : ""}`
          : "";
        return { key: v.key, cell: v.cell, lat: v.lat, lon: v.lon, label };
      }),
    );
  }, [map, allVenues, selected]);

  const zoomedIn = view !== null && view.zoom >= MIN_ZOOM_CELLS;
  // From zoom 13 the cell status wins, so loading, errors and counts are always announced;
  // only "searching your position" is shown over it.
  const shownMessage = message && (!zoomedIn || message === it.map.locating) ? message : null;
  const status =
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
            : cellsState === "error"
              ? it.map.loadError
              : it.map.bars(inView.length));

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
    setAdding({ prefill });
    if (prefill?.venue) return;
    void (async () => {
      let origin =
        position ?? (view && view.zoom >= MIN_ZOOM_CELLS ? { lat: view.lat, lon: view.lon } : null);
      if (!position && (await positionGranted())) {
        const found = await currentPosition();
        if (found) {
          setPosition(found);
          origin = found;
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
    if (!turnstileHost.current) throw new Error("turnstile host");
    return turnstileHost.current;
  };

  function showToast(text: string, undo?: () => void, ms = 4000) {
    window.clearTimeout(toastTimer.current);
    setToast({ text, undo });
    toastTimer.current = window.setTimeout(() => {
      setToast(null);
    }, ms);
  }

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
  async function send(entry: { draft: Draft; timer: number; sent: boolean }) {
    if (entry.sent) return;
    entry.sent = true;
    window.clearTimeout(entry.timer);
    if (pendingSave.current === entry) pendingSave.current = null;
    const { venue, drink, size, hh, cents } = entry.draft;
    try {
      const response = await postWithSession(
        host(),
        "/api/prices",
        {
          venue: venue.key,
          cell: venue.cell,
          source: "manual",
          items: [{ drink, size_ml: size, hh, price_cents: cents }],
        },
        true,
      );
      if (response.status === 429) {
        reopen(entry.draft, it.add.quota);
        return;
      }
      if (!response.ok) {
        reopen(entry.draft, it.add.network);
        return;
      }
      const { results } = (await response.json()) as {
        results: { status: string; code?: string }[];
      };
      const result = results[0];
      if (result?.status === "rejected") {
        reopen(
          entry.draft,
          result.code === "under_review"
            ? it.add.underReview
            : it.add.outOfRange(drinkLabel(drink)),
        );
        return;
      }
      if (result?.status === "quarantined") showToast(it.add.quarantined);
      if (result?.status === "confirmed") {
        showToast(result.code === "already" ? it.add.alreadyThere : it.add.confirmedSame);
      }
      invalidateCell(venue.cell);
      setAttempt((n) => n + 1);
      setBarVersion((n) => n + 1);
    } catch {
      reopen(entry.draft, it.add.network);
    }
  }

  function save(draft: Draft) {
    setAdding(null);
    const entry = { draft, timer: 0, sent: false };
    entry.timer = window.setTimeout(() => void send(entry), 10_000);
    pendingSave.current = entry;
    showToast(
      it.add.saved,
      () => {
        window.clearTimeout(entry.timer);
        entry.sent = true;
        if (pendingSave.current === entry) pendingSave.current = null;
        showToast(it.add.undone);
      },
      10_000,
    );
    // Turnstile only now, at the first contribution (M2-02), during the 10 s window.
    ensureSession(host()).catch(() => undefined);
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
      return body.status === "confirmed" ? body.confirmations : null;
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
      showToast(body.status === "already" ? it.report.already : it.report.thanks);
    } catch {
      showToast(it.actions.failed);
    }
  }

  function moveTo(lat: number, lon: number, zoom: number) {
    if (map) map.moveTo(lat, lon, zoom);
    else {
      pendingMove.current = [lat, lon, zoom];
      ensureMap();
    }
  }

  function nearMe() {
    setMessage(it.map.locating);
    ensureMap(); // load the map while the position is being found
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        // Kept in memory on the device only (SPEC 14).
        setPosition({ lat: coords.latitude, lon: coords.longitude });
        setMessage(null);
        moveTo(coords.latitude, coords.longitude, 15);
      },
      () => {
        setMessage(it.map.noPosition);
      },
      { timeout: 10_000, maximumAge: 60_000 },
    );
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
          <h1 class="brand">{APP_NAME}</h1>
          <button
            type="button"
            class="btn search-field"
            onClick={() => {
              setSheet("search");
              ensureMap(); // warm the map up while the user types
            }}
          >
            <Icon name="search" />
            {it.search.open}
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
              {it.chips[c.id]}
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
          data-prices-shown={pricesShown.join("|")}
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
              <img src="/map-italia.jpg" alt="" width={780} height={1308} />
            </button>
          )}
          <p class="map__status" data-testid="map-status" role="status">
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

      <div ref={turnstileHost} class="turnstile-host" />
      {toast && <Toast text={toast.text} onUndo={toast.undo} />}
      <nav class="bottom" aria-label={it.map.actions}>
        <button
          type="button"
          class="btn btn--primary bottom__primary"
          onClick={() => {
            openAdd(null);
          }}
        >
          {it.add.open}
        </button>
        <button type="button" class="btn btn--secondary" onClick={nearMe}>
          <Icon name="locate" />
          {it.map.nearMe}
        </button>
        <button
          type="button"
          class="btn btn--secondary"
          onClick={() => {
            setSheet("list");
          }}
        >
          <Icon name="list" />
          {it.map.list}
        </button>
      </nav>

      {sheet === "search" && (
        <SearchSheet
          venues={allVenues}
          onPlace={goToPlace}
          onVenue={(v) => {
            navigate(`/bar/${v.key}?c=${v.cell}`);
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
          onVenue={(v) => {
            if (!view || view.zoom < MIN_ZOOM_CELLS) moveTo(v.lat, v.lon, 16);
          }}
          onClose={closeBar}
        />
      )}
      {adding && (
        <AddPriceSheet
          venues={allVenues}
          origin={addOrigin}
          prefill={adding.prefill}
          onSave={save}
          onClose={() => {
            setAdding(null);
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
