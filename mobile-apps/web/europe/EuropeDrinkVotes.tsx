import { createContext, type ComponentChildren } from "preact";
import { useContext, useEffect, useRef, useState } from "preact/hooks";
import { z } from "zod";
import { currentLang, it } from "@site/app/i18n/lang";
import { mobileVoterId } from "../drink-votes";
import { ServingSchema, servingLabel, validServing, type Price, type Venue } from "./model";

const t = (italian: string, english: string) => (currentLang() === "en" ? english : italian);
const Target = z
  .strictObject({
    kind: z.literal("europe"),
    drink: z.string(),
    band: z.enum(["normal", "happy_hour"]),
    currency: z.enum(["EUR", "GBP"]),
    serving: ServingSchema,
  })
  .refine((value) => validServing(value.drink, value.serving));
type EuropeTarget = z.infer<typeof Target>;
const Item = z.object({
  target: z.unknown(),
  count: z.number().int().nonnegative(),
  recommended: z.boolean(),
});
const Snapshot = z.object({
  schema_version: z.literal(1),
  venue: z.object({ key: z.string(), cell: z.string(), name: z.string() }),
  items: z.array(Item).max(10000),
});
type Vote = { target: EuropeTarget; count: number; recommended: boolean };
type Phase = "loading" | "ready" | "error";
interface VoteState {
  phase: Phase;
  voter: string | null;
  items: Map<string, Vote>;
  busy: Set<string>;
  failed: Set<string>;
  retry: () => void;
  toggle: (target: EuropeTarget) => Promise<void>;
}
const Context = createContext<VoteState | null>(null);

export function europeVoteTarget(row: Price): EuropeTarget {
  return {
    kind: "europe",
    drink: row.drink,
    band: row.hh ? "happy_hour" : "normal",
    currency: row.currency,
    serving: row.serving,
  };
}

function targetKey(target: EuropeTarget): string {
  return JSON.stringify([
    target.drink,
    target.band,
    target.currency,
    target.serving.unit,
    target.serving.ml ?? null,
  ]);
}

function voteURL(venue: Venue, includeEurope: boolean): string {
  const params = new URLSearchParams({ cell: venue.cell });
  if (includeEurope) params.set("include_europe", "1");
  return `/api/mobile/v2/drink-votes/venues/${encodeURIComponent(venue.key)}?${params}`;
}

async function timedFetch(url: string, init: RequestInit, signal?: AbortSignal): Promise<Response> {
  const controller = new AbortController();
  const abort = () => {
    controller.abort();
  };
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(abort, 15000);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

async function load(
  venue: Venue,
  voter: string | null,
  signal?: AbortSignal,
): Promise<Map<string, Vote>> {
  const response = await timedFetch(
    voteURL(venue, true),
    { headers: voter ? { "X-DoveBevo-Voter": voter } : undefined },
    signal,
  );
  if (!response.ok) throw new Error(`Vote read failed: ${String(response.status)}`);
  const snapshot = Snapshot.parse(await response.json());
  if (snapshot.venue.key !== venue.key || snapshot.venue.cell !== venue.cell)
    throw new Error("Vote venue identity mismatch");
  const items = new Map<string, Vote>();
  for (const item of snapshot.items) {
    if (!item.target || typeof item.target !== "object" || !("kind" in item.target))
      throw new Error("Invalid vote target");
    if (item.target.kind !== "europe") continue;
    const target = Target.parse(item.target);
    if (target.currency !== venue.currency) throw new Error("Vote currency mismatch");
    const identity = targetKey(target);
    if (items.has(identity)) throw new Error("Duplicate European vote identity");
    items.set(identity, { target, count: item.count, recommended: item.recommended });
  }
  return items;
}

async function update(
  venue: Venue,
  voter: string,
  target: EuropeTarget,
  recommended: boolean,
): Promise<Vote> {
  const response = await timedFetch(voteURL(venue, false), {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-DoveBevo-Voter": voter },
    body: JSON.stringify({ target, recommended }),
  });
  if (!response.ok) throw new Error(`Vote write failed: ${String(response.status)}`);
  const item = Item.parse(await response.json());
  const returned = Target.parse(item.target);
  if (targetKey(returned) !== targetKey(target) || item.recommended !== recommended)
    throw new Error("Vote response identity mismatch");
  return { target: returned, count: item.count, recommended: item.recommended };
}

/** One opt-in read per open venue; controls share this snapshot and voter identity. */
export function EuropeDrinkVotesProvider({
  venue,
  children,
}: {
  venue: Venue;
  children: ComponentChildren;
}) {
  const [voter] = useState(mobileVoterId);
  const [phase, setPhase] = useState<Phase>("loading");
  const [items, setItems] = useState<Map<string, Vote>>(() => new Map());
  const [busy, setBusy] = useState<Set<string>>(() => new Set());
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const [version, setVersion] = useState(0);
  const busyRef = useRef<Set<string>>(new Set());
  const alive = useRef(true);
  const identity = `${venue.key}:${venue.cell}`;
  const identityRef = useRef(identity);
  identityRef.current = identity;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    busyRef.current.clear();
    setBusy(new Set());
    setItems(new Map());
    setFailed(new Set());
    setPhase("loading");
    void load(venue, voter, controller.signal)
      .then((next) => {
        if (controller.signal.aborted || identityRef.current !== identity) return;
        setItems(next);
        setPhase("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted && identityRef.current === identity) setPhase("error");
      });
    return () => {
      controller.abort();
    };
  }, [venue.key, venue.cell, voter, version]);

  const retry = () => {
    setVersion((value) => value + 1);
  };
  const toggle = async (target: EuropeTarget) => {
    if (phase !== "ready" || voter === null) return;
    const currentIdentity = identity;
    const key = targetKey(target);
    if (busyRef.current.has(key)) return;
    busyRef.current.add(key);
    setBusy(new Set(busyRef.current));
    setFailed((previous) => {
      const next = new Set(previous);
      next.delete(key);
      return next;
    });
    const desired = !(items.get(key)?.recommended ?? false);
    try {
      const item = await update(venue, voter, target, desired);
      if (alive.current && identityRef.current === currentIdentity)
        setItems((previous) => new Map(previous).set(key, item));
    } catch {
      // A lost POST response may still mean a committed vote: ask the server.
      try {
        const reconciled = await load(venue, voter);
        if (alive.current && identityRef.current === currentIdentity) {
          setItems(reconciled);
          if ((reconciled.get(key)?.recommended ?? false) !== desired)
            setFailed((previous) => new Set(previous).add(key));
        }
      } catch {
        if (alive.current && identityRef.current === currentIdentity) setPhase("error");
      }
    } finally {
      busyRef.current.delete(key);
      if (alive.current && identityRef.current === currentIdentity)
        setBusy(new Set(busyRef.current));
    }
  };

  return (
    <Context.Provider value={{ phase, voter, items, busy, failed, retry, toggle }}>
      {phase === "error" && (
        <p class="europe-vote-status" role="alert">
          {t("Consigli non disponibili.", "Recommendations unavailable.")}{" "}
          <button type="button" class="btn btn--ghost" onClick={retry}>
            {t("Riprova", "Retry")}
          </button>
        </p>
      )}
      {children}
    </Context.Provider>
  );
}

export function EuropeDrinkVoteButton({ row, venue }: { row: Price; venue: Venue }) {
  const votes = useContext(Context);
  if (!votes) return null;
  const target = europeVoteTarget(row);
  const key = targetKey(target);
  const item = votes.items.get(key);
  const count = item?.count ?? 0;
  const recommended = item?.recommended ?? false;
  const pending = votes.busy.has(key);
  const name = `${it.drinks[row.drink] ?? row.drink} ${servingLabel(row.serving)} ${t("da", "at")} ${venue.name}`;
  return (
    <>
      <button
        type="button"
        class="mobile-drink-vote europe-drink-vote"
        aria-label={`${recommended ? t("Rimuovi il consiglio per", "Remove recommendation for") : t("Consiglia", "Recommend")} ${name}. ${String(count)} ${t("consigli", "recommendations")}`}
        aria-pressed={recommended}
        disabled={votes.phase !== "ready" || votes.voter === null || pending}
        data-voted={recommended ? "true" : undefined}
        onClick={() => void votes.toggle(target)}
      >
        <span aria-hidden="true">👍</span>
        <span aria-hidden="true">{votes.phase === "ready" ? count : "–"}</span>
      </button>
      {votes.failed.has(key) && (
        <small class="europe-vote-failed" role="alert">
          {t("Consiglio non salvato. Riprova.", "Recommendation not saved. Retry.")}
        </small>
      )}
    </>
  );
}
