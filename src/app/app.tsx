import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { Place } from "../shared/api-types";
import { MAP_CHIPS, type ChipId } from "../shared/catalog";
import { APP_NAME } from "../shared/config";
import { visibleCells } from "../shared/geohash";
import { BarSheet } from "./components/BarSheet";
import { Icon } from "./components/Icon";
import { ListSheet } from "./components/ListSheet";
import { SearchSheet } from "./components/SearchSheet";
import { it } from "./i18n/it";
import { loadCell, shownPrice, type Venue } from "./lib/data";
import { formatPrice } from "./lib/format";
import type { MapView, VenueMap } from "./lib/maplibre-map";

const MIN_ZOOM_CELLS = 13;
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
        setVenues((previous) => {
          const next = new Map(previous);
          for (const venue of lists.flat()) next.set(venue.key, venue);
          return next;
        });
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

      <nav class="bottom" aria-label={it.map.actions}>
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
          key={route.key}
          venueKey={route.key}
          cell={route.cell}
          onVenue={(v) => {
            if (!view || view.zoom < MIN_ZOOM_CELLS) moveTo(v.lat, v.lon, 16);
          }}
          onClose={closeBar}
        />
      )}
    </div>
  );
}
