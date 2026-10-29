import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { msToNextChange, themeAt } from "../../src/shared/theme";

// ADR 0025: light by day, dark from 21:30 to 06:00 on the device clock; the phone setting is ignored.
const at = (h: number, m = 0, s = 0) => new Date(2026, 9, 19, h, m, s);

describe("themeAt", () => {
  it.each([
    [0, 0, "dark"],
    [5, 59, "dark"],
    [6, 0, "light"],
    [12, 0, "light"],
    [18, 30, "light"],
    [21, 29, "light"],
    [21, 30, "dark"],
    [23, 59, "dark"],
  ] as const)("%i:%i → %s", (h, m, theme) => {
    expect(themeAt(at(h, m))).toBe(theme);
  });
});

describe("msToNextChange", () => {
  it("counts down to 21:30 by day and to 06:00 at night", () => {
    expect(msToNextChange(at(21, 0))).toBe(30 * 60_000);
    expect(msToNextChange(at(10, 0, 30))).toBe((11 * 60 + 30) * 60_000 - 30_000);
    expect(msToNextChange(at(23, 0))).toBe(7 * 3_600_000);
    expect(msToNextChange(at(2, 0))).toBe(4 * 3_600_000);
  });
  it("is the whole next period at the exact switch minute, and never under a second", () => {
    expect(msToNextChange(at(21, 30))).toBe((8 * 60 + 30) * 60_000);
    expect(msToNextChange(at(6, 0))).toBe((15 * 60 + 30) * 60_000);
    expect(msToNextChange(at(21, 29, 59))).toBeGreaterThanOrEqual(1000);
  });
});

describe("public/theme.js", () => {
  const script = readFileSync("public/theme.js", "utf8");
  interface FakePage {
    documentElement: { dataset: Record<string, string> };
    createElement: () => { href?: string; setAttribute: () => void };
    head: { appendChild: () => void };
  }
  /** Runs the first-paint script with a fake page and clock; returns the theme it sets. */
  function themeOfScript(date: Date): string | undefined {
    const root: FakePage["documentElement"] = { dataset: {} };
    const links: { href?: string; setAttribute: () => void }[] = [];
    const page: FakePage = {
      documentElement: root,
      createElement: () => {
        const link: { href?: string; setAttribute: () => void } = { setAttribute: () => undefined };
        links.push(link);
        return link;
      },
      head: { appendChild: () => undefined },
    };
    class FixedDate extends Date {
      constructor() {
        super(date.getTime());
      }
    }
    // The script is ours and the only code run; a function keeps the fakes out of the global scope.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const run = new Function("document", "Date", script) as (p: FakePage, d: unknown) => void;
    run(page, FixedDate);
    expect(links[0]?.href).toBe(`/map-italia-${root.dataset["theme"] ?? ""}.webp`);
    return root.dataset["theme"];
  }

  it("does not ask for the picture at high priority: it would compete with the script that draws it (ADR 0045)", () => {
    expect(script).not.toMatch(/setAttribute\(\s*["']fetchpriority/);
    expect(script).not.toMatch(/\.fetchPriority\s*=/);
  });

  it("gives the same theme as the app for every minute of the day", () => {
    for (let minutes = 0; minutes < 24 * 60; minutes++) {
      const date = at(Math.floor(minutes / 60), minutes % 60);
      expect(themeOfScript(date), `minute ${String(minutes)}`).toBe(themeAt(date));
    }
  });
});
