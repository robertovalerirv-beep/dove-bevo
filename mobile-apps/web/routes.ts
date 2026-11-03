/** App-only URLs keep every document navigation on a real HTTPS asset. */
import { CELL_PATTERN } from "../../src/shared/venue.ts";
import { CATALOG } from "../../src/shared/catalog.ts";
export const mobileVenueKeyPattern = /^(?:[nwru][1-9]\d{0,14}|m[0-9a-f]{24})$/;
const isBar = (path: string) =>
  path.startsWith("/bar/") && mobileVenueKeyPattern.test(path.slice(5));
const ENTRY = "/mobile/";
type MobileLocation = Pick<Location, "pathname" | "search"> & { hash?: string };
export interface DrinkFocus {
  drink: string;
  hh: 0 | 1;
}

function focusPair(params: URLSearchParams): DrinkFocus | null {
  const drink = params.get("drink"),
    hh = params.get("hh");
  if (
    params.getAll("drink").length !== 1 ||
    params.getAll("hh").length !== 1 ||
    drink === null ||
    !CATALOG.some((value) => value.code === drink) ||
    (hh !== "0" && hh !== "1")
  )
    return null;
  return { drink, hh: hh === "1" ? 1 : 0 };
}

export function mobilePath(value: MobileLocation): string {
  if (value.pathname !== ENTRY && value.pathname !== `${ENTRY}index.html`) return "/";
  if (value.hash) return "/";
  const params = new URLSearchParams(value.search);
  if (params.getAll("path").length > 1 || params.getAll("c").length > 1) return "/";
  const path = params.get("path") ?? "/";
  if (path === "/") return "/";
  const keys = [...params.keys()];
  const rawKeys = value.search
    .replace(/^\?/, "")
    .split("&")
    .map((part) => part.split("=")[0]);
  const focused = params.has("drink") || params.has("hh");
  const allowed = focused ? ["path", "c", "drink", "hh"] : ["path", "c"];
  if (
    keys.length !== allowed.length ||
    rawKeys.length !== allowed.length ||
    rawKeys.some((key) => !allowed.includes(key ?? "")) ||
    keys.some((key) => !allowed.includes(key)) ||
    (focused && !focusPair(params))
  )
    return "/";
  return isBar(path) && CELL_PATTERN.test(params.get("c") ?? "") ? path : "/";
}

export function mobileFocus(value: MobileLocation): DrinkFocus | null {
  return mobilePath(value) === "/" ? null : focusPair(new URLSearchParams(value.search));
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
    if (value.searchParams.has("drink") || value.searchParams.has("hh")) {
      const focus = focusPair(value.searchParams);
      if (!focus) throw new TypeError("Invalid app drink focus");
      params.set("drink", focus.drink);
      params.set("hh", String(focus.hh));
    }
  } else {
    if (value.searchParams.has("drink") || value.searchParams.has("hh"))
      throw new TypeError("Drink focus requires a venue");
    if (value.searchParams.has("at")) params.set("at", value.searchParams.get("at") ?? "");
  }
  const query = params.toString();
  return ENTRY + (query ? `?${query}` : "");
}

export function mobileDefaultDrink(
  websiteDefault: string,
  value: MobileLocation | undefined = typeof location === "undefined" ? undefined : location,
): string {
  return (
    (value && mobileFocus(value)?.drink) ||
    (CATALOG.some((drink) => drink.code === "spritz") ? "spritz" : websiteDefault)
  );
}
