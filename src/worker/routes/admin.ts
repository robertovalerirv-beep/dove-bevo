// /api/admin/* — review queues and bar corrections for Roberto (SPEC 7.9, D-19).
// Behind Cloudflare Access; requireAccess verifies the JWT on every request.
import { Hono } from "hono";
import { z } from "zod";
import { CATALOG } from "../../shared/catalog";
import { CELL_PRECISION, encodeGeohash } from "../../shared/geohash";
import { COVERAGE_MIN_INTERVAL_MS } from "../config";
import { coverageSnapshot, forgetCoverage } from "../lib/coverage";
import { romeDay } from "../lib/day";
import {
  addApprovedVenue,
  hideVenue,
  listHidden,
  listPricesToReview,
  clearBarReports,
  listBarReports,
  listUserVenues,
  setPriceStatus,
  setUserVenueStatus,
  unhideVenue,
} from "../lib/db";
import { ApiError } from "../lib/errors";
import { readJson } from "../lib/guards";
import { osmVenue } from "../lib/venues";
import { forgetCell } from "./prices";
import type { AppEnv } from "../types";
import { Lat, Lon, VenueKey, VenueName } from "./venues";

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
  status: z.enum(["active", "removed"]),
});

export const admin = new Hono<AppEnv>();

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
  await forgetCell(c.req.url, cell);
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
  await forgetCell(c.req.url, cell);
  return c.json({ status: body.status });
});

// Hide an OSM entry that is not a bar (or is closed): off the map, no new prices.
admin.post("/hide", async (c) => {
  const body = await readJson(c, Hide);
  const found = await osmVenue(c.env, body.venue, body.cell);
  if (!found) throw new ApiError("not_found");
  await hideVenue(c.env.DB, { key: body.venue, cell: body.cell, name: found.name, day: romeDay() });
  await clearBarReports(c.env.DB, body.venue);
  await forgetCell(c.req.url, body.cell);
  return c.json({ status: "hidden" });
});

admin.post("/unhide", async (c) => {
  const body = await readJson(c, Unhide);
  const cell = await unhideVenue(c.env.DB, body.venue);
  if (cell) await forgetCell(c.req.url, cell);
  return c.json({ status: "visible" });
});

// Reports on a bar judged unfounded: the bar stays, its reports are closed.
admin.post("/reports/dismiss", async (c) => {
  const body = await readJson(c, z.strictObject({ venue: VenueKey }));
  await clearBarReports(c.env.DB, body.venue);
  return c.json({ status: "dismissed" });
});

// Decide on a price in review or in quarantine (SPEC 11).
admin.post("/prices/status", async (c) => {
  const body = await readJson(c, PriceStatus);
  const k = { venue: body.venue, drink: body.drink, hh: body.hh };
  const cell = await setPriceStatus(c.env.DB, k, body.status);
  if (!cell) throw new ApiError("not_found");
  await forgetCell(c.req.url, cell);
  return c.json({ status: body.status });
});
