import { render } from "preact";
import { AddPriceSheet, parseCents } from "../AddPriceSheet";
import { BarSheet } from "../BarSheet";
import { legacyPriceVenues } from "../../menu-v2";
import type { Draft, Prefill } from "../AddPriceSheet";
import type { Venue } from "@site/app/lib/data";
import type { PriceRow } from "@site/shared/api-types";
import { setLang } from "@site/app/i18n/lang";
import { installTrustedTypes } from "@site/app/lib/trusted-types";
import "@site/app/styles/base.css";
import "@site/app/styles/app.css";

const root = (() => {
  const element = document.getElementById("fixture-root");
  if (!element) throw new Error("Fixture root is missing");
  return element;
})();
installTrustedTypes();
const calls: { kind: string; venue?: string; drink?: string; hh?: number; cents?: number }[] = [];
const venue: Venue = {
  key: "n123",
  name: "Locale di prova <strong>",
  kind: 1,
  lat: 45.4642,
  lon: 9.19,
  addr: "Via di prova 1",
  city: "Milano",
  cell: "u0nd9",
  pending: false,
  verified: false,
  prices: [],
};
const venues: Venue[] = [600, 700, 800, 900, 1000].map((cents, index) => ({
  ...venue,
  key: `n${String(123 + index)}`,
  name: index === 0 ? venue.name : `Locale di prova ${String(index + 1)}`,
  lat: venue.lat + index * 0.0001,
  prices: [[`n${String(123 + index)}`, "spritz", 0, cents, "2026-10-28", 0, 0] as PriceRow],
}));
venues.push({ ...venue, key: "maaaaaaaaaaaaaaaaaaaaaaaa", name: "Locale solo app" });
let version = 0;
let confirmationMode: "success" | "failed" | "hold" = "success";
let releaseConfirmation: (() => void) | undefined;
function setConfirmation(mode: typeof confirmationMode) {
  confirmationMode = mode;
}
function finishConfirmation() {
  releaseConfirmation?.();
  releaseConfirmation = undefined;
}
function bar(focus = ["spritz"], key = "n123") {
  render(
    <BarSheet
      key={key}
      venueKey={key}
      cell="u0nd9"
      focus={focus}
      tier={() => "neutro"}
      onVenue={(found) => {
        calls.push({ kind: "venue", venue: found.key });
      }}
      onClose={() => {
        calls.push({ kind: "close" });
      }}
      actions={{
        confirm: async (row) => {
          calls.push({ kind: "confirm", drink: row[1] });
          if (confirmationMode === "failed") throw new Error("Owned confirmation failure");
          if (confirmationMode === "hold")
            await new Promise<void>((resolve) => {
              releaseConfirmation = resolve;
            });
          else await new Promise((resolve) => setTimeout(resolve, 30));
          return { count: 3, counted: true };
        },
        changed: (found, row) => {
          calls.push({ kind: "changed", venue: found.key, drink: row[1] });
        },
        report: (found, row) => {
          calls.push({ kind: "report", venue: found.key, drink: row?.[1] });
        },
        addHere: (found) => {
          calls.push({ kind: "add", venue: found.key });
        },
      }}
    />,
    root,
  );
}
function price(prefill: Prefill | null = { venue, drink: "spritz" }, withOrigin = true) {
  version++;
  render(
    <AddPriceSheet
      key={version}
      venues={legacyPriceVenues(venues)}
      prefill={prefill}
      origin={withOrigin ? { lat: 45.4642, lon: 9.19 } : null}
      onSave={(draft: Draft) => {
        calls.push({
          kind: "save",
          venue: draft.venue.key,
          drink: draft.drink,
          hh: draft.hh,
          cents: draft.cents,
        });
      }}
      onPropose={() => {
        calls.push({ kind: "propose" });
      }}
      onClose={() => {
        calls.push({ kind: "close" });
      }}
    />,
    root,
  );
}
declare global {
  interface Window {
    sheetFixture: {
      bar: typeof bar;
      price: typeof price;
      calls: typeof calls;
      venue: Venue;
      parseCents: typeof parseCents;
      setLang: typeof setLang;
      setConfirmation: typeof setConfirmation;
      finishConfirmation: typeof finishConfirmation;
    };
  }
}
window.sheetFixture = {
  bar,
  price,
  calls,
  venue,
  parseCents,
  setLang,
  setConfirmation,
  finishConfirmation,
};
