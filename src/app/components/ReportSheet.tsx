import { useState } from "preact/hooks";
import { it } from "../i18n/lang";
import { Sheet } from "./Sheet";

export type Reason = keyof typeof it.report.reasons;

interface Props {
  /** A price report offers "Prezzo sbagliato"; a bar report does not. */
  onPrice: boolean;
  onSend: (reason: Reason) => void;
  onClose: () => void;
}

/** Closed reasons only, no free text (SPEC 7.2, D-07). */
export function ReportSheet({ onPrice, onSend, onClose }: Props) {
  const reasons = (Object.keys(it.report.reasons) as Reason[]).filter(
    (r) => onPrice || r !== "wrong_price",
  );
  const [reason, setReason] = useState<Reason | null>(null);
  return (
    <Sheet title={it.report.title} onClose={onClose}>
      <fieldset class="choices">
        <legend class="sr-only">{it.report.title}</legend>
        {reasons.map((r) => (
          <label key={r} class="choice">
            <input
              type="radio"
              name="reason"
              value={r}
              checked={reason === r}
              onChange={() => {
                setReason(r);
              }}
            />
            {it.report.reasons[r]}
          </label>
        ))}
      </fieldset>
      <button
        type="button"
        class="btn btn--primary"
        disabled={!reason}
        onClick={() => {
          if (reason) onSend(reason);
        }}
      >
        {it.report.send}
      </button>
    </Sheet>
  );
}
