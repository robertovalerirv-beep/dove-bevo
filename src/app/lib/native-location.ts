import type { Located } from "./locate";
interface Permissions {
  location: string;
  coarseLocation: string;
}
interface LocationBridge {
  checkPermissions: () => Promise<Permissions>;
  requestPermissions: (options: { permissions: ["coarseLocation"] }) => Promise<Permissions>;
  getCurrentPosition: (options: {
    enableHighAccuracy: boolean;
    timeout: number;
    maximumAge: number;
  }) => Promise<{ coords: { latitude: number; longitude: number } }>;
}
const granted = (value: Permissions) =>
  value.location === "granted" || value.coarseLocation === "granted";
export function foregroundLocation(bridge: LocationBridge) {
  return {
    positionGranted: async () => {
      try {
        return granted(await bridge.checkPermissions());
      } catch {
        return false;
      }
    },
    locate: async (): Promise<Located> => {
      try {
        let permissions = await bridge.checkPermissions();
        if (!granted(permissions)) {
          if (permissions.coarseLocation === "denied") return { ok: false, reason: "denied" };
          permissions = await bridge.requestPermissions({ permissions: ["coarseLocation"] });
          if (!granted(permissions)) return { ok: false, reason: "denied" };
        }
        const { coords } = await bridge.getCurrentPosition({
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 60000,
        });
        if (
          !Number.isFinite(coords.latitude) ||
          !Number.isFinite(coords.longitude) ||
          Math.abs(coords.latitude) > 90 ||
          Math.abs(coords.longitude) > 180
        )
          return { ok: false, reason: "unavailable" };
        return { ok: true, lat: coords.latitude, lon: coords.longitude };
      } catch (error) {
        const code =
          typeof error === "object" && error !== null && "code" in error ? error.code : null;
        return {
          ok: false,
          reason:
            code === "OS-PLUG-GLOC-0003"
              ? "denied"
              : code === "OS-PLUG-GLOC-0010"
                ? "timeout"
                : "unavailable",
        };
      }
    },
  };
}
