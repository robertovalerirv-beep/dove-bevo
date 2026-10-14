import { useEffect, useMemo, useState } from "preact/hooks";
import type { Place } from "../../shared/api-types";
import { it } from "../i18n/it";
import { loadPlaces, type Venue } from "../lib/data";
import { searchKey } from "../../shared/venue";
import { Sheet } from "./Sheet";

interface Props {
  venues: Venue[];
  hint?: string;
  onPlace: (place: Place) => void;
  onVenue: (venue: Venue) => void;
  onClose: () => void;
}

const MAX_PLACES = 8;
const MAX_BARS = 8;

/** Prefix matches first, then substring matches (SPEC 7.6); input order is kept within each group. */
function match<T>(items: T[], query: string, name: (item: T) => string, max: number): T[] {
  if (!query) return [];
  const prefix: T[] = [];
  const inner: T[] = [];
  for (const item of items) {
    const key = searchKey(name(item));
    if (key.startsWith(query)) prefix.push(item);
    else if (key.includes(query)) inner.push(item);
  }
  return [...prefix, ...inner].slice(0, max);
}

function Result({
  label,
  detail,
  onSelect,
}: {
  label: string;
  detail: string;
  onSelect: () => void;
}) {
  return (
    <li>
      <button type="button" class="row" onClick={onSelect}>
        <span class="row__name">{label}</span>
        <span class="row__meta">{detail}</span>
      </button>
    </li>
  );
}

export function SearchSheet({ venues, hint, onPlace, onVenue, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<Place[]>([]);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    loadPlaces()
      .then(setPlaces)
      .catch(() => {
        setFailed(true);
      });
  }, []);
  const key = searchKey(query);
  const foundPlaces = useMemo(() => match(places, key, (p) => p[1], MAX_PLACES), [places, key]);
  const foundBars = useMemo(() => match(venues, key, (v) => v.name, MAX_BARS), [venues, key]);
  const total = foundPlaces.length + foundBars.length;

  return (
    <Sheet title={it.search.title} onClose={onClose}>
      {hint && <p class="hint">{hint}</p>}
      <input
        type="search"
        class="field"
        aria-label={it.search.label}
        placeholder={it.search.label}
        value={query}
        autofocus
        autocomplete="off"
        onInput={(e) => {
          setQuery(e.currentTarget.value);
        }}
      />
      <p class="sr-only" aria-live="polite">
        {failed
          ? it.search.loadError
          : key
            ? total
              ? it.search.results(total)
              : it.search.none
            : ""}
      </p>
      {failed && (
        <p class="hint" role="alert">
          {it.search.loadError}
        </p>
      )}
      {key && total === 0 && !failed && <p class="hint">{it.search.none}</p>}
      {foundPlaces.length > 0 && (
        <>
          <h3 class="section-title">{it.search.places}</h3>
          <ul aria-label={it.search.places} class="rows">
            {foundPlaces.map((p) => (
              <Result
                key={p[0]}
                label={p[1]}
                detail={it.search.barsCount(p[4])}
                onSelect={() => {
                  onPlace(p);
                }}
              />
            ))}
          </ul>
        </>
      )}
      {foundBars.length > 0 && (
        <>
          <h3 class="section-title">{it.search.bars}</h3>
          <ul aria-label={it.search.bars} class="rows">
            {foundBars.map((v) => (
              <Result
                key={v.key}
                label={v.name}
                detail={[it.kinds[v.kind], v.addr].filter(Boolean).join(" · ")}
                onSelect={() => {
                  onVenue(v);
                }}
              />
            ))}
          </ul>
        </>
      )}
    </Sheet>
  );
}
