export interface AppEnv {
  Bindings: Env;
  /**
   * `sid` is set by requireSession on protected routes; it is never stored (SPEC 14).
   * `nonce` is set by securityHeaders for every request: the CSP nonce of the page, if the response is one.
   */
  Variables: { start: number; sid: string; nonce: string };
}
