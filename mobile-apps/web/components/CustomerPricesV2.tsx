import { useEffect, useId, useRef, useState } from "preact/hooks";
import { formatDate } from "@site/app/lib/format";
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

const CATEGORY_OPTIONS = [
  ["", "Non specificata"],
  ["beer_draft", "Birra alla spina"],
  ["spritz", "Spritz"],
  ["negroni", "Negroni"],
  ["sbagliato", "Sbagliato"],
  ["gin_tonic", "Gin tonic"],
  ["gin_lemon", "Gin lemon"],
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
  hasLegacyPrices,
}: {
  menu: MenuPage | null;
  venue: { key: string; cell: string; country: string };
  focus: DrinkFocus | null;
  offerFocus: string | null;
  hasLegacyPrices: boolean;
}) {
  const { key, cell, country } = menu?.venue ?? venue;
  const offers = menu?.offers ?? [];
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [nativeOfferSave, setNativeOfferSave] = useState(nativeOfferSaveEnabled);
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
      setNativeOfferSave(nativeOfferSaveEnabled());
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

  const orderedOffers = offerFocus
    ? [...offers].sort((a, b) => Number(b.id === offerFocus) - Number(a.id === offerFocus))
    : focus
      ? [...offers].sort(
          (a, b) =>
            Number(menuOfferMatchesFocus(b, focus)) - Number(menuOfferMatchesFocus(a, focus)),
        )
      : offers;
  const observations = new Map(
    rows
      .filter((row) => row.kind === "menu_offer" && row.offer_id)
      .map((row) => [row.offer_id, row]),
  );
  const additional = rows.filter((row) => row.kind === "new_drink");
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
  const priceForm = editor && chosenCurrency && (
    <form
      class="mobile-customer-v2__form"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <strong>
        {editor.kind === "menu_offer"
          ? `Prezzo pagato per ${editor.offer.name}`
          : editor.row
            ? `Aggiorna ${editor.row.name}`
            : "Aggiungi un drink mancante"}
      </strong>
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
      <label htmlFor={`${formId}-amount`}>Importo pagato ({chosenCurrency.currency})</label>
      <input
        id={`${formId}-amount`}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={amount}
        required
        maxLength={9}
        onInput={(event) => {
          setAmount(event.currentTarget.value);
        }}
        placeholder={chosenCurrency.exponent === 2 ? "0,00" : "0"}
      />
      <small>
        Prezzo del drink e della porzione indicata, nella valuta originale. Eventuali supplementi
        restano separati.
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
          Annulla
        </button>
        <button
          type="submit"
          class="btn btn--primary"
          disabled={saving || resolvingOffer !== null || validAmount === null || !validNewName}
        >
          {saving ? "Invio…" : resolvingOffer ? "Caricamento…" : "Condividi prezzo"}
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
    return (
      <div class="mobile-customer-v2__observation">
        <span>Prezzo segnalato da un cliente</span>
        <strong>{menuMoney(row.amount_minor, row.currency, row.currency_exponent)}</strong>
        <small>Pagato il {customerDate(row)} · prezzo del drink, non totale del conto</small>
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

  if (!menu && loadState === "missing") return null;

  return (
    <>
      {offers.length > 0 && (
        <ul class="mobile-menu-v2__offers">
          {orderedOffers.map((offer) => {
            const customer = observations.get(offer.id);
            const exactSaved = offerFocus === offer.id;
            const categorySaved = focus !== null && menuOfferMatchesFocus(offer, focus);
            return (
              <li
                key={offer.id}
                class={`mobile-menu-v2__offer${exactSaved || categorySaved ? " mobile-menu-v2__offer--focused" : ""}`}
                data-testid={
                  exactSaved ? "saved-exact-offer" : categorySaved ? "saved-menu-offer" : undefined
                }
              >
                <span class="mobile-menu-v2__name">
                  {offer.name}
                  <small class="mobile-menu-v2__provenance">Prezzo da menu</small>
                  {exactSaved ? (
                    <small class="mobile-menu-v2__saved">Questo drink è nei tuoi preferiti</small>
                  ) : (
                    categorySaved && (
                      <small class="mobile-menu-v2__saved">
                        Stesso tipo di drink salvato · {focus.hh ? "Happy hour" : "Prezzo normale"}
                      </small>
                    )
                  )}
                </span>
                <strong class="mobile-menu-v2__amount">
                  {menuMoney(offer.amount_minor, offer.currency, offer.currency_exponent)}
                </strong>
                <span class="mobile-menu-v2__meta">
                  {[
                    offer.serving.label ??
                      (offer.serving.ml ? `${String(offer.serving.ml)} ml` : ""),
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
                <a
                  href={offer.source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="mobile-menu-v2__source"
                >
                  Menu verificato il {offer.source.checked_on}
                </a>
                {nativeOfferSave && mobileOfferIdPattern.test(offer.id) && (
                  <a
                    href={mobileOfferSaveURL(key, cell, offer.id)}
                    class="btn btn--secondary mobile-menu-v2__save"
                  >
                    Salva questo drink
                  </a>
                )}
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
              </li>
            );
          })}
        </ul>
      )}
      <section class="mobile-customer-v2" aria-label="Prezzi segnalati dai clienti">
        <h4>Prezzi segnalati dai clienti</h4>
        <p>
          Prezzi pagati e condivisi dalle persone. Restano distinti dai prezzi documentati nel menu
          del locale e non li sostituiscono.
        </p>
        {loadState === "loading" && (
          <p class="hint" role="status">
            Caricamento segnalazioni…
          </p>
        )}
        {loadState === "missing" && !hasLegacyPrices && (
          <p class="hint">Le segnalazioni dei clienti non sono ancora disponibili qui.</p>
        )}
        {loadState === "failed" && (
          <div class="mobile-menu-v2__error" role="alert">
            <p>Non riusciamo a caricare i prezzi segnalati.</p>
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
            {rows.length === 0 && (
              <p class="hint">
                {hasLegacyPrices
                  ? offers.length === 0
                    ? "Nessun altro prezzo segnalato."
                    : "Nessun altro prezzo segnalato per i drink del menu."
                  : offers.length === 0
                    ? "Nessun prezzo segnalato ancora."
                    : "Nessun prezzo segnalato per i drink del menu."}
              </p>
            )}
            {additional.length > 0 && (
              <>
                <h5>Altri drink segnalati</h5>
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
                      <button
                        type="button"
                        class="btn btn--secondary mobile-customer-v2__update"
                        onClick={() => {
                          beginNew(row);
                        }}
                      >
                        Prezzo diverso? Aggiorna
                      </button>
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
