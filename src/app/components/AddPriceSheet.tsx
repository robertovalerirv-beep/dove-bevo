import { useMemo, useState } from "preact/hooks";
import { CATALOG, findDrink } from "../../shared/catalog";
import { it } from "../i18n/it";
import type { Venue } from "../lib/data";
import { distanceMeters, searchKey } from "../../shared/venue";
import { formatDistance, formatPrice } from "../lib/format";
import { cellRange, seenPrices, tierOf } from "../lib/tiers";
import { drinkIcon, Icon } from "./Icon";
import { Sheet } from "./Sheet";

export interface Draft {
  venue: Venue;
  drink: string;
  hh: 0 | 1;
  cents: number;
}

export interface Prefill {
  venue: Venue;
  drink?: string;
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
  /** "Non trovi il bar?": leaves for the proposal of a new bar. */
  onPropose: () => void;
  onClose: () => void;
}

const NEAREST = 5;

/** "7,50" or "7.5" → 750; null when not a price. */
export function parseCents(text: string): number | null {
  const match = /^\s*(\d{1,3})(?:[.,](\d{1,2}))?\s*€?\s*$/.exec(text);
  if (!match?.[1]) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? "0").padEnd(2, "0"));
}

/** "Aggiungi prezzo" (SPEC 7.3): bar → drink → price, 4 taps plus the digits. */
export function AddPriceSheet({ venues, origin, prefill, onSave, onPropose, onClose }: Props) {
  const [venue, setVenue] = useState<Venue | null>(prefill?.venue ?? null);
  const [drink, setDrink] = useState<string | null>(prefill?.drink ?? null);
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
    const limits = findDrink(drink);
    if (limits && (cents < limits.min || cents > limits.max)) {
      setError(it.add.outOfRange(drinkName(drink).toLowerCase()));
      return;
    }
    onSave({ venue, drink, hh, cents });
  }

  if (!venue) {
    return (
      <Sheet title={it.add.chooseBar} onClose={onClose} step="bar">
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
        <ul class="rows rows--bars" aria-label={it.add.nearBars}>
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
                    {[
                      v.pending ? it.add.pendingBar : v.addr || it.kinds[v.kind],
                      meters === null ? "" : formatDistance(meters),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <button type="button" class="btn btn--secondary" onClick={onPropose}>
          {it.add.missingBar}
        </button>
      </Sheet>
    );
  }

  if (!drink) {
    return (
      <Sheet
        title={venue.name}
        onClose={onClose}
        step="drink"
        onBack={
          prefill?.venue
            ? undefined
            : () => {
                setVenue(null);
              }
        }
      >
        <h3 class="section-title" tabIndex={-1} autofocus>
          {it.add.chooseDrink}
        </h3>
        <ul class="drinks">
          {CATALOG.map((d) => (
            <li key={d.code}>
              <button
                type="button"
                class="drink"
                onClick={() => {
                  setDrink(d.code);
                }}
              >
                <Icon name={drinkIcon(d.code)} />
                <span class="drink__name">{drinkName(d.code)}</span>
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    );
  }

  // Prices already seen in this zone for the same drink (MB-10): one tap saves one.
  const seen = seenPrices(venues, venue.cell, drink);
  const range = cellRange(venues, venue.cell, drink);
  const bare = (cents: number) => formatPrice(cents).replace(" €", "");
  return (
    <Sheet
      title={venue.name}
      onClose={onClose}
      step="price"
      onBack={
        prefill?.drink
          ? undefined
          : () => {
              setDrink(null);
            }
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <h3 class="context-tag">
          <Icon name={drinkIcon(drink)} />
          {drinkName(drink)}
        </h3>
        <p class="question">{it.add.question}</p>
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
        {seen.length > 0 && (
          <>
            <p class="seen__label">{it.add.seenHelp}</p>
            <ul class="seen" aria-label={it.add.seenHere}>
              {seen.map((cents) => {
                const tier = tierOf(cents, range?.median ?? null);
                return (
                  <li key={cents}>
                    <button
                      type="button"
                      class={`chip seen__price seen__price--${tier}`}
                      onClick={() => {
                        onSave({ venue, drink, hh, cents });
                      }}
                    >
                      {tier !== "neutro" && (
                        <span aria-hidden="true">
                          {tier === "affare" ? "↓" : tier === "giusto" ? "=" : "↑"}
                        </span>
                      )}
                      {formatPrice(cents)}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        {range && (
          <p class="hint zone-range">
            {it.add.zoneRange(bare(range.min), bare(range.max), bare(range.median))}
          </p>
        )}
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
        <button type="submit" class="btn btn--primary" disabled={!text.trim()}>
          {it.add.save}
        </button>
      </form>
    </Sheet>
  );
}
