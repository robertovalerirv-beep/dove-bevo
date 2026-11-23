import { useRef } from "preact/hooks";

interface Props {
  text: string;
  /** Read out only, nothing drawn: "Prezzo salvato" after Salva, the bar page is the confirmation (SPEC 1.20). */
  quiet?: boolean;
  /** True while the pointer or the focus is on the toast: its timer stops (WCAG 2.2.1). */
  onHold?: (held: boolean) => void;
}

/** Short message of one line above the attribution, gone by itself (SPEC 7.3). */
export function Toast({ text, quiet, onHold }: Props) {
  const held = useRef({ pointer: false, focus: false });
  if (quiet) return <p class="sr-only">{text}</p>;
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
    </div>
  );
}
