// Types for household.mjs (that file stays plain JavaScript so Node can run it without a build).

export interface Roommate {
  id: string;
  name: string;
  /** Their avatar in the 3D flat. Missing in older saved houses: filled from defaultLook(id). */
  look: Look;
}

/** A housemate's avatar (see LOOK_OPTIONS). */
export interface Look {
  /** 0 = male … LOOK_BUILD_MAX = female: shoulders, waist and hips in between. */
  build: number;
  skin: "porcelain" | "fair" | "light" | "tan" | "olive" | "brown" | "deep" | "ebony";
  hair: "short" | "buzz" | "quiff" | "curly" | "bob" | "long" | "ponytail" | "bun" | "afro" | "bald";
  hairColour: "black" | "brown" | "chestnut" | "blonde" | "ginger" | "grey" | "pink" | "blue";
  top: "tee" | "hoodie" | "shirt" | "jacket" | "stripes";
  /** "name" = the person's own colour (lib/nameColour.ts). */
  topColour: "name" | "red" | "orange" | "yellow" | "green" | "teal" | "blue" | "purple" | "black" | "white";
  bottoms: "trousers" | "shorts" | "skirt";
  bottomColour: "denim" | "black" | "grey" | "khaki" | "navy" | "brown";
  extra: "none" | "glasses" | "shades" | "beanie" | "cap" | "headphones";
}

export type LookPart = keyof Look;
/** The parts chosen from a list (everything but the build slider). */
export type LookListPart = Exclude<LookPart, "build">;

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
  art: "print" | "poster" | "photos" | "neon" | "none";
  pet: "none" | "cat" | "fish" | "hamster";
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
  | { type: "addRoommate"; roommate: Pick<Roommate, "id" | "name"> }
  | { [P in LookPart]: { type: "setLook"; id: string; part: P; value: Look[P] } }[LookPart]
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
  storedRoommates: number;
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
export declare const LOOK_OPTIONS: { [P in LookListPart]: readonly Look[P][] };
export declare const LOOK_BUILD_MAX: number;
export declare function defaultLook(id: string): Look;
export declare function emptyHousehold(): Household;
export declare function normalizeHousehold(value: unknown): Household | null;
export declare function hasHouseholdContent(household: Household): boolean;
export declare function chatRoommateId(household: Household, value: unknown): string | null;
export declare class ActionError extends Error {}
export declare function applyAction(household: Household, action: HouseholdAction): Household;
