import { describe, expect, it, vi } from "vitest";
import { foregroundLocation } from "../../src/app/lib/native-location";

describe("foreground native location", () => {
  it("returns denied without prompting again or reading coordinates", async () => {
    const get = vi.fn();
    const request = vi.fn();
    const location = foregroundLocation({
      checkPermissions: () => Promise.resolve({ location: "denied", coarseLocation: "denied" }),
      requestPermissions: request,
      getCurrentPosition: get,
    });
    expect(await location.positionGranted()).toBe(false);
    expect(await location.locate()).toEqual({ ok: false, reason: "denied" });
    expect(request).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
  });
  it("accepts approximate permission and requests one foreground fix without networking", async () => {
    const get = vi.fn().mockResolvedValue({ coords: { latitude: 45.4, longitude: 9.1 } });
    const request = vi.fn();
    const location = foregroundLocation({
      checkPermissions: () => Promise.resolve({ location: "denied", coarseLocation: "granted" }),
      requestPermissions: request,
      getCurrentPosition: get,
    });
    expect(await location.positionGranted()).toBe(true);
    expect(await location.locate()).toEqual({ ok: true, lat: 45.4, lon: 9.1 });
    expect(request).not.toHaveBeenCalled();
    expect(get).toHaveBeenCalledExactlyOnceWith({
      enableHighAccuracy: false,
      timeout: 10000,
      maximumAge: 60000,
    });
  });
  it("requests only after a user action and preserves manual fallback on denial or disabled services", async () => {
    const request = vi.fn().mockResolvedValue({ location: "denied", coarseLocation: "denied" });
    const get = vi.fn();
    const location = foregroundLocation({
      checkPermissions: () => Promise.resolve({ location: "prompt", coarseLocation: "prompt" }),
      requestPermissions: request,
      getCurrentPosition: get,
    });
    expect(await location.positionGranted()).toBe(false);
    expect(request).not.toHaveBeenCalled();
    expect(await location.locate()).toEqual({ ok: false, reason: "denied" });
    expect(request).toHaveBeenCalledOnce();
    expect(get).not.toHaveBeenCalled();
    const disabled = foregroundLocation({
      checkPermissions: () => Promise.reject(new Error("disabled")),
      requestPermissions: request,
      getCurrentPosition: get,
    });
    expect(await disabled.locate()).toEqual({ ok: false, reason: "unavailable" });
  });
});
