import { afterEach, expect, it, vi } from "vitest";
vi.mock("../../src/app/lib/platform", () => ({
  publicFetch: (...args: unknown[]) => fetch(...(args as Parameters<typeof fetch>)),
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

it("legacy server pending names never enter the public client data used by selectors and duplicate suggestions", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) =>
      Promise.resolve(
        Response.json(
          url.startsWith("/data/")
            ? { c: [], v: [] }
            : {
                p: [],
                u: [["u8", "Approved Bar", 1, 45.46, 9.19]],
                pend: [["u9", "Unreviewed Name", 1, 45.46, 9.19, 1]],
                h: [],
                g: [],
              },
        ),
      ),
    ),
  );
  const { loadCell } = await import("../../src/app/lib/data");
  const venues = await loadCell("u0nd9");
  expect(venues.map((v) => v.name)).toEqual(["Approved Bar"]);
  expect(venues.every((v) => !v.pending)).toBe(true);
});
