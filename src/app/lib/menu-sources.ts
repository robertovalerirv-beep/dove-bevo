import type { PriceRow } from "../../shared/api-types";
import { findDrink } from "../../shared/catalog";
import { todayRome } from "./format";

/** Optional provenance, separate from the public seven-field price format. */
export interface MenuPriceSource {
  drink: string;
  hh: 0 | 1;
  price_cents: number;
  checked_on: string;
  menu_url: string;
  menu_item: string;
  serving: string | null;
  context: string | null;
  published_on: string | null;
}

const MAX_BYTES = 65_536;
const TIMEOUT_MS = 8_000;
const FIELDS = [
  "drink",
  "hh",
  "price_cents",
  "checked_on",
  "menu_url",
  "menu_item",
  "serving",
  "context",
  "published_on",
];
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, limit: number): value is string =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  value.length <= limit &&
  !/\p{Cc}/u.test(value);
const optionalText = (value: unknown, limit: number): value is string | null =>
  value === null || text(value, limit);

function validDay(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value &&
    value <= todayRome()
  );
}

function safeMenuURL(value: unknown): value is string {
  if (!text(value, 2_048)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.length > 0 && !url.username && !url.password;
  } catch {
    return false;
  }
}

/** Fail closed on malformed metadata: the caller still shows the ordinary price rows. */
export function parseMenuSources(value: unknown): MenuPriceSource[] {
  if (
    !record(value) ||
    Object.keys(value).length !== 1 ||
    !Array.isArray(value.prices) ||
    value.prices.length > 18
  )
    throw new Error("Invalid menu sources");
  const pairs = new Set<string>();
  return value.prices.map((item: unknown) => {
    if (
      !record(item) ||
      Object.keys(item).length !== FIELDS.length ||
      !FIELDS.every((key) => key in item)
    )
      throw new Error("Invalid menu source");
    const drink = typeof item.drink === "string" ? findDrink(item.drink) : undefined;
    if (
      !drink ||
      (item.hh !== 0 && item.hh !== 1) ||
      !Number.isSafeInteger(item.price_cents) ||
      (item.price_cents as number) < drink.min ||
      (item.price_cents as number) > drink.max ||
      !validDay(item.checked_on) ||
      !safeMenuURL(item.menu_url) ||
      !text(item.menu_item, 200) ||
      !optionalText(item.serving, 200) ||
      !optionalText(item.context, 1_024) ||
      !(item.published_on === null || validDay(item.published_on))
    )
      throw new Error("Invalid menu source");
    const pair = `${drink.code}|${String(item.hh)}`;
    if (pairs.has(pair)) throw new Error("Duplicate menu source");
    pairs.add(pair);
    return item as unknown as MenuPriceSource;
  });
}

/** Never attach an old quote to a changed customer price or an under-review row. */
export function menuSourceForRow(
  row: PriceRow,
  sources: readonly MenuPriceSource[],
  venueKey: string,
): MenuPriceSource | undefined {
  if (row[0] !== venueKey || row[6] !== 0) return undefined;
  return sources.find(
    (source) =>
      source.drink === row[1] &&
      source.hh === row[2] &&
      source.price_cents === row[3] &&
      source.checked_on === row[4],
  );
}

export async function loadMenuSources(
  venueKey: string,
  cell: string,
  signal?: AbortSignal,
): Promise<MenuPriceSource[]> {
  if (!/^[nwru][1-9]\d{0,14}$/.test(venueKey) || !/^[0-9b-hjkmnp-z]{5}$/.test(cell))
    throw new Error("Invalid venue");
  const controller = new AbortController();
  const abort = () => {
    controller.abort();
  };
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(abort, TIMEOUT_MS);
  try {
    controller.signal.throwIfAborted();
    const response = await fetch(
      `/api/venues/${encodeURIComponent(venueKey)}/menu-sources?c=${cell}`,
      {
        method: "GET",
        redirect: "error",
        credentials: "omit",
        cache: "no-store",
        signal: controller.signal,
      },
    );
    controller.signal.throwIfAborted();
    if (
      !response.ok ||
      response.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json" ||
      Number(response.headers.get("content-length") ?? "0") > MAX_BYTES ||
      !response.body
    )
      throw new Error("Menu sources unavailable");
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let body = "";
    let bytes = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        controller.signal.throwIfAborted();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_BYTES) {
          controller.abort();
          throw new Error("Menu sources too large");
        }
        body += decoder.decode(value, { stream: true });
      }
      body += decoder.decode();
    } finally {
      reader.releaseLock();
    }
    return parseMenuSources(JSON.parse(body) as unknown);
  } finally {
    controller.abort();
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
