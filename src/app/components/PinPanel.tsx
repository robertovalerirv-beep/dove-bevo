import { useEffect, useRef } from "preact/hooks";
import { it } from "../i18n/it";
import type { Venue } from "../lib/data";

interface Props {
  name: string;
  /** False while the map is too far out to point at one building. */
  close: boolean;
  /** True once the user has touched the map: the pin is theirs, not the device's position. */
  touched: boolean;
  sending: boolean;
  /** Known bars within 150 m with a similar name: maybe the bar already exists. */
  similar: Venue[];
  onPick: (venue: Venue) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Placing the pin of a proposed bar: the map stays usable, a cross marks the centre (SPEC 7.5). */
export function PinPanel({
  name,
  close,
  touched,
  sending,
  similar,
  onPick,
  onConfirm,
  onCancel,
}: Props) {
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    title.current?.focus();
  }, []);
  const ready = close && touched && !sending;
  return (
    <section class="pin" aria-labelledby="pin-title">
      <h2 id="pin-title" class="pin__title" tabIndex={-1} ref={title}>
        {it.propose.pinTitle(name)}
      </h2>
      <p id="pin-hint" class="hint">
        {close ? it.propose.pinHelp : it.propose.pinCloser}
      </p>
      {similar.length > 0 && (
        <>
          <p class="pin__similar">{it.propose.similar}</p>
          <ul class="rows rows--bars">
            {similar.map((v) => (
              <li key={v.key}>
                <button
                  type="button"
                  class="row"
                  onClick={() => {
                    onPick(v);
                  }}
                >
                  <span class="row__name">{v.name}</span>
                  <span class="row__meta">{v.addr || it.kinds[v.kind]}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <div class="pin__actions">
        <button
          type="button"
          class="btn btn--secondary"
          aria-disabled={sending ? "true" : undefined}
          onClick={() => {
            if (!sending) onCancel();
          }}
        >
          {it.propose.cancel}
        </button>
        <button
          type="button"
          class="btn btn--primary"
          aria-disabled={ready ? undefined : "true"}
          aria-describedby="pin-hint"
          onClick={() => {
            if (ready) onConfirm();
          }}
        >
          {sending ? it.propose.sending : it.propose.confirm}
        </button>
      </div>
    </section>
  );
}
