import { useEffect, useState } from "preact/hooks";
import { CELL_PRECISION, encodeGeohash, visibleCells } from "../../shared/geohash";
import { it } from "../i18n/it";
import { invalidateCell, loadCell, loadPlaces, type Venue } from "../lib/data";
import { formatDate, formatPrice, formatSize, searchKey } from "../lib/format";

// /admin (SPEC 7.9, D-19): behind Cloudflare Access; the Worker verifies the JWT on /api/admin/*.

interface Overview {
  venues: {
    id: number;
    name: string;
    kind: number;
    cell: string;
    status: "pending" | "approved";
    confirmations: number;
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
          <FindBars onHide={(v) => act("hide", { venue: v.key, cell: v.cell }, v.cell)} />
          <AddBar
            onAdd={async (body) => {
              const ok = await act("venues", body);
              if (ok) setMessage(it.admin.added);
              return ok;
            }}
            onError={setMessage}
          />
          <section>
            <h2 class="section-title">{it.admin.pricesTitle}</h2>
            {data.prices.length === 0 && <p class="hint">{it.admin.none}</p>}
            <ul class="admin__list">
              {data.prices.map((p) => {
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
                        onClick={() =>
                          void act("prices/status", { ...key, status: "active" }, p.cell)
                        }
                      >
                        {it.admin.approve}
                      </button>
                      <button
                        type="button"
                        class="btn btn--ghost"
                        onClick={() =>
                          void act("prices/status", { ...key, status: "removed" }, p.cell)
                        }
                      >
                        {it.admin.remove}
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
          <section>
            <h2 class="section-title">{it.admin.userTitle}</h2>
            {data.venues.length === 0 && <p class="hint">{it.admin.none}</p>}
            <ul class="admin__list">
              {data.venues.map((v) => (
                <li key={v.id}>
                  <a href={`/bar/u${String(v.id)}?c=${v.cell}`}>{v.name}</a> · {it.kinds[v.kind]}
                  {v.status === "pending" && ` · ${it.admin.pending}`}
                  <span class="admin__actions">
                    {v.status === "pending" && (
                      <button
                        type="button"
                        class="btn btn--secondary"
                        onClick={() =>
                          void act(`venues/${String(v.id)}/status`, { status: "approved" }, v.cell)
                        }
                      >
                        {it.admin.approve}
                      </button>
                    )}
                    <button
                      type="button"
                      class="btn btn--ghost"
                      onClick={() =>
                        void act(`venues/${String(v.id)}/status`, { status: "removed" }, v.cell)
                      }
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

/** City + part of the name → bars of the cells around the city centre. */
function FindBars({ onHide }: { onHide: (venue: Venue) => Promise<boolean> }) {
  const [city, setCity] = useState("");
  const [name, setName] = useState("");
  const [found, setFound] = useState<Venue[] | null>(null);
  const [note, setNote] = useState("");

  async function search(e: Event) {
    e.preventDefault();
    setNote("");
    const places = await loadPlaces();
    const wanted = searchKey(city);
    const place =
      places.find((p) => searchKey(p[1]) === wanted) ??
      places.find((p) => searchKey(p[1]).startsWith(wanted));
    if (!place) {
      setFound(null);
      setNote(it.admin.cityNotFound);
      return;
    }
    const [, , lat, lon] = place;
    const cells = visibleCells({
      south: lat - 0.03,
      north: lat + 0.03,
      west: lon - 0.04,
      east: lon + 0.04,
    }) ?? [encodeGeohash(lat, lon, CELL_PRECISION)];
    const lists = await Promise.all(cells.map((c) => loadCell(c).catch(() => [])));
    const key = searchKey(name);
    const result = lists
      .flat()
      .filter((v) => !v.key.startsWith("u") && searchKey(v.name).includes(key))
      .slice(0, 30);
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
            required
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
            required
            minLength={2}
            onInput={(e) => {
              setName(e.currentTarget.value);
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
            {v.addr && ` · ${v.addr}`}
            <span class="admin__actions">
              <button
                type="button"
                class="btn btn--secondary"
                onClick={() =>
                  void onHide(v).then((ok) => {
                    if (ok) setFound((list) => list?.filter((x) => x.key !== v.key) ?? null);
                  })
                }
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
