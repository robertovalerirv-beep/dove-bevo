import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { CELL_PRECISION, encodeGeohash } from "../../shared/geohash";
import { it } from "../i18n/it";
import { invalidateCell, loadCell, loadPlaces, type Venue } from "../lib/data";
import { distanceMeters, searchKey } from "../../shared/venue";
import { formatDate, formatDistance, formatPrice, formatSize } from "../lib/format";

// /admin (SPEC 7.9, D-19): behind Cloudflare Access; the Worker verifies the JWT on /api/admin/*.

interface Overview {
  reports: { venue_key: string; cell: string | null; reasons: string; n: number; day: string }[];
  venues: {
    id: number;
    name: string;
    kind: number;
    lat: number;
    lon: number;
    cell: string;
    status: "pending" | "approved";
    /** Independent proposals of the same pending bar: it only orders the queue. */
    confirmations: number;
    day: string | null;
    /** Prices waiting for the bar to be approved. */
    prices: number;
  }[];
  hidden: { venue_key: string; cell: string; name: string; day: string }[];
  prices: {
    venue_key: string;
    drink: string;
    size_ml: number;
    hh: 0 | 1;
    cell: string;
    price_cents: number;
    observed_on: string;
    status: "review" | "quarantined";
  }[];
}

async function post(path: string, body: unknown): Promise<boolean> {
  const response = await fetch(`/api/admin/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.ok;
}

/** "45.4642, 9.19" or "45.4642 9.19" → coordinates. */
export function parseCoords(text: string): { lat: number; lon: number } | null {
  const match = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(text);
  if (!match?.[1] || !match[2]) return null;
  const lat = Number(match[1]);
  const lon = Number(match[2]);
  return lat >= 35.2 && lat <= 47.2 && lon >= 6.5 && lon <= 18.6 ? { lat, lon } : null;
}

export function AdminPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [state, setState] = useState<"loading" | "denied" | "ready">("loading");
  const [message, setMessage] = useState("");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    void fetch("/api/admin/overview")
      .then(async (response) => {
        if (!response.ok) {
          setState("denied");
          return;
        }
        setData((await response.json()) as Overview);
        setState("ready");
      })
      .catch(() => {
        setState("denied");
      });
  }, [version]);

  async function act(path: string, body: unknown, cell?: string) {
    const ok = await post(path, body).catch(() => false);
    setMessage(ok ? it.admin.done : it.admin.failed);
    if (ok && cell) invalidateCell(cell);
    if (ok) setVersion((n) => n + 1);
    return ok;
  }

  return (
    <main class="admin">
      <header class="admin__head">
        <h1>{it.admin.title}</h1>
        <a class="btn btn--secondary" href="/">
          {it.admin.backToMap}
        </a>
      </header>
      <p class="hint" role="status">
        {state === "loading" ? it.admin.loading : message}
      </p>
      {state === "denied" && (
        <p class="error" role="alert">
          {it.admin.denied}
        </p>
      )}
      {state === "ready" && data && (
        <>
          <Todo
            counts={[
              [
                "new-bars",
                it.admin.queueNew,
                data.venues.filter((v) => v.status === "pending").length,
              ],
              ["bar-reports", it.admin.reportsTitle, data.reports.length],
              ["price-review", it.admin.pricesTitle, data.prices.length],
            ]}
          />
          <Queue
            id="new-bars"
            title={it.admin.queueNew}
            help={it.admin.queueNewHelp}
            count={data.venues.filter((v) => v.status === "pending").length}
          >
            {data.venues
              .filter((v) => v.status === "pending")
              .map((v) => (
                <NewBar
                  key={v.id}
                  venue={v}
                  onDecide={(status, edit) =>
                    act(`venues/${String(v.id)}/status`, { status, ...edit }, v.cell)
                  }
                />
              ))}
          </Queue>
          <BarReports
            reports={data.reports}
            onDelete={(key, cell) =>
              key.startsWith("u")
                ? act(`venues/${key.slice(1)}/status`, { status: "removed" }, cell)
                : act("hide", { venue: key, cell }, cell)
            }
            onIgnore={(key) => act("reports/dismiss", { venue: key })}
          />
          <PriceQueue prices={data.prices} act={act} />
          <h2 class="admin__tools">{it.admin.toolsTitle}</h2>
          <FindBars
            onDelete={(v) =>
              v.key.startsWith("u")
                ? act(`venues/${v.key.slice(1)}/status`, { status: "removed" }, v.cell)
                : act("hide", { venue: v.key, cell: v.cell }, v.cell)
            }
          />
          <AddBar
            onAdd={async (body) => {
              const ok = await act("venues", body);
              if (ok) setMessage(it.admin.added);
              return ok;
            }}
            onError={setMessage}
          />
          <section>
            <h2 class="section-title">{it.admin.userTitle}</h2>
            {data.venues.every((v) => v.status === "pending") && (
              <p class="hint">{it.admin.none}</p>
            )}
            <ul class="admin__list">
              {data.venues
                .filter((v) => v.status === "approved")
                .map((v) => (
                  <li key={v.id}>
                    <a href={`/bar/u${String(v.id)}?c=${v.cell}`}>{v.name}</a> · {it.kinds[v.kind]}
                    <span class="admin__actions">
                      <button
                        type="button"
                        class="btn btn--ghost"
                        onClick={() => {
                          if (window.confirm(it.admin.confirmDelete(v.name)))
                            void act(
                              `venues/${String(v.id)}/status`,
                              { status: "removed" },
                              v.cell,
                            );
                        }}
                      >
                        {it.admin.remove}
                      </button>
                    </span>
                  </li>
                ))}
            </ul>
          </section>
          <section>
            <h2 class="section-title">{it.admin.hiddenTitle}</h2>
            {data.hidden.length === 0 && <p class="hint">{it.admin.none}</p>}
            <ul class="admin__list">
              {data.hidden.map((h) => (
                <li key={h.venue_key}>
                  {h.name} · {formatDate(h.day)}
                  <span class="admin__actions">
                    <button
                      type="button"
                      class="btn btn--secondary"
                      onClick={() => void act("unhide", { venue: h.venue_key }, h.cell)}
                    >
                      {it.admin.unhide}
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}

/** What is waiting for a decision: a count per queue and a total badge (no notifications). */
function Todo({ counts }: { counts: [id: string, title: string, n: number][] }) {
  const total = counts.reduce((sum, [, , n]) => sum + n, 0);
  return (
    <nav class="admin__todo" aria-label={it.admin.todo}>
      <p class="admin__badge" data-testid="admin-total">
        {it.admin.total(total)}
      </p>
      <ul>
        {counts.map(([id, title, n]) => (
          <li key={id}>
            <a href={`#${id}`}>
              {title}: <strong data-testid={`count-${id}`}>{n}</strong>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** One queue of the admin: same look, same list, only the items differ. */
function Queue({
  id,
  title,
  help,
  count,
  children,
}: {
  id: string;
  title: string;
  help: string;
  count: number;
  children: ComponentChildren;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`}>
      <h2 class="section-title" id={`${id}-title`}>
        {title} ({count})
      </h2>
      <p class="hint">{help}</p>
      {count === 0 ? <p class="hint">{it.admin.none}</p> : <ul class="admin__list">{children}</ul>}
    </section>
  );
}

const googleMaps = (name: string, lat: number, lon: number) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${String(lat)},${String(lon)}`)}`;
const osmPoint = (lat: number, lon: number) =>
  `https://www.openstreetmap.org/?mlat=${String(lat)}&mlon=${String(lon)}#map=19/${String(lat)}/${String(lon)}`;

/** A bar proposed by a user: only the admin makes it public (name and kind can be fixed first). */
function NewBar({
  venue: v,
  onDecide,
}: {
  venue: Overview["venues"][number];
  onDecide: (
    status: "approved" | "removed",
    edit: { name?: string; kind?: number },
  ) => Promise<boolean>;
}) {
  const [name, setName] = useState(v.name);
  const [kind, setKind] = useState(v.kind);
  const [near, setNear] = useState<{ name: string; meters: number }[]>([]);
  useEffect(() => {
    void loadCell(v.cell)
      .catch(() => [])
      .then((list) => {
        setNear(
          list
            .map((x) => ({ name: x.name, meters: distanceMeters(v.lat, v.lon, x.lat, x.lon) }))
            .filter((x) => x.meters <= 200)
            .sort((a, b) => a.meters - b.meters)
            .slice(0, 3),
        );
      });
  }, [v.cell, v.lat, v.lon]);
  const edit = { ...(name !== v.name && { name }), ...(kind !== v.kind && { kind }) };

  return (
    <li>
      <label>
        {it.admin.name}
        <input
          class="field"
          value={name}
          maxLength={80}
          onInput={(e) => {
            setName(e.currentTarget.value);
          }}
        />
      </label>
      <label>
        {it.admin.kind}
        <select
          class="field"
          value={String(kind)}
          onChange={(e) => {
            setKind(Number(e.currentTarget.value));
          }}
        >
          {it.kinds.map((label, i) => (
            <option key={label} value={String(i)}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <p class="hint">
        {it.admin.proposedBy(v.confirmations)} · {it.admin.waitingPrices(v.prices)}
        {v.day && ` · ${formatDate(v.day)}`}
      </p>
      <p class="hint">
        <a href={osmPoint(v.lat, v.lon)} target="_blank" rel="noopener">
          {it.admin.onMap}
        </a>{" "}
        ·{" "}
        <a href={googleMaps(v.name, v.lat, v.lon)} target="_blank" rel="noopener">
          {it.admin.searchGoogle}
        </a>
      </p>
      {near.length > 0 && (
        <p class="hint">
          {it.admin.nearby}: {near.map((x) => `${x.name} (${formatDistance(x.meters)})`).join(", ")}
        </p>
      )}
      <span class="admin__actions">
        <button
          type="button"
          class="btn btn--secondary"
          aria-label={`${it.admin.approve} ${v.name}`}
          onClick={() => void onDecide("approved", edit)}
        >
          {it.admin.approve}
        </button>
        <button
          type="button"
          class="btn btn--ghost"
          aria-label={`${it.admin.reject} ${v.name}`}
          onClick={() => {
            if (window.confirm(it.admin.confirmReject(v.name))) void onDecide("removed", {});
          }}
        >
          {it.admin.reject}
        </button>
      </span>
    </li>
  );
}

/** Quarantined prices and prices reported by users, to approve or remove. */
function PriceQueue({
  prices,
  act,
}: {
  prices: Overview["prices"];
  act: (path: string, body: unknown, cell?: string) => Promise<boolean>;
}) {
  return (
    <Queue
      id="price-review"
      title={it.admin.pricesTitle}
      help={it.admin.pricesHelp}
      count={prices.length}
    >
      {prices.map((p) => {
        const key = { venue: p.venue_key, drink: p.drink, size_ml: p.size_ml, hh: p.hh };
        return (
          <li key={`${p.venue_key}|${p.drink}|${String(p.size_ml)}|${String(p.hh)}`}>
            <a href={`/bar/${p.venue_key}?c=${p.cell}`}>{p.venue_key}</a>{" "}
            {[it.drinks[p.drink] ?? p.drink, formatSize(p.size_ml), p.hh ? "HH" : ""]
              .filter(Boolean)
              .join(" ")}{" "}
            · {formatPrice(p.price_cents)} · {formatDate(p.observed_on)} ·{" "}
            {p.status === "review" ? it.admin.review : it.admin.quarantined}
            <span class="admin__actions">
              <button
                type="button"
                class="btn btn--secondary"
                onClick={() => void act("prices/status", { ...key, status: "active" }, p.cell)}
              >
                {it.admin.approve}
              </button>
              <button
                type="button"
                class="btn btn--ghost"
                onClick={() => void act("prices/status", { ...key, status: "removed" }, p.cell)}
              >
                {it.admin.remove}
              </button>
            </span>
          </li>
        );
      })}
    </Queue>
  );
}

/** Bar reports from users: the admin deletes the bar or dismisses the reports (nothing is automatic). */
function BarReports({
  reports,
  onDelete,
  onIgnore,
}: {
  reports: Overview["reports"];
  onDelete: (key: string, cell: string) => Promise<boolean>;
  onIgnore: (key: string) => Promise<boolean>;
}) {
  const [names, setNames] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    const cells = [...new Set(reports.map((r) => r.cell).filter((c): c is string => c !== null))];
    void Promise.all(cells.map((c) => loadCell(c).catch(() => []))).then((lists) => {
      setNames(new Map(lists.flat().map((v) => [v.key, v.name])));
    });
  }, [reports]);
  const reasonText = (code: string) =>
    (it.report.reasons as Record<string, string | undefined>)[code] ?? code;

  return (
    <Queue
      id="bar-reports"
      title={it.admin.reportsTitle}
      help={it.admin.reportsHelp}
      count={reports.length}
    >
      {reports.map((r) => {
        const name = names.get(r.venue_key) ?? r.venue_key;
        return (
          <li key={r.venue_key}>
            {r.cell ? <a href={`/bar/${r.venue_key}?c=${r.cell}`}>{name}</a> : name} ·{" "}
            {r.reasons.split(",").map(reasonText).join(", ")} · {it.admin.reportCount(r.n)} ·{" "}
            {formatDate(r.day)}
            <span class="admin__actions">
              {r.cell && (
                <button
                  type="button"
                  class="btn btn--secondary"
                  onClick={() => {
                    if (r.cell && window.confirm(it.admin.confirmDelete(name)))
                      void onDelete(r.venue_key, r.cell);
                  }}
                >
                  {it.admin.hide}
                </button>
              )}
              <button
                type="button"
                class="btn btn--ghost"
                onClick={() => void onIgnore(r.venue_key)}
              >
                {it.admin.ignore}
              </button>
            </span>
          </li>
        );
      })}
    </Queue>
  );
}

/** Cells around a point, about ±7 km: wide enough for a city, fetched fresh for the admin. */
function cellsAround(lat: number, lon: number): string[] {
  const cells = new Set<string>();
  for (let dLat = -0.06; dLat <= 0.06001; dLat += 0.03)
    for (let dLon = -0.08; dLon <= 0.08001; dLon += 0.03)
      cells.add(encodeGeohash(lat + dLat, lon + dLon, CELL_PRECISION));
  return [...cells];
}

async function freshCells(cells: string[]): Promise<Venue[]> {
  for (const cell of cells) invalidateCell(cell); // a bar added a moment ago must show up
  const lists = await Promise.all(cells.map((c) => loadCell(c).catch(() => [])));
  return lists.flat();
}

/** "/bar/n123?c=u0nd9" or a full link to it → key and cell. */
export function parseBarLink(text: string): { key: string; cell: string } | null {
  const match = /\/bar\/([nwru]\d{1,15})\?c=([0-9b-hjkmnp-z]{5})/.exec(text);
  return match?.[1] && match[2] ? { key: match[1], cell: match[2] } : null;
}

/** City + part of the name, or a bar link → OSM and added bars, each one deletable. */
function FindBars({ onDelete }: { onDelete: (venue: Venue) => Promise<boolean> }) {
  const [city, setCity] = useState("");
  const [name, setName] = useState("");
  const [link, setLink] = useState("");
  const [found, setFound] = useState<Venue[] | null>(null);
  const [note, setNote] = useState("");

  async function search(e: Event) {
    e.preventDefault();
    setNote("");
    setFound(null);
    let result: Venue[];
    if (link.trim()) {
      const target = parseBarLink(link);
      if (!target) {
        setNote(it.admin.badLink);
        return;
      }
      result = (await freshCells([target.cell])).filter((v) => v.key === target.key);
    } else {
      if (!city.trim() || name.trim().length < 2) {
        setNote(it.admin.needCityOrLink);
        return;
      }
      const places = await loadPlaces();
      const wanted = searchKey(city);
      const place =
        places.find((p) => searchKey(p[1]) === wanted) ??
        places.find((p) => searchKey(p[1]).startsWith(wanted));
      if (!place) {
        setNote(it.admin.cityNotFound);
        return;
      }
      const key = searchKey(name);
      result = (await freshCells(cellsAround(place[2], place[3])))
        .filter((v) => searchKey(v.name).includes(key))
        .slice(0, 30);
    }
    setFound(result);
    if (result.length === 0) setNote(it.admin.noResults);
  }

  return (
    <section>
      <h2 class="section-title">{it.admin.findTitle}</h2>
      <p class="hint">{it.admin.findHelp}</p>
      <form class="admin__form" onSubmit={(e) => void search(e)}>
        <label>
          {it.admin.city}
          <input
            class="field"
            value={city}
            onInput={(e) => {
              setCity(e.currentTarget.value);
            }}
          />
        </label>
        <label>
          {it.admin.name}
          <input
            class="field"
            value={name}
            onInput={(e) => {
              setName(e.currentTarget.value);
            }}
          />
        </label>
        <label>
          {it.admin.link}
          <input
            class="field"
            value={link}
            inputMode="url"
            placeholder="https://…/bar/n123?c=u0nd9"
            onInput={(e) => {
              setLink(e.currentTarget.value);
            }}
          />
        </label>
        <button type="submit" class="btn btn--primary">
          {it.admin.search}
        </button>
      </form>
      {note && <p class="hint">{note}</p>}
      <ul class="admin__list">
        {found?.map((v) => (
          <li key={v.key}>
            <a href={`/bar/${v.key}?c=${v.cell}`}>{v.name}</a> · {it.kinds[v.kind]}
            {v.key.startsWith("u") && ` · ${it.admin.addedByAdmin}`}
            {v.addr && ` · ${v.addr}`}
            <span class="admin__actions">
              <button
                type="button"
                class="btn btn--secondary"
                onClick={() => {
                  if (!window.confirm(it.admin.confirmDelete(v.name))) return;
                  void onDelete(v).then((ok) => {
                    if (ok) setFound((list) => list?.filter((x) => x.key !== v.key) ?? null);
                  });
                }}
              >
                {it.admin.hide}
              </button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AddBar({
  onAdd,
  onError,
}: {
  onAdd: (body: { name: string; kind: number; lat: number; lon: number }) => Promise<boolean>;
  onError: (text: string) => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState(1);
  const [coords, setCoords] = useState("");

  async function submit(e: Event) {
    e.preventDefault();
    const point = parseCoords(coords);
    if (!point) {
      onError(it.admin.badCoords);
      return;
    }
    if (name.trim().length < 2 || name.trim().length > 80) {
      onError(it.admin.badName);
      return;
    }
    if (await onAdd({ name: name.trim(), kind, ...point })) {
      setName("");
      setCoords("");
    }
  }

  return (
    <section>
      <h2 class="section-title">{it.admin.addTitle}</h2>
      <p class="hint">{it.admin.addHelp}</p>
      <form class="admin__form" onSubmit={(e) => void submit(e)}>
        <label>
          {it.admin.name}
          <input
            class="field"
            value={name}
            required
            maxLength={80}
            onInput={(e) => {
              setName(e.currentTarget.value);
            }}
          />
        </label>
        <label>
          {it.admin.kind}
          <select
            class="field"
            value={String(kind)}
            onChange={(e) => {
              setKind(Number(e.currentTarget.value));
            }}
          >
            {it.kinds.map((label, i) => (
              <option key={label} value={String(i)}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          {it.admin.coords}
          <input
            class="field"
            value={coords}
            required
            inputMode="decimal"
            placeholder="45.4642, 9.1900"
            onInput={(e) => {
              setCoords(e.currentTarget.value);
            }}
          />
        </label>
        <button type="submit" class="btn btn--primary">
          {it.admin.add}
        </button>
      </form>
    </section>
  );
}
