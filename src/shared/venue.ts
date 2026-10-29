// Bar names, distances and search keys, used by the client, the Worker and the admin (one source).

/** Same box as the OSM import (scripts/osm-import): Italy, San Marino, Vatican. */
export const ITALY = { south: 35.2, north: 47.2, west: 6.5, east: 18.6 } as const;

/** A geohash5 cell id (SPEC 5.4): the geohash alphabet has no a, i, l, o. */
export const CELL_PATTERN = /^[0-9b-hjkmnp-z]{5}$/;
/** An OSM bar ("n123", "w456", "r789") or a user bar ("u12"); canonical only, so "u007" never aliases "u7". */
export const VENUE_KEY_PATTERN = /^[nwru][1-9]\d{0,14}$/;
/** An OSM bar only (the admin hides and unhides these). */
export const OSM_KEY_PATTERN = /^[nwr][1-9]\d{0,14}$/;

export const NAME_MIN = 2;
export const NAME_MAX = 80;
/** A proposed bar this close to a known one with the same name is the same bar. */
export const DUPLICATE_METERS = 50;

/** Accent- and case-insensitive key for search and duplicate checks (SPEC 7.6). */
export const searchKey = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

/** Words that say nothing about which bar it is: never indexed, never a search fragment (ADR 0024). */
export const STOP_WORDS: ReadonlySet<string> = new Set([
  "bar",
  "caffe",
  "cafe",
  "pub",
  "di",
  "da",
  "del",
  "della",
  "dei",
  "delle",
  "dal",
  "la",
  "il",
  "lo",
  "le",
  "gli",
  "the",
  "and",
  "e",
  "al",
  "alla",
  "ai",
  "in",
  "con",
]);

/** The words of a text, normalised like `searchKey`, split on anything that is not a letter or digit. */
export const searchWords = (text: string): string[] =>
  searchKey(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

/** Words worth indexing: at least 3 characters and not a stop word (ADR 0024). */
export const significantWords = (text: string): string[] =>
  searchWords(text).filter((w) => w.length >= 3 && !STOP_WORDS.has(w));

/** File name of a search fragment: only [a-z0-9] in file names, anything else becomes "_". */
export const fragmentName = (prefix: string): string => prefix.replace(/[^a-z0-9]/g, "_");

/** Great-circle distance in metres. */
export function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 12_742_000 * Math.asin(Math.sqrt(a));
}

/**
 * Characters a name never needs: controls, invisible formatting (bidi, zero width), line and paragraph
 * separators, private use, unassigned code points and lone surrogates (D1 would store those as invalid UTF-8).
 */
const NEVER_IN_A_NAME = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Co}\p{Cn}\p{Cs}]/u;

/**
 * Top-level domains of links people hide in a name. The first group is never a word in a bar name
 * ("evil.xyz", "bit.ly"); the second is also an Italian word or an abbreviation ("Dr. De Luca",
 * "Punto Club", "S.Co"), so it counts only when a path follows ("t.me/x", "promo.shop/x").
 */
const LINK_TLD = "com|net|org|info|biz|eu|it|xyz|ly|io|cc|ws|gl|gg|tk|ml|ga|cf|gq|pw|tv|ru|cn";
const LINK_TLD_WITH_PATH =
  "me|co|to|be|at|de|fr|es|uk|shop|app|dev|online|site|link|click|top|club|store|vip";
const CONTACT = new RegExp(
  `https?:|www\\.|@|\\[(?:at|dot)\\]|\\((?:at|dot)\\)|` +
    `[\\p{L}\\p{N}-]\\.(?:${LINK_TLD})(?![\\p{L}\\p{N}])|` +
    `[\\p{L}\\p{N}-]\\.(?:${LINK_TLD_WITH_PATH})/|[\\p{L}\\p{N}-]{3,}\\.\\p{L}{2,6}/`,
  "iu",
);

/**
 * The only rule for a bar name, for users and for the admin: text, no control characters, no contacts.
 * Contacts are looked for in a compatibility form (full-width letters become ASCII, spaces around a dot
 * go), so "ｗｗｗ．evil．ｃｏｍ" and "bit . ly / x" are caught like "www.evil.com" and "bit.ly/x".
 */
export function validVenueName(name: string): boolean {
  const text = name.normalize("NFC").trim();
  if (text.length < NAME_MIN || text.length > NAME_MAX) return false;
  if (NEVER_IN_A_NAME.test(text)) return false;
  const plain = text
    .normalize("NFKC")
    .replace(/\s*[.。｡]\s*/gu, ".")
    .toLowerCase();
  if (CONTACT.test(plain)) return false;
  if (/\d[\d\s().+-]{6,}\d/.test(plain)) return false; // phone numbers
  return true;
}
