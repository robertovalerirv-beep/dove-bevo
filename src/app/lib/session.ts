// Anonymous session on the client (SPEC 13.2): Turnstile is loaded only at the first contribution
// (M2-02), then POST /api/session sets the HttpOnly cookie. Nothing is stored on the device.
const TURNSTILE_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const SESSION_MS = 29 * 60 * 1000; // a minute less than the cookie

interface Turnstile {
  render(
    element: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      appearance: "interaction-only";
      callback: (token: string) => void;
      "error-callback": () => void;
    },
  ): string;
  remove(id: string): void;
}

let validUntil = 0;
let pending: Promise<void> | null = null;
let script: Promise<Turnstile> | null = null;

function loadTurnstile(): Promise<Turnstile> {
  script ??= new Promise((resolve, reject) => {
    const tag = document.createElement("script");
    tag.src = TURNSTILE_URL;
    tag.async = true;
    tag.onload = () => {
      const api = (window as unknown as { turnstile?: Turnstile }).turnstile;
      if (api) resolve(api);
      else reject(new Error("turnstile"));
    };
    tag.onerror = () => {
      script = null;
      reject(new Error("turnstile"));
    };
    document.head.append(tag);
  });
  return script;
}

async function start(host: HTMLElement): Promise<void> {
  const { siteKey, action } = (await (await fetch("/api/session")).json()) as {
    siteKey: string;
    action: string;
  };
  const turnstile = await loadTurnstile();
  const token = await new Promise<string>((resolve, reject) => {
    const id = turnstile.render(host, {
      sitekey: siteKey,
      action,
      appearance: "interaction-only", // visible only when Cloudflare needs an interaction
      callback: (t) => {
        turnstile.remove(id);
        resolve(t);
      },
      "error-callback": () => {
        turnstile.remove(id);
        reject(new Error("turnstile"));
      },
    });
  });
  const response = await fetch("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (!response.ok) throw new Error(`session ${String(response.status)}`);
  validUntil = Date.now() + SESSION_MS;
}

/** Resolves when a session cookie is valid; at most one Turnstile check at a time. */
export function ensureSession(host: HTMLElement): Promise<void> {
  if (Date.now() < validUntil) return Promise.resolve();
  pending ??= start(host).finally(() => {
    pending = null;
  });
  return pending;
}

/** After a 401 the cookie expired: the next ensureSession() runs Turnstile again. */
export function forgetSession(): void {
  validUntil = 0;
}

/** POST JSON with the session; one transparent retry after a 401. */
export async function postWithSession(
  host: HTMLElement,
  path: string,
  body: unknown,
  keepalive = false,
): Promise<Response> {
  const send = () =>
    fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive,
    });
  await ensureSession(host);
  let response = await send();
  if (response.status === 401) {
    forgetSession();
    await ensureSession(host);
    response = await send();
  }
  return response;
}
