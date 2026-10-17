// Matching and order of the bar search (SPEC 7.6, ADR 0024). Pure: search.ts does the downloads.
import {
  distanceMeters,
  fragmentName,
  searchKey,
  searchWords,
  STOP_WORDS,
} from "../../shared/venue";

/** [key, name, lat, lon, OSM id of the city, 0 when none] */
export type Hit = [string, string, number, number, number];

export const MAX_BAR_RESULTS = 8;
/** Characters typed before bars are searched (SPEC 7.6). */
export const MIN_CHARS = 3;

/** The first typed word that is worth looking up: 3+ characters, not a stop word. */
export function leadWord(query: string): string | null {
  return searchWords(query).find((w) => w.length >= 3 && !STOP_WORDS.has(w)) ?? null;
}

/** `s/<prefix>.json`: 2 characters, or 3 when the prefix is split (the ids are in `s/index.json`). */
export function fragmentPath(word: string, split: readonly string[]): string {
  const p2 = fragmentName(word.slice(0, 2));
  return `s/${split.includes(p2) ? fragmentName(word.slice(0, 3)) : p2}.json`;
}

/** Every typed word is the start of a word of the name; the order of the words does not matter. */
export function matches(name: string, typed: string[]): boolean {
  const words = searchWords(name);
  return typed.length > 0 && typed.every((t) => words.some((w) => w.startsWith(t)));
}

/** Exact name, then name starting with the text, then nearer, then alphabetical (ADR 0024). */
export function rank(
  hits: Hit[],
  query: string,
  origin: { lat: number; lon: number } | null,
): Hit[] {
  const wanted = searchWords(query).join(" ");
  const order = (name: string) => {
    const flat = searchWords(name).join(" ");
    return flat === wanted ? 0 : flat.startsWith(wanted) ? 1 : 2;
  };
  const metres = (h: Hit) => (origin ? distanceMeters(origin.lat, origin.lon, h[2], h[3]) : 0);
  return [...hits].sort(
    (a, b) =>
      order(a[1]) - order(b[1]) ||
      metres(a) - metres(b) ||
      searchKey(a[1]).localeCompare(searchKey(b[1]), "it"),
  );
}
