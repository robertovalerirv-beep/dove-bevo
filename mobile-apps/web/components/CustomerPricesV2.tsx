import { useEffect, useId, useRef, useState } from "preact/hooks";
import { formatDate } from "@site/app/lib/format";
import { currentLang } from "@site/app/i18n/lang";
import { drinkImage } from "@mobile/drink-images";
import { DrinkVoteButton } from "./DrinkVotes";
import { NativeSaveAction, savedDrinkKey, useNativeSavedDrinks } from "../native-saved-drinks";
import {
  CustomerPriceHttpError,
  customerCurrency,
  loadCustomerPricesPage,
  parseCustomerAmount,
  reportCustomerPrice,
  submitCustomerPrice,
  type CustomerRow,
  type CustomerSubmission,
} from "../customer-prices-v2";
import { menuMoney, type MenuOffer, type MenuPage } from "../menu-v2";
import {
  menuOfferMatchesFocus,
  mobileCustomerItemKeyPattern,
  mobileCustomerSaveURL,
  mobileOfferIdPattern,
  mobileOfferSaveURL,
  type DrinkFocus,
} from "../routes";

type Editor =
  { kind: "menu_offer"; offer: MenuOffer } | { kind: "new_drink"; row: CustomerRow | null };
type LoadState = "loading" | "ready" | "missing" | "failed";

function nativeOfferSaveEnabled(): boolean {
  return (
    typeof window !== "undefined" &&
    (window as Window & { DoveBevoNativeOfferSave?: boolean }).DoveBevoNativeOfferSave === true
  );
}

function nativeCapabilities() {
  const native = window as Window & {
    DoveBevoNativeOfferSave?: boolean;
    DoveBevoNativeCustomerSave?: boolean;
  };
  return {
    offer: native.DoveBevoNativeOfferSave === true,
    customer: native.DoveBevoNativeCustomerSave === true,
  };
}

const CATEGORY_OPTIONS = [
  ["", "Non specificata"],
  ["beer_draft", "Birra alla spina"],
  ["spritz", "Spritz"],
  ["negroni", "Negroni"],
  ["sbagliato", "Sbagliato"],
  ["gin_tonic", "Gin tonic"],
  ["gin_lemon", "Americano"],
  ["wine_glass", "Calice di vino"],
  ["alcohol_free", "Analcolico"],
  ["water", "Acqua"],
] as const;

function errorMessage(error: unknown): string {
  if (error instanceof CustomerPriceHttpError) {
    if (error.status === 409)
      return "Questo prezzo è cambiato nel frattempo. Ricarica le segnalazioni e riprova.";
    if (error.status === 429)
      return "Hai raggiunto il limite di segnalazioni per oggi. Riprova domani.";
    if (error.status === 404)
      return "Questo drink o locale non è più disponibile. Ricarica la scheda.";
    if (error.status === 400) return "Controlla drink, porzione e importo prima di riprovare.";
    if (error.status === 403 || error.status === 401)
      return "Non riusciamo a verificare la sessione. Riprova tra poco.";
  }
  return "Non siamo riusciti a salvare la segnalazione. Riprova tra poco.";
}

function customerDate(row: CustomerRow): string {
  return formatDate(row.observed_on);
}

/** App-only source menu plus separate, public customer observations. */
export function CustomerPricesV2({
  menu,
  venue,
  focus,
  offerFocus,
  mapFocus,
  mapOfferId,
  hasLegacyPrices,
}: {
  menu: MenuPage | null;
  venue: { key: string; cell: string; country: string };
  focus: DrinkFocus | null;
  offerFocus: string | null;
  mapFocus: readonly string[];
  mapOfferId: string | null;
  hasLegacyPrices: boolean;
}) {
  const { key, cell, country } = menu?.venue ?? venue;
  const offers = menu?.offers ?? [];
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [nativeOfferSave, setNativeOfferSave] = useState(nativeOfferSaveEnabled);
  const [nativeCustomerSave, setNativeCustomerSave] = useState(false);
  const savedDrinkKeys = useNativeSavedDrinks();
  const [nextAfter, setNextAfter] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [moreBusy, setMoreBusy] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  const [resolvingOffer, setResolvingOffer] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [amount, setAmount] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [servingLabel, setServingLabel] = useState("");
  const [servingMl, setServingMl] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitMessage, setSubmitMessage] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [reportMessage, setReportMessage] = useState("");
  const [reportBusy, setReportBusy] = useState<string | null>(null);
  const [reported, setReported] = useState<Set<string>>(() => new Set());
  const formId = useId();
  const host = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    const updateNative = () => {
      const capabilities = nativeCapabilities();
      setNativeOfferSave(capabilities.offer);
      setNativeCustomerSave(capabilities.customer);
    };
    window.addEventListener("dovebevo-native-ready", updateNative);
    updateNative();
    return () => {
      window.removeEventListener("dovebevo-native-ready", updateNative);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    abort.current = controller;
    setRows([]);
    setNextAfter(null);
    setLoadState("loading");
    setMoreFailed(false);
    void loadCustomerPricesPage(key, cell, null, controller.signal)
      .then((page) => {
        if (controller.signal.aborted) return;
        if (!page) {
          setLoadState("missing");
          return;
        }
        setRows(page.rows);
        setNextAfter(page.next_after);
        setLoadState("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadState("failed");
      });
    return () => {
      controller.abort();
    };
  }, [key, cell, reload]);

  async function loadMore() {
    const controller = abort.current;
    const after = nextAfter;
    if (!controller || !after || moreBusy) return;
    setMoreBusy(true);
    setMoreFailed(false);
    try {
      const page = await loadCustomerPricesPage(key, cell, after, controller.signal);
      if (!page) throw new Error("Customer prices unavailable");
      if (controller.signal.aborted) return;
      const known = new Set(rows.map((row) => row.item_key));
      if (page.rows.some((row) => known.has(row.item_key)))
        throw new Error("Duplicate customer price page");
      setRows((previous) => [...previous, ...page.rows]);
      setNextAfter(page.next_after);
    } catch {
      if (!controller.signal.aborted) setMoreFailed(true);
    } finally {
      if (!controller.signal.aborted) setMoreBusy(false);
    }
  }

  async function beginOffer(offer: MenuOffer) {
    if (saving || moreBusy || resolvingOffer) return;
    setEditor({ kind: "menu_offer", offer });
    setAmount("");
    setSubmitError("");
    setSubmitMessage("");
    if (rows.some((row) => row.offer_id === offer.id) || !nextAfter) return;
    // The read route is paginated. Resolve this offer's latest observation before
    // setting expected_revision, so an unseen row is never treated as a new one.
    setResolvingOffer(offer.id);
    try {
      const controller = abort.current;
      if (!controller) throw new Error("Customer price request unavailable");
      const collected = [...rows];
      const known = new Set(rows.map((row) => row.item_key));
      let cursor: string | null = nextAfter;
      while (cursor) {
        const page = await loadCustomerPricesPage(key, cell, cursor, controller.signal);
        if (!page) throw new Error("Customer prices unavailable");
        if (page.rows.some((row) => known.has(row.item_key)))
          throw new Error("Duplicate customer price page");
        for (const row of page.rows) {
          known.add(row.item_key);
          collected.push(row);
        }
        cursor = page.next_after;
        if (page.rows.some((row) => row.offer_id === offer.id)) break;
      }
      if (controller.signal.aborted) return;
      setRows(collected);
      setNextAfter(cursor);
    } catch {
      if (!abort.current?.signal.aborted) {
        setEditor(null);
        setSubmitMessage("Non riusciamo a verificare il prezzo attuale. Riprova.");
      }
    } finally {
      setResolvingOffer(null);
    }
  }

  function beginNew(row: CustomerRow | null) {
    setEditor({ kind: "new_drink", row });
    setAmount("");
    setName(row?.name ?? "");
    setCategory(row?.category ?? "");
    setServingLabel(row?.serving.label ?? "");
    setServingMl(row?.serving.ml ? String(row.serving.ml) : "");
    setSubmitError("");
    setSubmitMessage("");
  }

  async function save() {
    const selected = editor;
    const turnstileHost = host.current;
    if (!selected || !turnstileHost || saving) return;
    const money =
      selected.kind === "menu_offer"
        ? { currency: selected.offer.currency, exponent: selected.offer.currency_exponent }
        : selected.row
          ? { currency: selected.row.currency, exponent: selected.row.currency_exponent }
          : customerCurrency(country, offers);
    const amountMinor = money && parseCustomerAmount(amount, money.exponent);
    if (!money || amountMinor === null) {
      setSubmitError("Inserisci un importo valido nella valuta indicata.");
      return;
    }
    let body: CustomerSubmission;
    if (selected.kind === "menu_offer") {
      const current = rows.find((row) => row.offer_id === selected.offer.id);
      body = {
        kind: "menu_offer",
        venue_key: key,
        cell,
        offer_id: selected.offer.id,
        amount_minor: amountMinor,
        currency: money.currency,
        currency_exponent: money.exponent,
        expected_revision: current?.revision ?? null,
      };
    } else {
      const cleanName = selected.row?.name ?? name.trim();
      const cleanServing = selected.row ? selected.row.serving.label : servingLabel.trim() || null;
      const ml = selected.row?.serving.ml ?? (servingMl.trim() ? Number(servingMl) : null);
      if (
        cleanName.length < 2 ||
        cleanName.length > 80 ||
        (cleanServing !== null && cleanServing.length > 80) ||
        (ml !== null && (!Number.isInteger(ml) || ml < 1 || ml > 2000))
      ) {
        setSubmitError("Controlla nome e porzione del drink.");
        return;
      }
      body = {
        kind: "new_drink",
        venue_key: key,
        cell,
        name: cleanName,
        category: selected.row ? selected.row.category : category || null,
        serving_label: cleanServing,
        serving_ml: ml,
        amount_minor: amountMinor,
        currency: money.currency,
        currency_exponent: money.exponent,
        expected_revision: selected.row?.revision ?? null,
      };
    }
    setSaving(true);
    setSubmitError("");
    try {
      const receipt = await submitCustomerPrice(turnstileHost, body);
      setEditor(null);
      setSubmitMessage(
        receipt.status === "pending"
          ? "Drink inviato: sarà visibile dopo la verifica."
          : receipt.status === "unchanged"
            ? "Questo prezzo è già visibile."
            : "Prezzo salvato e visibile a tutti.",
      );
      setReload((value) => value + 1);
    } catch (error) {
      setSubmitError(errorMessage(error));
      if (error instanceof CustomerPriceHttpError && error.status === 409) {
        setSubmitMessage(errorMessage(error));
        setEditor(null);
        setReload((value) => value + 1);
      }
    } finally {
      setSaving(false);
    }
  }

  async function report(row: CustomerRow) {
    const turnstileHost = host.current;
    if (!turnstileHost || reportBusy || reported.has(row.revision)) return;
    setReportBusy(row.revision);
    setReportMessage("");
    try {
      const receipt = await reportCustomerPrice(turnstileHost, key, cell, row.revision);
      setReported((previous) => new Set([...previous, row.revision]));
      setReportMessage(
        receipt.status === "already"
          ? "Hai già segnalato questo prezzo."
          : "Segnalazione ricevuta. Grazie.",
      );
      setReload((value) => value + 1);
    } catch (error) {
      setReportMessage(errorMessage(error));
    } finally {
      setReportBusy(null);
    }
  }

  const mapCategoryIndex = (offer: MenuOffer) =>
    offer.category && offer.context.kind === "regular" ? mapFocus.indexOf(offer.category) : -1;
  const offerPriority = (offer: MenuOffer) =>
    offerFocus === offer.id
      ? 0
      : focus && menuOfferMatchesFocus(offer, focus)
        ? 1
        : !offerFocus && !focus && mapOfferId === offer.id
          ? 2
          : !offerFocus && !focus && mapCategoryIndex(offer) !== -1
            ? 3
            : 4;
  const orderedOffers = [...offers].sort((a, b) => {
    const priority = offerPriority(a) - offerPriority(b);
    if (priority) return priority;
    if (offerPriority(a) !== 3) return 0;
    return (
      mapCategoryIndex(a) - mapCategoryIndex(b) ||
      a.currency.localeCompare(b.currency) ||
      a.currency_exponent - b.currency_exponent ||
      a.amount_minor - b.amount_minor ||
      a.id.localeCompare(b.id)
    );
  });
  const compactMenu = orderedOffers.length > 6;
  const observations = new Map(
    rows
      .filter((row) => row.kind === "menu_offer" && row.offer_id)
      .map((row) => [row.offer_id, row]),
  );
  const loadedOfferIds = new Set(offers.map((offer) => offer.id));
  // A customer observation must remain visible even when its linked owner
  // menu is absent or a later menu page has not loaded. It has no safe offer
  // update path until that menu offer is available again.
  const additional = rows.filter(
    (row) => row.kind === "new_drink" || !row.offer_id || !loadedOfferIds.has(row.offer_id),
  );
  const compactNoCustomerRows = rows.length === 0;
  const hasVisiblePrices = offers.length > 0 || hasLegacyPrices;
  const newCurrency = customerCurrency(country, offers);
  const chosenCurrency =
    editor?.kind === "menu_offer"
      ? { currency: editor.offer.currency, exponent: editor.offer.currency_exponent }
      : editor?.row
        ? { currency: editor.row.currency, exponent: editor.row.currency_exponent }
        : newCurrency;
  const validAmount = chosenCurrency && parseCustomerAmount(amount, chosenCurrency.exponent);
  const validNewName =
    editor?.kind !== "new_drink" ||
    editor.row !== null ||
    (name.trim().length >= 2 && name.trim().length <= 80);
  const selectedOffer = editor?.kind === "menu_offer" ? editor.offer : null;
  const offerArtwork = selectedOffer?.category
    ? drinkImage(selectedOffer.category, "product")
    : undefined;
  const offerServing = selectedOffer
    ? (selectedOffer.serving.label ??
      (selectedOffer.serving.ml ? `${String(selectedOffer.serving.ml)} ml` : ""))
    : "";
  const english = currentLang() === "en";
  const currencyMark =
    chosenCurrency?.currency === "EUR"
      ? "€"
      : chosenCurrency?.currency === "GBP"
        ? "£"
        : chosenCurrency?.currency;
  const priceForm = editor && chosenCurrency && (
    <form
      class={`mobile-customer-v2__form${selectedOffer ? " mobile-customer-v2__form--menu" : ""}`}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      {selectedOffer ? (
        <>
          <div class="mobile-customer-v2__form-heading">
            <span>{english ? "Add a price" : "Aggiungi un prezzo"}</span>
            <strong>{menu?.venue.name ?? (english ? "This venue" : "Questo locale")}</strong>
          </div>
          {offerArtwork && (
            <div
              class={`mobile-customer-v2__form-art${selectedOffer.category === "spritz" ? " mobile-customer-v2__form-art--product" : ""}`}
            >
              <img src={offerArtwork} alt="" decoding="async" />
              <small>{english ? "Illustrative image" : "Immagine illustrativa"}</small>
            </div>
          )}
          <div class="mobile-customer-v2__form-drink">
            <strong>{selectedOffer.name}</strong>
            {offerServing && <span>{offerServing}</span>}
            <small>
              {english ? "Menu price" : "Prezzo da menu"}:{" "}
              {menuMoney(
                selectedOffer.amount_minor,
                selectedOffer.currency,
                selectedOffer.currency_exponent,
              )}
            </small>
          </div>
          <p class="mobile-customer-v2__form-prompt">
            {english
              ? "Paid a different price? Share the price of this drink and serving."
              : "Hai pagato un prezzo diverso? Condividi il prezzo del drink indicato."}
          </p>
        </>
      ) : editor.kind === "new_drink" ? (
        <strong>{editor.row ? `Aggiorna ${editor.row.name}` : "Aggiungi un drink mancante"}</strong>
      ) : null}
      {editor.kind === "new_drink" && (
        <>
          <label htmlFor={`${formId}-name`}>Nome del drink</label>
          <input
            id={`${formId}-name`}
            value={name}
            required
            maxLength={80}
            readOnly={editor.row !== null}
            onInput={(event) => {
              setName(event.currentTarget.value);
            }}
            placeholder="Es. Negroni della casa"
          />
          <label htmlFor={`${formId}-category`}>Tipo di drink</label>
          <select
            id={`${formId}-category`}
            value={category}
            disabled={editor.row !== null}
            onChange={(event) => {
              setCategory(event.currentTarget.value);
            }}
          >
            {CATEGORY_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <label htmlFor={`${formId}-serving`}>Porzione (facoltativa)</label>
          <input
            id={`${formId}-serving`}
            value={servingLabel}
            maxLength={80}
            readOnly={editor.row !== null}
            onInput={(event) => {
              setServingLabel(event.currentTarget.value);
            }}
            placeholder="Es. bicchiere"
          />
          <label htmlFor={`${formId}-ml`}>Quantità in ml (facoltativa)</label>
          <input
            id={`${formId}-ml`}
            type="number"
            min="1"
            max="2000"
            value={servingMl}
            readOnly={editor.row !== null}
            onInput={(event) => {
              setServingMl(event.currentTarget.value);
            }}
          />
        </>
      )}
      <label htmlFor={`${formId}-amount`}>
        {english ? "Price paid" : "Importo pagato"} ({chosenCurrency.currency})
      </label>
      <div class="mobile-customer-v2__amount-input">
        <input
          id={`${formId}-amount`}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={amount}
          required
          maxLength={9}
          aria-invalid={submitError ? "true" : undefined}
          onInput={(event) => {
            setAmount(event.currentTarget.value);
            setSubmitError("");
          }}
          placeholder={chosenCurrency.exponent === 2 ? "0,00" : "0"}
        />
        <span aria-hidden="true">{currencyMark}</span>
      </div>
      <small>
        {english
          ? "Price for this drink and serving in its original currency. Any extra charges are separate."
          : "Prezzo del drink e della porzione indicata, nella valuta originale. Eventuali supplementi restano separati."}
      </small>
      <div class="mobile-customer-v2__form-actions">
        <button
          type="button"
          class="btn btn--secondary"
          disabled={saving}
          onClick={() => {
            setEditor(null);
            setSubmitError("");
          }}
        >
          {english ? "Cancel" : "Annulla"}
        </button>
        <button
          type="submit"
          class="btn btn--primary"
          disabled={saving || resolvingOffer !== null || validAmount === null || !validNewName}
        >
          {saving
            ? english
              ? "Sending…"
              : "Invio…"
            : resolvingOffer
              ? english
                ? "Loading…"
                : "Caricamento…"
              : english
                ? "Share price"
                : "Condividi prezzo"}
        </button>
      </div>
      {submitError && (
        <p class="error" role="alert">
          {submitError}
        </p>
      )}
    </form>
  );

  function observation(row: CustomerRow) {
    const voteTarget =
      row.kind === "menu_offer" && row.offer_id && mobileOfferIdPattern.test(row.offer_id)
        ? ({ kind: "offer", id: row.offer_id } as const)
        : row.kind === "new_drink" && /^c[0-9a-f]{64}$/.test(row.item_key)
          ? ({ kind: "customer", id: row.item_key } as const)
          : null;
    const voteVisible = voteTarget !== null && !offers.some((offer) => offer.id === row.offer_id);
    return (
      <div class="mobile-customer-v2__observation">
        <span>Prezzo segnalato da un cliente</span>
        <strong>{menuMoney(row.amount_minor, row.currency, row.currency_exponent)}</strong>
        <small>Pagato il {customerDate(row)} · prezzo del drink, non totale del conto</small>
        {(nativeCustomerSave || voteVisible) && (
          <div class="mobile-menu-v2__quick-actions mobile-customer-v2__quick-actions">
            {nativeCustomerSave && mobileCustomerItemKeyPattern.test(row.item_key) && (
              <NativeSaveAction
                href={mobileCustomerSaveURL(key, cell, row.item_key)}
                name={row.name}
                venue={menu?.venue.name ?? key}
                keys={savedDrinkKeys}
              />
            )}
            {voteVisible && (
              <DrinkVoteButton
                target={voteTarget}
                name={`${row.name} da ${menu?.venue.name ?? key}`}
              />
            )}
          </div>
        )}
        <button
          type="button"
          class="btn btn--ghost"
          disabled={reportBusy === row.revision || reported.has(row.revision)}
          onClick={() => void report(row)}
        >
          {reported.has(row.revision) ? "Segnalato" : "Segnala prezzo errato"}
        </button>
      </div>
    );
  }

  function offerRow(offer: MenuOffer, compact: boolean) {
    const customer = observations.get(offer.id);
    const exactSaved = offerFocus === offer.id;
    const offerSaved =
      mobileOfferIdPattern.test(offer.id) &&
      savedDrinkKeys.has(savedDrinkKey(mobileOfferSaveURL(key, cell, offer.id)) ?? "");
    const categorySaved = focus !== null && menuOfferMatchesFocus(offer, focus);
    const mapSelected =
      !exactSaved && !categorySaved && !offerFocus && !focus && mapOfferId === offer.id;
    const summary = (
      <>
        <span class="mobile-menu-v2__name">
          {offer.name}
          <small class="mobile-menu-v2__provenance">Prezzo da menu</small>
          {mapSelected && (
            <small class="mobile-menu-v2__saved">
              {english ? "Selected on the map" : "Drink scelto sulla mappa"}
            </small>
          )}
          {offerSaved ? (
            <small class="mobile-menu-v2__saved">Questo drink è nei tuoi preferiti</small>
          ) : (
            categorySaved && (
              <small class="mobile-menu-v2__saved">
                Stesso tipo di drink selezionato · {focus.hh ? "Happy hour" : "Prezzo normale"}
              </small>
            )
          )}
        </span>
        <strong class="mobile-menu-v2__amount">
          {menuMoney(offer.amount_minor, offer.currency, offer.currency_exponent)}
        </strong>
        <span class="mobile-menu-v2__meta">
          {[
            offer.serving.label ?? (offer.serving.ml ? `${String(offer.serving.ml)} ml` : ""),
            offer.context.kind === "happy_hour"
              ? ["Happy hour", offer.context.condition].filter(Boolean).join(" · ")
              : offer.context.kind === "conditional"
                ? offer.context.condition
                  ? `Solo con: ${offer.context.condition}`
                  : "Prezzo condizionato"
                : (offer.context.condition ?? ""),
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </>
    );
    const quickActions = (
      <div class="mobile-menu-v2__quick-actions">
        {nativeOfferSave && mobileOfferIdPattern.test(offer.id) && (
          <NativeSaveAction
            href={mobileOfferSaveURL(key, cell, offer.id)}
            name={offer.name}
            venue={menu?.venue.name ?? key}
            keys={savedDrinkKeys}
          />
        )}
        {mobileOfferIdPattern.test(offer.id) && (
          <DrinkVoteButton
            target={{ kind: "offer", id: offer.id }}
            name={`${offer.name} da ${menu?.venue.name ?? key}`}
          />
        )}
      </div>
    );
    const actions = (
      <>
        <a
          href={offer.source.url}
          target="_blank"
          rel="noopener noreferrer"
          class="mobile-menu-v2__source"
        >
          Menu verificato il {offer.source.checked_on}
        </a>
        {customer && observation(customer)}
        {loadState === "ready" && (
          <button
            type="button"
            class="btn btn--secondary mobile-customer-v2__update"
            disabled={resolvingOffer !== null || saving || moreBusy}
            onClick={() => {
              void beginOffer(offer);
            }}
          >
            Prezzo diverso? Aggiorna
          </button>
        )}
        {editor?.kind === "menu_offer" && editor.offer.id === offer.id && priceForm}
      </>
    );
    return (
      <li
        key={offer.id}
        class={`mobile-menu-v2__offer${compact ? " mobile-menu-v2__offer--compact" : ""}${exactSaved || categorySaved || mapSelected ? " mobile-menu-v2__offer--focused" : ""}`}
        data-testid={
          exactSaved
            ? "saved-exact-offer"
            : categorySaved
              ? "saved-menu-offer"
              : mapSelected
                ? "map-selected-menu-offer"
                : undefined
        }
      >
        {compact ? (
          <>
            <details class="mobile-menu-v2__offer-details">
              <summary class="mobile-menu-v2__offer-summary">
                {summary}
                <small class="mobile-menu-v2__expand">{english ? "Details" : "Dettagli"}</small>
              </summary>
              <div class="mobile-menu-v2__offer-actions">{actions}</div>
            </details>
            {quickActions}
          </>
        ) : (
          <>
            {summary}
            {quickActions}
            {actions}
          </>
        )}
      </li>
    );
  }

  if (!menu && loadState === "missing") return null;

  return (
    <>
      {offers.length > 0 && (
        <>
          <ul class="mobile-menu-v2__offers">
            {(compactMenu ? orderedOffers.slice(0, 1) : orderedOffers).map((offer) =>
              offerRow(offer, false),
            )}
          </ul>
          {compactMenu && (
            <details class="mobile-menu-v2__more-offers">
              <summary>
                {english ? "Other menu prices" : "Altri prezzi dal menu"}
                <span>
                  {String(orderedOffers.length - 1)} {english ? "drinks" : "drink"}
                </span>
              </summary>
              <ul class="mobile-menu-v2__offers mobile-menu-v2__offers--compact">
                {orderedOffers.slice(1).map((offer) => offerRow(offer, true))}
              </ul>
            </details>
          )}
        </>
      )}
      <section
        class={`mobile-customer-v2${compactNoCustomerRows ? " mobile-customer-v2--compact" : ""}`}
        aria-label="Prezzi segnalati dai clienti"
      >
        {!compactNoCustomerRows && (
          <>
            <h4>Prezzi segnalati dai clienti</h4>
            <p>
              Prezzi pagati e condivisi dalle persone.
              {offers.length > 0 &&
                " Restano distinti dai prezzi documentati nel menu del locale e non li sostituiscono."}
            </p>
          </>
        )}
        {loadState === "loading" && (
          <p class="hint" role="status">
            Caricamento segnalazioni…
          </p>
        )}
        {loadState === "missing" && !hasVisiblePrices && (
          <p class="hint">Le segnalazioni dei clienti non sono ancora disponibili qui.</p>
        )}
        {loadState === "failed" && (
          <div
            class={hasVisiblePrices ? "mobile-customer-v2__load-warning" : "mobile-menu-v2__error"}
            role="alert"
          >
            <p>
              {hasVisiblePrices
                ? "Altre segnalazioni dei clienti non disponibili."
                : "Non riusciamo a caricare i prezzi segnalati dai clienti."}
            </p>
            <button
              type="button"
              class="btn btn--secondary"
              onClick={() => {
                setReload((value) => value + 1);
              }}
            >
              Riprova
            </button>
          </div>
        )}
        {loadState === "ready" && (
          <>
            {additional.length > 0 && (
              <>
                <h5>{offers.length > 0 ? "Altri drink segnalati" : "Drink segnalati"}</h5>
                <ul class="mobile-customer-v2__additional">
                  {additional.map((row) => (
                    <li key={row.item_key}>
                      <strong>{row.name}</strong>
                      <small>
                        {[row.serving.label, row.serving.ml ? `${String(row.serving.ml)} ml` : ""]
                          .filter(Boolean)
                          .join(" · ")}
                      </small>
                      {observation(row)}
                      {row.kind === "new_drink" && (
                        <button
                          type="button"
                          class="btn btn--secondary mobile-customer-v2__update"
                          onClick={() => {
                            beginNew(row);
                          }}
                        >
                          Prezzo diverso? Aggiorna
                        </button>
                      )}
                      {editor?.kind === "new_drink" &&
                        editor.row?.item_key === row.item_key &&
                        priceForm}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {nextAfter && (
              <button
                type="button"
                class="btn btn--secondary mobile-menu-v2__more"
                disabled={moreBusy}
                onClick={() => void loadMore()}
              >
                {moreBusy ? "Caricamento…" : "Vedi altre segnalazioni"}
              </button>
            )}
            {moreFailed && (
              <p class="error" role="alert">
                Impossibile caricare altre segnalazioni. Riprova.
              </p>
            )}
            {newCurrency ? (
              <button
                type="button"
                class="btn btn--secondary mobile-customer-v2__add"
                onClick={() => {
                  beginNew(null);
                }}
              >
                Aggiungi un drink mancante
              </button>
            ) : (
              <p class="hint">
                La valuta per nuovi drink non è ancora verificata in questo locale.
              </p>
            )}
            {editor?.kind === "new_drink" && !editor.row && priceForm}
          </>
        )}
        {submitMessage && (
          <p class="hint" role="status">
            {submitMessage}
          </p>
        )}
        {reportMessage && (
          <p class="hint" role="status">
            {reportMessage}
          </p>
        )}
        <div ref={host} class="mobile-customer-v2__turnstile" />
      </section>
    </>
  );
}
