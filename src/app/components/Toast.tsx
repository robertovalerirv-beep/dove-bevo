import { it } from "../i18n/it";

interface Props {
  text: string;
  onUndo?: () => void;
}

/** Short message above the bottom bar, announced politely; optional "Annulla" (SPEC 7.3). */
export function Toast({ text, onUndo }: Props) {
  return (
    <div class="toast" role="status">
      <span>{text}</span>
      {onUndo && (
        <button type="button" class="toast__action" onClick={onUndo}>
          {it.add.undo}
        </button>
      )}
    </div>
  );
}
