import { useRef } from "preact/hooks";
import { it } from "../i18n/it";

interface Props {
  text: string;
  onUndo?: () => void;
  /** True while the pointer or the focus is on the toast: its timers stop (WCAG 2.2.1). */
  onHold?: (held: boolean) => void;
}

/** Short message above the attribution; optional "Annulla" with a progress bar (SPEC 7.3). */
export function Toast({ text, onUndo, onHold }: Props) {
  const held = useRef({ pointer: false, focus: false });
  const update = (key: "pointer" | "focus", value: boolean) => {
    held.current[key] = value;
    onHold?.(held.current.pointer || held.current.focus);
  };
  return (
    <div
      class="toast"
      onPointerEnter={() => {
        update("pointer", true);
      }}
      onPointerLeave={() => {
        update("pointer", false);
      }}
      onFocusIn={() => {
        update("focus", true);
      }}
      onFocusOut={() => {
        update("focus", false);
      }}
    >
      <span>{text}</span>
      {onUndo && (
        <>
          <button type="button" class="toast__action" onClick={onUndo}>
            {it.add.undo}
          </button>
          <span class="toast__progress" aria-hidden="true" />
        </>
      )}
    </div>
  );
}
