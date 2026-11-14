// Household data shared by everyone in a house: validation and the list of changes ("actions").
// Plain JavaScript so the Node server (no build step) and the browser can both import it:
// the server uses it to check and apply every change, the browser to show a change instantly
// while the server confirms it. Types live in household.d.mts.

/** Size limits, matching the form inputs; the server rejects anything larger. */
export const LIMITS = {
  roommates: 30,
  chores: 300,
  expenses: 2000,
  notes: 100,
  idLength: 100,
  roommateName: 40,
  choreTitle: 70,
  expenseTitle: 70,
  noteText: 140,
  houseName: 28,
  maxAmount: 1_000_000,
};

export function emptyHousehold() {
  return { roommates: [], chores: [], expenses: [], notes: [], householdName: "" };
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isText(value, maxLength, minLength = 1) {
  return typeof value === "string" && value.length >= minLength && value.length <= maxLength;
}

const isId = (value) => isText(value, LIMITS.idLength);
const isShortDate = (value) => isText(value, 40);

function isRoommate(value) {
  return (
    isRecord(value) &&
    isId(value.id) &&
    typeof value.name === "string" &&
    isText(value.name.trim(), LIMITS.roommateName)
  );
}

function isChore(value) {
  return (
    isRecord(value) &&
    isId(value.id) &&
    isText(value.title, LIMITS.choreTitle) &&
    (value.assigneeId === null || isId(value.assigneeId)) &&
    (value.dueDate === null || isShortDate(value.dueDate)) &&
    typeof value.completed === "boolean" &&
    (value.completedWeek === undefined || isShortDate(value.completedWeek))
  );
}

function isExpense(value) {
  return (
    isRecord(value) &&
    isId(value.id) &&
    isText(value.title, LIMITS.expenseTitle) &&
    typeof value.amount === "number" &&
    Number.isFinite(value.amount) &&
    value.amount > 0 &&
    value.amount <= LIMITS.maxAmount &&
    isId(value.paidById) &&
    Array.isArray(value.splitBetweenIds) &&
    value.splitBetweenIds.length > 0 &&
    value.splitBetweenIds.length <= LIMITS.roommates &&
    value.splitBetweenIds.every(isId) &&
    isShortDate(value.date)
  );
}

function isNote(value) {
  return isRecord(value) && isId(value.id) && isText(value.text, LIMITS.noteText) && isShortDate(value.createdAt);
}

function isList(value, check, max) {
  return Array.isArray(value) && value.length <= max && value.every(check);
}

/**
 * Checks household data from storage or an upload and fills in fields that older saved data
 * may lack (notes, householdName). Returns a clean copy, or null if the data is invalid.
 * Extra fields such as the old per-browser `chatUsername` are dropped.
 */
export function normalizeHousehold(value) {
  if (!isRecord(value)) return null;
  const notes = value.notes ?? [];
  const householdName = value.householdName ?? "";
  if (
    !isList(value.roommates, isRoommate, LIMITS.roommates) ||
    !isList(value.chores, isChore, LIMITS.chores) ||
    !isList(value.expenses, isExpense, LIMITS.expenses) ||
    !isList(notes, isNote, LIMITS.notes) ||
    !isText(householdName, LIMITS.houseName, 0)
  ) {
    return null;
  }
  return {
    roommates: value.roommates.map(({ id, name }) => ({ id, name })),
    chores: value.chores.map(({ id, title, assigneeId, dueDate, completed, completedWeek }) => ({
      id, title, assigneeId, dueDate, completed, ...(completedWeek === undefined ? {} : { completedWeek }),
    })),
    expenses: value.expenses.map(({ id, title, amount, paidById, splitBetweenIds, date }) => ({
      id, title, amount, paidById, splitBetweenIds: [...splitBetweenIds], date,
    })),
    notes: notes.map(({ id, text, createdAt }) => ({ id, text, createdAt })),
    householdName,
  };
}

/** True if there is anything worth keeping (used to offer uploading a browser's old data). */
export function hasHouseholdContent(household) {
  return (
    household.roommates.length > 0 ||
    household.chores.length > 0 ||
    household.expenses.length > 0 ||
    household.notes.length > 0 ||
    household.householdName.trim() !== ""
  );
}

/** Thrown for an action that is malformed or breaks a limit. The message is shown to the user. */
export class ActionError extends Error {}

function fail(message) {
  throw new ActionError(message);
}

function requireRoom(list, max, label) {
  if (list.length >= max) fail(`This house already has the maximum of ${max} ${label}.`);
}

const hasId = (list, id) => list.some((item) => item.id === id);

/** Removes an item by id; returns the same household object if it was not there (no change). */
function removeFrom(household, field, id) {
  if (!hasId(household[field], id)) return household;
  return { ...household, [field]: household[field].filter((item) => item.id !== id) };
}

/**
 * Applies one change to a household and returns the new household (the input is not modified).
 * Removing or updating something that no longer exists does nothing, so two people deleting the
 * same chore at once is not an error. Throws ActionError for invalid actions.
 */
export function applyAction(household, action) {
  if (!isRecord(action) || typeof action.type !== "string") fail("Unknown change.");

  switch (action.type) {
    case "addRoommate": {
      const roommate = action.roommate;
      if (!isRoommate(roommate)) fail("A housemate needs a name of up to 40 characters.");
      if (hasId(household.roommates, roommate.id)) return household;
      requireRoom(household.roommates, LIMITS.roommates, "housemates");
      return { ...household, roommates: [...household.roommates, { id: roommate.id, name: roommate.name.trim() }] };
    }

    case "removeRoommate": {
      if (!isId(action.id)) fail("Unknown housemate.");
      const next = removeFrom(household, "roommates", action.id);
      if (next === household) return household;
      // Their chores become unassigned in the same step, so nobody sees a half-done removal.
      return {
        ...next,
        chores: household.chores.map((chore) =>
          chore.assigneeId === action.id ? { ...chore, assigneeId: null } : chore,
        ),
      };
    }

    case "addChore": {
      const chore = action.chore;
      if (!isChore(chore)) fail("A chore needs a name of up to 70 characters.");
      if (hasId(household.chores, chore.id)) return household;
      requireRoom(household.chores, LIMITS.chores, "chores");
      // If the assignee was removed a moment ago by someone else, leave the chore up for grabs.
      const assigneeId = hasId(household.roommates, chore.assigneeId) ? chore.assigneeId : null;
      return { ...household, chores: [...household.chores, { ...chore, assigneeId }] };
    }

    case "updateChore": {
      if (!isId(action.id) || !isRecord(action.updates)) fail("Unknown chore.");
      const target = household.chores.find((chore) => chore.id === action.id);
      if (!target) return household;
      // Only these fields can change; the result must still be a valid chore.
      const { title, assigneeId, dueDate, completed, completedWeek } = action.updates;
      const updated = { ...target };
      if (title !== undefined) updated.title = title;
      if (assigneeId !== undefined) {
        updated.assigneeId = assigneeId !== null && hasId(household.roommates, assigneeId) ? assigneeId : null;
      }
      if (dueDate !== undefined) updated.dueDate = dueDate;
      if (completed !== undefined) updated.completed = completed;
      if (completedWeek !== undefined) updated.completedWeek = completedWeek;
      if (!isChore(updated)) fail("That chore change is not valid.");
      return { ...household, chores: household.chores.map((chore) => (chore.id === action.id ? updated : chore)) };
    }

    case "removeChore":
      if (!isId(action.id)) fail("Unknown chore.");
      return removeFrom(household, "chores", action.id);

    case "rotateRoster": {
      // Each assigned chore moves to the next housemate (in list order) and is reset for the week.
      if (!isShortDate(action.week)) fail("Unknown week.");
      const { roommates } = household;
      if (roommates.length < 2) return household;
      return {
        ...household,
        chores: household.chores.map((chore) => {
          if (!chore.assigneeId) return chore;
          const index = roommates.findIndex((roommate) => roommate.id === chore.assigneeId);
          const next = roommates[(index + 1) % roommates.length];
          return { ...chore, assigneeId: next.id, completed: false, completedWeek: action.week };
        }),
      };
    }

    case "addExpense": {
      const expense = action.expense;
      if (!isExpense(expense)) fail("That bill is not valid. Check the name, amount and who shares it.");
      if (hasId(household.expenses, expense.id)) return household;
      const people = [expense.paidById, ...expense.splitBetweenIds];
      if (!people.every((id) => hasId(household.roommates, id))) {
        fail("One of the housemates on this bill has been removed. Refresh and try again.");
      }
      requireRoom(household.expenses, LIMITS.expenses, "bills");
      return { ...household, expenses: [...household.expenses, expense] };
    }

    case "removeExpense":
      if (!isId(action.id)) fail("Unknown bill.");
      return removeFrom(household, "expenses", action.id);

    case "addNote": {
      const note = action.note;
      if (!isNote(note)) fail("A note can be up to 140 characters.");
      if (hasId(household.notes, note.id)) return household;
      requireRoom(household.notes, LIMITS.notes, "notes");
      return { ...household, notes: [note, ...household.notes] }; // newest first
    }

    case "removeNote":
      if (!isId(action.id)) fail("Unknown note.");
      return removeFrom(household, "notes", action.id);

    case "setHouseholdName":
      if (!isText(action.name, LIMITS.houseName, 0)) fail("The house name can be up to 28 characters.");
      if (action.name === household.householdName) return household;
      return { ...household, householdName: action.name };

    default:
      return fail("Unknown change.");
  }
}
