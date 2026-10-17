import { useRef } from "preact/hooks";
import { it } from "../i18n/it";

interface Props {
  text: string;
  /** After "Salva": the Timbro with the day, and the lines of Copertura and Tessera (MB-11). */
  stamp?: { day: string; lines: string[] };
  onUndo?: () => void;
  /** A second action next to "Annulla", e.g. "Aggiungi un altro drink qui". */
  more?: { label: string; run: () => void };
  /** True while the pointer or the focus is on the toast: its timers stop (WCAG 2.2.1). */
  onHold?: (held: boolean) => void;
}

/** Short message above the attribution; optional "Annulla" with a progress bar (SPEC 7.3). */
export function Toast({ text, stamp, onUndo, more, onHold }: Props) {
  const held = useRef({ pointer: false, focus: false });
  const update = (key: "pointer" | "focus", value: boolean) => {
    held.current[key] = value;
    onHold?.(held.current.pointer || held.current.focus);
  };
  return (
    <div
      class={stamp ? "toast toast--stamp" : "toast"}
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
      {stamp ? (
        <div class="stamp">
          <span class="stamp__mark" aria-hidden="true">
            {stamp.day}
          </span>
          <span class="stamp__text">
            <strong>{text}</strong>
            {stamp.lines.map((line) => (
              <span key={line} class="stamp__line">
                {line}
              </span>
            ))}
          </span>
        </div>
      ) : (
        <span>{text}</span>
      )}
      {onUndo && (
        <>
          <button type="button" class="toast__action" onClick={onUndo}>
            {it.add.undo}
          </button>
          {more && (
            <button type="button" class="toast__action" onClick={more.run}>
              {more.label}
            </button>
          )}
          <span class="toast__progress" aria-hidden="true" />
        </>
      )}
    </div>
  );
}
