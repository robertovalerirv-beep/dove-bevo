// /api/admin/* — review queues and bar corrections for Roberto (SPEC 7.9, D-19).
// Behind Cloudflare Access; requireAccess verifies the JWT on every request.
import { Hono } from "hono";
import { z } from "zod";
import { CATALOG, findDrink } from "../../shared/catalog";
import { DAYS_IN_WEEK, isValidWeek, MAX_RANGES, TIME, type WeekHours } from "../../shared/hours";
import { STALE_DAYS } from "../../shared/config";
import { summarizeMetrics } from "../../shared/metrics";
import { CELL_PRECISION, encodeGeohash } from "../../shared/geohash";
import { COVERAGE_MIN_INTERVAL_MS, MAX_ITEMS } from "../config";
import { coverageSnapshot, forgetCoverage } from "../lib/coverage";
import { romeDay } from "../lib/day";
import {
  addApprovedVenue,
  hideVenue,
  listHidden,
  listMetrics,
  listPricesToReview,
  clearBarReports,
  clearPriceReports,
  getCurrentPrice,
  listBarReports,
  runStatements,
  writePriceStatements,
  listUserVenues,
  listVerified,
  listVerifiedViews,
  removeVerified,
  saveVerified,
  setPriceStatus,
  setUserVenueStatus,
  unhideVenue,
} from "../lib/db";
import { ApiError } from "../lib/errors";
import { readJson } from "../lib/guards";
import { osmVenue, publicVenueName, resolveVenue } from "../lib/venues";
import { forgetCell } from "../lib/cell-cache";
import type { AppEnv } from "../types";
import { Lat, Lon, VenueKey, VenueName } from "./venues";
import { RESTRICTION_CAPACITY } from "../../shared/contribution-restrictions";
import { retainedRestrictionDays, restrictionExpiry } from "../lib/contribution-restrictions";
import {
  addContributionRestriction,
  listContributionRestrictions,
  removeContributionRestriction,
  userVenueExists,
} from "../lib/db";

const Cell = z.string().regex(/^[0-9b-hjkmnp-z]{5}$/);
const OsmKey = z.string().regex(/^[nwr][1-9]\d{0,14}$/);

const Kind = z.number().int().min(0).max(4);
const NewVenue = z.strictObject({ name: VenueName, kind: Kind, lat: Lat, lon: Lon });
/** Approve (optionally fixing name and kind) or reject a user bar. */
const VenueStatus = z.strictObject({
  status: z.enum(["approved", "removed"]),
  name: VenueName.optional(),
  kind: Kind.optional(),
});
const Hide = z.strictObject({ venue: OsmKey, cell: Cell });
const Unhide = z.strictObject({ venue: OsmKey });
const PriceStatus = z.strictObject({
  venue: VenueKey,
  drink: z.string().refine((d) => CATALOG.some((e) => e.code === d)),
  hh: z.union([z.literal(0), z.literal(1)]),
  status: z.enum(["active", "review", "removed"]),
});

/** Seven days, Monday first, each closed ([]) or up to two "HH:MM" ranges (SPEC 9.2, D-34). */
const Hours = z
  .array(z.array(z.tuple([z.string().regex(TIME), z.string().regex(TIME)])).max(MAX_RANGES))
  .length(DAYS_IN_WEEK)
  .refine((week): week is WeekHours => isValidWeek(week));
const Verified = z.strictObject({ venue: VenueKey, cell: Cell, hours: Hours });

export const admin = new Hono<AppEnv>();

const RestrictionInput = z.discriminatedUnion("family", [
  z.strictObject({
    family: z.literal("price"),
    ...PriceStatus.omit({ status: true }).shape,
    day: z.string(),
  }),
  z.strictObject({
    family: z.literal("proposal"),
    venue: z.string().regex(/^u[1-9]\d{0,14}$/),
    day: z.string(),
  }),
]);
const restrictionRef = (body: z.infer<typeof RestrictionInput>) => ({
  family: body.family,
  target: body.family === "price" ? `${body.venue}|${body.drink}|${String(body.hh)}` : body.venue,
  day: body.day,
});

admin.get("/restrictions", async (c) => {
  const now = Date.now();
  c.header("Cache-Control", "no-store");
  return c.json({
    days: retainedRestrictionDays(now),
    restrictions: await listContributionRestrictions(c.env.DB, now),
    capacity: RESTRICTION_CAPACITY,
  });
});

admin.post("/restrictions", async (c) => {
  const body = await readJson(c, RestrictionInput);
  const now = Date.now();
  if (!retainedRestrictionDays(now).includes(body.day)) throw new ApiError("bad_request");
  const exists =
    body.family === "price"
      ? await getCurrentPrice(c.env.DB, body)
      : await userVenueExists(c.env.DB, body.venue);
  if (!exists) throw new ApiError("not_found");
  const ref = { ...restrictionRef(body), expires_at: restrictionExpiry(body.day) };
  if (!(await addContributionRestriction(c.env.DB, ref, now))) throw new ApiError("busy");
  return c.json(ref);
});

admin.post("/restrictions/revoke", async (c) => {
  const body = await readJson(c, RestrictionInput);
  if (!retainedRestrictionDays().includes(body.day)) throw new ApiError("bad_request");
  await removeContributionRestriction(c.env.DB, restrictionRef(body));
  return c.json({ status: "revoked" });
});

// Everything the admin page shows, in one request.
admin.get("/overview", async (c) => {
  const [venues, hidden, prices, reports] = await Promise.all([
    listUserVenues(c.env.DB),
    listHidden(c.env.DB),
    listPricesToReview(c.env.DB),
    listBarReports(c.env.DB),
  ]);
  return c.json({ venues, hidden, prices, reports });
});

// Coverage of the map, computed only when the admin asks (ADR 0022). Best-effort minimum interval
// between two calls, kept in memory: it needs no D1 read, and a new isolate resets it. The figures
// themselves are reused for a minute and dropped at every admin change (ADR 0025).
let lastCoverageAt = 0;
/** Test hook: forgets the last calculation. */
export const resetCoverageLimit = () => {
  lastCoverageAt = 0;
  forgetCoverage();
};

// Usage of the last two weeks, from the anonymous counters (M5-03). One range read of a small table.
const METRICS_DAYS = 14;
admin.get("/metrics", async (c) => {
  // Calendar arithmetic on the Rome date, as the cron does, so DST days do not shift the cut.
  const since = new Date(Date.parse(`${romeDay()}T12:00:00Z`) - (METRICS_DAYS - 1) * 86_400_000)
    .toISOString()
    .slice(0, 10);
  c.header("Cache-Control", "no-store");
  return c.json({ days: summarizeMetrics(await listMetrics(c.env.DB, since)) });
});

admin.get("/coverage", async (c) => {
  const wait = lastCoverageAt + COVERAGE_MIN_INTERVAL_MS - Date.now();
  if (wait > 0)
    throw new ApiError("rate_limited", { "Retry-After": String(Math.ceil(wait / 1000)) });
  lastCoverageAt = Date.now();
  try {
    const coverage = await coverageSnapshot(c.env);
    c.header("Cache-Control", "no-store");
    return c.json(coverage);
  } catch (error) {
    lastCoverageAt = 0;
    throw error;
  }
});

// A bar missing from OpenStreetMap, added directly as approved (key "u<id>").
admin.post("/venues", async (c) => {
  const body = await readJson(c, NewVenue);
  const cell = encodeGeohash(body.lat, body.lon, CELL_PRECISION);
  const id = await addApprovedVenue(c.env.DB, {
    ...body,
    lat: Math.round(body.lat * 1e5) / 1e5,
    lon: Math.round(body.lon * 1e5) / 1e5,
    cell,
  });
  await forgetCell(c.env.DB, c.req.url, cell);
  return c.json({ key: `u${String(id)}`, cell });
});

// Approve a pending bar or remove a user bar.
admin.post("/venues/:id/status", async (c) => {
  const id = z.coerce.number().int().positive().safeParse(c.req.param("id"));
  if (!id.success) throw new ApiError("bad_request");
  const body = await readJson(c, VenueStatus);
  const cell = await setUserVenueStatus(c.env.DB, id.data, body.status, romeDay(), body);
  if (!cell) throw new ApiError("not_found");
  if (body.status === "removed") await clearBarReports(c.env.DB, `u${String(id.data)}`);
  await forgetCell(c.env.DB, c.req.url, cell);
  return c.json({ status: body.status });
});

// Hide an OSM entry that is not a bar (or is closed): off the map, no new prices.
admin.post("/hide", async (c) => {
  const body = await readJson(c, Hide);
  const found = await osmVenue(c.env, body.venue, body.cell);
  if (!found) throw new ApiError("not_found");
  await hideVenue(c.env.DB, { key: body.venue, cell: body.cell, name: found.name, day: romeDay() });
  await clearBarReports(c.env.DB, body.venue);
  await forgetCell(c.env.DB, c.req.url, body.cell);
  return c.json({ status: "hidden" });
});

admin.post("/unhide", async (c) => {
  const body = await readJson(c, Unhide);
  const cell = await unhideVenue(c.env.DB, body.venue);
  if (cell) await forgetCell(c.env.DB, c.req.url, cell);
  return c.json({ status: "visible" });
});

// Close only the selected target's reports. The content and anti-duplicate markers stay.
admin.post("/reports/dismiss", async (c) => {
  const body = await readJson(
    c,
    z.union([z.strictObject({ venue: VenueKey }), PriceStatus.omit({ status: true })]),
  );
  if ("drink" in body) await clearPriceReports(c.env.DB, body);
  else await clearBarReports(c.env.DB, body.venue);
  return c.json({ status: "dismissed" });
});

// Decide on a price in review/quarantine or reported at least once (SPEC 11, ADR 0037).
admin.post("/prices/status", async (c) => {
  const body = await readJson(c, PriceStatus);
  const k = { venue: body.venue, drink: body.drink, hh: body.hh };
  const cell = await setPriceStatus(c.env.DB, k, body.status);
  if (!cell) throw new ApiError("not_found");
  await forgetCell(c.env.DB, c.req.url, cell);
  return c.json({ status: body.status });
});

// ---- Price list entry (M3-17, SPEC 7.9) ----

const ListinoItem = z.strictObject({
  drink: z.string().max(32),
  hh: z.union([z.literal(0), z.literal(1)]),
  price_cents: z.number().int().min(0).max(100_000),
});
const Listino = z.strictObject({
  venue: VenueKey,
  cell: Cell,
  observed_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  items: z.array(ListinoItem).min(1).max(MAX_ITEMS),
});

/** "YYYY-MM-DD" shifted by whole days, in UTC (the string is a calendar day, no hours). */
const shiftDay = (day: string, days: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

// Prices copied from a bar's printed list, with the day they were seen. The same catalog and limits
// as a person's entry; a day in the future or older than STALE_DAYS is refused. The admin's word
// needs no quarantine, but a newer price already on the bar is never replaced by an older one.
admin.post("/listino", async (c) => {
  const body = await readJson(c, Listino);
  const today = romeDay();
  const day = new Date(`${body.observed_on}T00:00:00Z`);
  if (
    Number.isNaN(day.getTime()) ||
    day.toISOString().slice(0, 10) !== body.observed_on ||
    body.observed_on > today ||
    body.observed_on < shiftDay(today, -STALE_DAYS)
  )
    throw new ApiError("bad_request");
  for (const item of body.items) {
    const drink = findDrink(item.drink);
    if (!drink || item.price_cents < drink.min || item.price_cents > drink.max)
      throw new ApiError("bad_request");
  }
  const where = await resolveVenue(c.env, body.venue, body.cell);

  const statements: D1PreparedStatement[] = [];
  const results: { status: "active" | "skipped"; code?: string }[] = [];
  const seen = new Set<string>();
  for (const item of body.items) {
    const k = { venue: body.venue, drink: item.drink, hh: item.hh };
    const id = `${item.drink}|${String(item.hh)}`;
    const existing = await getCurrentPrice(c.env.DB, k);
    if (seen.has(id)) {
      results.push({ status: "skipped", code: "repeated" });
    } else if (existing && (existing.status === "review" || existing.status === "removed")) {
      results.push({ status: "skipped", code: "under_review" });
    } else if (existing && existing.observed_on > body.observed_on) {
      results.push({ status: "skipped", code: "newer_exists" });
    } else {
      statements.push(
        ...writePriceStatements(c.env.DB, k, {
          ...where,
          price: item.price_cents,
          day: body.observed_on,
          status: "active",
        }),
      );
      results.push({ status: "active" });
    }
    seen.add(id);
  }
  if (statements.length > 0) {
    await runStatements(c.env.DB, statements);
    await forgetCell(c.env.DB, c.req.url, where.cell);
  }
  return c.json({ results });
});

// ---- Gestore verificato (SPEC 1.9, 7.10, D-34, ADR 0033) ----

// Openings of the bar pages counted over this many days, for the admin list.
const VIEWS_DAYS = 30;

admin.get("/verified", async (c) => {
  const since = new Date(Date.parse(`${romeDay()}T12:00:00Z`) - (VIEWS_DAYS - 1) * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const [v, views] = await Promise.all([
    listVerified(c.env.DB),
    listVerifiedViews(c.env.DB, since),
  ]);
  c.header("Cache-Control", "no-store");
  return c.json({ v, views });
});

// Turns «Gestore verificato» on for a bar the map shows, or replaces its hours. The name and the cell
// come from the static file or D1: the client only says which bar.
admin.post("/verified", async (c) => {
  const body = await readJson(c, Verified);
  const name = await publicVenueName(c.env, body.venue, body.cell);
  if (name === null) throw new ApiError("bad_request");
  await saveVerified(c.env.DB, { key: body.venue, cell: body.cell, name, hours: body.hours });
  await forgetCell(c.env.DB, c.req.url, body.cell);
  return c.json({ status: "verified" });
});

admin.post("/verified/remove", async (c) => {
  const body = await readJson(c, z.strictObject({ venue: VenueKey }));
  const cell = await removeVerified(c.env.DB, body.venue);
  if (!cell) throw new ApiError("not_found");
  await forgetCell(c.env.DB, c.req.url, cell);
  return c.json({ status: "removed" });
});
