/** Preview mobile protocol. Production identities require the separate release gates. */
export const MOBILE_API_PREFIX = "/api/mobile";
export const MOBILE_REDEEM_PATH = `${MOBILE_API_PREFIX}/session`;
export const MOBILE_CLIENT_ID = "com.dovebevo.app.preview";
export const MOBILE_CALLBACK_URL = "dovebevopreview://auth/callback";
export const MOBILE_CODE_TTL_S = 120;
export const MOBILE_SESSION_TTL_S = 30 * 60;
export const MOBILE_PROTOCOL_VERSION = 1;
export const MOBILE_NATIVE_HEADER = "X-Dovebevo-Native";
export const MOBILE_NATIVE_HEADER_VALUE = "1";

export interface MobileConfig {
  version: typeof MOBILE_PROTOCOL_VERSION;
  clientId: typeof MOBILE_CLIENT_ID;
  callbackUrl: typeof MOBILE_CALLBACK_URL;
  challengePath: "/mobile-auth";
  dataVersion: string;
}

export interface MobileAuthorizeRequest {
  token: string;
  codeChallenge: string;
  nonce: string;
  clientId: typeof MOBILE_CLIENT_ID;
}

export interface MobileAuthorizeResponse {
  code: string;
  state: string;
}

export interface MobileRedeemRequest {
  code: string;
  codeVerifier: string;
  nonce: string;
  clientId: typeof MOBILE_CLIENT_ID;
}

export interface MobileRedeemResponse {
  token: string;
  expiresIn: typeof MOBILE_SESSION_TTL_S;
}
