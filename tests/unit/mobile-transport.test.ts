import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true },
  registerPlugin: () => ({ request: () => Promise.reject(new Error("plugin unavailable")) }),
}));
vi.mock("@capacitor/app", () => ({ App: {} }));
vi.mock("@capacitor/browser", () => ({ Browser: {} }));
vi.mock("@capacitor/geolocation", () => ({ Geolocation: {} }));
vi.mock("@capacitor/share", () => ({ Share: {} }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});
describe("native transport cannot fall back to web cookies", () => {
  it("fails before any fetch when the native adapter is absent", async () => {
    vi.stubEnv("VITE_NATIVE", "true");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { publicFetch } = await import("../../src/app/lib/platform");
    expect(() => publicFetch("/api/prices/u0nd9")).toThrow("native adapter unavailable");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects absent isolated plugin without using CapacitorHttp or fetch", async () => {
    vi.stubEnv("VITE_NATIVE_API_ORIGIN", "https://mobile-preview.dovebevo.com");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { initializeNative } = await import("../../src/app/lib/native");
    await expect(initializeNative()).rejects.toThrow("plugin unavailable");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("preserves ordinary same-origin web requests", async () => {
    vi.stubEnv("VITE_NATIVE", "false");
    const fetch = vi.fn().mockResolvedValue(Response.json({}));
    vi.stubGlobal("fetch", fetch);
    const { publicFetch } = await import("../../src/app/lib/platform");
    await publicFetch("/api/prices/u0nd9", { cache: "reload" });
    expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/prices/u0nd9", { cache: "reload" });
  });
});
