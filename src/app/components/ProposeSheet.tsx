import { useState } from "preact/hooks";
import { validVenueName } from "../../shared/venue";
import { it } from "../i18n/it";
import { Sheet } from "./Sheet";

export type ProposedKind = 1 | 2 | 4;
export interface Proposal {
  name: string;
  kind: ProposedKind;
}

const KINDS: ProposedKind[] = [1, 2, 4];

interface Props {
  onNext: (proposal: Proposal) => void;
  onClose: () => void;
}

/** "Non trovi il bar?" (SPEC 7.5): name and kind; the pin on the map comes next. */
export function ProposeSheet({ onNext, onClose }: Props) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ProposedKind>(1);
  const [error, setError] = useState("");

  return (
    <Sheet title={it.propose.title} onClose={onClose} step="propose">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!validVenueName(name)) {
            setError(it.propose.badName);
            return;
          }
          onNext({ name: name.normalize("NFC").trim(), kind });
        }}
      >
        <label class="field-label" for="venue-name">
          {it.propose.name}
        </label>
        <input
          id="venue-name"
          type="text"
          class="field"
          autocomplete="off"
          maxLength={80}
          autofocus
          aria-invalid={error ? "true" : "false"}
          aria-describedby="venue-name-error"
          value={name}
          onInput={(e) => {
            setName(e.currentTarget.value);
            setError("");
          }}
        />
        <p id="venue-name-error" class="error" role="alert">
          {error || " "}
        </p>
        <fieldset class="segmented">
          <legend class="field-label">{it.propose.kind}</legend>
          {KINDS.map((k) => (
            <label key={k} class="chip">
              <input
                type="radio"
                name="kind"
                class="sr-only"
                checked={k === kind}
                onChange={() => {
                  setKind(k);
                }}
              />
              {it.propose.kinds[k]}
            </label>
          ))}
        </fieldset>
        <button type="submit" class="btn btn--primary" disabled={!name.trim()}>
          {it.propose.next}
        </button>
      </form>
    </Sheet>
  );
}
