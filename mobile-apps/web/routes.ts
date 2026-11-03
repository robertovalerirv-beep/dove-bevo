/** App-only URLs keep every document navigation on a real HTTPS asset. */
import { CELL_PATTERN } from "../../src/shared/venue.ts";
import { CATALOG } from "../../src/shared/catalog.ts";
export const mobileVenueKeyPattern = /^(?:[nwru][1-9]\d{0,14}|m[0-9a-f]{24})$/;
const isBar = (path: string) =>
  path.startsWith("/bar/") && mobileVenueKeyPattern.test(path.slice(5));
const ENTRY = "/mobile/";

export function mobilePath(value: Pick<Location, "pathname" | "search">): string {
  if (value.pathname !== ENTRY && value.pathname !== `${ENTRY}index.html`) return "/";
  const params = new URLSearchParams(value.search);
  if (params.getAll("path").length > 1 || params.getAll("c").length > 1) return "/";
  const path = params.get("path") ?? "/";
  if (path === "/") return "/";
  return isBar(path) && CELL_PATTERN.test(params.get("c") ?? "") ? path : "/";
}

export function mobileURL(path: string, origin = location.origin): string {
  if (typeof path !== "string" || path.length > 2048) throw new TypeError("Invalid app route");
  const value = new URL(path, origin);
  if (
    value.origin !== origin ||
    value.username ||
    value.password ||
    value.hash ||
    (value.pathname !== "/" && !isBar(value.pathname))
  )
    throw new TypeError("Invalid app route");
  const cell = value.searchParams.get("c") ?? "";
  if (
    value.searchParams.getAll("c").length > 1 ||
    (value.pathname !== "/" && !CELL_PATTERN.test(cell))
  )
    throw new TypeError("Invalid app route");
  const params = new URLSearchParams();
  if (value.pathname !== "/") {
    params.set("path", value.pathname);
    params.set("c", cell);
  } else if (value.searchParams.has("at")) {
    params.set("at", value.searchParams.get("at") ?? "");
  }
  const query = params.toString();
  return ENTRY + (query ? `?${query}` : "");
}

export function mobileDefaultDrink(websiteDefault: string): string {
  return CATALOG.some((drink) => drink.code === "spritz") ? "spritz" : websiteDefault;
}
