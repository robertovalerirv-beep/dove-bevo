// The admin's bar search (SPEC 7.9, 7.10): by city and part of the name, or by the link of a bar page.
// Shared by /admin and /admin/verificati; it reads the same static cells and prices as the map.
import { CELL_PRECISION, encodeGeohash } from "../../shared/geohash";
import { searchKey } from "../../shared/venue";
import { it } from "../i18n/it";
import { invalidateCell, loadCell, loadPlaces, type Venue } from "./data";

/** "/bar/n123?c=u0nd9" or a full link to it → key and cell. */
export function parseBarLink(text: string): { key: string; cell: string } | null {
  const match = /\/bar\/([nwru][1-9]\d{0,14})\?c=([0-9b-hjkmnp-z]{5})/.exec(text);
  return match?.[1] && match[2] ? { key: match[1], cell: match[2] } : null;
}

/** Cells around a point, about ±7 km: wide enough for a city, fetched fresh for the admin. */
function cellsAround(lat: number, lon: number): string[] {
  const cells = new Set<string>();
  for (let dLat = -0.06; dLat <= 0.06001; dLat += 0.03)
    for (let dLon = -0.08; dLon <= 0.08001; dLon += 0.03)
      cells.add(encodeGeohash(lat + dLat, lon + dLon, CELL_PRECISION));
  return [...cells];
}

export async function freshCells(cells: string[]): Promise<Venue[]> {
  for (const cell of cells) invalidateCell(cell); // a bar added a moment ago must show up
  const lists = await Promise.all(cells.map((c) => loadCell(c).catch(() => [])));
  return lists.flat();
}

/** The bars found (at most 30), or the reason there are none in `note`. */
export async function findBars(query: {
  city: string;
  name: string;
  link: string;
}): Promise<{ found: Venue[]; note: string }> {
  let found: Venue[];
  if (query.link.trim()) {
    const target = parseBarLink(query.link);
    if (!target) return { found: [], note: it.admin.badLink };
    found = (await freshCells([target.cell])).filter((v) => v.key === target.key);
  } else {
    if (!query.city.trim() || query.name.trim().length < 2)
      return { found: [], note: it.admin.needCityOrLink };
    const places = await loadPlaces();
    const wanted = searchKey(query.city);
    const place =
      places.find((p) => searchKey(p[1]) === wanted) ??
      places.find((p) => searchKey(p[1]).startsWith(wanted));
    if (!place) return { found: [], note: it.admin.cityNotFound };
    const key = searchKey(query.name);
    found = (await freshCells(cellsAround(place[2], place[3])))
      .filter((v) => searchKey(v.name).includes(key))
      .slice(0, 30);
  }
  return { found, note: found.length === 0 ? it.admin.noResults : "" };
}
