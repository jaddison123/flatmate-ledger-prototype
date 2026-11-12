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

export interface HouseholdData {
  roommates: Roommate[];
  chores: Chore[];
  expenses: Expense[];
  chatUsername: string;
}

const STORAGE_KEY = "flatmate-ledger:household:v1";

const EMPTY_HOUSEHOLD: HouseholdData = {
  roommates: [],
  chores: [],
  expenses: [],
  chatUsername: "",
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

type StoredHouseholdData = Omit<HouseholdData, "chatUsername"> & {
  chatUsername?: string;
  chatMessages?: unknown;
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
    (value.chatMessages === undefined || Array.isArray(value.chatMessages)) &&
    (value.chatUsername === undefined || typeof value.chatUsername === "string")
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
        chatUsername: parsed.chatUsername ?? "",
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

  function updateRoommate(
    id: string,
    updates: Partial<Omit<Roommate, "id">>,
  ): void {
    setData((current) => ({
      ...current,
      roommates: updateById(current.roommates, id, updates),
    }));
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

  function updateExpense(
    id: string,
    updates: Partial<Omit<Expense, "id">>,
  ): void {
    setData((current) => ({
      ...current,
      expenses: updateById(current.expenses, id, updates),
    }));
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

  return {
    ...data,
    storageError,
    addRoommate,
    updateRoommate,
    removeRoommate,
    addChore,
    updateChore,
    removeChore,
    addExpense,
    updateExpense,
    removeExpense,
    setChatUsername,
  };
}
