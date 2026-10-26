import { useEffect, useState } from "preact/hooks";
import type {
  ContributionRestriction,
  RestrictionOverview,
} from "../../shared/contribution-restrictions";
import { it } from "../i18n/it";

export interface RestrictionTarget {
  family: "price" | "proposal";
  venue: string;
  drink?: string;
  hh?: 0 | 1;
  label: string;
}
const inputFor = (ref: ContributionRestriction) => {
  const [venue, drink, hh] = ref.target.split("|");
  return {
    family: ref.family,
    venue,
    day: ref.day,
    ...(ref.family === "price" ? { drink, hh: Number(hh) } : {}),
  };
};

/** Explicit content/day cohorts. Dates in the review queue are deliberately never preselected. */
export function ContributionRestrictions({
  targets,
  version,
  act,
}: {
  targets: RestrictionTarget[];
  version: number;
  act: (path: string, body: unknown) => Promise<boolean>;
}) {
  const [data, setData] = useState<RestrictionOverview | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState("");
  const [day, setDay] = useState("");
  useEffect(() => {
    let live = true;
    void fetch("/api/admin/restrictions")
      .then(async (response) => {
        if (!response.ok) throw new Error("restrictions");
        const body = (await response.json()) as RestrictionOverview;
        if (live) {
          setData(body);
          setFailed(false);
        }
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [version]);
  const key = (t: RestrictionTarget) =>
    `${t.family}|${t.venue}|${t.drink ?? ""}|${String(t.hh ?? "")}`;
  const target = targets.find((t) => key(t) === selected);
  return (
    <section id="contribution-restrictions" aria-labelledby="restrictions-title">
      <h2 class="section-title" id="restrictions-title">
        {it.admin.restrictions.title}
      </h2>
      <p class="hint">{it.admin.restrictions.help}</p>
      <p class="hint">{it.admin.restrictions.warning}</p>
      {failed && (
        <p class="error" role="alert">
          {it.admin.restrictions.failed}
        </p>
      )}
      {data && (
        <>
          <p class="hint">
            {it.admin.restrictions.capacity(data.restrictions.length, data.capacity)}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (
                !target ||
                !data.days.includes(day) ||
                !window.confirm(it.admin.restrictions.warning)
              )
                return;
              void act("restrictions", {
                family: target.family,
                venue: target.venue,
                ...(target.family === "price" ? { drink: target.drink, hh: target.hh } : {}),
                day,
              });
            }}
          >
            <label>
              {it.admin.restrictions.target}
              <select
                class="field"
                value={selected}
                onChange={(e) => {
                  setSelected(e.currentTarget.value);
                }}
                required
              >
                <option value="">{it.admin.restrictions.choose}</option>
                {targets.map((t) => (
                  <option key={key(t)} value={key(t)}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {it.admin.restrictions.day}
              <select
                class="field"
                value={day}
                onChange={(e) => {
                  setDay(e.currentTarget.value);
                }}
                required
              >
                <option value="">{it.admin.restrictions.choose}</option>
                {data.days.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <button
              class="btn btn--secondary"
              type="submit"
              disabled={
                !target || !data.days.includes(day) || data.restrictions.length >= data.capacity
              }
            >
              {it.admin.restrictions.add}
            </button>
          </form>
          {data.restrictions.length === 0 ? (
            <p class="hint">{it.admin.none}</p>
          ) : (
            <ul class="admin__list">
              {data.restrictions.map((r) => (
                <li key={`${r.family}|${r.target}|${r.day}`}>
                  <p>
                    {it.admin.restrictions[r.family]} · {r.target} · {r.day}
                  </p>
                  <p class="hint">
                    {it.admin.restrictions.expires(
                      new Intl.DateTimeFormat("it-IT", {
                        timeZone: "Europe/Rome",
                        dateStyle: "short",
                        timeStyle: "short",
                      }).format(new Date(r.expires_at)),
                    )}
                  </p>
                  <button
                    class="btn btn--ghost"
                    type="button"
                    onClick={() => void act("restrictions/revoke", inputFor(r))}
                  >
                    {it.admin.restrictions.revoke}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
