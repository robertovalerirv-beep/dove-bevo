import { useEffect, useState } from "preact/hooks";
import type { MetricsDay } from "../../shared/metrics";
import { it } from "../i18n/it";
import { formatDate } from "../lib/format";

// Daily usage for /admin (M5-03): visits, returning visits, prices, bars seen, contributing visits.
// Anonymous counters only (SPEC 12); fetched when the page opens, one range read of a small table.
const percent = new Intl.NumberFormat("it-IT", { style: "percent", maximumFractionDigits: 0 });
const share = (part: number, whole: number) => percent.format(whole > 0 ? part / whole : 0);

export function MetricsSection() {
  const [days, setDays] = useState<MetricsDay[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    void fetch("/api/admin/metrics")
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        const body = (await response.json()) as { days?: MetricsDay[] };
        if (!Array.isArray(body.days)) throw new Error("shape");
        setDays(body.days);
      })
      .catch(() => {
        setFailed(true);
      });
  }, []);

  const m = it.admin.metrics;
  return (
    <section class="cov" aria-labelledby="metrics-title" data-testid="metrics-section">
      <h2 class="section-title" id="metrics-title">
        {m.title}
      </h2>
      {failed && (
        <p class="hint" role="status">
          {m.failed}
        </p>
      )}
      {days?.length === 0 && <p class="hint">{m.empty}</p>}
      {days && days.length > 0 && (
        <table class="cov__table">
          <caption class="sr-only">{m.tableLabel}</caption>
          <thead>
            <tr>
              <th scope="col">{m.day}</th>
              <th scope="col">{m.opens}</th>
              <th scope="col">{m.returning}</th>
              <th scope="col">{m.added}</th>
              <th scope="col">{m.contributed}</th>
              <th scope="col" class="cov__minor">
                {m.confirmed}
              </th>
              <th scope="col" class="cov__minor">
                {m.viewed}
              </th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.day}>
                <th scope="row">{formatDate(d.day)}</th>
                <td>{d.opens}</td>
                <td>{share(d.returning, d.opens)}</td>
                <td>{d.added}</td>
                <td>{share(d.contributed, d.opens)}</td>
                <td class="cov__minor">{d.confirmed}</td>
                <td class="cov__minor">{d.viewed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p class="hint">{m.help}</p>
    </section>
  );
}
