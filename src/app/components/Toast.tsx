import { useRef } from "preact/hooks";
import { it } from "../i18n/lang";
import { TESSERA_STEPS } from "../lib/usage";

/** After "Salva": the Timbro with the day, the lines under it and the Tessera (MB-11, MB-12). */
export interface StampInfo {
  day: string;
  lines: string[];
  /** Prices entered on this device (D-29) and the sentence of the Tessera. */
  count: number;
  tessera: string;
}

interface Props {
  text: string;
  stamp?: StampInfo;
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
  const handlers = {
    onPointerEnter: () => {
      update("pointer", true);
    },
    onPointerLeave: () => {
      update("pointer", false);
    },
    onFocusIn: () => {
      update("focus", true);
    },
    onFocusOut: () => {
      update("focus", false);
    },
  };
  if (stamp)
    return (
      <div class="toast toast--stamp" {...handlers}>
        <div class="stamp-card">
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
          {onUndo && (
            <button type="button" class="btn stamp__undo" onClick={onUndo}>
              {it.add.undo}
            </button>
          )}
        </div>
        <div class="tessera">
          <p class="tessera__title">{stamp.tessera}</p>
          <ol class="tessera__steps" aria-hidden="true">
            {TESSERA_STEPS.map((step) => (
              <li key={step} class={stamp.count >= step ? "tessera__step--on" : undefined}>
                {step}
              </li>
            ))}
          </ol>
        </div>
        {onUndo && more && (
          <button type="button" class="btn btn--primary stamp__more" onClick={more.run}>
            {more.label}
          </button>
        )}
        {onUndo && <span class="toast__progress" aria-hidden="true" />}
      </div>
    );
  return (
    <div class="toast" {...handlers}>
      <span>{text}</span>
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
