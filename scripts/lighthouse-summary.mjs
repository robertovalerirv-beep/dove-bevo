// Prints the key metrics of the Lighthouse reports in .lighthouseci/ (CI log aid).
import { readdirSync, readFileSync } from "node:fs";

for (const name of readdirSync(".lighthouseci").filter((f) => /^lhr-.*\.json$/.test(f))) {
  const r = JSON.parse(readFileSync(`.lighthouseci/${name}`, "utf8"));
  const ms = (id) => Math.round(r.audits[id]?.numericValue ?? NaN);
  const scores = Object.entries(r.categories)
    .map(([k, c]) => `${k} ${c.score}`)
    .join(" · ");
  console.log(
    `FCP ${ms("first-contentful-paint")} · LCP ${ms("largest-contentful-paint")} · TBT ${ms("total-blocking-time")} · SI ${ms("speed-index")} · CLS ${r.audits["cumulative-layout-shift"]?.numericValue} · ${scores}`,
  );
}
