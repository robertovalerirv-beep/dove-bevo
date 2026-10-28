import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { it, setLang, type Lang } from "../i18n/lang";
import { useLang } from "../lib/use-lang";

const LANGS: Lang[] = ["it", "en"];

/**
 * The language menu (SPEC 7.11, D-36): a 48 px button with the language in use, and a list of the two
 * languages, each named in itself. The choice is kept in memory only; the page does not reload.
 */
export function LangMenu({ className = "" }: { className?: string }) {
  const lang = useLang();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  // A tap outside closes the list (same as the drink menu).
  useLayoutEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => {
      document.removeEventListener("pointerdown", outside);
    };
  }, [open]);

  return (
    <div
      class={`lang-menu ${className}`}
      ref={root}
      onKeyDown={(event) => {
        // Tabbing out of the list leaves it open over the page: close it once the focus is gone.
        if (event.key === "Tab" && open) {
          setTimeout(() => {
            if (!root.current?.contains(document.activeElement)) setOpen(false);
          }, 0);
        }
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          setOpen(false);
          button.current?.focus();
        }
      }}
    >
      <button
        type="button"
        class="btn icon-btn lang-menu__button"
        ref={button}
        aria-label={`${it.lang.menu}: ${lang.toUpperCase()}`}
        aria-expanded={open}
        aria-controls="lang-menu-list"
        onClick={() => {
          setOpen(!open);
        }}
      >
        {lang.toUpperCase()}
      </button>
      <div
        id="lang-menu-list"
        class="lang-menu__list"
        role="group"
        aria-label={it.lang.menu}
        hidden={!open}
      >
        {LANGS.map((code) => (
          <button
            key={code}
            type="button"
            lang={code}
            class="btn lang-menu__option"
            aria-current={code === lang ? "true" : undefined}
            onClick={() => {
              setOpen(false);
              button.current?.focus();
              void setLang(code);
            }}
          >
            {code === "it" ? it.lang.italian : it.lang.english}
          </button>
        ))}
      </div>
    </div>
  );
}
