import { useMemo, useRef, useState } from "preact/hooks";
import type { Coverage, Place } from "../../shared/api-types";
import { COVERAGE_WARN_ROWS, LAUNCH_CITY_ID, LAUNCH_TARGET } from "../../shared/config";
import { searchKey } from "../../shared/venue";
import { it } from "../i18n/it";
import { loadPlaces } from "../lib/data";
import { formatDate } from "../lib/format";

// Coverage of the map for the admin (SPEC 7.9, ADR 0022): calculated only when "Aggiorna" is
// pressed. City names and bar totals come from places.json (static), prices from the Worker.

const SHOWN_ROWS = 200;
// "always": Italian groups four-digit numbers only in some engines (1947 vs 1.947); this is the same everywhere.
const number = new Intl.NumberFormat("it-IT", { useGrouping: "always" });
const percent = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 });

interface Row {
  id: number;
  name: string;
  /** searchKey(name), computed once: sorting and filtering would repeat it thousands of times. */
  key: string;
  lat: number;
  lon: number;
  total: number;
  bars: number;
  prices: number;
  day: string;
}

type Column = "name" | "bars" | "total" | "share" | "prices" | "day";
const COLUMNS: Column[] = ["name", "bars", "total", "share", "prices", "day"];
const LABEL: Record<Column, string> = {
  name: it.admin.coverage.city,
  bars: it.admin.coverage.covered,
  total: it.admin.coverage.total,
  share: it.admin.coverage.share,
  prices: it.admin.coverage.prices,
  day: it.admin.coverage.latest,
};
const share = (r: Row) => (r.total > 0 ? r.bars / r.total : 0);
const VALUE: Record<Column, (r: Row) => number | string> = {
  name: (r) => r.key,
  bars: (r) => r.bars,
  total: (r) => r.total,
  share,
  prices: (r) => r.prices,
  day: (r) => r.day,
};

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour12: false });

export function CoverageSection() {
  const [data, setData] = useState<Coverage | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [showEmpty, setShowEmpty] = useState(false);
  const [sort, setSort] = useState<{ column: Column; desc: boolean }>({
    column: "bars",
    desc: true,
  });
  // A double tap must not start two calculations: state alone is too slow to say "already running".
  const running = useRef(false);

  async function refresh() {
    if (running.current) return;
    running.current = true;
    setLoading(true);
    try {
      const [response, list] = await Promise.all([
        fetch("/api/admin/coverage", { cache: "no-store" }),
        loadPlaces(),
      ]);
      if (response.status === 429) {
        setError(it.admin.coverage.tooSoon);
        return;
      }
      if (!response.ok || !response.headers.get("content-type")?.includes("application/json"))
        throw new Error("coverage");
      setData((await response.json()) as Coverage);
      setPlaces(list);
      setError("");
    } catch {
      setError(it.admin.coverage.failed);
    } finally {
      running.current = false;
      setLoading(false);
    }
  }

  const rows = useMemo(() => {
    if (!data) return [];
    const byId = new Map(data.cities.map((c) => [c[0], c]));
    // Bars added by hand are not in places.json: they join the total of their city.
    const added = new Map(data.users);
    const known = new Set(places.map((p) => p[0]));
    const make = (id: number, name: string, lat: number, lon: number, total: number): Row => {
      const c = byId.get(id);
      return {
        id,
        name,
        key: searchKey(name),
        lat,
        lon,
        total: total + (added.get(id) ?? 0),
        bars: c?.[1] ?? 0,
        prices: c?.[2] ?? 0,
        day: c?.[3] ?? "",
      };
    };
    const all = places
      .filter((p) => showEmpty || byId.has(p[0]))
      .map((p) => make(p[0], p[1], p[2], p[3], p[4]));
    // A covered city missing from places.json (a different import) is still shown, never dropped.
    for (const c of data.cities)
      if (!known.has(c[0])) all.push(make(c[0], `#${String(c[0])}`, 0, 0, 0));
    const wanted = searchKey(query);
    const value = VALUE[sort.column];
    return all
      .filter((r) => r.key.includes(wanted))
      .sort((a, b) => {
        const x = value(a);
        const y = value(b);
        const order = x < y ? -1 : x > y ? 1 : 0;
        return (sort.desc ? -order : order) || a.name.localeCompare(b.name, "it");
      });
  }, [data, places, query, showEmpty, sort]);

  const gate = data?.cities.find((c) => c[0] === LAUNCH_CITY_ID)?.[1] ?? 0;
  const none = data?.none;
  const showNone =
    none && none[0] > 0 && searchKey(it.admin.coverage.noCity).includes(searchKey(query));

  return (
    <section class="cov" aria-labelledby="cov-title" data-testid="coverage-section">
      <h2 class="section-title" id="cov-title">
        {it.admin.coverage.title}
      </h2>
      <div class="cov__bar">
        <button
          type="button"
          class="btn btn--primary"
          aria-disabled={loading}
          onClick={() => void refresh()}
        >
          {it.admin.coverage.refresh}
        </button>
        <p class="hint" aria-live="polite">
          {loading
            ? it.admin.coverage.refreshing
            : data
              ? it.admin.coverage.updatedAt(time(data.at))
              : ""}
        </p>
      </div>
      {error && (
        <p class="error" role="alert">
          {error}
        </p>
      )}
      {!data && !loading && !error && <p class="hint">{it.admin.coverage.empty}</p>}
      {data && (
        <>
          <dl class="cov__stats" data-testid="coverage-stats">
            <div>
              <dt>{it.admin.coverage.barsWithPrice}</dt>
              <dd>{number.format(data.bars)}</dd>
            </div>
            <div>
              <dt>{it.admin.coverage.citiesCovered}</dt>
              <dd>{number.format(data.cities.length)}</dd>
            </div>
            <div>
              <dt>{it.admin.coverage.publicPrices}</dt>
              <dd>{number.format(data.prices)}</dd>
            </div>
          </dl>
          <div class="cov__gate" data-testid="coverage-gate">
            <p>
              {it.admin.coverage.gate}:{" "}
              <strong>{it.admin.coverage.gateOf(gate, LAUNCH_TARGET)}</strong>
            </p>
            <progress
              max={LAUNCH_TARGET}
              value={Math.min(gate, LAUNCH_TARGET)}
              aria-label={it.admin.coverage.gateLabel}
            />
          </div>
          {data.active > COVERAGE_WARN_ROWS && <p class="hint">{it.admin.coverage.warn}</p>}
          <div class="cov__tools">
            <input
              type="search"
              class="field"
              aria-label={it.admin.coverage.filter}
              placeholder={it.admin.coverage.filter}
              value={query}
              onInput={(e) => {
                setQuery(e.currentTarget.value);
              }}
            />
            <select
              class="field"
              aria-label={it.admin.coverage.sort}
              value={sort.column}
              onChange={(e) => {
                const column = e.currentTarget.value as Column;
                setSort({ column, desc: column !== "name" });
              }}
            >
              {COLUMNS.map((c) => (
                <option key={c} value={c}>
                  {LABEL[c]}
                </option>
              ))}
            </select>
            <button
              type="button"
              class="btn btn--secondary"
              aria-label={it.admin.coverage.reverse(sort.desc)}
              onClick={() => {
                setSort({ ...sort, desc: !sort.desc });
              }}
            >
              {sort.desc ? it.admin.coverage.descending : it.admin.coverage.ascending}
            </button>
          </div>
          <label class="cov__toggle">
            <input
              type="checkbox"
              checked={showEmpty}
              onChange={(e) => {
                setShowEmpty(e.currentTarget.checked);
              }}
            />
            {it.admin.coverage.showEmpty}
          </label>
          <table class="cov__table">
            <caption class="sr-only">{it.admin.coverage.tableLabel}</caption>
            <thead>
              <tr>
                {COLUMNS.map((c) => (
                  <th
                    key={c}
                    scope="col"
                    class={c === "total" || c === "prices" || c === "day" ? "cov__minor" : ""}
                    aria-sort={
                      sort.column === c ? (sort.desc ? "descending" : "ascending") : undefined
                    }
                  >
                    {LABEL[c]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, SHOWN_ROWS).map((r) => (
                <tr key={r.id}>
                  <th scope="row">
                    {r.lat === 0 ? (
                      r.name
                    ) : (
                      <a href={`/?at=${String(r.lat)},${String(r.lon)}`}>{r.name}</a>
                    )}
                    <span class="cov__sub">
                      {it.admin.coverage.subLine(
                        number.format(r.total),
                        r.prices,
                        r.day ? formatDate(r.day) : "",
                      )}
                    </span>
                  </th>
                  <td>{number.format(r.bars)}</td>
                  <td class="cov__minor">{number.format(r.total)}</td>
                  <td>{r.total > 0 ? `${percent.format((r.bars / r.total) * 100)} %` : "—"}</td>
                  <td class="cov__minor">{number.format(r.prices)}</td>
                  <td class="cov__minor">{r.day ? formatDate(r.day) : "—"}</td>
                </tr>
              ))}
              {showNone && (
                <tr>
                  <th scope="row">
                    {it.admin.coverage.noCity}
                    <span class="cov__sub">{it.admin.coverage.noCityHelp}</span>
                  </th>
                  <td>{number.format(none[0])}</td>
                  <td class="cov__minor">—</td>
                  <td>—</td>
                  <td class="cov__minor">{number.format(none[1])}</td>
                  <td class="cov__minor">{none[2] ? formatDate(none[2]) : "—"}</td>
                </tr>
              )}
            </tbody>
          </table>
          {rows.length === 0 && !showNone && <p class="hint">{it.admin.coverage.nothing}</p>}
          {rows.length > SHOWN_ROWS && (
            <p class="hint">{it.admin.coverage.truncated(SHOWN_ROWS)}</p>
          )}
        </>
      )}
    </section>
  );
}
