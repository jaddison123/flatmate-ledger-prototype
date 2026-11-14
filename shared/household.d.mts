// Types for household.mjs (that file stays plain JavaScript so Node can run it without a build).

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

/** Everything shared by a house. */
export interface Household {
  roommates: Roommate[];
  chores: Chore[];
  expenses: Expense[];
  notes: Note[];
  /** Display name of the house, shown in the hero and top bar. Empty = default. */
  householdName: string;
}

export type ChoreUpdates = Partial<Omit<Chore, "id">>;

export type HouseholdAction =
  | { type: "addRoommate"; roommate: Roommate }
  | { type: "removeRoommate"; id: string }
  | { type: "addChore"; chore: Chore }
  | { type: "updateChore"; id: string; updates: ChoreUpdates }
  | { type: "removeChore"; id: string }
  | { type: "rotateRoster"; week: string }
  | { type: "addExpense"; expense: Expense }
  | { type: "removeExpense"; id: string }
  | { type: "addNote"; note: Note }
  | { type: "removeNote"; id: string }
  | { type: "setHouseholdName"; name: string };

export declare const LIMITS: {
  roommates: number;
  chores: number;
  expenses: number;
  notes: number;
  idLength: number;
  roommateName: number;
  choreTitle: number;
  expenseTitle: number;
  noteText: number;
  houseName: number;
  maxAmount: number;
};

export declare function emptyHousehold(): Household;
export declare function normalizeHousehold(value: unknown): Household | null;
export declare function hasHouseholdContent(household: Household): boolean;
export declare class ActionError extends Error {}
export declare function applyAction(household: Household, action: HouseholdAction): Household;
