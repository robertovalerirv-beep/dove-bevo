// Bar names, distances and search keys, used by the client, the Worker and the admin (one source).

/** Same box as the OSM import (scripts/osm-import): Italy, San Marino, Vatican. */
export const ITALY = { south: 35.2, north: 47.2, west: 6.5, east: 18.6 } as const;

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

/** Great-circle distance in metres. */
export function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 12_742_000 * Math.asin(Math.sqrt(a));
}

/** Same name once accents, case, spaces and punctuation are ignored. */
export const sameName = (a: string, b: string) => {
  const flat = (s: string) => searchKey(s).replace(/[^\p{L}\p{N}]/gu, "");
  return flat(a) === flat(b);
};

/** The only rule for a bar name, for users and for the admin: text, no control characters, no contacts. */
export function validVenueName(name: string): boolean {
  const text = name.normalize("NFC").trim();
  if (text.length < NAME_MIN || text.length > NAME_MAX) return false;
  if (/\p{Cc}|\p{Cf}/u.test(text)) return false;
  if (/https?:|www\.|\.(com|it|net|org|eu|info)\b|@/i.test(text)) return false;
  if (/\d[\d\s().+-]{6,}\d/.test(text)) return false; // phone numbers
  return true;
}
