export interface AppEnv {
  Bindings: Env;
  /** `sid` is set by requireSession on protected routes; it is never stored (SPEC 14). */
  Variables: { start: number; sid: string };
}
