import { useEffect, useId, useRef, useState } from "preact/hooks";
import { currentLang, it } from "@site/app/i18n/lang";

/** App map actions live above the native tabs instead of occupying a second footer. */
export function MapContributeActions({
  onAddPrice,
  onAddVenue,
}: {
  onAddPrice: () => void;
  onAddVenue: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const label = currentLang() === "en" ? "Add" : "Aggiungi";

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      root.current?.querySelector<HTMLButtonElement>(".mobile-map-actions__toggle")?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div ref={root} class="mobile-map-actions" data-testid="mobile-map-actions">
      {open && (
        <div id={menuId} class="mobile-map-actions__menu" role="group" aria-label={label}>
          <button
            type="button"
            class="btn btn--primary"
            onClick={() => {
              setOpen(false);
              onAddPrice();
            }}
          >
            {it.add.open}
          </button>
          <button
            type="button"
            class="btn btn--secondary"
            onClick={() => {
              setOpen(false);
              onAddVenue();
            }}
          >
            {it.add.addMissing}
          </button>
        </div>
      )}
      <button
        type="button"
        class="btn mobile-map-actions__toggle"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <span class="mobile-map-actions__plus" aria-hidden="true">
          ＋
        </span>
        {label}
      </button>
    </div>
  );
}
