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

// When the HttpOnly cookie should expire, kept for this tab only so a reload does not run
// Turnstile again (sessionStorage may be unavailable: then it is just memory).
const KEY = "dovebevo.session-until";
let validUntil = readUntil();

function readUntil(): number {
  try {
    return Number(sessionStorage.getItem(KEY) ?? "0");
  } catch {
    return 0;
  }
}

function writeUntil(value: number): void {
  validUntil = value;
  try {
    sessionStorage.setItem(KEY, String(value));
  } catch {
    // memory only
  }
}
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
  writeUntil(Date.now() + SESSION_MS);
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
  writeUntil(0);
}

/** POST JSON with the session cookie; on 401 a new session (Turnstile) and one retry. */
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
  // Try the cookie we may already have; Turnstile only when the server says it is missing (401).
  let response = await send();
  if (response.status === 401) {
    forgetSession();
    await ensureSession(host);
    response = await send();
  }
  return response;
}
