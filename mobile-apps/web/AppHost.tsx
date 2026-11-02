import { useEffect, useState } from "preact/hooks";
import { App } from "@site/app/app";
import type * as MapModule from "@site/app/lib/maplibre-map";
import { loadCatalog, loadVenue } from "./europe/api";
import { cities, cityNearAt, type Catalog, type City } from "./europe/model";
import { EuropeApp } from "./europe/EuropeApp";
import { mobilePath } from "./routes";

function italianCell(cell: string): boolean {
  let west = -180,
    east = 180,
    south = -90,
    north = 90,
    even = true;
  for (const letter of cell) {
    const index = "0123456789bcdefghjkmnpqrstuvwxyz".indexOf(letter);
    if (index < 0) return false;
    for (let bit = 4; bit >= 0; bit--) {
      const high = (index & (1 << bit)) !== 0;
      if (even) {
        const mid = (west + east) / 2;
        if (high) west = mid;
        else east = mid;
      } else {
        const mid = (south + north) / 2;
        if (high) south = mid;
        else north = mid;
      }
      even = !even;
    }
  }
  return north >= 35 && south <= 48 && east >= 6 && west <= 19;
}
export function AppHost({ loadMap }: { loadMap: () => Promise<typeof MapModule> }) {
  const path = mobilePath(location),
    cell = new URLSearchParams(location.search).get("c") ?? "";
  const key = path.startsWith("/bar/") ? path.slice(5) : null;
  const [catalog, setCatalog] = useState<Catalog | null>(null),
    [failed, setFailed] = useState(false);
  const [legacy, setLegacy] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    setFailed(false);
    void loadCatalog()
      .then((value) => {
        if (alive) setCatalog(value);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);
  const venue = catalog?.venues.find((v) => v.key === key && v.cell === cell);
  useEffect(() => {
    if (!catalog || !venue || venue.country !== "IT") return;
    let alive = true;
    const controller = new AbortController();
    void loadVenue(catalog, venue, controller.signal)
      .then((snapshot) => {
        if (alive) setLegacy(snapshot.legacy_venues.includes(venue.key));
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [catalog, venue]);
  const groups = catalog ? cities(catalog) : [],
    at = cityNearAt(groups, location.search);
  const city: City | undefined = venue
    ? groups.find((v) => v.venues.some((item) => item.key === venue.key))
    : at;
  const foreignAt = new URLSearchParams(location.search).get("at");
  const likelyForeign = key
    ? !italianCell(cell)
    : !!foreignAt &&
      /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.test(foreignAt) &&
      (() => {
        const [lat = NaN, lon = NaN] = foreignAt.split(",").map(Number);
        return !(lat >= 35 && lat <= 48 && lon >= 6 && lon <= 19);
      })();
  if (
    catalog &&
    city &&
    (venue ? venue.country !== "IT" || legacy === false : city.country !== "IT")
  )
    return (
      <EuropeApp catalog={catalog} initialCity={city} initialVenue={venue} loadMap={loadMap} />
    );
  if (
    (!catalog && !failed && (!!key || !!foreignAt)) ||
    (likelyForeign && (!catalog || !city)) ||
    (venue?.country === "IT" && legacy === null)
  )
    return (
      <div class="europe-app europe-unavailable" role="status">
        <h1>Dove bevo</h1>
        <p>
          {failed
            ? "Il catalogo non è disponibile. Riprova senza cambiare i dati del locale."
            : catalog
              ? "Questo locale non è nel catalogo dell'app."
              : "Caricamento catalogo…"}
        </p>
        {failed && (
          <button
            class="btn"
            onClick={() => {
              location.reload();
            }}
          >
            Riprova
          </button>
        )}
        <a href="/mobile/">Mappa Italia</a>
      </div>
    );
  return <App loadMap={loadMap} />;
}
