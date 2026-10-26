import {
  MOBILE_CALLBACK_URL,
  MOBILE_CLIENT_ID,
  MOBILE_CODE_TTL_S,
  MOBILE_NATIVE_HEADER,
  MOBILE_PROTOCOL_VERSION,
  MOBILE_REDEEM_PATH,
  MOBILE_SESSION_TTL_S,
  type MobileConfig,
} from "../../shared/mobile";
import { it } from "../i18n/it";

// Preview only. A production identity/backend must be reviewed together before expanding this list.
export const MOBILE_ORIGIN = "https://mobile-preview.dovebevo.com";
const PUBLIC =
  /^(?:\/api\/prices\/[0-9b-hjkmnp-z]{5}|\/api\/venues\/(?:approved|[nwru][1-9]\d{0,14}\/prices)|\/data\/(?:\d{8}|fixture)\/(?:places|v\/[0-9b-hjkmnp-z]{5}|s\/[a-z0-9_]{2,3}|s\/index)\.json)$/;
const MOBILE = new Set([
  "/api/mobile/config",
  MOBILE_REDEEM_PATH,
  "/api/mobile/events",
  "/api/mobile/prices",
  "/api/mobile/prices/confirm",
  "/api/mobile/venues",
  "/api/mobile/reports",
]);
const MUTATIONS = new Map([
  ["/api/prices", "/api/mobile/prices"],
  ["/api/prices/confirm", "/api/mobile/prices/confirm"],
  ["/api/venues", "/api/mobile/venues"],
  ["/api/reports", "/api/mobile/reports"],
]);
const RANDOM = /^[A-Za-z0-9_-]{43,128}$/;
export type NativeTransport = (
  url: string,
  init: RequestInit & { headers: Headers; credentials: "omit" },
) => Promise<Response>;

export function resolveMobileUrl(origin: string, path: string): string {
  if (origin !== MOBILE_ORIGIN || (!PUBLIC.test(path) && !MOBILE.has(path)))
    throw new Error(it.native.unavailable);
  return origin + path;
}

/** Reject all URL ambiguity before touching a pending verifier. */
export function parseMobileCallback(raw: string, nonce: string): string | null {
  try {
    const url = new URL(raw);
    if (
      raw.split("?")[0] !== MOBILE_CALLBACK_URL ||
      url.hash ||
      url.username ||
      url.password ||
      url.port
    )
      return null;
    const keys = [...url.searchParams.keys()];
    if (keys.length !== 2 || !keys.includes("code") || !keys.includes("state")) return null;
    const code = url.searchParams.get("code") ?? "";
    return url.searchParams.get("state") === nonce && RANDOM.test(code) ? code : null;
  } catch {
    return null;
  }
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}
const random = () => base64url(crypto.getRandomValues(new Uint8Array(32)));
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface Options {
  origin: string;
  request: NativeTransport;
  open: (url: string) => Promise<void>;
  close: () => Promise<void>;
  allowFixture?: boolean;
}
interface Pending {
  verifier: string;
  nonce: string;
  until: number;
  resolve: () => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export function createMobileClient(options: Options) {
  let config: MobileConfig | null = null;
  let session: { token: string; until: number } | null = null;
  let pending: Pending | null = null;
  let redeeming: Pending | null = null;
  let authentication: Promise<void> | null = null;
  const fail = () => new Error(it.native.unavailable);
  async function request(path: string, init?: RequestInit, bearer?: string): Promise<Response> {
    const headers = new Headers(init?.headers);
    headers.delete("Authorization");
    headers.delete("Cookie");
    if (path.startsWith("/api/mobile/")) headers.set(MOBILE_NATIVE_HEADER, "1");
    if (bearer) {
      if (![...MUTATIONS.values()].includes(path)) throw fail();
      headers.set("Authorization", `Bearer ${bearer}`);
    }
    const response = await options.request(resolveMobileUrl(options.origin, path), {
      ...init,
      headers,
      credentials: "omit",
      redirect: "error",
    });
    if ((response.status >= 300 && response.status < 400) || response.redirected) throw fail();
    return response;
  }
  function cancel() {
    const flow = pending ?? redeeming;
    if (!flow) return;
    clearTimeout(flow.timer);
    flow.reject(new Error(it.native.cancelled));
    pending = null;
    redeeming = null;
  }
  async function initialize(): Promise<MobileConfig> {
    const response = await request("/api/mobile/config");
    if (!response.ok) throw fail();
    const value: unknown = await response.json();
    if (
      !record(value) ||
      value.version !== MOBILE_PROTOCOL_VERSION ||
      value.clientId !== MOBILE_CLIENT_ID ||
      value.callbackUrl !== MOBILE_CALLBACK_URL ||
      value.challengePath !== "/mobile-auth" ||
      typeof value.dataVersion !== "string" ||
      !(
        /^\d{8}$/.test(value.dataVersion) ||
        (options.allowFixture && value.dataVersion === "fixture")
      )
    )
      throw fail();
    config = value as unknown as MobileConfig;
    return config;
  }
  async function ensureSession(): Promise<void> {
    if (session && session.until > Date.now()) return;
    session = null;
    if (authentication) return authentication;
    if (!config) await initialize();
    authentication = (async () => {
      const verifier = random();
      const nonce = random();
      const challenge = base64url(
        new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))),
      );
      const complete = new Promise<void>((resolve, reject) => {
        pending = {
          verifier,
          nonce,
          until: Date.now() + MOBILE_CODE_TTL_S * 1000,
          resolve,
          reject,
          timer: setTimeout(cancel, MOBILE_CODE_TTL_S * 1000),
        };
      });
      const url = new URL("/mobile-auth", options.origin);
      url.search = new URLSearchParams({
        codeChallenge: challenge,
        nonce,
        clientId: MOBILE_CLIENT_ID,
      }).toString();
      // Attach the rejection handler before the browser can deliver a callback/cancellation.
      const opened = options.open(url.href).catch(() => {
        cancel();
      });
      await Promise.all([complete, opened]);
    })().finally(() => {
      authentication = null;
    });
    return authentication;
  }
  async function receiveCallback(raw: string): Promise<boolean> {
    const flow = pending;
    if (!flow) return false;
    if (flow.until <= Date.now()) {
      cancel();
      return false;
    }
    const code = parseMobileCallback(raw, flow.nonce);
    if (!code) return false;
    pending = null; // one use, including parallel callbacks
    redeeming = flow;
    try {
      const response = await request(MOBILE_REDEEM_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          codeVerifier: flow.verifier,
          nonce: flow.nonce,
          clientId: MOBILE_CLIENT_ID,
        }),
      });
      const value: unknown = response.ok ? await response.json() : null;
      if (
        redeeming !== flow ||
        flow.until <= Date.now() ||
        !record(value) ||
        typeof value.token !== "string" ||
        value.token.length < 1 ||
        value.token.length > 4096 ||
        value.expiresIn !== MOBILE_SESSION_TTL_S
      )
        throw fail();
      clearTimeout(flow.timer);
      redeeming = null;
      session = { token: value.token, until: Date.now() + (MOBILE_SESSION_TTL_S - 60) * 1000 };
      await options.close().catch(() => undefined);
      flow.resolve();
      return true;
    } catch {
      clearTimeout(flow.timer);
      if (redeeming === flow) redeeming = null;
      session = null;
      flow.reject(fail());
      return false;
    }
  }
  async function post(path: string, body: unknown): Promise<Response> {
    const mobile = MUTATIONS.get(path);
    if (!mobile) throw fail();
    const send = async () => {
      await ensureSession();
      if (!session) throw fail();
      return request(
        mobile,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        session.token,
      );
    };
    let response = await send();
    if (response.status === 401) {
      session = null;
      response = await send();
    }
    return response;
  }
  return {
    initialize,
    ensureSession,
    receiveCallback,
    cancel,
    post,
    forget: () => {
      session = null;
      cancel();
    },
    read: (path: string, init?: RequestInit) => {
      if (!PUBLIC.test(path)) return Promise.reject(fail());
      return request(path, { ...init, method: "GET", body: undefined });
    },
    events: (body: string) =>
      request("/api/mobile/events", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body,
      }),
    resume: () => {
      if (session && session.until <= Date.now()) session = null;
      if (pending && pending.until <= Date.now()) cancel();
    },
  };
}
export type MobileClient = ReturnType<typeof createMobileClient>;

/** Canonical venue links contain venue identity and cell only, never device coordinates. */
export function nativeVenuePath(raw: string): string | null {
  try {
    const url = new URL(raw);
    const cell = url.searchParams.get("c") ?? "";
    if (
      url.origin !== "https://www.dovebevo.com" ||
      url.username ||
      url.password ||
      url.hash ||
      !/^\/bar\/[nwru][1-9]\d{0,14}$/.test(url.pathname) ||
      !/^[0-9b-hjkmnp-z]{5}$/.test(cell) ||
      [...url.searchParams.keys()].join() !== "c"
    )
      return null;
    return url.pathname + "?c=" + cell;
  } catch {
    return null;
  }
}
