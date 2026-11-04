import { createContext, type ComponentChildren } from "preact";
import { useContext, useEffect, useRef, useState } from "preact/hooks";
import {
  loadDrinkVotes,
  mobileVoterId,
  setDrinkVote,
  voteTargetKey,
  type DrinkVoteItem,
  type DrinkVoteTarget,
} from "../drink-votes";

type Phase = "loading" | "ready" | "error";
interface VoteContextValue {
  phase: Phase;
  voter: string | null;
  items: Map<string, DrinkVoteItem>;
  busy: Set<string>;
  failed: Set<string>;
  refresh: () => void;
  toggle: (target: DrinkVoteTarget) => Promise<void>;
}
const VoteContext = createContext<VoteContextValue | null>(null);

/** One authenticated read per opened venue; every row consumes the same exact-item snapshot. */
export function DrinkVotesProvider({
  venueKey,
  cell,
  children,
}: {
  venueKey: string;
  cell: string;
  children: ComponentChildren;
}) {
  const [voter] = useState(mobileVoterId);
  const [phase, setPhase] = useState<Phase>("loading");
  const [items, setItems] = useState<Map<string, DrinkVoteItem>>(() => new Map());
  const [busy, setBusy] = useState<Set<string>>(() => new Set());
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const [version, setVersion] = useState(0);
  const busyRef = useRef<Set<string>>(new Set());
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setPhase("loading");
    void loadDrinkVotes(venueKey, cell, voter, controller.signal)
      .then((next) => {
        if (controller.signal.aborted) return;
        setItems(next);
        setFailed(new Set());
        setPhase("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setPhase("error");
      });
    return () => {
      controller.abort();
    };
  }, [venueKey, cell, voter, version]);

  const refresh = () => {
    setVersion((value) => value + 1);
  };
  const toggle = async (target: DrinkVoteTarget) => {
    if (phase !== "ready" || !voter) return;
    const identity = voteTargetKey(target);
    if (busyRef.current.has(identity)) return;
    busyRef.current.add(identity);
    setBusy(new Set(busyRef.current));
    setFailed((previous) => {
      const next = new Set(previous);
      next.delete(identity);
      return next;
    });
    const desired = !(items.get(identity)?.recommended ?? false);
    try {
      const updated = await setDrinkVote(venueKey, cell, voter, target, desired);
      if (alive.current) setItems((previous) => new Map(previous).set(identity, updated));
    } catch {
      // A lost POST response may still represent a committed vote. Read the authority first.
      try {
        const reconciled = await loadDrinkVotes(venueKey, cell, voter);
        if (alive.current) {
          setItems(reconciled);
          if ((reconciled.get(identity)?.recommended ?? false) !== desired)
            setFailed((previous) => new Set(previous).add(identity));
        }
      } catch {
        if (alive.current) setPhase("error");
      }
    } finally {
      busyRef.current.delete(identity);
      if (alive.current) setBusy(new Set(busyRef.current));
    }
  };

  return (
    <VoteContext.Provider value={{ phase, voter, items, busy, failed, refresh, toggle }}>
      {children}
    </VoteContext.Provider>
  );
}

/** Direct public recommendation for the exact drink identity represented by its row. */
export function DrinkVoteButton({ target, name }: { target: DrinkVoteTarget; name: string }) {
  const votes = useContext(VoteContext);
  if (!votes) return null;
  const identity = voteTargetKey(target);
  const item = votes.items.get(identity);
  const count = item?.count ?? 0;
  const recommended = item?.recommended ?? false;
  const isBusy = votes.busy.has(identity);
  const unavailable = votes.phase !== "ready" || votes.voter === null;
  const failed = votes.failed.has(identity);
  const label =
    votes.phase === "error"
      ? `Riprova a caricare i consigli per ${name}`
      : votes.voter === null
        ? `Consigli non modificabili su questo dispositivo: ${name}`
        : `${recommended ? "Rimuovi il consiglio per" : "Consiglia"} ${name}. ${String(count)} consigli`;
  return (
    <button
      type="button"
      class="mobile-drink-vote"
      aria-label={label}
      aria-pressed={recommended}
      disabled={votes.phase === "loading" || isBusy || votes.voter === null}
      data-voted={recommended ? "true" : undefined}
      onClick={() => {
        if (votes.phase === "error") votes.refresh();
        else void votes.toggle(target);
      }}
    >
      <span aria-hidden="true">👍</span>
      <span aria-hidden="true">{votes.phase === "ready" ? count : "–"}</span>
      {failed && <span class="sr-only">Il consiglio non è stato salvato. Riprova.</span>}
      {unavailable && votes.phase === "loading" && <span class="sr-only">Caricamento.</span>}
    </button>
  );
}
