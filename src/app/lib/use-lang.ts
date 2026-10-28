import { useEffect, useState } from "preact/hooks";
import { currentLang, subscribeLang, type Lang } from "../i18n/lang";

/** Renders the component again when the language changes; returns the language in use (SPEC 7.11). */
export function useLang(): Lang {
  const [, bump] = useState(0);
  useEffect(
    () =>
      subscribeLang(() => {
        bump((n) => n + 1);
      }),
    [],
  );
  return currentLang();
}
