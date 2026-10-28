import { readdirSync, readFileSync, statSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it as test, vi } from "vitest";
import { it as italian } from "../../src/app/i18n/it";
import { UNDO_MS } from "../../src/shared/config";

// SPEC 1.11, D-36 (ADR 0038): the public interface also in English, the choice kept only in memory.

/** Every public group of it.ts: all but `admin`, which stays Italian. */
const publicItalian = Object.fromEntries(Object.entries(italian).filter(([k]) => k !== "admin"));

/** Same shape as `a`: same keys, same kind of value, same length of lists. */
function shapeDiff(a: unknown, b: unknown, path = ""): string[] {
  if (typeof a === "function")
    return typeof b === "function" ? [] : [`${path}: not a function in the other language`];
  if (typeof a === "string")
    return typeof b === "string" && b.length > 0 ? [] : [`${path}: not a text`];
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return [`${path}: list of another length`];
    return a.flatMap((v, i) => shapeDiff(v, b[i], `${path}[${String(i)}]`));
  }
  if (a && typeof a === "object") {
    if (!b || typeof b !== "object") return [`${path}: missing`];
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].flatMap((k) =>
      shapeDiff(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k],
        path ? `${path}.${k}` : k,
      ),
    );
  }
  return [];
}

// Every text of a dictionary, the functions called on sample arguments.
function collect(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (typeof value === "function") {
    for (const args of [["x"], [0], [1], [2], [true], [1, 2], ["x", 1, "y"], ["a", "b", "c"]]) {
      try {
        const r = (value as (...a: unknown[]) => unknown)(...args);
        if (typeof r === "string") out.push(r);
      } catch {
        /* wrong sample arguments */
      }
    }
  } else if (value && typeof value === "object")
    Object.values(value).forEach((v) => collect(v, out));
  return out;
}

describe("ME-01 the English dictionary", () => {
  test("has every public group of it.ts, with the same names, functions and lists", async () => {
    const { en } = await import("../../src/app/i18n/en");
    expect(shapeDiff(publicItalian, en)).toEqual([]);
  });

  test("has no admin group: the admin stays Italian", async () => {
    const { en } = await import("../../src/app/i18n/en");
    expect("admin" in en).toBe(false);
  });

  test("every function gives a text, and no text is left empty or in Italian by mistake", async () => {
    const { en } = await import("../../src/app/i18n/en");
    const texts = collect(en);
    expect(texts.length).toBeGreaterThan(150);
    expect(texts.filter((t) => t.trim() === "")).toEqual([]);
    // The two dictionaries differ in what the person reads (a few names are the same on purpose).
    const english = new Set(texts);
    const same = collect(publicItalian).filter(
      (t) => t.length > 12 && !t.startsWith("©") && english.has(t),
    );
    expect(same).toEqual([]);
  });

  test("the text of «Undo» promises the seconds of UNDO_MS", async () => {
    const { en } = await import("../../src/app/i18n/en");
    expect(en.add.seenHelp).toContain(`${String(UNDO_MS / 1000)} seconds`);
  });

  test("plurals follow English", async () => {
    const { en } = await import("../../src/app/i18n/en");
    expect(en.search.results(1)).toBe("1 result");
    expect(en.search.results(3)).toBe("3 results");
    expect(en.bar.confirmations(0)).toBe("No confirmations");
    expect(en.bar.confirmations(1)).toBe("1 confirmation");
    expect(en.bar.confirmations(4)).toBe("4 confirmations");
    expect(en.bar.drinkCount(1)).toBe("1 drink");
    expect(en.tessera.count(1)).toBe("1 price logged.");
  });
});

describe("ME-03 the language lives in memory only", () => {
  const writes: string[] = [];
  const store = () => ({
    getItem: () => null,
    removeItem: () => undefined,
    clear: () => undefined,
    key: () => null,
    length: 0,
    setItem: (k: string) => {
      writes.push(k);
    },
  });
  const root = { lang: "it" };

  beforeEach(() => {
    writes.length = 0;
    root.lang = "it";
    vi.stubGlobal("localStorage", store());
    vi.stubGlobal("sessionStorage", store());
    vi.stubGlobal("document", {
      documentElement: root,
      set cookie(value: string) {
        writes.push(`cookie:${value}`);
      },
      get cookie() {
        return "";
      },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.doUnmock("../../src/app/i18n/en");
    vi.resetModules();
  });

  test("starts in Italian", async () => {
    const lang = await import("../../src/app/i18n/lang");
    expect(lang.currentLang()).toBe("it");
    expect(lang.it.add.open).toBe("Aggiungi prezzo");
  });

  test("setLang switches the texts, tells the listeners and sets <html lang>", async () => {
    const lang = await import("../../src/app/i18n/lang");
    const heard = vi.fn();
    const stop = lang.subscribeLang(heard);
    await lang.setLang("en");
    expect(lang.currentLang()).toBe("en");
    expect(lang.it.add.open).toBe("Add a price");
    expect(root.lang).toBe("en");
    expect(heard).toHaveBeenCalledTimes(1);
    await lang.setLang("it");
    expect(lang.it.add.open).toBe("Aggiungi prezzo");
    expect(root.lang).toBe("it");
    expect(heard).toHaveBeenCalledTimes(2);
    stop();
    await lang.setLang("en");
    expect(heard).toHaveBeenCalledTimes(2);
  });

  test("choosing the language already shown does nothing", async () => {
    const lang = await import("../../src/app/i18n/lang");
    const heard = vi.fn();
    lang.subscribeLang(heard);
    await lang.setLang("it");
    expect(heard).not.toHaveBeenCalled();
  });

  test("a failed download of the English file changes nothing: the language, the page and the listeners stay", async () => {
    vi.doMock("../../src/app/i18n/en", () => {
      throw new Error("offline");
    });
    const lang = await import("../../src/app/i18n/lang");
    const heard = vi.fn();
    lang.subscribeLang(heard);
    await expect(lang.setLang("en")).rejects.toThrow();
    expect(lang.currentLang()).toBe("it");
    expect(lang.it.add.open).toBe("Aggiungi prezzo");
    expect(root.lang).toBe("it");
    expect(heard).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  test("the last choice wins when two are made quickly", async () => {
    const lang = await import("../../src/app/i18n/lang");
    const first = lang.setLang("en");
    const second = lang.setLang("it");
    await Promise.all([first, second]);
    expect(lang.currentLang()).toBe("it");
    expect(lang.it.add.open).toBe("Aggiungi prezzo");
  });

  test("writes nothing: no localStorage, no sessionStorage, no cookie", async () => {
    const lang = await import("../../src/app/i18n/lang");
    await lang.setLang("en");
    await lang.setLang("it");
    expect(writes).toEqual([]);
  });
});

describe("ME-06 / ME-08 who imports what", () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = `${dir}/${name}`;
      if (!statSync(path).isFile()) return files(path);
      return /\.(ts|tsx)$/.test(name) ? [path] : [];
    });

  test("the admin pages and the Worker stay on the Italian file", () => {
    const admin = [
      "src/app/views/AdminPage.tsx",
      "src/app/views/Coverage.tsx",
      "src/app/views/CityBars.tsx",
      "src/app/views/Metrics.tsx",
      "src/app/views/VerifiedPage.tsx",
      "src/app/lib/admin-find.ts",
      ...files("src/worker"),
    ];
    for (const file of admin) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/i18n\/(lang|en)["']/);
    }
  });

  test("the English file is loaded on request, never imported statically", () => {
    const offenders = files("src").filter((file) => {
      if (file.endsWith("src/app/i18n/en.ts")) return false;
      const source = readFileSync(file, "utf8");
      return /(?:import|export)[^;]*from\s*["'][^"']*i18n\/en["']/.test(source);
    });
    expect(offenders).toEqual([]);
    expect(readFileSync("src/app/i18n/lang.ts", "utf8")).toMatch(/import\(\s*["']\.\/en["']\s*\)/);
  });

  test("src/app/i18n is in the Worker's TypeScript project: no preact and no DOM in it", () => {
    for (const file of files("src/app/i18n")) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/from\s*["']preact/);
      expect(source, file).not.toMatch(/\b(document|window|navigator)\./);
    }
  });

  test("the public files read the live dictionary of lang.ts", () => {
    const stale = files("src/app")
      .filter(
        (file) =>
          file.includes("src/app/components/") ||
          file.endsWith("src/app/app.tsx") ||
          file.endsWith("src/app/views/LegalPage.tsx") ||
          file.endsWith("src/app/lib/maplibre-map.ts"),
      )
      .filter((file) => /from\s*["'][^"']*i18n\/it["']/.test(readFileSync(file, "utf8")));
    expect(stale).toEqual([]);
  });
});
