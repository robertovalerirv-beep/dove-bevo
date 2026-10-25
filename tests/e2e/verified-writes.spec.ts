import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "@playwright/test";
import type { WeekHours } from "../../src/shared/hours";
import { test } from "./fixtures";

// MD-07 and MD-08 on the real chain, no mocked answer: a row in the local D1, as POST
// /api/admin/verified writes it (tests/worker/verified.test.ts), and the app reads `g` and `o` from
// the Worker. Locally there is no Cloudflare Access to call the admin route itself. One bar per browser,
// so the two projects that run this file never touch the same row.
const BARS = {
  "chromium-writes": { key: "n13001337602", name: "Camparino in Galleria" },
  "webkit-writes": { key: "n10013246997", name: "Vesta" },
} as const;
const CELL = "u0nd9";
const HOURS: WeekHours = [[], [["08:00", "20:00"]], [], [], [], [["18:00", "02:00"]], []];

// Wrangler's own entry point run with node: `npx` is a .cmd file that execFileSync cannot start on Windows.
const WRANGLER = join(
  dirname(fileURLToPath(import.meta.resolve("wrangler/package.json"))),
  "bin/wrangler.js",
);

/** SQL on the local D1 of the preview, as `npm run db:local` runs it. */
function d1(sql: string) {
  execFileSync(process.execPath, [WRANGLER, "d1", "execute", "DB", "--local", "--command", sql], {
    stdio: "ignore",
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
  });
}

// The snapshot row is emptied here as forgetCell does; the edge copy of the cell (Cache API, 60 s)
// cannot be reached from outside the Worker, so the page is read again until it has expired.
const forgetCell = `UPDATE cell_snapshot SET v = v + 1, at = 0, body = NULL WHERE cell = '${CELL}'`;

test("MD-07 MD-08 a bar saved as verified in D1 shows as such on the map, and stops when removed", async ({
  page,
}, info) => {
  test.setTimeout(240_000);
  const bar = BARS[info.project.name as keyof typeof BARS];
  const sheet = page.getByRole("dialog", { name: bar.name });
  const badge = sheet.getByText("Gestore verificato");
  const reload = async (visible: boolean) => {
    await expect(async () => {
      await page.goto(`/bar/${bar.key}?c=${CELL}`);
      await expect(sheet.getByRole("heading", { name: "Prezzi" })).toBeVisible();
      await expect(badge).toHaveCount(visible ? 1 : 0, { timeout: 1_000 });
    }).toPass({ timeout: 90_000, intervals: [2_000, 5_000] });
  };

  d1(
    `INSERT OR REPLACE INTO venues_verified (venue_key, cell, name, hours) VALUES ('${bar.key}', '${CELL}', '${bar.name.replace(/'/g, "''")}', '${JSON.stringify(HOURS)}'); ${forgetCell}`,
  );
  try {
    await reload(true);
    await expect(sheet.getByText("Sponsorizzato")).toBeVisible();
    const hours = sheet.getByRole("region", { name: "Orari" });
    await expect(hours.locator("dd")).toHaveText([
      "Chiuso",
      "08:00–20:00",
      "Chiuso",
      "Chiuso",
      "Chiuso",
      "18:00–02:00",
      "Chiuso",
    ]);
  } finally {
    d1(`DELETE FROM venues_verified WHERE venue_key = '${bar.key}'; ${forgetCell}`);
  }
  await reload(false);
  await expect(sheet.getByRole("region", { name: "Orari" })).toHaveCount(0);
});
