import { describe, expect, it } from "vitest";
import { isValidWeek, rangeText, type WeekHours } from "../../src/shared/hours";

// Opening hours of a verified bar (SPEC 1.9, D-34, MD-03): one rule for the Worker and the admin form.
const closed = (): WeekHours => [[], [], [], [], [], [], []];
const week = (day: WeekHours[number]): WeekHours => [day, day, day, day, day, day, day];

describe("isValidWeek: accepted", () => {
  const ok: [string, WeekHours][] = [
    ["closed every day", closed()],
    ["one range", week([["08:00", "20:00"]])],
    [
      "two ranges",
      week([
        ["12:00", "15:00"],
        ["18:30", "23:00"],
      ]),
    ],
    ["closing after midnight", week([["18:00", "02:00"]])],
    ["closing at midnight", week([["18:00", "00:00"]])],
    [
      "second range after midnight",
      week([
        ["07:00", "11:00"],
        ["18:00", "01:30"],
      ]),
    ],
    ["first and last minute", week([["00:00", "23:59"]])],
    ["some days closed", [[], [["07:00", "20:00"]], [], [], [], [["10:00", "02:00"]], []]],
  ];
  for (const [name, value] of ok)
    it(name, () => {
      expect(isValidWeek(value)).toBe(true);
    });
});

describe("isValidWeek: refused", () => {
  const bad: [string, unknown][] = [
    ["six days", [[], [], [], [], [], []]],
    ["eight days", [[], [], [], [], [], [], [], []]],
    ["not an array", { mon: [] }],
    ["a day that is not an array", [[], [], [], [], [], [], "chiuso"]],
    [
      "three ranges",
      week([
        ["07:00", "09:00"],
        ["10:00", "12:00"],
        ["18:00", "20:00"],
      ]),
    ],
    ["a range of one time", week([["08:00"]] as unknown as WeekHours[number])],
    ["a range of three times", week([["08:00", "12:00", "13:00"]] as unknown as WeekHours[number])],
    ["24:00", week([["18:00", "24:00"]])],
    ["hour 25", week([["25:00", "26:00"]])],
    ["minute 60", week([["08:60", "12:00"]])],
    ["no leading zero", week([["8:00", "12:00"]])],
    ["seconds", week([["08:00:00", "12:00"]])],
    ["free text", week([["dalle 8", "alle 12"]])],
    ["html", week([["<b>8</b>", "12:00"]])],
    ["a number", week([[800, 1200]] as unknown as WeekHours[number])],
    ["same open and close", week([["08:00", "08:00"]])],
    [
      "overlapping ranges",
      week([
        ["08:00", "13:00"],
        ["12:00", "15:00"],
      ]),
    ],
    [
      "touching ranges",
      week([
        ["08:00", "12:00"],
        ["12:00", "15:00"],
      ]),
    ],
    [
      "ranges out of order",
      week([
        ["18:00", "20:00"],
        ["08:00", "12:00"],
      ]),
    ],
    [
      "first range past midnight",
      week([
        ["18:00", "02:00"],
        ["10:00", "12:00"],
      ]),
    ],
    ["null", null],
  ];
  for (const [name, value] of bad)
    it(name, () => {
      expect(isValidWeek(value)).toBe(false);
    });
});

describe("rangeText", () => {
  it("writes a range with an en dash, as the receipt writes dates", () => {
    expect(rangeText(["18:00", "02:00"])).toBe("18:00–02:00");
  });
});
