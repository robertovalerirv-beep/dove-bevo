import type { ComponentChildren } from "preact";
import { useEffect, useId, useRef } from "preact/hooks";
import { it } from "../i18n/it";
import { Icon } from "./Icon";

interface Props {
  title: string;
  onClose: () => void;
  children: ComponentChildren;
}

/** Bottom sheet on a native modal <dialog>: focus trap, Esc and inert background for free. */
export function Sheet({ title, onClose, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    // WebKit does not always honour autofocus inside showModal().
    dialog?.querySelector<HTMLElement>("[autofocus]")?.focus();
    return () => {
      dialog?.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      class="sheet"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div class="sheet__head">
        <h2 id={titleId} class="sheet__title">
          {title}
        </h2>
        <button type="button" class="btn btn--ghost" onClick={onClose}>
          <Icon name="close" />
          {it.common.close}
        </button>
      </div>
      <div class="sheet__body">{children}</div>
    </dialog>
  );
}
