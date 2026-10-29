import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validVenueName } from "../../src/shared/venue";
import { sameName } from "../../src/worker/lib/same-name";

// The rule for a bar name (SPEC 13.4): text only. A proposed name is public before the admin sees it,
// so links, contacts and invisible or invalid characters must not get through (red-team audit 22/10/2026, F-04).
describe("validVenueName: what must be refused", () => {
  const refused: [string, string][] = [
    ["a link", "https://evil.example"],
    ["a www address", "www.evil.com"],
    ["an email", "mail@bar.it"],
    ["a shortener", "bit.ly/abc"],
    ["a shortener with spaces", "bit . ly / abc"],
    ["a domain with a rare TLD", "evil.xyz"],
    ["a domain with a path", "promo.shop/x"],
    ["a messenger link", "t.me/spam"],
    ["a domain with spaces around the dot", "Bar Roma . it"],
    ["a full-width address", "ｗｗｗ．evil．ｃｏｍ"],
    ["an ideographic dot", "evil。com"],
    ["a spaced domain with a rare TLD", "evil . xyz"],
    ["a messenger link with a path", "wa.me/393331234567"],
    ["a short link with a path", "goo.gl/abc"],
    ["a word TLD with a path", "promo.club/x"],
    ["a domain with a short TLD", "x.io"],
    ["a bracketed dot", "bar[dot]com"],
    ["an obfuscated email", "bar[at]gmail"],
    ["a phone number", "Telefono 02 1234 5678"],
    ["a full-width phone number", "０２１２３４５６７８"],
    ["a line separator", "Bar \u2028 Linea"],
    ["a paragraph separator", "Bar \u2029 Para"],
    ["a private use character", "Bar \ue000 private"],
    ["a noncharacter", "Bar \ufdd0 nonchar"],
    ["an unassigned code point", "Bar \u0378 x"],
    ["a lone surrogate", "Bar \ud800 x"],
    ["a right-to-left override", "Bar\u202Eevil"],
    ["a zero-width space", "Bar\u200Bzero"],
    ["a tab", "Bar\tTab"],
    ["81 characters", "A".repeat(81)],
    ["one character", "A"],
  ];
  it.each(refused)("refuses %s", (_label, name) => {
    expect(validVenueName(name)).toBe(false);
  });
});

describe("validVenueName: what must stay accepted", () => {
  const accepted = [
    "Bistrot Duomo",
    "L'Osteria dell'Orso",
    "Caffè Più",
    "Bar & Grill",
    "St. Louis Pub",
    "Dr. Beer",
    "Smith & Co. Bar",
    "Bar.Roma",
    "Punto Club",
    "Punto Shop",
    "Punto Net",
    "Dott. De Santis",
    "Dr. De Luca",
    "Pizzeria S.Co",
    "Dot Com Bar",
    "Pasticceria G. De Rosa",
    "Bar L. De Santis",
    "Caffè G.B. De Luca",
    "Osteria Da M. Fr",
    "Bar Tizio & C. Co",
    "Bar S.Antonio/S.Marco",
    "Il Punto Club",
    "Punto Vip",
    "Punto Top",
    "Bar 24",
    "Bar 1900",
    "Pub 3 Fratelli",
    "Caffè dell'Orso 🍺",
    "Ｂａｒ Roma",
    "A".repeat(80),
    "  Bar Padded  ",
    "Bar\u00a0Roma",
    "<b>Bar</b>", // markup is text here: every place that shows a name escapes it
  ];
  it.each(accepted)("accepts %j", (name) => {
    expect(validVenueName(name)).toBe(true);
  });

  it("accepts every name of the real OpenStreetMap fixture (no false positive on real bars)", () => {
    const dir = "tests/fixtures/data/v";
    const names: string[] = [];
    for (const file of readdirSync(dir)) {
      const cell = JSON.parse(readFileSync(`${dir}/${file}`, "utf8")) as { v: [string, string][] };
      for (const venue of cell.v) names.push(venue[1]);
    }
    expect(names.length).toBeGreaterThan(500);
    expect(names.filter((name) => !validVenueName(name))).toEqual([]);
  });
});

// Audit 28/10/2026: a name written with Cyrillic or Greek letters that look Latin was not seen as the
// name of a bar already on the map, so a copy at the same spot was accepted as new.
describe("sameName: look-alike letters", () => {
  it.each([
    ["Cyrillic о and а", "Bistrot Italia", "Bistr\u043Et It\u0430li\u0430"],
    ["Cyrillic capitals", "BAR ROMA", "\u0412\u0410R R\u041E\u041C\u0410"],
    ["Cyrillic е and с", "Caffè Rec", "Caff\u0435\u0300 R\u0435\u0441"],
    ["Greek omicron and alpha", "Bar Nova", "B\u03B1r N\u03BFva"],
    ["Cyrillic Ј and а", "Bar Jazz", "Bar \u0408\u0430zz"],
  ])("%s is the same name", (_label, plain, fake) => {
    expect(sameName(plain, fake)).toBe(true);
  });

  it.each([
    ["different words", "Bar Roma", "Bar Napoli"],
    ["a letter that only looks similar in some fonts", "Bar Roma", "Bar Rorna"],
    ["a different number", "Bar 21", "Bar 22"],
  ])("%s stays different", (_label, a, b) => {
    expect(sameName(a, b)).toBe(false);
  });

  it("keeps the old behaviour: case, accents, spaces and punctuation do not matter", () => {
    expect(sameName("Caffè   dell'Angolo!", "CAFFE DELL ANGOLO")).toBe(true);
  });

  it.each([
    [
      "full-width letters",
      "Bistrot Italia",
      "\uFF22\uFF49\uFF53\uFF54\uFF52\uFF4F\uFF54 \uFF29\uFF54\uFF41\uFF4C\uFF49\uFF41",
    ],
    [
      "mathematical bold letters",
      "Bar Roma",
      "\u{1D401}\u{1D41A}\u{1D42B} \u{1D411}\u{1D428}\u{1D426}\u{1D41A}",
    ],
    ["a ligature", "Office Bar", "O\uFB03ce Bar"],
    ["full-width and Cyrillic mixed", "Bar Roma", "\uFF22\u0430r R\u043Ema"],
  ])("%s is the same name", (_label, plain, fake) => {
    expect(sameName(plain, fake)).toBe(true);
  });

  it("a look-alike letter that composes with an accent into another Cyrillic letter is still folded", () => {
    // Cyrillic е + grave accent composes into the single letter ѐ (U+0450), which a table of plain letters misses.
    expect(sameName("Caff\u00E8", "Caff\u0450")).toBe(true);
    expect(sameName("Caffe", "Caff\u0435\u0301")).toBe(true);
  });

  it("a name written entirely in Cyrillic is still equal to itself and different from another", () => {
    expect(
      sameName(
        "\u0411\u0430\u0440 \u041C\u043E\u0441\u043A\u0432\u0430",
        "\u0411\u0430\u0440 \u041C\u043E\u0441\u043A\u0432\u0430",
      ),
    ).toBe(true);
    expect(
      sameName(
        "\u0411\u0430\u0440 \u041C\u043E\u0441\u043A\u0432\u0430",
        "\u0411\u0430\u0440 \u041A\u0438\u0435\u0432",
      ),
    ).toBe(false);
  });
});
