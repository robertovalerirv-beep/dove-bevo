import type { ComponentChildren } from "preact";
import { useId, useLayoutEffect, useRef } from "preact/hooks";
import { it } from "../i18n/lang";
import { Icon } from "./Icon";

interface Props {
  title: string;
  onClose: () => void;
  /** Shown at the top left when the sheet has a previous step. */
  onBack?: () => void;
  /**
   * Steps of «Aggiungi prezzo» (SPEC 7.3, 1.19): «Indietro» shows only the arrow (its name stays for
   * screen readers) and the bar name is a subtitle, so it is read in full.
   */
  iconBack?: boolean;
  /** Changes when the content is swapped (a new step): focus moves to its `[autofocus]` element. */
  step?: string;
  /** The content writes its own title (the bar receipt): the sheet only shows a grip and a close button. */
  bare?: boolean;
  children: ComponentChildren;
}

/** Bottom sheet on a native modal <dialog>: focus trap, Esc and inert background for free. */
export function Sheet({ title, onClose, onBack, iconBack, step, bare, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  // Layout effects run in order: open the dialog first, then move focus into it.
  useLayoutEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      dialog?.close();
      if (opener?.isConnected) opener.focus();
    };
  }, []);
  // Layout effect: still inside the tap that changed step, so phones open the keyboard on a field.
  // WebKit does not always honour autofocus inside showModal(), hence the explicit focus.
  useLayoutEffect(() => {
    const dialog = ref.current;
    (dialog?.querySelector<HTMLElement>("[autofocus]") ?? dialog?.querySelector("h2"))?.focus();
  }, [step]);
  return (
    <dialog
      ref={ref}
      class={bare ? "sheet sheet--bare" : "sheet"}
      aria-labelledby={bare ? undefined : titleId}
      aria-label={bare ? title : undefined}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      {bare && (
        <div class="sheet__grip">
          <span aria-hidden="true" />
          <button type="button" class="btn btn--ghost sheet__x" onClick={onClose}>
            <Icon name="close" />
            <span class="sr-only">{it.common.close}</span>
          </button>
        </div>
      )}
      {!bare && (
        <div class={iconBack ? "sheet__head sheet__head--steps" : "sheet__head"}>
          {onBack && (
            <button
              type="button"
              class={
                iconBack
                  ? "btn btn--ghost sheet__back sheet__back--icon"
                  : "btn btn--ghost sheet__back"
              }
              onClick={onBack}
            >
              <Icon name="back" />
              {iconBack ? <span class="sr-only">{it.add.back}</span> : it.add.back}
            </button>
          )}
          <h2 id={titleId} class="sheet__title" tabIndex={-1}>
            {title}
          </h2>
          <button type="button" class="btn btn--ghost" onClick={onClose}>
            <Icon name="close" />
            {it.common.close}
          </button>
        </div>
      )}
      <div class="sheet__body">{children}</div>
    </dialog>
  );
}
