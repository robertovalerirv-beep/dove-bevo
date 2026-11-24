import { readFileSync } from "node:fs";
import { describe, expect, it as test } from "vitest";
import { en } from "../../src/app/i18n/en";
import { it } from "../../src/app/i18n/it";
import * as config from "../../src/shared/config";

// SPEC 1.20 (ADR 0052): after Salva no panel and no «Annulla». The price leaves at once, the bar page
// opens, and a failure says exactly why.
describe("no undo window", () => {
  test("UNDO_MS and the progress bar are gone", () => {
    expect("UNDO_MS" in config).toBe(false);
    expect(readFileSync("src/app/styles/tokens.css", "utf8")).not.toContain("--toast-duration");
    expect(readFileSync("src/app/styles/app.css", "utf8")).not.toMatch(
      /\.toast__progress|\.stamp|\.tessera/,
    );
  });

  test("no text promises seconds to undo, a Timbro or a Tessera", () => {
    for (const dict of [it, en]) {
      expect(Object.keys(dict.add)).not.toEqual(
        expect.arrayContaining(["undo", "undone", "stamp", "stampDay", "another", "coverageUp"]),
      );
      expect("tessera" in dict).toBe(false);
      expect(dict.add.seenHelp).not.toMatch(/\d/);
    }
    expect(it.add.seenHelp).toBe("Tocca un prezzo per metterlo nel campo, poi Salva.");
  });
});

describe("the messages after Salva", () => {
  test("the same price again: one line of thanks", () => {
    expect(it.add.confirmedSame).toBe(
      "Grazie, il prezzo inserito da te conferma il prezzo che era già presente.",
    );
  });

  test("each failure says its reason, in both languages", () => {
    expect(it.add.quotaDay).toBe(
      `Oggi hai già segnato ${String(config.DAILY_PRICE_QUOTA)} prezzi, il massimo per un giorno. Potrai segnarne altri da mezzanotte.`,
    );
    expect(config.DAILY_PRICE_QUOTA).toBe(30);
    expect(it.add.tooFast).toBe("Stai segnando molti prezzi di fila: aspetta un minuto e riprova.");
    expect(it.add.offline).toBe(
      "Sei offline: il prezzo non è partito. Riprova quando torna la connessione.",
    );
    expect(it.add.busy).toBe(
      "Il servizio è molto richiesto: il prezzo non è partito, riprova tra poco.",
    );
    expect(it.add.robot).toBe("Non sono riuscito a verificare che tu non sia un robot: riprova.");
    expect(it.add.underReview).toBe(
      "Il prezzo di questo drink qui è stato segnalato ed è in controllo: per ora non si può cambiare.",
    );
    expect(it.add.outOfRange("Spritz", "2,50 €", "15,00 €")).toBe(
      "Spritz: accettiamo prezzi da 2,50 € a 15,00 €. Controlla le cifre.",
    );
    expect(it.add.failed).toBe("Non sono riuscito a salvare il prezzo: riprova tra poco.");
    const keys = [
      "quotaDay",
      "tooFast",
      "offline",
      "busy",
      "robot",
      "underReview",
      "failed",
    ] as const;
    for (const k of keys) {
      expect(en.add[k].length).toBeGreaterThan(10);
      expect(en.add[k]).not.toBe(it.add[k]);
    }
    expect(en.add.outOfRange("Spritz", "2,50 €", "15,00 €")).toContain("2,50 € to 15,00 €");
  });

  test("a price in review says why it is not in the list (D-10)", () => {
    expect(it.bar.inReviewWhy("8,00 €")).toBe(
      "Molto diverso dagli altri prezzi della zona (mediana 8,00 €): entra in elenco e in mappa quando qualcun altro lo conferma.",
    );
    expect(it.bar.inReviewWhy(null)).toBe(
      "Molto diverso dagli altri prezzi della zona: entra in elenco e in mappa quando qualcun altro lo conferma.",
    );
    expect(en.bar.inReviewWhy("8,00 €")).toContain("(median 8,00 €)");
  });
});
