import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchNativeMap, validateNativeMapUrl } from "../../src/app/lib/native-map";
afterEach(() => vi.unstubAllGlobals());
describe("token-free native map network", () => {
  it("allows bundled styles and the existing tile origin only", () => {
    expect(() => {
      validateNativeMapUrl("/map/bancone.json", "capacitor://localhost/");
    }).not.toThrow();
    expect(() => {
      validateNativeMapUrl("https://tiles.openfreemap.org/planet", "capacitor://localhost/");
    }).not.toThrow();
    for (const raw of [
      "https://evil.example/x",
      "http://tiles.openfreemap.org/x",
      "https://user@tiles.openfreemap.org/x",
      "https://tiles.openfreemap.org/x?lat=45.4",
    ])
      expect(() => {
        validateNativeMapUrl(raw, "capacitor://localhost/");
      }).toThrow();
  });
  it("fetches sprite JSON as JSON with cookies omitted and redirects rejected", async () => {
    vi.stubGlobal("location", { href: "capacitor://localhost/" });
    const fetch = vi.fn().mockResolvedValue(Response.json({ icon: { x: 0 } }));
    vi.stubGlobal("fetch", fetch);
    const controller = new AbortController();
    expect(
      await fetchNativeMap(
        { url: "dovebevo-map://tiles.openfreemap.org/sprites/example.json", type: "json" },
        controller,
      ),
    ).toEqual({ data: { icon: { x: 0 } } });
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      "https://tiles.openfreemap.org/sprites/example.json",
      { credentials: "omit", redirect: "error", signal: controller.signal },
    );
  });
});
