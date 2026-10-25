import { useEffect, useState } from "preact/hooks";
import type { VerifiedList } from "../../shared/api-types";
import { isValidDay, rangeText, type DayHours, type WeekHours } from "../../shared/hours";
import { it } from "../i18n/it";
import { findBars } from "../lib/admin-find";
import { invalidateCell, type Venue } from "../lib/data";
import { formatDate } from "../lib/format";

// /admin/verificati (SPEC 7.10, D-34): turn «Gestore verificato» on or off and write the hours.
// Behind Cloudflare Access like /admin; the Worker verifies the JWT on /api/admin/*. Contracts,
// payments and dates stay out of the app: a bar is verified while it has a row, nothing else.

const t = it.admin.verified;
const DAYS = it.verified.days;

interface Target {
  key: string;
  cell: string;
  name: string;
}

/** One day of the form, as typed: times are "HH:MM" from <input type="time"> or "". */
interface DayForm {
  closed: boolean;
  open: string;
  close: string;
  reopen: string;
  reclose: string;
}

const blankDay = (): DayForm => ({ closed: false, open: "", close: "", reopen: "", reclose: "" });

function toForm(week: WeekHours | undefined): DayForm[] {
  return DAYS.map((_, i) => {
    const day = week?.[i];
    if (!day) return blankDay();
    if (day.length === 0) return { ...blankDay(), closed: true };
    return {
      closed: false,
      open: day[0]?.[0] ?? "",
      close: day[0]?.[1] ?? "",
      reopen: day[1]?.[0] ?? "",
      reclose: day[1]?.[1] ?? "",
    };
  });
}

/** The week to send, or the index of the first day that is not valid (checked as the Worker does). */
function fromForm(days: DayForm[]): WeekHours | number {
  const week: WeekHours = [];
  for (const [i, d] of days.entries()) {
    const day: DayHours = [];
    if (!d.closed) {
      if (d.open || d.close) day.push([d.open, d.close]);
      if (d.reopen || d.reclose) day.push([d.reopen, d.reclose]);
      // A day is either closed or has at least one complete range.
      if (day.length === 0 || !isValidDay(day)) return i;
    }
    week.push(day);
  }
  return week;
}

const dayText = (day: DayHours) =>
  day.length === 0 ? it.verified.closed : day.map(rangeText).join(it.verified.rangeJoin);

async function post(path: string, body: unknown): Promise<boolean> {
  try {
    const response = await fetch(`/api/admin/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function VerifiedPage() {
  const [data, setData] = useState<VerifiedList | null>(null);
  const [state, setState] = useState<"loading" | "denied" | "failed" | "ready">("loading");
  const [message, setMessage] = useState("");
  const [version, setVersion] = useState(0);
  // The bar whose hours are open in the form: one at a time.
  const [editing, setEditing] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/admin/verified")
      .then(async (response) => {
        if (response.status === 401 || response.status === 403) {
          setState("denied");
          return;
        }
        if (!response.ok) {
          setState("failed");
          return;
        }
        setData((await response.json()) as VerifiedList);
        setState("ready");
      })
      .catch(() => {
        setState("failed");
      });
  }, [version]);

  const saved = (cell: string) => {
    invalidateCell(cell);
    setEditing(null);
    setMessage(t.saved);
    setVersion((n) => n + 1);
  };

  async function remove(bar: Target) {
    if (!window.confirm(t.confirmRemove(bar.name))) return;
    if (await post("verified/remove", { venue: bar.key })) {
      invalidateCell(bar.cell);
      setMessage(t.removed);
      setVersion((n) => n + 1);
    } else setMessage(t.removeFailed);
  }

  const verified = data?.v ?? [];
  return (
    <main class="admin">
      <header class="admin__head">
        <h1>{t.title}</h1>
        <a class="btn btn--secondary" href="/admin">
          {t.back}
        </a>
      </header>
      <p class="hint">{t.intro}</p>
      <p class="hint" role="status">
        {state === "loading" ? it.admin.loading : message}
      </p>
      {state === "denied" && (
        <p class="error" role="alert">
          {it.admin.denied}
        </p>
      )}
      {state === "failed" && (
        <p class="error" role="alert">
          {t.loadFailed}
        </p>
      )}
      {state === "ready" && data && (
        <>
          <section aria-labelledby="verified-active">
            <h2 class="section-title" id="verified-active">
              {t.activeTitle} ({verified.length})
            </h2>
            {verified.length === 0 && <p class="hint">{t.none}</p>}
            <ul class="admin__list" aria-label={t.activeTitle}>
              {verified.map((bar) => {
                const views = data.views.filter(([key]) => key === bar.key);
                const total = views.reduce((sum, [, , n]) => sum + n, 0);
                return (
                  <li key={bar.key}>
                    <a href={`/bar/${bar.key}?c=${bar.cell}`}>{bar.name}</a>
                    <ul class="admin__hours">
                      {bar.hours.map((day, i) => (
                        <li key={i}>{`${DAYS[i] ?? ""} ${dayText(day)}`}</li>
                      ))}
                    </ul>
                    <p class="hint">{t.views(total)}</p>
                    {views.length > 0 && (
                      <details class="admin__views">
                        <summary>{t.viewsByDay}</summary>
                        <ul>
                          {views.map(([, day, n]) => (
                            <li key={day}>{`${formatDate(day)}: ${String(n)}`}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                    <span class="admin__actions">
                      <button
                        type="button"
                        class="btn btn--secondary"
                        aria-expanded={editing === bar.key}
                        onClick={() => {
                          setEditing(editing === bar.key ? null : bar.key);
                        }}
                      >
                        {t.edit}
                      </button>
                      <button type="button" class="btn btn--ghost" onClick={() => void remove(bar)}>
                        {t.remove}
                      </button>
                    </span>
                    {editing === bar.key && (
                      <HoursForm
                        bar={bar}
                        initial={bar.hours}
                        onSaved={saved}
                        onCancel={() => {
                          setEditing(null);
                        }}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
          <FindAndActivate
            verified={verified}
            editing={editing}
            setEditing={setEditing}
            onSaved={saved}
          />
        </>
      )}
    </main>
  );
}

function FindAndActivate({
  verified,
  editing,
  setEditing,
  onSaved,
}: {
  verified: VerifiedList["v"];
  editing: string | null;
  setEditing: (key: string | null) => void;
  onSaved: (cell: string) => void;
}) {
  const [city, setCity] = useState("");
  const [name, setName] = useState("");
  const [link, setLink] = useState("");
  const [found, setFound] = useState<Venue[] | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function search(e: Event) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setNote("");
    setFound(null);
    try {
      const result = await findBars({ city, name, link });
      // A proposed bar the admin has not approved is not on the map: it cannot be verified.
      setFound(result.found.filter((v) => !v.pending));
      setNote(result.note);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="verified-find">
      <h2 class="section-title" id="verified-find">
        {t.findTitle}
      </h2>
      <p class="hint">{t.findHelp}</p>
      <form class="admin__form" onSubmit={(e) => void search(e)}>
        <label>
          {t.city}
          <input
            class="field"
            value={city}
            autoComplete="off"
            onInput={(e) => {
              setCity(e.currentTarget.value);
            }}
          />
        </label>
        <label>
          {t.name}
          <input
            class="field"
            value={name}
            autoComplete="off"
            onInput={(e) => {
              setName(e.currentTarget.value);
            }}
          />
        </label>
        <label>
          {t.link}
          <input
            class="field"
            value={link}
            inputMode="url"
            autoComplete="off"
            placeholder="https://…/bar/n123?c=u0nd9"
            onInput={(e) => {
              setLink(e.currentTarget.value);
            }}
          />
        </label>
        <button type="submit" class="btn btn--primary" aria-disabled={busy ? "true" : undefined}>
          {t.search}
        </button>
      </form>
      {note && <p class="hint">{note}</p>}
      {found && found.length > 0 && (
        <ul class="admin__list" aria-label={t.results}>
          {found.map((v) => {
            const current = verified.find((b) => b.key === v.key);
            const id = `find:${v.key}`;
            return (
              <li key={v.key}>
                <a href={`/bar/${v.key}?c=${v.cell}`}>{v.name}</a> · {it.kinds[v.kind]}
                {v.addr && ` · ${v.addr}`}
                {current && ` · ${t.already}`}
                <span class="admin__actions">
                  <button
                    type="button"
                    class="btn btn--secondary"
                    aria-expanded={editing === id}
                    onClick={() => {
                      setEditing(editing === id ? null : id);
                    }}
                  >
                    {current ? t.edit : t.activate}
                  </button>
                </span>
                {editing === id && (
                  <HoursForm
                    bar={{ key: v.key, cell: v.cell, name: v.name }}
                    initial={current?.hours}
                    onSaved={onSaved}
                    onCancel={() => {
                      setEditing(null);
                    }}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Seven days, Monday first: closed, or an opening and a closing, and an optional second range. */
function HoursForm({
  bar,
  initial,
  onSaved,
  onCancel,
}: {
  bar: Target;
  initial: WeekHours | undefined;
  onSaved: (cell: string) => void;
  onCancel: () => void;
}) {
  const [days, setDays] = useState<DayForm[]>(() => toForm(initial));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (i: number, patch: Partial<DayForm>) => {
    setDays((all) => all.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  };

  async function submit(e: Event) {
    e.preventDefault();
    if (busy) return;
    setError("");
    const week = fromForm(days);
    if (typeof week === "number") {
      setError(t.badDay(DAYS[week] ?? ""));
      return;
    }
    setBusy(true);
    const ok = await post("verified", { venue: bar.key, cell: bar.cell, hours: week });
    setBusy(false);
    if (ok) onSaved(bar.cell);
    else setError(t.failed); // the hours typed stay in the form
  }

  const time = (i: number, field: "open" | "close" | "reopen" | "reclose", label: string) => (
    <label>
      {label}
      <input
        class="field"
        type="time"
        value={days[i]?.[field] ?? ""}
        disabled={days[i]?.closed}
        onInput={(e) => {
          set(i, { [field]: e.currentTarget.value });
        }}
      />
    </label>
  );

  return (
    <form class="admin__form hours-form" onSubmit={(e) => void submit(e)}>
      <h3 class="hours-form__title">{t.hoursFor(bar.name)}</h3>
      <p class="hint">{t.hoursHelp}</p>
      {DAYS.map((day, i) => (
        <fieldset class="hours-form__day" key={day}>
          <legend>{day}</legend>
          <label class="check">
            <input
              type="checkbox"
              checked={days[i]?.closed}
              onChange={(e) => {
                set(i, { closed: e.currentTarget.checked });
              }}
            />
            {t.closedDay}
          </label>
          <div class="hours-form__times">
            {time(i, "open", t.open)}
            {time(i, "close", t.close)}
            {time(i, "reopen", t.reopen)}
            {time(i, "reclose", t.reclose)}
          </div>
        </fieldset>
      ))}
      <button
        type="button"
        class="btn btn--secondary"
        onClick={() => {
          setDays((all) => all.map(() => ({ ...(all[0] ?? blankDay()) })));
        }}
      >
        {t.copy}
      </button>
      {error && (
        <p class="error" role="alert">
          {error}
        </p>
      )}
      <span class="admin__actions">
        <button type="submit" class="btn btn--primary" aria-disabled={busy ? "true" : undefined}>
          {t.save}
        </button>
        <button type="button" class="btn btn--ghost" onClick={onCancel}>
          {t.cancel}
        </button>
      </span>
    </form>
  );
}
