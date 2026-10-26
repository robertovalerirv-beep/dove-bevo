import { afterEach, describe, expect, it, vi } from "vitest";
import { MOBILE_CALLBACK_URL, MOBILE_CLIENT_ID, MOBILE_REDEEM_PATH } from "../../src/shared/mobile";

const bridge = vi.hoisted(() => ({
  request:
    vi.fn<
      (options: {
        url: string;
        headers: Record<string, string>;
        data?: string;
      }) => Promise<{ status: number; headers: Record<string, string>; body: string }>
    >(),
  listeners: new Map<string, (value: never) => void>(),
  removed: vi.fn(),
  launch: vi.fn(),
  open: vi.fn<(options: { url: string }) => Promise<void>>(),
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true },
  registerPlugin: () => ({ request: bridge.request }),
}));
vi.mock("@capacitor/app", () => ({
  App: {
    addListener: (event: string, callback: (value: never) => void) => {
      bridge.listeners.set(event, callback);
      return Promise.resolve({
        remove: () => {
          bridge.listeners.delete(event);
          bridge.removed();
          return Promise.resolve();
        },
      });
    },
    getLaunchUrl: bridge.launch,
  },
}));
vi.mock("@capacitor/browser", () => ({
  Browser: {
    open: bridge.open,
    close: () => Promise.resolve(),
    addListener: () =>
      Promise.resolve({
        remove: () => {
          bridge.removed();
          return Promise.resolve();
        },
      }),
  },
}));
vi.mock("@capacitor/geolocation", () => ({ Geolocation: {} }));
vi.mock("@capacitor/share", () => ({ Share: {} }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
  bridge.listeners.clear();
  vi.clearAllMocks();
});

describe("native initialization retry", () => {
  it("binds retry callbacks to the active session after a late initialization failure", async () => {
    vi.stubEnv("VITE_NATIVE_API_ORIGIN", "https://mobile-preview.dovebevo.com");
    vi.stubGlobal("document", { addEventListener: vi.fn(), removeEventListener: vi.fn() });
    bridge.launch
      .mockRejectedValueOnce(new Error("temporary launch failure"))
      .mockResolvedValue(undefined);
    bridge.open.mockResolvedValue(undefined);
    bridge.request.mockImplementation((options) =>
      Promise.resolve({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          options.url.endsWith("/config")
            ? {
                version: 1,
                clientId: MOBILE_CLIENT_ID,
                callbackUrl: MOBILE_CALLBACK_URL,
                challengePath: "/mobile-auth",
                dataVersion: "20261024",
              }
            : new URL(options.url).pathname === MOBILE_REDEEM_PATH
              ? { token: "active-client-token", expiresIn: 1800 }
              : {},
        ),
      }),
    );
    const { initializeNative } = await import("../../src/app/lib/native");
    const { nativePlatform } = await import("../../src/app/lib/platform");
    await expect(initializeNative()).rejects.toThrow("temporary launch failure");
    expect(nativePlatform).toThrow("native adapter unavailable");
    expect(bridge.removed).toHaveBeenCalledTimes(4);
    expect(await initializeNative()).toBe("20261024");
    const client = nativePlatform().client;
    const auth = client.ensureSession();
    await vi.waitFor(() => {
      expect(bridge.open).toHaveBeenCalledOnce();
    });
    const nonce = new URL(bridge.open.mock.calls[0]?.[0].url ?? "").searchParams.get("nonce") ?? "";
    const callback = bridge.listeners.get("appUrlOpen") as
      ((value: { url: string }) => void) | undefined;
    if (!callback) throw new Error("active callback missing");
    callback({ url: `${MOBILE_CALLBACK_URL}?code=${"c".repeat(43)}&state=${nonce}` });
    await vi.waitFor(() => {
      expect(
        bridge.request.mock.calls.some(
          ([request]) => new URL(request.url).pathname === MOBILE_REDEEM_PATH,
        ),
      ).toBe(true);
    });
    await auth;
    await client.post("/api/prices", {});
    expect(bridge.request.mock.calls.at(-1)?.[0].headers.authorization).toBe(
      "Bearer active-client-token",
    );
    expect(bridge.launch).toHaveBeenCalledTimes(2);
    expect(await initializeNative()).toBe("20261024");
    expect(nativePlatform().client).toBe(client);
    expect(bridge.launch).toHaveBeenCalledTimes(2);
  });
});
