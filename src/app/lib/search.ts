// Search of bars by name in all Italy (SPEC 7.6, D-30, ADR 0024, 0025): static fragments by word
// prefix for the OSM bars, plus the short list of approved user bars. No position is sent. The
// fragment name is the only thing that reaches the CDN; the list of user bars carries no query.
import { DATA_VERSION } from "./data";
import { loadUserBars } from "./user-bars";
import { searchKey, searchWords } from "../../shared/venue";
import {
  fragmentPath,
  leadWord,
  matches,
  MAX_BAR_RESULTS,
  MIN_CHARS,
  rank,
  type Hit,
} from "./search-match";

export type { Hit } from "./search-match";

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`/data/${DATA_VERSION}/${path}`);
  const isJson = response.headers.get("content-type")?.includes("application/json") ?? false;
  // No such fragment (no bar has a word starting so): the static host answers with the app shell.
  if (response.status === 404 || (response.ok && !isJson)) return [] as T;
  if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
  return (await response.json()) as T;
}

let splitIndex: Promise<string[]> | null = null;
const fragments = new Map<string, Promise<Hit[]>>();

/** The bars matching a typed text; rejects when the fragment cannot be downloaded. */
export async function searchBars(
  query: string,
  origin: { lat: number; lon: number } | null,
): Promise<Hit[]> {
  const word = leadWord(query);
  if (word === null || searchKey(query).length < MIN_CHARS) return [];
  splitIndex ??= getJson<string[]>("s/index.json");
  splitIndex.catch(() => (splitIndex = null)); // retry after a network error
  const path = fragmentPath(word, await splitIndex);
  let fragment = fragments.get(path);
  if (!fragment) {
    fragment = getJson<Hit[]>(path);
    fragment.catch(() => fragments.delete(path));
    fragments.set(path, fragment);
  }
  const typed = searchWords(query);
  const [osm, user] = await Promise.all([fragment, loadUserBars()]);
  const found = [...osm, ...user].filter((h) => matches(h[1], typed));
  return rank(found, query, origin).slice(0, MAX_BAR_RESULTS);
}
