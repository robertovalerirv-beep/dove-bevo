import { postWithSession } from "@site/app/lib/session";
import { z } from "zod";
import {
  CatalogSchema,
  SnapshotSchema,
  type Catalog,
  type City,
  type Price,
  type Snapshot,
  type Venue,
  type Serving,
} from "./model";

async function withDeadline<T>(
  signal: AbortSignal,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const relay = () => {
    controller.abort();
  };
  signal.addEventListener("abort", relay, { once: true });
  if (signal.aborted) controller.abort();
  const timer = setTimeout(relay, 20000);
  try {
    return await run(controller.signal);
  } finally {
    controller.abort();
    clearTimeout(timer);
    signal.removeEventListener("abort", relay);
  }
}

async function json(response: Response): Promise<unknown> {
  if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw new Error("Invalid JSON response");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Empty response");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 2 * 1024 * 1024) {
      await reader.cancel();
      throw new Error("Response too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
}
let catalogRequest: Promise<Catalog> | null = null;
export function loadCatalog(): Promise<Catalog> {
  if (catalogRequest) return catalogRequest;
  const controller = new AbortController(),
    timer = setTimeout(() => {
      controller.abort();
    }, 10000);
  catalogRequest = fetch("/mobile-data/catalog.json", {
    cache: "no-cache",
    signal: controller.signal,
  })
    .then(json)
    .then((value) => CatalogSchema.parse(value))
    .catch((error: unknown) => {
      catalogRequest = null;
      throw error;
    })
    .finally(() => {
      clearTimeout(timer);
    });
  return catalogRequest;
}
export function validateSnapshot(value: unknown, catalog: Catalog, cell: string): Snapshot {
  const result = SnapshotSchema.parse(value);
  if (result.catalog_version !== catalog.version) throw new Error("Catalog version changed");
  const allowed = new Map(catalog.venues.filter((v) => v.cell === cell).map((v) => [v.key, v]));
  if (
    result.rows.some((r) => r.cell !== cell || allowed.get(r.venue)?.currency !== r.currency) ||
    [...result.hidden, ...result.legacy_venues].some((key) => !allowed.has(key))
  )
    throw new Error("Price identity mismatch");
  const identities = new Set(
    result.rows.map(
      (r) =>
        `${r.venue}|${r.drink}|${String(r.hh)}|${r.currency}|${r.serving.unit}:${String(r.serving.ml ?? "")}`,
    ),
  );
  if (identities.size !== result.rows.length) throw new Error("Duplicate price identity");
  return result;
}
export async function loadCity(
  catalog: Catalog,
  city: City,
  signal: AbortSignal,
): Promise<Snapshot> {
  return withDeadline(signal, async (deadlineSignal) => {
    const cells = [...new Set(city.venues.map((v) => v.cell))];
    const snapshots = await Promise.all(
      cells.map(async (cell) =>
        validateSnapshot(
          await json(
            await fetch(`/api/mobile/prices/cells/${cell}`, {
              signal: deadlineSignal,
              cache: "no-store",
            }),
          ),
          catalog,
          cell,
        ),
      ),
    );
    const keys = new Set(city.venues.map((v) => v.key));
    const hidden = [...new Set(snapshots.flatMap((v) => v.hidden))],
      legacy = [...new Set(snapshots.flatMap((v) => v.legacy_venues))];
    return {
      schema_version: 1,
      catalog_version: catalog.version,
      rows: snapshots
        .flatMap((v) => v.rows)
        .filter((v) => keys.has(v.venue) && !hidden.includes(v.venue) && !legacy.includes(v.venue)),
      hidden,
      legacy_venues: legacy,
    };
  });
}
export function loadVenue(catalog: Catalog, venue: Venue, signal: AbortSignal): Promise<Snapshot> {
  return withDeadline(signal, async (deadlineSignal) =>
    validateSnapshot(
      await json(
        await fetch(`/api/mobile/prices/venues/${venue.key}?cell=${venue.cell}`, {
          signal: deadlineSignal,
          cache: "no-store",
        }),
      ),
      catalog,
      venue.cell,
    ),
  );
}
export interface Draft {
  venue: Venue;
  drink: string;
  hh: 0 | 1;
  serving: Serving;
  amount_minor: number;
}
export async function submitPrice(
  host: HTMLElement,
  draft: Draft,
  keepalive = false,
): Promise<string> {
  const result = await json(
    await postWithSession(
      host,
      "/api/mobile/prices",
      {
        venue: draft.venue.key,
        cell: draft.venue.cell,
        currency: draft.venue.currency,
        items: [
          {
            drink: draft.drink,
            hh: draft.hh,
            serving: { ...draft.serving },
            amount_minor: draft.amount_minor,
          },
        ],
      },
      keepalive,
    ),
  );
  const parsed = z
    .strictObject({
      results: z
        .array(
          z.strictObject({
            status: z.enum(["active", "quarantined", "confirmed"]),
            code: z.literal("already").optional(),
          }),
        )
        .length(1),
    })
    .parse(result);
  const row = parsed.results[0];
  if (!row) throw new Error("Price not accepted");
  return row.status;
}
export function priceTarget(venue: Venue, row: Price) {
  return {
    venue: venue.key,
    cell: venue.cell,
    currency: row.currency,
    drink: row.drink,
    hh: row.hh,
    serving: { ...row.serving },
    revision: row.revision,
  };
}
export async function confirmPrice(host: HTMLElement, venue: Venue, row: Price) {
  return z
    .strictObject({
      status: z.enum(["confirmed", "already"]),
      confirmations: z.number().int().min(0),
    })
    .parse(
      await json(
        await postWithSession(host, "/api/mobile/prices/confirm", priceTarget(venue, row)),
      ),
    );
}
export type ReportReason = "wrong_price" | "closed" | "not_exists" | "wrong_info" | "offensive";
export async function reportPrice(
  host: HTMLElement,
  venue: Venue,
  reason: ReportReason,
  row: Price | null,
): Promise<void> {
  z.strictObject({ status: z.enum(["reported", "already"]) }).parse(
    await json(
      await postWithSession(host, "/api/mobile/prices/report", {
        venue: venue.key,
        cell: venue.cell,
        reason,
        ...(row
          ? {
              price: {
                drink: row.drink,
                hh: row.hh,
                currency: row.currency,
                serving: { ...row.serving },
                revision: row.revision,
              },
            }
          : {}),
      }),
    ),
  );
}
