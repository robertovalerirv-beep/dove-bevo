import { z } from "zod";
import { postWithSession } from "@site/app/lib/session";
import type { MenuOffer } from "./menu-v2";

const Key = z.string().regex(/^(?:[nwru][1-9]\d{0,14}|m[0-9a-f]{24})$/);
const Cell = z.string().regex(/^[0-9b-hjkmnp-z]{5}$/);
const ItemKey = z.string().regex(/^[oc][0-9a-f]{64}$/);
const Currency = z.string().regex(/^[A-Z]{3}$/);
const CustomerRowSchema = z.object({
  revision: z.uuid(),
  item_key: ItemKey,
  kind: z.enum(["menu_offer", "new_drink"]),
  offer_id: z.string().min(1).max(128).nullable(),
  name: z.string().min(1).max(512),
  category: z.string().nullable(),
  serving: z.object({
    label: z.string().nullable(),
    ml: z.number().int().positive().nullable(),
  }),
  amount_minor: z.number().int().min(1).max(100000),
  currency: Currency,
  currency_exponent: z.number().int().min(0).max(3),
  observed_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  source_kind: z.literal("customer"),
  observation_kind: z.literal("customer_reported_price"),
  price_scope: z.literal("drink_item"),
});
const CustomerPageSchema = z.object({
  schema_version: z.literal(1),
  venue: z.object({
    key: Key,
    cell: Cell,
    name: z.string().min(1),
    country: z.string().regex(/^[A-Z]{2}$/),
  }),
  price_scope: z.literal("customer_reported_drink_item"),
  rows: z.array(CustomerRowSchema).max(50),
  next_after: ItemKey.nullable(),
});
export type CustomerRow = z.infer<typeof CustomerRowSchema>;
export type CustomerPage = z.infer<typeof CustomerPageSchema>;

export type CustomerSubmission =
  | {
      kind: "menu_offer";
      venue_key: string;
      cell: string;
      offer_id: string;
      amount_minor: number;
      currency: string;
      currency_exponent: number;
      expected_revision: string | null;
    }
  | {
      kind: "new_drink";
      venue_key: string;
      cell: string;
      name: string;
      category: string | null;
      serving_label: string | null;
      serving_ml: number | null;
      amount_minor: number;
      currency: string;
      currency_exponent: number;
      expected_revision: string | null;
    };

export class CustomerPriceHttpError extends Error {
  constructor(readonly status: number) {
    super(`Customer price request failed: ${String(status)}`);
  }
}

async function parseJson(response: Response): Promise<unknown> {
  if (!response.ok) throw new CustomerPriceHttpError(response.status);
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw new Error("Invalid customer price response");
  const body = await response.text();
  if (body.length > 1024 * 1024) throw new Error("Customer price response too large");
  return JSON.parse(body) as unknown;
}

export async function loadCustomerPricesPage(
  key: string,
  cell: string,
  after: string | null,
  signal: AbortSignal,
): Promise<CustomerPage | null> {
  if (!Key.safeParse(key).success || !Cell.safeParse(cell).success ||
      (after !== null && !ItemKey.safeParse(after).success))
    throw new Error("Invalid customer price identity");
  const params = new URLSearchParams({ cell, limit: "50" });
  if (after) params.set("after", after);
  const response = await fetch(
    `/api/mobile/v2/customer-prices/venues/${encodeURIComponent(key)}?${params}`,
    { cache: "no-store", signal },
  );
  // The menu and customer routes deploy independently during this additive rollout.
  if (response.status === 404) return null;
  const page = CustomerPageSchema.parse(await parseJson(response));
  if (page.venue.key !== key || page.venue.cell !== cell ||
      (page.next_after !== null &&
        (page.next_after !== page.rows.at(-1)?.item_key || page.next_after === after)))
    throw new Error("Customer price identity mismatch");
  if (new Set(page.rows.map((row) => row.item_key)).size !== page.rows.length)
    throw new Error("Duplicate customer price items");
  return page;
}

const SubmitReceipt = z.object({
  status: z.enum(["active", "pending", "unchanged"]),
  revision: z.uuid(),
  source_kind: z.literal("customer").optional(),
});
const ReportReceipt = z.object({ status: z.enum(["reported", "already"]) });

export async function submitCustomerPrice(host: HTMLElement, body: CustomerSubmission) {
  const response = await postWithSession(host, "/api/mobile/v2/customer-prices", body);
  return SubmitReceipt.parse(await parseJson(response));
}

export async function reportCustomerPrice(
  host: HTMLElement,
  venueKey: string,
  cell: string,
  entryId: string,
) {
  const response = await postWithSession(host, "/api/mobile/v2/customer-prices/report", {
    venue_key: venueKey,
    cell,
    entry_id: entryId,
    reason: "wrong_price",
  });
  return ReportReceipt.parse(await parseJson(response));
}

/** Parse the amount exactly in minor units, without floating-point rounding or conversion. */
export function parseCustomerAmount(raw: string, exponent: number): number | null {
  if (!Number.isInteger(exponent) || exponent < 0 || exponent > 3) return null;
  const value = raw.trim();
  const match = /^(\d{1,4})(?:[,.](\d{1,3}))?$/.exec(value);
  if (!match) return null;
  const fraction = match[2] ?? "";
  if (fraction.length > exponent) return null;
  const minor = Number(match[1]) * 10 ** exponent +
    Number(fraction.padEnd(exponent, "0") || "0");
  return Number.isSafeInteger(minor) && minor >= 1 && minor <= 100000 ? minor : null;
}

const EURO_COUNTRIES = new Set([
  "IT", "FR", "ES", "DE", "AT", "BE", "PT", "NL", "IE", "FI", "GR",
  "SK", "SI", "EE", "LV", "LT", "MT", "CY", "LU", "HR",
]);

/** For new drinks only: retain the venue currency, never relabel or convert a price. */
export function customerCurrency(
  country: string,
  offers: readonly MenuOffer[],
): { currency: string; exponent: number } | null {
  if (country === "GB") return { currency: "GBP", exponent: 2 };
  if (EURO_COUNTRIES.has(country)) return { currency: "EUR", exponent: 2 };
  const distinct = new Map(offers.map((offer) =>
    [`${offer.currency}:${String(offer.currency_exponent)}`,
      { currency: offer.currency, exponent: offer.currency_exponent }] as const,
  ));
  return distinct.size === 1 ? [...distinct.values()][0] : null;
}