import { useEffect, useRef, useState } from "react";

export interface Roommate {
  id: string;
  name: string;
}

export interface Chore {
  id: string;
  title: string;
  assigneeId: string | null;
  dueDate: string | null;
  completed: boolean;
  completedWeek?: string;
}

export interface Expense {
  id: string;
  title: string;
  amount: number;
  paidById: string;
  splitBetweenIds: string[];
  date: string;
}

/** A short reminder or note that is not a chore (e.g. "Landlord visiting Friday"). */
export interface Note {
  id: string;
  text: string;
  createdAt: string;
}

export interface HouseholdData {
  roommates: Roommate[];
  chores: Chore[];
  expenses: Expense[];
  notes: Note[];
  chatUsername: string;
  /** Display name of the house, shown in the hero and top bar. Empty = default. */
  householdName: string;
}

const STORAGE_KEY = "flatmate-ledger:household:v1";

const EMPTY_HOUSEHOLD: HouseholdData = {
  roommates: [],
  chores: [],
  expenses: [],
  notes: [],
  chatUsername: "",
  householdName: "",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRoommate(value: unknown): value is Roommate {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string"
  );
}

function isChore(value: unknown): value is Chore {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    (typeof value.assigneeId === "string" || value.assigneeId === null) &&
    (typeof value.dueDate === "string" || value.dueDate === null) &&
    typeof value.completed === "boolean" &&
    (value.completedWeek === undefined || typeof value.completedWeek === "string")
  );
}

function isExpense(value: unknown): value is Expense {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.amount === "number" &&
    Number.isFinite(value.amount) &&
    typeof value.paidById === "string" &&
    Array.isArray(value.splitBetweenIds) &&
    value.splitBetweenIds.every((id) => typeof id === "string") &&
    typeof value.date === "string"
  );
}

function isNote(value: unknown): value is Note {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.text === "string" &&
    typeof value.createdAt === "string"
  );
}

// Fields added after the first release are optional so older saved data still loads.
type StoredHouseholdData = Omit<HouseholdData, "chatUsername" | "householdName" | "notes"> & {
  notes?: Note[];
  chatUsername?: string;
  householdName?: string;
};

function isHouseholdData(value: unknown): value is StoredHouseholdData {
  return (
    isRecord(value) &&
    Array.isArray(value.roommates) &&
    value.roommates.every(isRoommate) &&
    Array.isArray(value.chores) &&
    value.chores.every(isChore) &&
    Array.isArray(value.expenses) &&
    value.expenses.every(isExpense) &&
    (value.notes === undefined || (Array.isArray(value.notes) && value.notes.every(isNote))) &&
    (value.chatUsername === undefined || typeof value.chatUsername === "string") &&
    (value.householdName === undefined || typeof value.householdName === "string")
  );
}

function readHouseholdData(): { data: HouseholdData; error: string | null } {
  if (typeof window === "undefined") {
    return { data: EMPTY_HOUSEHOLD, error: null };
  }

  try {
    const storedData = window.localStorage.getItem(STORAGE_KEY);
    if (storedData === null) {
      return { data: EMPTY_HOUSEHOLD, error: null };
    }

    const parsed: unknown = JSON.parse(storedData);
    if (!isHouseholdData(parsed)) {
      return {
        data: EMPTY_HOUSEHOLD,
        error: "Saved household data has an invalid format.",
      };
    }

    return {
      data: {
        roommates: parsed.roommates,
        chores: parsed.chores,
        expenses: parsed.expenses,
        notes: parsed.notes ?? [],
        chatUsername: parsed.chatUsername ?? "",
        householdName: parsed.householdName ?? "",
      },
      error: null,
    };
  } catch {
    return {
      data: EMPTY_HOUSEHOLD,
      error: "Could not read household data from localStorage.",
    };
  }
}

function createId(): string {
  return globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function updateById<T extends { id: string }>(
  items: T[],
  id: string,
  updates: Partial<Omit<T, "id">>,
): T[] {
  return items.map((item) => (item.id === id ? { ...item, ...updates } : item));
}

function removeById<T extends { id: string }>(items: T[], id: string): T[] {
  return items.filter((item) => item.id !== id);
}

export function useHouseholdData() {
  const [initial] = useState(readHouseholdData);
  const [data, setData] = useState(initial.data);
  const [storageError, setStorageError] = useState(initial.error);
  const lastPersistedData = useRef(data);

  useEffect(() => {
    if (data === lastPersistedData.current) {
      return;
    }

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      lastPersistedData.current = data;
      setStorageError(null);
    } catch {
      setStorageError("Could not save household data to localStorage.");
    }
  }, [data]);

  function addRoommate(roommate: Omit<Roommate, "id">): string {
    const id = createId();
    setData((current) => ({
      ...current,
      roommates: [...current.roommates, { ...roommate, id }],
    }));
    return id;
  }

  function removeRoommate(id: string): void {
    setData((current) => ({
      ...current,
      roommates: removeById(current.roommates, id),
    }));
  }

  function addChore(chore: Omit<Chore, "id">): string {
    const id = createId();
    setData((current) => ({
      ...current,
      chores: [...current.chores, { ...chore, id }],
    }));
    return id;
  }

  function updateChore(id: string, updates: Partial<Omit<Chore, "id">>): void {
    setData((current) => ({
      ...current,
      chores: updateById(current.chores, id, updates),
    }));
  }

  function removeChore(id: string): void {
    setData((current) => ({
      ...current,
      chores: removeById(current.chores, id),
    }));
  }

  function addExpense(expense: Omit<Expense, "id">): string {
    const id = createId();
    setData((current) => ({
      ...current,
      expenses: [...current.expenses, { ...expense, id }],
    }));
    return id;
  }

  function removeExpense(id: string): void {
    setData((current) => ({
      ...current,
      expenses: removeById(current.expenses, id),
    }));
  }

  function setChatUsername(chatUsername: string): void {
    setData((current) => ({ ...current, chatUsername }));
  }

  function addNote(text: string): void {
    setData((current) => ({
      ...current,
      // Newest first
      notes: [
        { id: createId(), text, createdAt: new Date().toISOString() },
        ...current.notes,
      ],
    }));
  }

  function removeNote(id: string): void {
    setData((current) => ({ ...current, notes: removeById(current.notes, id) }));
  }

  function setHouseholdName(householdName: string): void {
    setData((current) => ({ ...current, householdName }));
  }

  return {
    ...data,
    storageError,
    addNote,
    removeNote,
    setHouseholdName,
    addRoommate,
    removeRoommate,
    addChore,
    updateChore,
    removeChore,
    addExpense,
    removeExpense,
    setChatUsername,
  };
}
