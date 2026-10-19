// Applies the theme of the hour to the page and keeps it up to date (SPEC D-27, ADR 0025).
import { msToNextChange, themeAt, type Theme } from "../../shared/theme";

export const THEME_EVENT = "themechange";

/** The theme the page is drawn in now (set by /theme.js before the first paint). */
export const currentTheme = (): Theme =>
  document.documentElement.dataset["theme"] === "dark" ? "dark" : "light";

function apply(): void {
  const next = themeAt(new Date());
  if (next === currentTheme()) return;
  document.documentElement.dataset["theme"] = next;
  window.dispatchEvent(new Event(THEME_EVENT));
}

/** Re-checks at the minute the theme changes, and when the page comes back to the foreground. */
export function watchTheme(): void {
  apply();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    clearTimeout(timer);
    // setTimeout caps at 2^31 ms; the next change is always under 24 hours away.
    timer = setTimeout(() => {
      apply();
      schedule();
    }, msToNextChange(new Date()));
  };
  schedule();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    apply();
    schedule();
  });
}
