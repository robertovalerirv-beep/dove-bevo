// The only place that asks the browser for the position (SPEC 14: it never leaves the device).
export type Located =
  | { ok: true; lat: number; lon: number }
  | { ok: false; reason: "denied" | "unavailable" | "timeout" };

/** GeolocationPositionError.code → reason: 1 permission denied, 2 unavailable, 3 timeout. */
const REASON = { 1: "denied", 2: "unavailable", 3: "timeout" } as const;

async function permission(): Promise<PermissionState | null> {
  try {
    return (await navigator.permissions.query({ name: "geolocation" })).state;
  } catch {
    return null; // Permissions API missing: the call itself will tell
  }
}

/** True when the user already granted the position: reading it then shows no prompt. */
export async function positionGranted(): Promise<boolean> {
  return (await permission()) === "granted";
}

/**
 * Current position with a typed result. A permission already denied answers at once: asking again
 * would show no prompt and stay silent.
 */
export async function locate(): Promise<Located> {
  if (!("geolocation" in navigator)) return { ok: false, reason: "unavailable" };
  if ((await permission()) === "denied") return { ok: false, reason: "denied" };
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        resolve({ ok: true, lat: coords.latitude, lon: coords.longitude });
      },
      (error) => {
        resolve({ ok: false, reason: REASON[error.code as 1 | 2 | 3] });
      },
      { timeout: 10_000, maximumAge: 60_000 },
    );
  });
}

/**
 * Where a blocked position can be fixed: inside an app's own browser (Instagram, Facebook…) the
 * answer is always "denied" and no setting exists; on iPhone and Android the steps differ.
 */
export function blockedHelp(): "app" | "ios" | "other" {
  const ua = navigator.userAgent;
  if (/FBAN|FBAV|Instagram|TikTok|Snapchat|Line\/|; wv\)/.test(ua)) return "app";
  return /iPhone|iPad|iPod/.test(ua) ? "ios" : "other";
}
