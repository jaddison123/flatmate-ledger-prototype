// A house's shared data (housemates, chores, bills, notes, name), kept in sync with the server.
//
// The server is the source of truth. Each change is sent as an "action"; it shows on screen at
// once (an optimistic copy) and is replaced by the server's version when that arrives over the
// live event stream or in the reply. If the server rejects a change, it simply disappears and an
// error is shown. The last copy seen is cached in localStorage so the page appears instantly
// while the server wakes up.
import { useEffect, useMemo, useState } from "react";
import {
  applyAction,
  emptyHousehold,
  normalizeHousehold,
  type ChoreUpdates,
  type Chore,
  type Expense,
  type Household,
  type HouseholdAction,
} from "../../shared/household.mjs";
import {
  ApiError,
  apiRequest,
  readChatName,
  readHouseCache,
  saveChatName,
  writeHouseCache,
} from "../lib/house";

export type { Chore, Expense, Household, Note, Roommate } from "../../shared/household.mjs";

/** connecting: first load; live: in sync; reconnecting: connection lost; missing: no such house. */
export type SyncStatus = "connecting" | "live" | "reconnecting" | "missing";

interface Snapshot {
  version: number;
  household: Household;
}

interface PendingAction {
  id: string;
  action: HouseholdAction;
}

const RETRY_DELAY_MS = 4000;

function createId(): string {
  return globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Validates a `{ version, household, actionId? }` value sent by the server. */
function parseSnapshot(value: unknown): (Snapshot & { actionId?: string }) | null {
  if (typeof value !== "object" || value === null) return null;
  const { version, household, actionId } = value as Record<string, unknown>;
  const clean = normalizeHousehold(household);
  if (typeof version !== "number" || !clean) return null;
  return { version, household: clean, ...(typeof actionId === "string" ? { actionId } : {}) };
}

function parseEvent(event: Event) {
  try {
    return parseSnapshot(JSON.parse((event as MessageEvent<string>).data));
  } catch {
    return null;
  }
}

export function useHouseholdData(houseCode: string) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(() => readHouseCache(houseCode));
  const [pending, setPending] = useState<PendingAction[]>([]);
  const [status, setStatus] = useState<SyncStatus>("connecting");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [chatUsername, setChatUsernameState] = useState(readChatName);
  // Bumped to start over (fetch + new event stream) after the connection fails for good.
  const [attempt, setAttempt] = useState(0);

  /** Takes a server copy if it is newer than ours (or always, for a fresh full snapshot). */
  function acceptSnapshot(next: Snapshot, always = false) {
    setSnapshot((current) =>
      always || !current || next.version > current.version
        ? { version: next.version, household: next.household }
        : current,
    );
  }

  useEffect(() => {
    let cancelled = false;
    let source: EventSource | null = null;
    let retryTimer: number | undefined;

    function retrySoon() {
      retryTimer = window.setTimeout(() => setAttempt((count) => count + 1), RETRY_DELAY_MS);
    }

    // Check the house exists first: an EventSource cannot tell us about a 404.
    apiRequest<unknown>(`/api/houses/${houseCode}`)
      .then((result) => {
        if (cancelled) return;
        const fresh = parseSnapshot(result);
        if (fresh) acceptSnapshot(fresh, true);

        source = new EventSource(`/api/houses/${houseCode}/events`);
        source.onerror = () => {
          setStatus("reconnecting");
          // The browser retries dropped streams itself, but gives up after an error response
          // (e.g. the server restarted and lost the house), so start over in that case.
          if (source?.readyState === EventSource.CLOSED) {
            source.close();
            retrySoon();
          }
        };
        source.addEventListener("snapshot", (event) => {
          const next = parseEvent(event);
          if (!next) return;
          acceptSnapshot(next, true);
          setStatus("live");
          setSyncError(null);
        });
        source.addEventListener("household", (event) => {
          const next = parseEvent(event);
          if (!next) return;
          acceptSnapshot(next);
          if (next.actionId) setPending((current) => current.filter((item) => item.id !== next.actionId));
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 404) {
          setStatus("missing");
          return;
        }
        setStatus("reconnecting");
        retrySoon();
      });

    return () => {
      cancelled = true;
      source?.close();
      window.clearTimeout(retryTimer);
    };
  }, [houseCode, attempt]);

  // Remember the latest server copy on this device.
  useEffect(() => {
    if (snapshot) writeHouseCache(houseCode, snapshot);
  }, [houseCode, snapshot]);

  // What the page shows: the server's copy plus our changes it has not confirmed yet.
  const household = useMemo(() => {
    const base = snapshot?.household ?? emptyHousehold();
    return pending.reduce((current, item) => {
      try {
        return applyAction(current, item.action);
      } catch {
        return current; // the server will reject it too
      }
    }, base);
  }, [snapshot, pending]);

  function dispatch(action: HouseholdAction): void {
    const id = createId();
    setPending((current) => [...current, { id, action }]);
    apiRequest<unknown>(`/api/houses/${houseCode}/actions`, { actionId: id, action })
      .then((result) => {
        const confirmed = parseSnapshot(result);
        if (confirmed) acceptSnapshot(confirmed);
        setSyncError(null);
      })
      .catch((error: unknown) => {
        const reason = error instanceof Error ? error.message : "Unknown error.";
        setSyncError(`That change was not saved. ${reason}`);
      })
      .finally(() => setPending((current) => current.filter((item) => item.id !== id)));
  }

  return {
    ...household,
    /** False until the house has loaded at least once (from the server or this device's cache). */
    isLoaded: snapshot !== null,
    status,
    syncError,
    chatUsername,
    setChatUsername(name: string) {
      setChatUsernameState(name);
      saveChatName(name);
    },
    addRoommate(roommate: { name: string }): string {
      const id = createId();
      dispatch({ type: "addRoommate", roommate: { id, name: roommate.name } });
      return id;
    },
    /** Also unassigns their chores. */
    removeRoommate(id: string) {
      dispatch({ type: "removeRoommate", id });
    },
    addChore(chore: Omit<Chore, "id">): string {
      const id = createId();
      dispatch({ type: "addChore", chore: { ...chore, id } });
      return id;
    },
    updateChore(id: string, updates: ChoreUpdates) {
      dispatch({ type: "updateChore", id, updates });
    },
    removeChore(id: string) {
      dispatch({ type: "removeChore", id });
    },
    /** Passes each assigned chore to the next housemate and resets it for `week`. */
    rotateRoster(week: string) {
      dispatch({ type: "rotateRoster", week });
    },
    addExpense(expense: Omit<Expense, "id">): string {
      const id = createId();
      dispatch({ type: "addExpense", expense: { ...expense, id } });
      return id;
    },
    removeExpense(id: string) {
      dispatch({ type: "removeExpense", id });
    },
    addNote(text: string) {
      dispatch({ type: "addNote", note: { id: createId(), text, createdAt: new Date().toISOString() } });
    },
    removeNote(id: string) {
      dispatch({ type: "removeNote", id });
    },
    setHouseholdName(name: string) {
      dispatch({ type: "setHouseholdName", name });
    },
  };
}
