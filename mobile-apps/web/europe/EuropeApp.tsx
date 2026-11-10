import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { UNDO_MS } from "@site/shared/config";
import { createPortal } from "preact/compat";
import { CATALOG as DRINKS, DEFAULT_DRINK } from "@site/shared/catalog";
import { currentLang, it } from "@site/app/i18n/lang";
import { useLang } from "@site/app/lib/use-lang";
import { holdableTimeout, type HoldableTimer } from "@site/app/lib/timer";
import { formatDate, todayRome } from "@site/app/lib/format";
import { isStale } from "@site/app/lib/tiers";
import type { Tier } from "@site/app/lib/tiers";
import { directionsUrl } from "@site/app/lib/geo";
import { locate } from "@site/app/lib/locate";
import { Icon, drinkIcon } from "@site/app/components/Icon";
import { LangMenu } from "@site/app/components/LangMenu";
import { Sheet } from "@site/app/components/Sheet";
import { AppLegalLinks } from "../components/AppLegalLinks";
import { DrinkHero } from "../components/DrinkHero";
import { sharePresentation } from "../share-presentation";
import type * as MapModule from "@site/app/lib/maplibre-map";
import type { VenueMap, MapView } from "@site/app/lib/maplibre-map";
import { drinkImage } from "../drink-images";
import { mobileFocus, mobilePath, type DrinkFocus } from "../routes";
import {
  loadCity,
  submitPrice,
  confirmPrice,
  reportPrice,
  type Draft,
  type ReportReason,
} from "./api";
import {
  cities,
  cityNearAt,
  cityURL,
  venueURL,
  money,
  servingKey,
  servingLabel,
  comparable,
  priceTier,
  type Catalog,
  type City,
  type Price,
  type Serving,
  type Snapshot,
  type Venue,
} from "./model";
import { PriceForm, ReportForm } from "./PriceForm";
import { EuropeDrinkVoteButton, EuropeDrinkVotesProvider } from "./EuropeDrinkVotes";
import { europeDrinkSaveURL } from "./europe-save";
import "./europe.css";

const t = (italian: string, english: string) => (currentLang() === "en" ? english : italian);
const EMPTY_ROWS: Price[] = [];
const EMPTY_KEYS: string[] = [];
interface Props {
  catalog: Catalog;
  initialCity: City;
  initialVenue?: Venue;
  loadMap: () => Promise<typeof MapModule>;
}
interface Pending {
  draft: Draft;
  timer: HoldableTimer;
  sent: boolean;
}
const defaultServing = (drink: string): Serving | null =>
  drink === "beer_draft" || drink === "water"
    ? null
    : { unit: drink === "wine_glass" ? "glass" : "drink" };

export function EuropeApp({ catalog, initialCity, initialVenue, loadMap }: Props) {
  useLang();
  const groups = useMemo(() => cities(catalog), [catalog]);
  const [city, setCity] = useState(initialCity),
    [venueKey, setVenueKey] = useState<string | null>(initialVenue?.key ?? null);
  const initialFocus = initialVenue ? mobileFocus(location) : null;
  const [savedFocus, setSavedFocus] = useState<DrinkFocus | null>(initialFocus);
  const [drink, setDrink] = useState(initialFocus?.drink ?? DEFAULT_DRINK),
    [band, setBand] = useState<0 | 1>(initialFocus?.hh ?? 0),
    [serveChoice, setServeChoice] = useState("");
  const [loaded, setLoaded] = useState<{ scope: string; snapshot: Snapshot } | null>(null),
    [loadError, setLoadError] = useState(false),
    [reload, setReload] = useState(0);
  const [picker, setPicker] = useState(false),
    [query, setQuery] = useState(""),
    [list, setList] = useState(false);
  const [form, setForm] = useState<{ venue: Venue; row?: Price } | null>(null),
    [report, setReport] = useState<{ venue: Venue; row: Price | null } | null>(null);
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [queued, setQueued] = useState(false);
  const [map, setMap] = useState<VenueMap | null>(null),
    [mapFailed, setMapFailed] = useState(false),
    [view, setView] = useState<MapView | null>(null),
    [rendered, setRendered] = useState<string[]>([]);
  const [me, setMe] = useState<{ lat: number; lon: number } | null>(null);
  const [nativeEuropeSave, setNativeEuropeSave] = useState(
    () =>
      typeof window !== "undefined" &&
      (window as Window & { DoveBevoNativeEuropeSave?: boolean }).DoveBevoNativeEuropeSave === true,
  );
  const canvas = useRef<HTMLDivElement>(null),
    root = useRef<HTMLDivElement>(null),
    generation = useRef(0);
  const currentCity = useRef(city.key);
  currentCity.current = city.key;
  const currentScope = useRef<{ snapshot: Snapshot | null; city: City }>({ snapshot: null, city });
  const pending = useRef<Pending | null>(null),
    alive = useRef(true);
  const challenge = useMemo(() => {
    const node = document.createElement("div");
    node.className = "turnstile-host";
    return node;
  }, []);
  const notification = useMemo(() => {
    const node = document.createElement("div");
    node.className = "europe-notice-layer";
    return node;
  }, []);
  const snapshot = loaded?.scope === city.key ? loaded.snapshot : null;
  currentScope.current = { snapshot, city };
  const rows = snapshot?.rows ?? EMPTY_ROWS,
    hidden = snapshot?.hidden ?? EMPTY_KEYS,
    legacy = snapshot?.legacy_venues ?? EMPTY_KEYS;
  const venues = city.venues.filter((v) => !hidden.includes(v.key) && !legacy.includes(v.key));
  const venue = venues.find((v) => v.key === venueKey);
  const available = [
    ...new Map(
      rows
        .filter((r) => r.drink === drink && r.hh === band)
        .map((r) => [servingKey(r.serving), r.serving]),
    ).values(),
  ].sort((a, b) => (a.ml ?? 0) - (b.ml ?? 0));
  const serving =
    available.find((s) => servingKey(s) === serveChoice) ?? available[0] ?? defaultServing(drink);
  const priced = serving ? comparable(rows, city.currency, drink, band, serving) : [];
  const prices = new Map(priced.map((p) => [p.venue, p]));
  const selectedVenue = venueKey && snapshot ? venue : undefined;
  const visibleVenues = view
    ? venues.filter(
        (v) =>
          v.lat >= view.south && v.lat <= view.north && v.lon >= view.west && v.lon <= view.east,
      )
    : [];
  const visiblePriced = visibleVenues.filter((v) => prices.has(v.key)).length;

  useEffect(() => {
    const updateNative = () => {
      setNativeEuropeSave(
        (window as Window & { DoveBevoNativeEuropeSave?: boolean }).DoveBevoNativeEuropeSave ===
          true,
      );
    };
    window.addEventListener("dovebevo-native-ready", updateNative);
    updateNative();
    return () => {
      window.removeEventListener("dovebevo-native-ready", updateNative);
    };
  }, []);

  useEffect(() => {
    const token = ++generation.current,
      controller = new AbortController();
    setLoadError(false);
    void loadCity(catalog, city, controller.signal)
      .then((value) => {
        if (token === generation.current && !controller.signal.aborted)
          setLoaded({ scope: city.key, snapshot: value });
      })
      .catch(() => {
        if (token === generation.current && !controller.signal.aborted) setLoadError(true);
      });
    return () => {
      controller.abort();
    };
  }, [catalog, city.key, reload]);
  useLayoutEffect(() => {
    const target =
      document.querySelector("dialog.sheet[open]:last-of-type > .sheet__body") ?? root.current;
    target?.append(challenge, notification);
    return () => {
      challenge.remove();
      notification.remove();
    };
  }, [challenge, notification, form, report, picker, list, selectedVenue]);

  function selectedRoute() {
    setForm(null);
    setReport(null);
    setPicker(false);
    setList(false);
    const path = mobilePath(location),
      cell = new URLSearchParams(location.search).get("c");
    const selected = catalog.venues.find((v) => path === `/bar/${v.key}` && cell === v.cell);
    if (selected) {
      const restoredFocus = mobileFocus(location);
      setSavedFocus(restoredFocus);
      if (restoredFocus) {
        setDrink(restoredFocus.drink);
        setBand(restoredFocus.hh);
        setServeChoice("");
      }
      if (selected.country === "IT") {
        location.replace(location.href);
        return;
      }
      const group = groups.find((g) => g.venues.some((v) => v.key === selected.key));
      if (group) {
        setCity(group);
        setVenueKey(selected.key);
        return;
      }
    }
    const at = cityNearAt(groups, location.search);
    if (at) {
      if (at.country === "IT") {
        location.replace(location.href);
        return;
      }
      setCity(at);
      setVenueKey(null);
      return;
    }
    // A history boundary crossing is a real document navigation, never an EUR fallback.
    location.replace(location.href);
  }
  useEffect(() => {
    addEventListener("popstate", selectedRoute);
    return () => {
      removeEventListener("popstate", selectedRoute);
    };
  }, [catalog]);
  function openVenue(target: Venue) {
    if (target.country === "IT") {
      if (pending.current || busy) {
        setNotice(
          t(
            "Attendi l'invio o annulla il prezzo prima di cambiare mappa.",
            "Wait for sending or undo the price before changing maps.",
          ),
        );
        return;
      }
      location.assign(venueURL(target));
      return;
    }
    history.pushState({ inApp: true, europe: true }, "", venueURL(target));
    setVenueKey(target.key);
    setSavedFocus(null);
    setList(false);
    setPicker(false);
  }
  function openCity(target: City) {
    if (target.country === "IT") {
      if (pending.current || busy) {
        setNotice(
          t(
            "Attendi l'invio o annulla il prezzo prima di cambiare mappa.",
            "Wait for sending or undo the price before changing maps.",
          ),
        );
        return;
      }
      location.assign(cityURL(target));
      return;
    }
    history.pushState({ inApp: true, europe: true }, "", cityURL(target));
    setCity(target);
    setVenueKey(null);
    setSavedFocus(null);
    setPicker(false);
    setServeChoice("");
    if (!pending.current && !busy) setNotice("");
  }
  function closeVenue() {
    const state: unknown = history.state;
    if (state && typeof state === "object" && "europe" in state && state.europe === true) {
      history.back();
      return;
    }
    history.replaceState(null, "", cityURL(city));
    setVenueKey(null);
    setSavedFocus(null);
  }
  useEffect(() => {
    let retired = false;
    const timer = setTimeout(() => {
      if (!retired) setMapFailed(true);
    }, 20000);
    void loadMap()
      .then(({ VenueMap }) => (canvas.current ? VenueMap.create(canvas.current) : null))
      .then((created) => {
        if (!created || retired) return;
        clearTimeout(timer);
        created.onMove(setView);
        created.onRendered(setRendered);
        created.onVenueClick((key) => {
          const scope = currentScope.current,
            target = scope.city.venues.find((v) => v.key === key);
          if (
            target &&
            scope.snapshot &&
            !scope.snapshot.hidden.includes(key) &&
            !scope.snapshot.legacy_venues.includes(key)
          )
            openVenue(target);
        });
        setMap(created);
        setView(created.view());
      })
      .catch(() => {
        if (!retired) setMapFailed(true);
      });
    return () => {
      retired = true;
      clearTimeout(timer);
    };
  }, [loadMap]);
  useEffect(() => {
    if (map) {
      map.moveTo(venue?.lat ?? city.lat, venue?.lon ?? city.lon, venue ? 16 : 14);
    }
  }, [map, city.key, venue?.key]);
  useEffect(() => {
    map?.setVenues(
      venues.map((v) => {
        const row = prices.get(v.key);
        return {
          key: v.key,
          cell: v.cell,
          lat: v.lat,
          lon: v.lon,
          label: row ? `${money(row.amount_minor, row.currency)}${row.hh ? " HH" : ""}` : "",
          tier: row ? priceTier(row, rows) : "neutro",
          stale: row
            ? isStale(row.observed_on ?? row.provenance.source_checked_on ?? "", todayRome())
            : false,
        };
      }),
    );
    map?.setSelected(selectedVenue?.key ?? null);
    map?.setLabel(it.map.canvas);
  }, [
    map,
    city.key,
    rows,
    drink,
    band,
    serving ? servingKey(serving) : "",
    selectedVenue?.key,
    currentLang(),
  ]);
  useEffect(() => {
    map?.setMe(me);
  }, [map, me]);

  async function sendPending(keepalive = false) {
    const task = pending.current;
    if (!task || task.sent) return;
    task.sent = true;
    task.timer.clear();
    setQueued(false);
    setBusy(true);
    try {
      const result = await submitPrice(challenge, task.draft, keepalive);
      if (alive.current) {
        setNotice(
          `${task.draft.venue.name}: ${result === "quarantined" ? t("prezzo da confermare", "price needs confirmation") : result === "confirmed" ? t("prezzo già presente, conferma elaborata", "existing price confirmation processed") : t("prezzo salvato", "price saved")} · ${money(task.draft.amount_minor, task.draft.venue.currency)}`,
        );
        if (
          currentCity.current ===
          `${task.draft.venue.country}|${task.draft.venue.city}|${task.draft.venue.currency}`
        )
          setReload((v) => v + 1);
      }
    } catch {
      if (alive.current)
        setNotice(
          t(
            "Invio non riuscito. Ricarica il locale prima di riprovare: il risultato potrebbe essere già arrivato.",
            "Sending failed. Reload the venue before retrying: the result may already have arrived.",
          ),
        );
    } finally {
      pending.current = null;
      if (alive.current) setBusy(false);
    }
  }
  function queue(draft: Draft) {
    if (pending.current || busy) return;
    const immutable: Draft = { ...draft, venue: { ...draft.venue }, serving: { ...draft.serving } };
    const timer = holdableTimeout(() => {
      void sendPending();
    }, UNDO_MS);
    pending.current = { draft: immutable, timer, sent: false };
    setQueued(true);
    setForm(null);
    setNotice(
      `${draft.venue.name} · ${money(draft.amount_minor, draft.venue.currency)}${draft.serving.unit === "drink" ? "" : ` · ${servingLabel(draft.serving)}`}`,
    );
  }
  function undo() {
    pending.current?.timer.clear();
    pending.current = null;
    setQueued(false);
    setNotice(t("Prezzo annullato.", "Price cancelled."));
  }
  useEffect(() => {
    alive.current = true;
    const hide = () => {
      if (document.visibilityState === "hidden") void sendPending(true);
    };
    const pagehide = () => {
      void sendPending(true);
    };
    document.addEventListener("visibilitychange", hide);
    addEventListener("pagehide", pagehide);
    return () => {
      alive.current = false;
      pending.current?.timer.clear();
      document.removeEventListener("visibilitychange", hide);
      removeEventListener("pagehide", pagehide);
    };
  }, []);
  async function confirm(target: Venue, row: Price) {
    if (busy || queued) return;
    setBusy(true);
    try {
      await confirmPrice(challenge, target, row);
      if (currentCity.current === city.key) setReload((v) => v + 1);
      setNotice(
        t(
          "Conferma elaborata. Il totale viene riletto dal servizio.",
          "Confirmation processed. Reloading the actual total.",
        ),
      );
    } catch {
      setNotice(
        t(
          "Il prezzo può essere cambiato. Ricarica prima di confermare.",
          "The price may have changed. Reload before confirming.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  async function sendReport(reason: ReportReason) {
    const target = report;
    if (!target || busy || queued) return;
    setBusy(true);
    try {
      await reportPrice(challenge, target.venue, reason, target.row);
      setReport(null);
      setNotice(t("Segnalazione elaborata.", "Report processed."));
      setReload((v) => v + 1);
    } catch {
      setNotice(
        t("Segnalazione non riuscita. Ricarica e riprova.", "Report failed. Reload and retry."),
      );
    } finally {
      setBusy(false);
    }
  }
  async function position() {
    setNotice(t("Cerco la posizione…", "Finding your location…"));
    const result = await locate();
    if (!result.ok) {
      setNotice(
        t("Posizione non disponibile. Scegli una città.", "Location unavailable. Choose a city."),
      );
      return;
    }
    const nearby = cityNearAt(groups, `?at=${String(result.lat)},${String(result.lon)}`);
    if (!nearby) {
      setNotice(
        t(
          "Non ci sono ancora locali del catalogo vicino a te.",
          "No catalogue venues are available near you yet.",
        ),
      );
      return;
    }
    openCity(nearby);
    setMe({ lat: result.lat, lon: result.lon });
  }
  async function share(target: Venue) {
    const url = location.origin + venueURL(target);
    try {
      const capabilities: Partial<Navigator> = navigator;
      if (capabilities.share) await capabilities.share.call(navigator, { title: target.name, url });
      else if (capabilities.clipboard) {
        await capabilities.clipboard.writeText(url);
        setNotice(t("Link dell'app copiato.", "App link copied."));
      } else setNotice(url);
    } catch {
      setNotice(url);
    }
  }
  const matches = groups.filter((g) =>
    g.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  const matchingVenues = catalog.venues
    .filter((v) => `${v.name} ${v.city}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
    .slice(0, 30);
  const selectedFocus =
    venue &&
    savedFocus &&
    mobilePath(location) === "/bar/" + venue.key &&
    new URLSearchParams(location.search).get("c") === venue.cell
      ? savedFocus
      : null;
  const matchesSaved = (row: Price) =>
    selectedFocus !== null && row.drink === selectedFocus.drink && row.hh === selectedFocus.hh;
  const venueRows = venue
    ? rows
        .filter((r) => r.venue === venue.key)
        .sort(
          (a, b) =>
            Number(matchesSaved(b)) - Number(matchesSaved(a)) ||
            Number(b.drink === drink) - Number(a.drink === drink) ||
            a.drink.localeCompare(b.drink) ||
            a.hh - b.hh,
        )
    : [];
  const savedFound = venueRows.some(matchesSaved);
  return (
    <div class="app europe-app" ref={root}>
      <header class="europe-top">
        <div class="europe-search-row">
          <span class="europe-city-current" aria-label={`${t("Città", "City")}: ${city.name}`}>
            {city.name}
          </span>
          <span class="europe-currency">
            {city.currency} ({city.currency === "GBP" ? "£" : "€"})
          </span>
        </div>
        <label class="europe-drinks">
          {it.map.pickDrinks}
          <select
            aria-label={it.map.pickDrinks}
            value={drink}
            onChange={(event) => {
              setDrink(event.currentTarget.value);
              setSavedFocus(null);
              setServeChoice("");
            }}
          >
            {DRINKS.map((d) => (
              <option value={d.code} key={d.code}>
                {it.drinks[d.code] ?? d.code}
              </option>
            ))}
          </select>
        </label>
        <div class="europe-filter-row">
          {!(serving?.unit === "drink" && available.length <= 1) && (
            <label>
              {t("Formato", "Serving")}{" "}
              <select
                aria-label={t("Formato da confrontare", "Serving to compare")}
                value={serving ? servingKey(serving) : ""}
                onChange={(event) => {
                  setServeChoice(event.currentTarget.value);
                }}
              >
                {available.length === 0 && (
                  <option value={serving ? servingKey(serving) : ""}>
                    {serving
                      ? servingLabel(serving)
                      : t("Nessun formato con prezzi", "No priced servings")}
                  </option>
                )}
                {available.map((s) => (
                  <option key={servingKey(s)} value={servingKey(s)}>
                    {servingLabel(s)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label class="europe-band">
            <input
              type="checkbox"
              checked={band === 1}
              onChange={() => {
                setBand(band ? 0 : 1);
                setSavedFocus(null);
              }}
            />
            Happy hour
          </label>
        </div>
      </header>
      <section
        class="map europe-map"
        aria-label={it.map.canvas}
        data-ready={!!map && !mapFailed}
        data-selected={selectedVenue?.key ?? ""}
        data-center={view ? `${view.lat.toFixed(5)},${view.lon.toFixed(5)}` : ""}
        data-zoom={view?.zoom.toFixed(1) ?? ""}
        data-prices-shown={rendered.join("|")}
      >
        <div class="map__canvas" ref={canvas} />
        <LangMenu className="map__lang" />
        <button
          class="btn icon-btn map__list"
          aria-label={t("Elenco locali", "Venue list")}
          onClick={() => {
            setList(true);
          }}
        >
          <Icon name="list" />
        </button>
        <button
          class="europe-search"
          data-dovebevo-search="1"
          aria-label={it.search.open}
          onClick={() => {
            if (venueKey !== null) {
              history.replaceState(null, "", cityURL(city));
              setVenueKey(null);
              setSavedFocus(null);
            }
            setPicker(true);
            setQuery("");
          }}
        >
          <Icon name="search" />
        </button>
        <button
          class="europe-locate"
          aria-label={it.map.nearMe}
          onClick={() => {
            void position();
          }}
        >
          <Icon name="locate" />
        </button>
        <button
          class="europe-map-add"
          aria-label={t("Aggiungi prezzo", "Add price")}
          disabled={busy || queued || !snapshot}
          onClick={() => {
            if (venue) setForm({ venue });
            else setList(true);
          }}
        >
          <span aria-hidden="true">+</span> {t("Aggiungi", "Add")}
        </button>
        {(mapFailed || loadError) && (
          <div class="europe-map-error" role="alert">
            <p>
              {t(
                "Mappa o prezzi non disponibili. Controlla la connessione e riprova.",
                "Map or prices unavailable. Check your connection and retry.",
              )}
            </p>
            <button
              class="btn"
              onClick={() => {
                // Refresh both document catalogue and prices after a deployment/version change.
                location.reload();
              }}
            >
              {t("Riprova", "Retry")}
            </button>
          </div>
        )}
        <div class="europe-coverage" role="status">
          {loadError
            ? t("Prezzi non disponibili. Riprova.", "Prices unavailable. Retry.")
            : !snapshot
              ? t("Caricamento prezzi…", "Loading prices…")
              : `${String(visiblePriced)}/${String(visibleVenues.length)} ${t("con prezzo", "with prices")}${serving && serving.unit !== "drink" ? ` · ${servingLabel(serving)}` : ""}`}
        </div>
        <div class="map__attribution">
          <a href="https://openfreemap.org" target="_blank" rel="noopener">
            OpenFreeMap
          </a>{" "}
          ©{" "}
          <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">
            OpenMapTiles
          </a>{" "}
          ©{" "}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">
            OpenStreetMap contributors
          </a>
        </div>
      </section>
      {notice &&
        createPortal(
          <div
            class="europe-notice"
            role="status"
            onPointerEnter={() => pending.current?.timer.hold()}
            onPointerLeave={() => pending.current?.timer.release()}
            onFocusIn={() => pending.current?.timer.hold()}
            onFocusOut={() => pending.current?.timer.release()}
          >
            <span>{notice}</span>
            {queued && (
              <button class="btn" onClick={undo}>
                {t("Annulla", "Undo")}
              </button>
            )}
          </div>,
          notification,
        )}
      {picker && (
        <Sheet
          title={it.search.title}
          onClose={() => {
            setPicker(false);
          }}
        >
          <div class="mobile-price-flow">
            <input
              class="field"
              aria-label={it.search.label}
              value={query}
              autofocus
              onInput={(event) => {
                setQuery(event.currentTarget.value);
              }}
            />
            <h3>{t("Città nel catalogo app", "Cities in the app catalogue")}</h3>
            <ul class="rows">
              {matches.map((g) => (
                <li key={g.key}>
                  <button
                    class="row"
                    onClick={() => {
                      openCity(g);
                    }}
                  >
                    <span class="row__name">{g.name}</span>
                    <span class="row__meta">
                      {g.country} · {g.currency} · {g.venues.length} {t("locali", "venues")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {query && (
              <>
                <h3>{t("Locali", "Venues")}</h3>
                <ul class="rows">
                  {matchingVenues.map((v) => (
                    <li key={v.key}>
                      <button
                        class="row"
                        onClick={() => {
                          const g = groups.find((item) =>
                            item.venues.some((itemVenue) => itemVenue.key === v.key),
                          );
                          if (g) {
                            if (v.country !== "IT") setCity(g);
                            openVenue(v);
                          }
                        }}
                      >
                        <span class="row__name">{v.name}</span>
                        <span class="row__meta">
                          {v.city} · {v.currency}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <a
              class="btn"
              href="/mobile/"
              onClick={(event) => {
                if (busy || queued) {
                  event.preventDefault();
                  setNotice(
                    t(
                      "Attendi l'invio o annulla il prezzo prima di cambiare mappa.",
                      "Wait for sending or undo the price before changing maps.",
                    ),
                  );
                }
              }}
            >
              {t("Mappa italiana originale", "Original Italian map")}
            </a>
            <AppLegalLinks />
          </div>
        </Sheet>
      )}
      {list && (
        <Sheet
          title={t("Locali nel catalogo", "Catalogue venues")}
          onClose={() => {
            setList(false);
          }}
        >
          <div class="mobile-price-flow">
            <p>
              {city.name} · {city.currency}
              {serving?.unit !== "drink" && (
                <>
                  {" "}
                  ·{" "}
                  {serving
                    ? servingLabel(serving)
                    : t("Formato non selezionato", "No serving selected")}
                </>
              )}
            </p>
            <ul class="rows">
              {venues.map((v) => {
                const price = prices.get(v.key);
                return (
                  <li key={v.key}>
                    <button
                      class="row"
                      onClick={() => {
                        openVenue(v);
                      }}
                    >
                      <span class="row__name">{v.name}</span>
                      <span class="row__price">
                        {price
                          ? money(price.amount_minor, price.currency)
                          : t("Nessun prezzo", "No price")}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </Sheet>
      )}
      {venueKey && snapshot && !venue && !picker && !list && (
        <Sheet title={t("Locale non disponibile", "Venue unavailable")} onClose={closeVenue}>
          <p>
            {t(
              "Il locale non è disponibile in questo catalogo.",
              "This venue is unavailable in the current catalogue.",
            )}
          </p>
        </Sheet>
      )}
      {selectedVenue && !picker && !list && (
        <Sheet title={selectedVenue.name} bare onClose={closeVenue}>
          <div class="scontrino mobile-venue europe-venue">
            <DrinkHero drink={selectedFocus?.drink ?? venueRows[0]?.drink ?? drink} />
            <div class="scontrino__paper">
              <p class="bar__kind">
                {it.kinds[selectedVenue.kind]} · {selectedVenue.city} · {selectedVenue.country}
              </p>
              <h2 class="scontrino__name" tabIndex={-1}>
                {selectedVenue.name}
              </h2>
              <p class="bar__addr">
                {selectedVenue.city} · {selectedVenue.currency} (
                {selectedVenue.currency === "GBP" ? "£" : "€"})
              </p>
              <h3 class="section-title">{it.bar.prices}</h3>
              {venueRows.length === 0 && <p class="hint">{it.bar.noPrices}</p>}
              {selectedFocus && !savedFound && (
                <p class="hint" role="status" data-testid="saved-drink-unavailable">
                  Il prezzo salvato per questo drink e orario non è più disponibile. Gli altri
                  prezzi del locale sono qui sotto.
                </p>
              )}
              <EuropeDrinkVotesProvider
                key={`${selectedVenue.key}:${selectedVenue.cell}`}
                venue={selectedVenue}
              >
                <ul class="prices">
                  {venueRows.map((row, index) => (
                    <PriceItem
                      key={row.revision}
                      row={row}
                      venue={selectedVenue}
                      featured={index === 0 && (!selectedFocus || savedFound)}
                      tier={priceTier(row, rows)}
                      nativeSave={nativeEuropeSave}
                      busy={busy || queued}
                      onConfirm={() => {
                        void confirm(selectedVenue, row);
                      }}
                      onChanged={() => {
                        setForm({ venue: selectedVenue, row });
                      }}
                      onReport={() => {
                        setReport({ venue: selectedVenue, row });
                      }}
                    />
                  ))}
                </ul>
              </EuropeDrinkVotesProvider>
              <p class="hint">
                {t(
                  "I prezzi da menu hanno una data di verifica della fonte, non una visita o un pagamento.",
                  "Menu prices show when the source was checked, not a visit or payment.",
                )}
              </p>
            </div>
            <div class="bar__actions">
              <a
                class="btn btn--secondary"
                href={directionsUrl(selectedVenue.lat, selectedVenue.lon)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Icon name="directions" />
                {it.bar.directions}
              </a>
              <button
                class="btn btn--primary"
                disabled={busy || queued}
                onClick={() => {
                  setForm({ venue: selectedVenue });
                }}
              >
                {it.actions.addHere}
              </button>
            </div>
            <button
              class="btn btn--ghost"
              onClick={() => {
                void share(selectedVenue);
              }}
            >
              {t("Condividi locale", "Share venue")}
            </button>
            <button
              class="btn btn--ghost"
              disabled={busy || queued}
              onClick={() => {
                setReport({ venue: selectedVenue, row: null });
              }}
            >
              {it.actions.reportBar}
            </button>
            <AppLegalLinks />
          </div>
        </Sheet>
      )}
      {form && (
        <PriceForm
          key={`${form.venue.key}|${form.row?.revision ?? "new"}`}
          venue={form.venue}
          row={form.row}
          initialDrink={drink}
          initialServing={serving}
          initialBand={band}
          onSave={queue}
          onClose={() => {
            setForm(null);
          }}
        />
      )}
      {report && (
        <ReportForm
          venue={report.venue}
          row={report.row}
          busy={busy}
          onReport={(reason) => {
            void sendReport(reason);
          }}
          onClose={() => {
            setReport(null);
          }}
        />
      )}
    </div>
  );
}

function PriceItem({
  row,
  venue,
  featured,
  tier,
  nativeSave,
  busy,
  onConfirm,
  onChanged,
  onReport,
}: {
  row: Price;
  venue: Venue;
  featured: boolean;
  tier: Tier;
  nativeSave: boolean;
  busy: boolean;
  onConfirm: () => void;
  onChanged: () => void;
  onReport: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const art = drinkImage(row.drink);
  const day = row.observed_on ?? row.provenance.source_checked_on;
  const stale = day ? isStale(day, todayRome()) : false;
  return (
    <li
      class={`price mobile-price${featured ? " mobile-price--featured" : ""}${expanded ? " mobile-price--expanded" : ""}`}
      {...sharePresentation(
        featured && row.status === "active" && row.venue === venue.key
          ? {
              venue: venue.key,
              venueName: venue.name,
              drink: row.drink,
              drinkName: it.drinks[row.drink] ?? row.drink,
              hh: row.hh,
              amountMinor: row.amount_minor,
              currency: row.currency,
              serving: servingLabel(row.serving),
              provenance:
                row.provenance.kind === "online_menu"
                  ? [
                      t("Da menu online", "Online menu"),
                      row.provenance.source_checked_on
                        ? `${t("Fonte verificata", "Source checked")} ${formatDate(row.provenance.source_checked_on)}`
                        : "",
                      row.provenance.menu_item ?? "",
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : [
                      row.observed_on
                        ? `${t("Segnalato il", "Reported")} ${formatDate(row.observed_on)}`
                        : t("Prezzo segnalato", "Reported price"),
                      row.confirmed_on
                        ? `${t("Confermato il", "Confirmed")} ${formatDate(row.confirmed_on)}`
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" · "),
              confirmations: row.confirmations,
              tier,
              location: venue.city,
            }
          : null,
      )}
    >
      <span class="price__icon">
        {art ? (
          <img src={art} width="1536" height="1024" alt="" loading="lazy" />
        ) : (
          <Icon name={drinkIcon(row.drink)} />
        )}
      </span>
      <span class="price__name">
        {it.drinks[row.drink] ?? row.drink}
        {row.hh ? " · Happy hour" : ""}
        {row.serving.unit !== "drink" && (
          <span class="europe-serving">{servingLabel(row.serving)}</span>
        )}
      </span>
      <span class={`price__value price__value--${tier}${stale ? " price__value--stale" : ""}`}>
        {money(row.amount_minor, row.currency)}
      </span>
      <span class="price__meta">
        {row.provenance.kind === "online_menu" ? (
          <>
            {t("Da menu online · Fonte verificata il ", "Online menu · Source checked ")}
            {row.provenance.source_checked_on && formatDate(row.provenance.source_checked_on)}{" "}
            <a
              href={row.provenance.source_url ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("Menu", "Menu")}
            </a>
            {row.provenance.menu_item && (
              <span class="europe-serving">{row.provenance.menu_item}</span>
            )}
          </>
        ) : (
          <>
            {t("Segnalato il ", "Reported ")}
            {row.observed_on && formatDate(row.observed_on)}
          </>
        )}
        <br />
        {it.bar.confirmations(row.confirmations)}
        {row.confirmed_on
          ? ` · ${t("Confermato il ", "Confirmed ")}${formatDate(row.confirmed_on)}`
          : ""}
        {row.status === "quarantined" || stale
          ? ` · ${t("Da confermare", "Needs confirmation")}`
          : ""}
      </span>
      <span class="mobile-menu-v2__quick-actions mobile-price__quick-actions europe-price__quick-actions">
        {nativeSave && (
          <a
            class="btn btn--secondary mobile-menu-v2__save europe-price__save"
            href={europeDrinkSaveURL(venue, row)}
            aria-label={`${t("Salva", "Save")} ${it.drinks[row.drink] ?? row.drink} ${servingLabel(row.serving)} ${t("da", "at")} ${venue.name} ${t("nei preferiti", "to favourites")}`}
          >
            {t("Salva questo drink", "Save this drink")}
          </a>
        )}
        <EuropeDrinkVoteButton row={row} venue={venue} />
      </span>
      {featured && tier !== "neutro" && (
        <span class={`mobile-price__tier mobile-price__tier--${tier}`}>{it.map.tiers[tier]}</span>
      )}
      {!featured && (
        <button
          type="button"
          class="mobile-price__toggle"
          aria-expanded={expanded}
          onClick={() => {
            setExpanded(!expanded);
          }}
        >
          {expanded
            ? t("Nascondi azioni", "Hide actions")
            : t("Azioni sul prezzo", "Price actions")}
        </button>
      )}
      <span class="price__actions" hidden={!featured && !expanded}>
        <button class="btn btn--secondary" disabled={busy} onClick={onConfirm}>
          {it.actions.confirm}
        </button>
        <button class="btn btn--secondary" disabled={busy} onClick={onChanged}>
          {it.actions.changed}
        </button>
        <button class="btn btn--ghost" disabled={busy} onClick={onReport}>
          {it.actions.report}
        </button>
      </span>
    </li>
  );
}
