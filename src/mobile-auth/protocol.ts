import {
  MOBILE_CALLBACK_URL,
  MOBILE_CLIENT_ID,
  type MobileAuthorizeResponse,
} from "../shared/mobile";

export interface ChallengeParameters {
  codeChallenge: string;
  nonce: string;
  clientId: typeof MOBILE_CLIENT_ID;
}

const digest = /^[A-Za-z0-9_-]{43}$/;
const code = /^[A-Za-z0-9_-]{32,128}$/;
const FIELDS = ["codeChallenge", "nonce", "clientId"];

/** Untrusted query parameters never select a callback, host or client identity. */
export function challengeParameters(search: string): ChallengeParameters | null {
  const params = new URLSearchParams(search);
  if ([...params.keys()].some((key) => !FIELDS.includes(key))) return null;
  if (FIELDS.some((key) => params.getAll(key).length !== 1)) return null;
  const codeChallenge = params.get("codeChallenge") ?? "";
  const nonce = params.get("nonce") ?? "";
  if (
    !digest.test(codeChallenge) ||
    !digest.test(nonce) ||
    params.get("clientId") !== MOBILE_CLIENT_ID
  ) {
    return null;
  }
  return { codeChallenge, nonce, clientId: MOBILE_CLIENT_ID };
}

/** Only a short-lived code and its matching state enter the fixed preview callback. */
export function completionUrl(value: unknown, nonce: string): string {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("invalid");
  const response = value as Partial<MobileAuthorizeResponse>;
  if (
    Object.keys(response).length !== 2 ||
    typeof response.code !== "string" ||
    !code.test(response.code) ||
    response.state !== nonce ||
    !digest.test(nonce)
  ) {
    throw new Error("invalid");
  }
  const callback = new URL(MOBILE_CALLBACK_URL);
  callback.searchParams.set("code", response.code);
  callback.searchParams.set("state", nonce);
  return callback.href;
}
