import { useEffect, useId, useMemo, useState } from "preact/hooks";
import type { Place } from "../../shared/api-types";
import { searchKey, searchWords } from "../../shared/venue";
import { it } from "../i18n/it";
import { loadPlaces, type Venue } from "../lib/data";
import { formatDate, formatPrice } from "../lib/format";
import { searchBars, type Hit } from "../lib/search";
import { leadWord, MIN_CHARS } from "../lib/search-match";
import { Sheet } from "./Sheet";

/** A bar of «I più economici qui»: the cheapest prices of the chosen drink in the visible area. */
export interface Cheap {
  venue: Venue;
  cents: number;
  day: string;
}

interface Props {
  /** Position if already granted, else the map centre: only used to order bars, never sent. */
  origin: { lat: number; lon: number } | null;
  cheapest: Cheap[];
  drink: string;
  hint?: string;
  onPlace: (place: Place) => void;
  onBar: (hit: Hit) => void;
  onCheap: (venue: Venue) => void;
  /** «Non trovi il bar?» with the typed name already written. */
  onPropose: (name: string) => void;
  onClose: () => void;
}

const MAX_PLACES = 8;
const MAX_TOTAL = 8;

/** Prefix matches first, then substring matches (SPEC 7.6); input order is kept within each group. */
function matchPlaces(places: Place[], query: string): Place[] {
  if (!query) return [];
  const prefix: Place[] = [];
  const inner: Place[] = [];
  for (const place of places) {
    const key = searchKey(place[1]);
    if (key.startsWith(query)) prefix.push(place);
    else if (key.includes(query)) inner.push(place);
  }
  return [...prefix, ...inner].slice(0, MAX_PLACES);
}

/** The part of a name the typed words match, in `<mark>` (also bold: never colour alone). */
function Highlight({ text, typed }: { text: string; typed: string[] }) {
  const parts: (string | { mark: string })[] = [];
  let last = 0;
  for (const m of text.matchAll(/[\p{L}\p{N}]+/gu)) {
    const flat = searchKey(m[0]);
    const word = typed.find((t) => flat.startsWith(t));
    if (!word) continue;
    const start = m.index;
    const end = start + Math.min(word.length, m[0].length);
    parts.push(text.slice(last, start), { mark: text.slice(start, end) });
    last = end;
  }
  parts.push(text.slice(last));
  return <>{parts.map((p, i) => (typeof p === "string" ? p : <mark key={i}>{p.mark}</mark>))}</>;
}

type Option = { id: string; kind: "place"; place: Place } | { id: string; kind: "bar"; hit: Hit };

export function SearchSheet({
  origin,
  cheapest,
  drink,
  hint,
  onPlace,
  onBar,
  onCheap,
  onPropose,
  onClose,
}: Props) {
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<Place[]>([]);
  const [placesFailed, setPlacesFailed] = useState(false);
  const [bars, setBars] = useState<Hit[]>([]);
  const [barsState, setBarsState] = useState<"idle" | "loading" | "failed">("idle");
  const [active, setActive] = useState(-1);
  const listId = useId();
  useEffect(() => {
    loadPlaces()
      .then(setPlaces)
      .catch(() => {
        setPlacesFailed(true);
      });
  }, []);

  const key = searchKey(query);
  const typed = useMemo(() => searchWords(query), [query]);
  useEffect(() => {
    if (key.length < MIN_CHARS || leadWord(query) === null) {
      setBars([]);
      setBarsState("idle");
      return;
    }
    let current = true;
    setBarsState("loading");
    searchBars(query, origin)
      .then((found) => {
        if (!current) return;
        setBars(found);
        setBarsState("idle");
      })
      .catch(() => {
        if (!current) return;
        setBars([]);
        setBarsState("failed");
      });
    return () => {
      current = false;
    };
  }, [query]);

  const foundPlaces = useMemo(() => matchPlaces(places, key), [places, key]);
  const options: Option[] = [
    ...foundPlaces.map((place, i): Option => ({
      id: `${listId}-p${String(i)}`,
      kind: "place",
      place,
    })),
    ...bars.map((hit, i): Option => ({ id: `${listId}-b${String(i)}`, kind: "bar", hit })),
  ].slice(0, MAX_TOTAL);
  const cityById = useMemo(() => new Map(places.map((p) => [p[0], p[1]])), [places]);

  function choose(option: Option) {
    if (option.kind === "place") onPlace(option.place);
    else onBar(option.hit);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (options.length === 0) return;
      e.preventDefault();
      const down = e.key === "ArrowDown";
      setActive((i) => (down ? (i + 1) % options.length : i <= 0 ? options.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      const option = options[active] ?? (options.length === 1 ? options[0] : undefined);
      if (option) {
        e.preventDefault();
        choose(option);
      }
    } else if (e.key === "Escape" && query) {
      e.preventDefault(); // the first Esc clears the text, the next one closes the sheet
      setQuery("");
    }
  }

  const searching = barsState === "loading";
  const noneFound = key.length > 0 && !searching && options.length === 0;
  const announce = placesFailed
    ? it.search.loadError
    : searching
      ? it.search.searching
      : barsState === "failed" && options.length === 0
        ? it.search.barsFailed
        : key
          ? options.length
            ? it.search.results(options.length)
            : it.search.none
          : "";

  return (
    <Sheet title={it.search.title} onClose={onClose}>
      {hint && <p class="hint">{hint}</p>}
      <input
        type="text"
        role="combobox"
        class="field"
        aria-label={it.search.label}
        aria-autocomplete="list"
        aria-expanded={options.length > 0}
        aria-controls={listId}
        aria-activedescendant={options[active]?.id}
        placeholder={it.search.label}
        value={query}
        autofocus
        autocomplete="off"
        autocapitalize="off"
        spellcheck={false}
        enterkeyhint="search"
        onInput={(e) => {
          setQuery(e.currentTarget.value);
          setActive(-1); // here, not in an effect: an arrow pressed right after typing must count
        }}
        onKeyDown={onKeyDown}
      />
      <p class="sr-only" role="status" aria-live="polite">
        {announce}
      </p>
      {placesFailed && (
        <p class="hint" role="alert">
          {it.search.loadError}
        </p>
      )}
      {barsState === "failed" && (
        <p class="hint" role="alert">
          {it.search.barsFailed}
        </p>
      )}
      <ul
        id={listId}
        role="listbox"
        aria-label={it.search.listLabel}
        class="rows options"
        hidden={options.length === 0}
      >
        {options.map((o, i) => (
          <li
            key={o.id}
            id={o.id}
            role="option"
            aria-selected={i === active}
            class="row option"
            onClick={() => {
              choose(o);
            }}
          >
            {o.kind === "place" ? (
              <>
                <span class="row__name">
                  <Highlight text={o.place[1]} typed={typed} />
                </span>
                <span class="row__meta">
                  {it.search.kindPlace} · {it.search.barsCount(o.place[4])}
                </span>
              </>
            ) : (
              <>
                <span class="row__name">
                  <Highlight text={o.hit[1]} typed={typed} />
                </span>
                <span class="row__meta">
                  {[it.search.kindBar, cityById.get(o.hit[4])].filter(Boolean).join(" · ")}
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
      {noneFound && (
        <div class="search-none">
          <p class="hint">{it.search.none}</p>
          {barsState !== "failed" && (
            <button
              type="button"
              class="btn btn--secondary"
              onClick={() => {
                onPropose(query.trim());
              }}
            >
              {it.add.missingBar}
            </button>
          )}
        </div>
      )}
      {!key && cheapest.length > 0 && (
        <>
          <h3 class="section-title">{it.search.cheapest}</h3>
          <p class="hint">{drink}</p>
          <ul class="rows" aria-label={it.search.cheapest}>
            {cheapest.map((c) => (
              <li key={c.venue.key}>
                <button
                  type="button"
                  class="row"
                  onClick={() => {
                    onCheap(c.venue);
                  }}
                >
                  <span class="row__name">{c.venue.name}</span>
                  <span class="row__price">{formatPrice(c.cents)}</span>
                  <span class="row__meta">
                    {[c.venue.addr, formatDate(c.day)].filter(Boolean).join(" · ")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Sheet>
  );
}
