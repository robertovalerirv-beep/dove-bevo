import { useMemo, useState } from "preact/hooks";
import { CATALOG, findSize } from "../../shared/catalog";
import { it } from "../i18n/it";
import type { Venue } from "../lib/data";
import { formatDistance, formatSize, searchKey } from "../lib/format";
import { distanceMeters } from "../lib/geo";
import { Sheet } from "./Sheet";

export interface Draft {
  venue: Venue;
  drink: string;
  size: number;
  hh: 0 | 1;
  cents: number;
}

export interface Prefill {
  venue: Venue;
  drink?: string;
  size?: number;
  hh?: 0 | 1;
  /** Shown above the price, e.g. a rejection from the server. */
  error?: string;
  text?: string;
}

interface Props {
  venues: Venue[];
  /** Position if granted, else the map centre (D-16). Null when nothing is known yet. */
  origin: { lat: number; lon: number } | null;
  prefill: Prefill | null;
  onSave: (draft: Draft) => void;
  onClose: () => void;
}

const NEAREST = 5;

/** "7,50" or "7.5" → 750; null when not a price. */
export function parseCents(text: string): number | null {
  const match = /^\s*(\d{1,3})(?:[.,](\d{1,2}))?\s*€?\s*$/.exec(text);
  if (!match?.[1]) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? "0").padEnd(2, "0"));
}

const defaultSize = (drink: string) => {
  const entry = CATALOG.find((d) => d.code === drink);
  return entry?.sizes[entry.defaultSize]?.ml ?? 0;
};

/** "Aggiungi prezzo" (SPEC 7.3): bar → drink → price, 4 taps plus the digits. */
export function AddPriceSheet({ venues, origin, prefill, onSave, onClose }: Props) {
  const [venue, setVenue] = useState<Venue | null>(prefill?.venue ?? null);
  const [drink, setDrink] = useState<string | null>(prefill?.drink ?? null);
  const [size, setSize] = useState<number>(
    prefill?.size ?? (prefill?.drink ? defaultSize(prefill.drink) : 0),
  );
  const [hh, setHh] = useState<0 | 1>(prefill?.hh ?? 0);
  const [text, setText] = useState(prefill?.text ?? "");
  const [error, setError] = useState(prefill?.error ?? "");
  const [query, setQuery] = useState("");

  const nearest = useMemo(() => {
    const key = searchKey(query);
    const list = key ? venues.filter((v) => searchKey(v.name).includes(key)) : venues;
    if (!origin) return key ? list.slice(0, NEAREST) : [];
    return list
      .map((v) => ({ v, m: distanceMeters(origin.lat, origin.lon, v.lat, v.lon) }))
      .sort((a, b) => a.m - b.m)
      .slice(0, NEAREST);
  }, [venues, origin, query]);

  const drinkName = (code: string) => it.drinks[code] ?? code;

  function save() {
    if (!venue || !drink) return;
    const cents = parseCents(text);
    if (cents === null) {
      setError(it.add.badFormat);
      return;
    }
    const range = findSize(drink, size);
    if (range && (cents < range.min || cents > range.max)) {
      setError(it.add.outOfRange(drinkName(drink).toLowerCase()));
      return;
    }
    onSave({ venue, drink, size, hh, cents });
  }

  if (!venue) {
    return (
      <Sheet title={it.add.chooseBar} onClose={onClose}>
        <input
          type="search"
          class="field"
          aria-label={it.add.searchBar}
          placeholder={it.add.searchBar}
          value={query}
          onInput={(e) => {
            setQuery(e.currentTarget.value);
          }}
        />
        {nearest.length === 0 && <p class="hint">{it.add.noBars}</p>}
        <ul class="rows" aria-label={it.add.nearBars}>
          {nearest.map((item) => {
            const v = "v" in item ? item.v : item;
            const meters = "m" in item ? item.m : null;
            return (
              <li key={v.key}>
                <button
                  type="button"
                  class="row"
                  onClick={() => {
                    setVenue(v);
                  }}
                >
                  <span class="row__name">{v.name}</span>
                  <span class="row__meta">
                    {[v.addr || it.kinds[v.kind], meters === null ? "" : formatDistance(meters)]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Sheet>
    );
  }

  if (!drink) {
    return (
      <Sheet title={venue.name} onClose={onClose}>
        <h3 class="section-title">{it.add.chooseDrink}</h3>
        <ul class="drinks">
          {CATALOG.map((d) => (
            <li key={d.code}>
              <button
                type="button"
                class="drink"
                onClick={() => {
                  setDrink(d.code);
                  setSize(defaultSize(d.code));
                }}
              >
                <span class="drink__name">{drinkName(d.code)}</span>
                <span class="drink__size">{formatSize(defaultSize(d.code))}</span>
              </button>
            </li>
          ))}
        </ul>
        {!prefill?.venue && (
          <button
            type="button"
            class="btn btn--ghost"
            onClick={() => {
              setVenue(null);
            }}
          >
            {it.add.back}
          </button>
        )}
      </Sheet>
    );
  }

  const sizes = CATALOG.find((d) => d.code === drink)?.sizes ?? [];
  return (
    <Sheet title={venue.name} onClose={onClose}>
      <h3 class="section-title">{drinkName(drink)}</h3>
      {sizes.length > 1 && (
        <div class="segmented" role="radiogroup" aria-label={it.add.size}>
          {sizes.map((s) => (
            <button
              key={s.ml}
              type="button"
              role="radio"
              aria-checked={s.ml === size}
              class="chip"
              onClick={() => {
                setSize(s.ml);
              }}
            >
              {formatSize(s.ml)}
            </button>
          ))}
        </div>
      )}
      <label class="price-input">
        <span class="sr-only">{it.add.price}</span>
        <input
          type="text"
          inputMode="decimal"
          autocomplete="off"
          aria-label={it.add.price}
          aria-invalid={error ? "true" : "false"}
          aria-describedby="price-error"
          placeholder="0,00"
          value={text}
          autofocus
          onInput={(e) => {
            setText(e.currentTarget.value);
            setError("");
          }}
        />
        <span aria-hidden="true">€</span>
      </label>
      <p id="price-error" class="error" role="alert">
        {error}
      </p>
      <button
        type="button"
        role="switch"
        aria-checked={hh === 1}
        class="switch"
        onClick={() => {
          setHh(hh ? 0 : 1);
        }}
      >
        <span class="switch__track" aria-hidden="true" />
        {it.add.happyHour}
      </button>
      <button type="button" class="btn btn--primary" disabled={!text.trim()} onClick={save}>
        {it.add.save}
      </button>
      {!prefill?.drink && (
        <button
          type="button"
          class="btn btn--ghost"
          onClick={() => {
            setDrink(null);
          }}
        >
          {it.add.back}
        </button>
      )}
    </Sheet>
  );
}
