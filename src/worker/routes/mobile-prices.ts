import { Hono } from "hono";
import { z } from "zod";
import { medianOf } from "../../shared/prices";
import { QUARANTINE_MIN_PRICES, QUARANTINE_RATIO, REVIEW_AFTER_REPORTS } from "../config";
import { claimOnce, claimStatement } from "../lib/db";
import { romeDay } from "../lib/day";
import { ApiError } from "../lib/errors";
import { readJson } from "../lib/guards";
import { hmacHex } from "../lib/hmac";
import { clientIp, consumeQuota } from "../lib/quota";
import type { AppEnv } from "../types";
import {
  MobileCell,
  MobileCurrency,
  MobileDrink,
  MobileVenueKey,
  Serving,
  catalogScope,
  loadMobileCatalog,
  resolveMobileVenue,
  servingKey,
  validServing,
} from "./mobile-price-catalog";
import {
  SELECT_PUBLIC,
  PRICE_PK,
  UNBLOCKED,
  amountInRange,
  confirmationStatements,
  currentPrice,
  customerStatements,
  keyValues,
  priceTarget,
  publicMobilePrice,
  type MobilePriceDb,
  type MobilePriceKey,
} from "./mobile-price-store";

const Variant = z
  .strictObject({ drink: MobileDrink, hh: z.union([z.literal(0), z.literal(1)]), serving: Serving })
  .refine((value) => validServing(value.drink, value.serving));
const Item = z
  .strictObject({
    drink: MobileDrink,
    hh: z.union([z.literal(0), z.literal(1)]),
    serving: Serving,
    amount_minor: z.number().int().min(1).max(100_000),
  })
  .refine((value) => validServing(value.drink, value.serving));
const Body = z
  .strictObject({
    venue: MobileVenueKey,
    cell: MobileCell,
    currency: MobileCurrency,
    items: z.array(Item).min(1).max(9),
  })
  .refine(
    (value) =>
      new Set(value.items.map((row) => `${row.drink}|${String(row.hh)}|${servingKey(row.serving)}`))
        .size === value.items.length,
  );
const ConfirmBody = z
  .strictObject({
    venue: MobileVenueKey,
    cell: MobileCell,
    currency: MobileCurrency,
    drink: MobileDrink,
    hh: z.union([z.literal(0), z.literal(1)]),
    serving: Serving,
    revision: z.uuid(),
  })
  .refine((value) => validServing(value.drink, value.serving));
const ReportBody = z.strictObject({
  venue: MobileVenueKey,
  cell: MobileCell,
  reason: z.enum(["wrong_price", "closed", "not_exists", "wrong_info", "offensive"]),
  price: z
    .strictObject({ ...Variant.shape, currency: MobileCurrency, revision: z.uuid() })
    .optional(),
});

export const mobilePrices = new Hono<AppEnv>();

async function readCell(env: Env, cell: string, venueKey?: string) {
  const catalog = await loadMobileCatalog(env);
  const scope = await catalogScope(env, catalog, cell);
  if (venueKey && !scope.venues.some((v) => v.key === venueKey)) throw new ApiError("not_found");
  const allowed = new Map(scope.venues.map((v) => [v.key, v]));
  const result = await env.DB.prepare(
    `${SELECT_PUBLIC} WHERE p.cell=?1
    AND p.status IN ('active','quarantined') ${venueKey ? "AND p.venue_key=?2" : ""}
    ORDER BY p.venue_key,p.drink,p.hh,p.currency,p.serving_key LIMIT 5001`,
  )
    .bind(...(venueKey ? [cell, venueKey] : [cell]))
    .all<MobilePriceDb>();
  if (result.results.length > 5000) throw new ApiError("busy");
  const rows = result.results
    .filter(
      (row) =>
        allowed.get(row.venue_key)?.currency === row.currency &&
        !scope.hidden.includes(row.venue_key) &&
        !scope.legacy.includes(row.venue_key),
    )
    .map(publicMobilePrice);
  return {
    schema_version: 1 as const,
    catalog_version: catalog.version,
    rows,
    hidden: scope.hidden,
    legacy_venues: scope.legacy,
  };
}

mobilePrices.get("/cells/:cell", async (c) => {
  const cell = MobileCell.safeParse(c.req.param("cell"));
  if (!cell.success) throw new ApiError("bad_request");
  return c.json(await readCell(c.env, cell.data), 200, { "Cache-Control": "no-store" });
});
mobilePrices.get("/venues/:key", async (c) => {
  const key = MobileVenueKey.safeParse(c.req.param("key"));
  const values = new URL(c.req.url).searchParams.getAll("cell");
  const cell = MobileCell.safeParse(values.length === 1 ? values[0] : undefined);
  if (!key.success || !cell.success) throw new ApiError("bad_request");
  return c.json(await readCell(c.env, cell.data, key.data), 200, { "Cache-Control": "no-store" });
});

async function markers(
  env: Env,
  sid: string,
  ip: string,
  key: MobilePriceKey,
  revision: string,
  day: string,
) {
  const target = `${priceTarget(key)}|${revision}`;
  const yesterday = romeDay(new Date(Date.parse(day + "T12:00:00Z") - 86_400_000));
  const author = await Promise.all(
    [...new Set([day, yesterday])].flatMap((date) => [
      hmacHex(env.HASH_KEY, [date, "mobile-price-author", "sid", sid, target]),
      hmacHex(env.HASH_KEY, [date, "mobile-price-author", "ip", ip, target]),
    ]),
  );
  const claims = await Promise.all([
    hmacHex(env.HASH_KEY, [day, "mobile-price-confirm", "sid", sid, target]),
    hmacHex(env.HASH_KEY, [day, "mobile-price-confirm", "ip", ip, target]),
  ]);
  return { author, claims, blockers: [...author, ...claims] };
}

/** Distinguish a real duplicate from a revision/moderation race before acknowledging it. */
export async function checkedConfirmationNoop(
  env: Env,
  key: MobilePriceKey,
  cell: string,
  revision: string,
) {
  const { venue } = await resolveMobileVenue(env, key.venue, cell);
  if (venue.currency !== key.currency) throw new ApiError("conflict");
  const fresh = await env.DB.prepare(
    `SELECT * FROM mobile_prices_current WHERE ${PRICE_PK} AND ${UNBLOCKED}`,
  )
    .bind(...keyValues(key))
    .first<MobilePriceDb>();
  if (!fresh || fresh.status === "review" || fresh.status === "removed")
    throw new ApiError("not_found");
  if (fresh.revision !== revision) throw new ApiError("conflict");
  return fresh;
}

mobilePrices.post("/", async (c) => {
  const body = await readJson(c, Body);
  const { venue, catalog } = await resolveMobileVenue(c.env, body.venue, body.cell);
  if (venue.currency !== body.currency) throw new ApiError("bad_request");
  const scope = await catalogScope(c.env, catalog, body.cell);
  const allowed = new Set(
    scope.venues
      .filter(
        (v) =>
          v.currency === body.currency &&
          !scope.hidden.includes(v.key) &&
          !scope.legacy.includes(v.key),
      )
      .map((v) => v.key),
  );
  const peers = await c.env.DB.prepare(
    `SELECT * FROM mobile_prices_current
    WHERE cell=?1 AND currency=?2 AND status='active' LIMIT 5001`,
  )
    .bind(body.cell, body.currency)
    .all<MobilePriceDb>();
  if (peers.results.length > 5000) throw new ApiError("busy");
  const day = romeDay(),
    ip = clientIp(c.req.raw);
  await consumeQuota(c.env, "price", c.var.sid, ip, body.items.length);
  const results: { status: string; code?: string }[] = [];
  for (const item of body.items) {
    if (!amountInRange(item.drink, body.currency, item.amount_minor)) {
      results.push({ status: "rejected", code: "out_of_range" });
      continue;
    }
    const key: MobilePriceKey = { venue: body.venue, currency: body.currency, ...item };
    const current = await currentPrice(c.env, key);
    if (current?.status === "review" || current?.status === "removed") {
      results.push({ status: "rejected", code: "under_review" });
      continue;
    }
    if (current?.amount_minor === item.amount_minor) {
      const marks = await markers(c.env, c.var.sid, ip, key, current.revision, day);
      const [update] = await c.env.DB.batch(
        confirmationStatements(c.env, key, current.revision, day, marks.blockers, marks.claims),
      );
      if (!update?.meta.changes)
        await checkedConfirmationNoop(c.env, key, body.cell, current.revision);
      results.push(
        update?.meta.changes ? { status: "confirmed" } : { status: "confirmed", code: "already" },
      );
      continue;
    }
    const values = peers.results
      .filter(
        (row) =>
          allowed.has(row.venue_key) &&
          row.drink === item.drink &&
          row.hh === item.hh &&
          row.serving_key === servingKey(item.serving),
      )
      .map((row) => row.amount_minor);
    const median = medianOf(values);
    const status =
      values.length >= QUARANTINE_MIN_PRICES &&
      Math.abs(item.amount_minor - median) > QUARANTINE_RATIO * median
        ? "quarantined"
        : "active";
    const revision = crypto.randomUUID();
    const marks = await markers(c.env, c.var.sid, ip, key, revision, day);
    const [update] = await c.env.DB.batch([
      ...customerStatements(c.env, key, {
        cell: body.cell,
        amount: item.amount_minor,
        day,
        status,
        revision,
        previousRevision: current?.revision ?? null,
        changedAt: new Date().toISOString(),
      }),
      ...marks.author.slice(0, 2).map((claim) => claimStatement(c.env.DB, claim, day)),
    ]);
    results.push(
      update?.meta.changes ? { status } : { status: "rejected", code: "conflict_or_blocked" },
    );
  }
  return c.json({ results });
});

mobilePrices.post("/confirm", async (c) => {
  const body = await readJson(c, ConfirmBody);
  const { venue } = await resolveMobileVenue(c.env, body.venue, body.cell);
  if (venue.currency !== body.currency) throw new ApiError("bad_request");
  const current = await currentPrice(c.env, body);
  if (!current || current.status === "review" || current.status === "removed")
    throw new ApiError("not_found");
  if (current.revision !== body.revision) throw new ApiError("conflict");
  const day = romeDay(),
    ip = clientIp(c.req.raw);
  await consumeQuota(c.env, "confirm", c.var.sid, ip);
  const marks = await markers(c.env, c.var.sid, ip, body, body.revision, day);
  const [update] = await c.env.DB.batch(
    confirmationStatements(c.env, body, body.revision, day, marks.blockers, marks.claims),
  );
  const count = (update?.results[0] as { confirmations?: number } | undefined)?.confirmations;
  const fresh =
    count === undefined
      ? await checkedConfirmationNoop(c.env, body, body.cell, body.revision)
      : null;
  return c.json({
    status: count === undefined ? "already" : "confirmed",
    confirmations: count ?? fresh?.confirmations ?? current.confirmations,
  });
});

mobilePrices.post("/report", async (c) => {
  const body = await readJson(c, ReportBody);
  const { venue } = await resolveMobileVenue(c.env, body.venue, body.cell);
  const aboutVenue = ["closed", "not_exists", "wrong_info"].includes(body.reason);
  const price = aboutVenue ? undefined : body.price;
  if (body.reason === "wrong_price" && !price) throw new ApiError("bad_request");
  let key: MobilePriceKey | null = null;
  if (price) {
    if (!validServing(price.drink, price.serving) || price.currency !== venue.currency)
      throw new ApiError("bad_request");
    key = { venue: body.venue, ...price };
    const current = await currentPrice(c.env, key);
    if (!current || current.status === "review" || current.status === "removed")
      throw new ApiError("not_found");
    if (current.revision !== price.revision) throw new ApiError("conflict");
  }
  const target = key ? priceTarget(key) : body.venue;
  const revision = price?.revision ?? null;
  const day = romeDay(),
    ip = clientIp(c.req.raw);
  await consumeQuota(c.env, "report", c.var.sid, ip);
  const marks = await Promise.all([
    hmacHex(c.env.HASH_KEY, [day, "mobile-price-report", "ip", ip, target, revision ?? "venue"]),
    hmacHex(c.env.HASH_KEY, [
      day,
      "mobile-price-report",
      "sid",
      c.var.sid,
      target,
      revision ?? "venue",
    ]),
  ]);
  for (const mark of marks)
    if (!(await claimOnce(c.env.DB, mark, day))) return c.json({ status: "already" });
  const statements = [
    c.env.DB.prepare(
      `INSERT INTO mobile_price_reports(venue_key,target,revision,reason,day)
    SELECT ?1,?2,?3,?4,?5 WHERE NOT EXISTS (SELECT 1 FROM venues_hidden WHERE venue_key=?1)
      AND NOT EXISTS (SELECT 1 FROM mobile_venues_moderation WHERE venue_key=?1)`,
    ).bind(body.venue, target, revision, body.reason, day),
  ];
  if (key)
    statements.push(
      c.env.DB.prepare(
        `UPDATE mobile_prices_current SET status='review'
    WHERE ${PRICE_PK} AND revision=?6 AND ${UNBLOCKED}
      AND (SELECT COUNT(*) FROM mobile_price_reports WHERE target=?7 AND revision=?6)>?8`,
      ).bind(...keyValues(key), revision, target, REVIEW_AFTER_REPORTS),
    );
  await c.env.DB.batch(statements);
  return c.json({ status: "reported" });
});
