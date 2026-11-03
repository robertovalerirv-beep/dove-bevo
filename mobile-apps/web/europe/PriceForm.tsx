import { useState } from "preact/hooks";
import { CATALOG } from "@site/shared/catalog";
import { it, currentLang } from "@site/app/i18n/lang";
import { Icon, drinkIcon } from "@site/app/components/Icon";
import { Sheet } from "@site/app/components/Sheet";
import { drinkImage } from "../drink-images";
import {
  amountAllowed,
  money,
  parseAmount,
  servingLabel,
  validServing,
  type Price,
  type Serving,
  type Venue,
} from "./model";
import type { Draft, ReportReason } from "./api";
const t = (italian: string, english: string) => (currentLang() === "en" ? english : italian);

export function PriceForm({
  venue,
  initialDrink,
  initialServing,
  initialBand,
  row,
  onSave,
  onClose,
}: {
  venue: Venue;
  initialDrink: string;
  initialServing: Serving | null;
  initialBand: 0 | 1;
  row?: Price;
  onSave: (draft: Draft) => void;
  onClose: () => void;
}) {
  const [drink, setDrink] = useState(row?.drink ?? initialDrink),
    [hh, setHh] = useState<0 | 1>(row?.hh ?? initialBand);
  const initial = row?.serving ?? initialServing;
  const [volume, setVolume] = useState(initial?.ml ? String(initial.ml) : ""),
    [text, setText] = useState("");
  const [error, setError] = useState("");
  const unit: Serving["unit"] =
    drink === "beer_draft" || drink === "water" ? "ml" : drink === "wine_glass" ? "glass" : "drink";
  const volumeNumber = /^[1-9]\d{0,3}$/.test(volume) ? Number(volume) : undefined;
  const serving: Serving = {
    unit,
    ...(unit !== "drink" && volumeNumber !== undefined ? { ml: volumeNumber } : {}),
  };
  const art = drinkImage(drink, "product");
  function save() {
    const amount = parseAmount(text);
    if (amount === null) {
      setError(
        t(
          "Inserisci solo il numero, ad esempio 7,50. La valuta è ",
          "Enter only the number, for example 7.50. Currency: ",
        ) + venue.currency,
      );
      return;
    }
    if (
      ((unit === "ml" || volume !== "") && (volumeNumber === undefined || volumeNumber > 2000)) ||
      !validServing(drink, serving)
    ) {
      setError(
        t(
          "Indica il volume reale in ml (da 1 a 2000).",
          "Enter the actual volume in ml (1 to 2000).",
        ),
      );
      return;
    }
    if (!amountAllowed(drink, venue.currency, amount)) {
      setError(
        t(
          "Importo fuori dai limiti di questa categoria e valuta.",
          "Amount outside this category's currency limits.",
        ),
      );
      return;
    }
    onSave({ venue, drink, hh, serving, amount_minor: amount });
  }
  return (
    <Sheet title={t("Aggiungi un prezzo", "Add a price")} onClose={onClose} step="europe-price">
      <form
        class="mobile-price-form mobile-price-flow europe-price-form"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <p class="mobile-price-flow__venue">
          {venue.name} · {venue.city}
        </p>
        {art && (
          <div
            class={`mobile-price-form__art${drink === "spritz" ? " mobile-price-form__art--product" : ""}`}
          >
            <img src={art} width="1024" height="1536" alt="" />
            <span>{t("Immagine illustrativa", "Illustrative drink image")}</span>
          </div>
        )}
        <label class="europe-field-label">
          {t("Cosa hai bevuto?", "What did you drink?")}
          <select
            class="field"
            value={drink}
            onChange={(event) => {
              setDrink(event.currentTarget.value);
              setVolume("");
              setError("");
            }}
          >
            {CATALOG.map((d) => (
              <option value={d.code} key={d.code}>
                {it.drinks[d.code] ?? d.code}
              </option>
            ))}
          </select>
        </label>
        <h3 class="context-tag">
          <Icon name={drinkIcon(drink)} />
          {it.drinks[drink] ?? drink}
        </h3>
        {unit !== "drink" ? (
          <label class="europe-field-label">
            {unit === "ml"
              ? t("Volume reale (ml)", "Actual volume (ml)")
              : t("Volume del calice in ml (facoltativo)", "Glass volume in ml (optional)")}
            <input
              class="field"
              inputMode="numeric"
              pattern="[0-9]*"
              value={volume}
              placeholder={
                unit === "ml"
                  ? t("Richiesto, leggi il menu", "Required: check the menu")
                  : t("Se non indicato, lascia vuoto", "Leave blank if unspecified")
              }
              onInput={(event) => {
                setVolume(event.currentTarget.value);
                setError("");
              }}
            />
          </label>
        ) : serving.unit !== "drink" ? (
          <p class="hint">{servingLabel(serving)}</p>
        ) : null}
        <p class="europe-currency" role="note">
          {t("Prezzo in ", "Price in ")}
          {venue.currency} ({venue.currency === "GBP" ? "£" : "€"}) ·{" "}
          {t("Nessuna conversione", "No conversion")}
        </p>
        <label class="question" for="europe-price-amount">
          {t("Quale prezzo hai visto?", "What price did you see?")}
        </label>
        <label class="price-input">
          <span class="sr-only">{t("Importo", "Amount")}</span>
          <input
            id="europe-price-amount"
            aria-label={t("Importo", "Amount")}
            inputMode="decimal"
            value={text}
            placeholder="0,00"
            autofocus
            aria-invalid={!!error}
            aria-describedby="europe-price-error"
            onInput={(event) => {
              setText(event.currentTarget.value);
              setError("");
            }}
          />
          <span aria-hidden="true">{venue.currency === "GBP" ? "£" : "€"}</span>
        </label>
        <p id="europe-price-error" role="alert" class="error">
          {error}
        </p>
        <button
          type="button"
          role="switch"
          aria-checked={hh === 1}
          class="switch"
          onClick={() => {
            setHh(hh ? 0 : 1);
          }}
        >
          <span class="switch__track" aria-hidden="true" />
          Happy hour
        </button>
        <p class="hint">
          {t(
            "Stai segnalando il prezzo attuale di questo formato. Hai 5 secondi per annullare.",
            "You are reporting the current price for this serving. You have 5 seconds to undo.",
          )}
        </p>
        <button type="submit" class="btn btn--primary" disabled={!text.trim()}>
          {t("Salva prezzo", "Save price")}
        </button>
      </form>
    </Sheet>
  );
}

export function ReportForm({
  venue,
  row,
  busy,
  onReport,
  onClose,
}: {
  venue: Venue;
  row: Price | null;
  busy: boolean;
  onReport: (reason: ReportReason) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<ReportReason>(row ? "wrong_price" : "wrong_info");
  const choices: { value: ReportReason; label: string }[] = [
    ...(row ? [{ value: "wrong_price" as const, label: t("Prezzo errato", "Wrong price") }] : []),
    { value: "closed", label: t("Locale chiuso", "Venue closed") },
    { value: "not_exists", label: t("Locale inesistente", "Venue does not exist") },
    { value: "wrong_info", label: t("Informazioni errate", "Wrong information") },
    { value: "offensive", label: t("Contenuto offensivo", "Offensive content") },
  ];
  return (
    <Sheet title={t("Segnala un problema", "Report a problem")} onClose={onClose}>
      <div class="europe-report">
        <p>{venue.name}</p>
        {row && (
          <p>
            {it.drinks[row.drink] ?? row.drink}
            {row.serving.unit !== "drink" && <> · {servingLabel(row.serving)}</>} ·{" "}
            {money(row.amount_minor, row.currency)}
          </p>
        )}
        <fieldset>
          <legend>{t("Qual è il problema?", "What is the problem?")}</legend>
          {choices.map((choice) => (
            <label class="europe-radio" key={choice.value}>
              <input
                type="radio"
                name="europe-report"
                value={choice.value}
                checked={reason === choice.value}
                onChange={() => {
                  setReason(choice.value);
                }}
              />
              {choice.label}
            </label>
          ))}
        </fieldset>
        <button
          class="btn btn--primary"
          disabled={busy}
          onClick={() => {
            onReport(reason);
          }}
        >
          {busy ? t("Invio…", "Sending…") : t("Invia segnalazione", "Send report")}
        </button>
      </div>
    </Sheet>
  );
}
