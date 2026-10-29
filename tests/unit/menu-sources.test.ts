import { afterEach, describe, expect, it, vi } from "vitest";
import type { PriceRow } from "../../src/shared/api-types";
import {
  loadMenuSources,
  menuSourceForRow,
  parseMenuSources,
} from "../../src/app/lib/menu-sources";

const source = {
  drink: "spritz",
  hh: 0,
  price_cents: 700,
  checked_on: "2026-10-28",
  menu_url: "https://venue.example/menu.pdf",
  menu_item: "Aperol Spritz",
  serving: "one glass",
  context: "indoors",
  published_on: null,
};
const row: PriceRow = ["n123", "spritz", 0, 700, "2026-10-28", 0, 0];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("optional official-menu provenance", () => {
  it("preserves the published item and nullable serving/context without inferring them", () => {
    expect(parseMenuSources({ prices: [source] })).toEqual([source]);
    const unknown = { ...source, serving: null, context: null };
    expect(parseMenuSources({ prices: [unknown] })).toEqual([unknown]);
  });

  it.each([
    { hh: false },
    { hh: 2 },
    { price_cents: 700.5 },
    { price_cents: 1501 },
    { drink: "unknown" },
    { checked_on: "2026-02-30" },
    { checked_on: "2999-01-01" },
    { published_on: "2025-02-29" },
    { menu_url: "javascript:alert(1)" },
    { menu_url: "http://venue.example/menu" },
    { menu_url: "https://user:password@venue.example/menu" },
    { menu_item: "" },
    { menu_item: "line\nbreak" },
    { serving: 12 },
    { context: "x".repeat(1025) },
    { unexpected: true },
  ])("rejects malformed provenance instead of labelling legacy prices: %j", (change) => {
    expect(() => parseMenuSources({ prices: [{ ...source, ...change }] })).toThrow();
  });

  it("rejects duplicate price pairs and oversized lists", () => {
    expect(() => parseMenuSources({ prices: [source, source] })).toThrow();
    expect(() => parseMenuSources({ prices: Array.from({ length: 19 }, () => source) })).toThrow();
    expect(() => parseMenuSources({ prices: [], other: [] })).toThrow();
  });

  it("matches venue, drink, band, exact cents, observation day and active status", () => {
    const sources = parseMenuSources({ prices: [source] });
    expect(menuSourceForRow(row, sources, "n123")).toEqual(source);
    for (const changed of [
      ["n124", ...row.slice(1)],
      [row[0], "negroni", ...row.slice(2)],
      [row[0], row[1], 1, ...row.slice(3)],
      [...row.slice(0, 3), 701, ...row.slice(4)],
      [...row.slice(0, 4), "2026-10-29", ...row.slice(5)],
      [...row.slice(0, 6), 1],
    ]) {
      expect(menuSourceForRow(changed as PriceRow, sources, "n123")).toBeUndefined();
    }
  });

  it("reads only the encoded same-origin endpoint with a finite body and no redirect", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ prices: [source] }));
    vi.stubGlobal("fetch", fetch);
    await expect(loadMenuSources("n123", "u0nd9")).resolves.toEqual([source]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[0]).toBe("/api/venues/n123/menu-sources?c=u0nd9");
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ method: "GET", redirect: "error" });
  });

  it.each([
    new Response("<html>not JSON</html>", { headers: { "content-type": "text/html" } }),
    new Response("x".repeat(65_537), { headers: { "content-type": "application/json" } }),
    new Response("{}", { status: 503, headers: { "content-type": "application/json" } }),
  ])("rejects failed, HTML and oversized bodies", async (response) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    await expect(loadMenuSources("n123", "u0nd9")).rejects.toThrow();
  });

  it("aborts a timed-out or retired request, including a fetch that resolves after cancellation", async () => {
    vi.useFakeTimers();
    let complete: ((response: Response) => void) | undefined;
    const fetch = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          complete = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetch);
    const request = loadMenuSources("n123", "u0nd9");
    const rejected = expect(request).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(8_000);
    const signal = (fetch.mock.calls[0]?.[1] as RequestInit).signal;
    expect(signal?.aborted).toBe(true);
    complete?.(Response.json({ prices: [source] }));
    await rejected;

    const controller = new AbortController();
    const retired = loadMenuSources("n124", "u0nd9", controller.signal);
    const retiredRejected = expect(retired).rejects.toThrow();
    controller.abort();
    complete?.(Response.json({ prices: [source] }));
    await retiredRejected;
    expect((fetch.mock.calls[1]?.[1] as RequestInit).signal?.aborted).toBe(true);
  });
});
