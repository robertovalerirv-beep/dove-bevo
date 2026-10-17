import { describe, expect, it as test } from "vitest";
import { it } from "../../src/app/i18n/it";

// MB-15 (SPEC D-31): brand phrases from docs/brand/02-voce.md are in it.ts and no forbidden word is.
const FORBIDDEN = [
  "sbronz",
  "ubriac",
  "sballo",
  "shot",
  "chupito",
  "brindis",
  "brinda",
  "bevi di piu",
  "bere di piu",
  "a volonta",
  "open bar",
  "senza limiti",
  "tracanna",
  "alcolic",
];

// Every string in it.ts, with the text functions called on sample arguments.
const collect = (value: unknown, out: string[] = []): string[] => {
  if (typeof value === "string") out.push(value);
  else if (typeof value === "function") {
    for (const args of [["x"], [1], [2], [true], [1, 2], ["x", 1, "y"]]) {
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
};
const plain = (text: string) =>
  text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replaceAll("analcolic", "");

describe("MB-15 voice", () => {
  const texts = collect(it);
  test("no forbidden word in it.ts", () => {
    const hits = texts.flatMap((t) =>
      FORBIDDEN.filter((w) => plain(t).includes(w)).map((w) => `${w}: ${t}`),
    );
    expect(hits).toEqual([]);
  });

  test("the brand phrases are in it.ts", () => {
    const phrases = [
      it.add.question,
      it.add.stamp,
      it.add.undo,
      it.map.emptyZone,
      it.map.coverage(42, 180),
      it.map.zoomIn,
      it.bar.stale("3 mesi fa"),
      it.add.quota,
      it.map.position.denied,
      it.tessera.messages[5],
    ];
    expect(phrases).toEqual([
      "Quanto l'hai pagato?",
      "Segnato. Il prossimo che passa sa già quanto spende.",
      "Annulla",
      "Qui nessuno ha ancora segnato un prezzo. Il primo sei tu: ci vogliono 10 secondi.",
      "42 bar su 180 qui hanno un prezzo",
      "Avvicinati per vedere i prezzi, o cerca una città.",
      "Visto 3 mesi fa. Ci sei passato? Confermalo.",
      "Per oggi hai segnato tanto. Riprova dopo mezzanotte.",
      "Attiva la posizione per questo sito nelle impostazioni, oppure cerca una città.",
      "5 prezzi segnati. Sei di casa.",
    ]);
  });

  test("the primary button stays «Aggiungi prezzo» (SPEC 2.10)", () => {
    expect(it.add.open).toBe("Aggiungi prezzo");
  });
});
