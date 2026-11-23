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

/** The 3D flat's furniture choices: one style id per slot (see DECOR_OPTIONS). */
export interface Decor {
  walls: "classic" | "sage" | "blush" | "navy";
  floor: "oak" | "walnut" | "grey";
  sofa: "classic" | "corner" | "beanbags";
  upholstery: "red" | "green" | "mustard" | "grey";
  rug: "rectangle" | "round" | "striped" | "none";
  plant: "leafy" | "cactus" | "palm";
  lamp: "floor" | "arc" | "fairy";
  kitchen: "white" | "wood" | "mint";
  table: "wood" | "round";
  bath: "bath" | "shower";
  fridge: "classic" | "retro" | "steel";
  tv: "flat" | "crt" | "projector";
  board: "whiteboard" | "chalkboard" | "cork";
  frontDoor: "red" | "navy" | "green";
  mirror: "gilt" | "round" | "cabinet";
}

export type DecorSlot = keyof Decor;

/** Everything shared by a house. */
export interface Household {
  roommates: Roommate[];
  chores: Chore[];
  expenses: Expense[];
  notes: Note[];
  /** Display name of the house, shown in the hero and top bar. Empty = default. */
  householdName: string;
  /** Furniture styles in the 3D flat. Missing in older saved houses: filled with defaults. */
  decor: Decor;
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
  | { type: "setHouseholdName"; name: string }
  | { [S in DecorSlot]: { type: "setDecor"; slot: S; style: Decor[S] } }[DecorSlot];

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

export declare const DECOR_OPTIONS: { [S in DecorSlot]: readonly Decor[S][] };
export declare function defaultDecor(): Decor;
export declare function emptyHousehold(): Household;
export declare function normalizeHousehold(value: unknown): Household | null;
export declare function hasHouseholdContent(household: Household): boolean;
export declare class ActionError extends Error {}
export declare function applyAction(household: Household, action: HouseholdAction): Household;
