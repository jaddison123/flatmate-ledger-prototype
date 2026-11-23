// Tests for shared/household.mjs: the validation and changes the server applies to every house.
// Run with `npm test` (Node's built-in test runner; no extra dependencies).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ActionError, DECOR_OPTIONS, LIMITS, LOOK_BUILD_MAX, LOOK_OPTIONS, applyAction, defaultDecor, defaultLook,
  emptyHousehold, hasHouseholdContent, normalizeHousehold,
} from "../shared/household.mjs";

/** A house with the given housemates (ids), built through actions like the real app. */
function houseWith(...ids) {
  return ids.reduce(
    (house, id) => applyAction(house, { type: "addRoommate", roommate: { id, name: id.toUpperCase() } }),
    emptyHousehold(),
  );
}

function chore(id, assigneeId = null, extra = {}) {
  return { id, title: `Chore ${id}`, assigneeId, dueDate: null, completed: false, ...extra };
}

// ---------- Loading saved data ----------

test("normalizeHousehold fills fields that older saved houses lack", () => {
  const house = normalizeHousehold({ roommates: [{ id: "a", name: "Ann" }], chores: [], expenses: [] });
  assert.deepEqual(house.notes, []);
  assert.equal(house.householdName, "");
  assert.deepEqual(house.decor, defaultDecor());
  assert.deepEqual(house.roommates[0].look, defaultLook("a"));
});

test("normalizeHousehold still loads houses saved with more than the housemate cap", () => {
  const roommates = Array.from({ length: LIMITS.roommates + 3 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
  const house = normalizeHousehold({ roommates, chores: [], expenses: [] });
  assert.equal(house.roommates.length, LIMITS.roommates + 3);
});

test("normalizeHousehold rejects data that is not a household", () => {
  assert.equal(normalizeHousehold(null), null);
  assert.equal(normalizeHousehold({ roommates: "nope", chores: [], expenses: [] }), null);
  assert.equal(normalizeHousehold({ roommates: [{ id: "a", name: "" }], chores: [], expenses: [] }), null);
  const tooMany = Array.from({ length: LIMITS.storedRoommates + 1 }, (_, i) => ({ id: `p${i}`, name: "P" }));
  assert.equal(normalizeHousehold({ roommates: tooMany, chores: [], expenses: [] }), null);
});

test("normalizeHousehold keeps known look and decor choices and replaces retired ones", () => {
  const house = normalizeHousehold({
    roommates: [{ id: "a", name: "Ann", look: { hair: "afro", skin: "retired-tone", build: 3 } }],
    chores: [],
    expenses: [],
    decor: { walls: "navy", sofa: "a-sofa-we-dropped" },
  });
  const look = house.roommates[0].look;
  assert.equal(look.hair, "afro");
  assert.equal(look.build, 3);
  assert.equal(look.skin, defaultLook("a").skin);
  assert.equal(house.decor.walls, "navy");
  assert.equal(house.decor.sofa, DECOR_OPTIONS.sofa[0]);
});

test("normalizeHousehold drops unknown extra fields", () => {
  const house = normalizeHousehold({ roommates: [], chores: [], expenses: [], chatUsername: "old" });
  assert.equal("chatUsername" in house, false);
});

test("hasHouseholdContent is false only for an empty house", () => {
  assert.equal(hasHouseholdContent(emptyHousehold()), false);
  assert.equal(hasHouseholdContent(houseWith("a")), true);
});

// ---------- Looks ----------

test("defaultLook is the same every time for an id, and uses allowed options", () => {
  assert.deepEqual(defaultLook("abc"), defaultLook("abc"));
  const look = defaultLook("abc");
  for (const [part, options] of Object.entries(LOOK_OPTIONS)) {
    assert.ok(options.includes(look[part]), `${part} = ${look[part]}`);
  }
  assert.ok(look.build >= 0 && look.build <= LOOK_BUILD_MAX);
});

test("defaultLook varies between housemates", () => {
  const looks = ["a", "b", "c", "d", "e", "f"].map((id) => JSON.stringify(defaultLook(id)));
  assert.ok(new Set(looks).size > 1);
});

test("setLook changes one part and leaves the rest", () => {
  const before = houseWith("a", "b");
  const after = applyAction(before, { type: "setLook", id: "a", part: "hair", value: "bun" });
  assert.equal(after.roommates[0].look.hair, "bun");
  assert.equal(after.roommates[0].look.skin, before.roommates[0].look.skin);
  assert.deepEqual(after.roommates[1], before.roommates[1]);
  assert.notEqual(before.roommates[0].look.hair, "bun"); // defaults never pick "bun", so this was a real change
});

test("setLook accepts whole-number builds in range only", () => {
  const house = houseWith("a");
  assert.equal(applyAction(house, { type: "setLook", id: "a", part: "build", value: 0 }).roommates[0].look.build, 0);
  assert.equal(
    applyAction(house, { type: "setLook", id: "a", part: "build", value: LOOK_BUILD_MAX }).roommates[0].look.build,
    LOOK_BUILD_MAX,
  );
  for (const value of [-1, LOOK_BUILD_MAX + 1, 2.5, "5", null]) {
    assert.throws(() => applyAction(house, { type: "setLook", id: "a", part: "build", value }), ActionError);
  }
});

test("setLook rejects unknown parts and options", () => {
  const house = houseWith("a");
  assert.throws(() => applyAction(house, { type: "setLook", id: "a", part: "hair", value: "mohawk" }), ActionError);
  assert.throws(() => applyAction(house, { type: "setLook", id: "a", part: "__proto__", value: "x" }), ActionError);
  assert.throws(() => applyAction(house, { type: "setLook", id: "a", part: "name", value: "Bob" }), ActionError);
});

test("setLook for someone already removed, or with no change, returns the same house", () => {
  const house = houseWith("a");
  assert.equal(applyAction(house, { type: "setLook", id: "gone", part: "hair", value: "bun" }), house);
  const same = house.roommates[0].look.hair;
  assert.equal(applyAction(house, { type: "setLook", id: "a", part: "hair", value: same }), house);
});

// ---------- Housemates ----------

test("addRoommate trims the name and gives a default look", () => {
  const house = applyAction(emptyHousehold(), { type: "addRoommate", roommate: { id: "a", name: "  Ann  " } });
  assert.equal(house.roommates[0].name, "Ann");
  assert.deepEqual(house.roommates[0].look, defaultLook("a"));
});

test("addRoommate stops at the housemate cap", () => {
  const ids = Array.from({ length: LIMITS.roommates }, (_, i) => `p${i}`);
  const full = houseWith(...ids);
  assert.equal(full.roommates.length, LIMITS.roommates);
  assert.throws(
    () => applyAction(full, { type: "addRoommate", roommate: { id: "extra", name: "Extra" } }),
    /maximum of 8 housemates/,
  );
});

test("addRoommate with an id that already exists changes nothing (a retried request)", () => {
  const house = houseWith("a");
  assert.equal(applyAction(house, { type: "addRoommate", roommate: { id: "a", name: "Again" } }), house);
});

test("addRoommate needs a name", () => {
  assert.throws(
    () => applyAction(emptyHousehold(), { type: "addRoommate", roommate: { id: "a", name: "   " } }),
    ActionError,
  );
});

test("removeRoommate also unassigns their chores", () => {
  let house = houseWith("a", "b");
  house = applyAction(house, { type: "addChore", chore: chore("c1", "a") });
  house = applyAction(house, { type: "addChore", chore: chore("c2", "b") });
  house = applyAction(house, { type: "removeRoommate", id: "a" });
  assert.deepEqual(house.roommates.map((r) => r.id), ["b"]);
  assert.equal(house.chores.find((c) => c.id === "c1").assigneeId, null);
  assert.equal(house.chores.find((c) => c.id === "c2").assigneeId, "b");
});

test("removing something already gone returns the same house", () => {
  const house = houseWith("a");
  assert.equal(applyAction(house, { type: "removeRoommate", id: "nobody" }), house);
  assert.equal(applyAction(house, { type: "removeChore", id: "nothing" }), house);
  assert.equal(applyAction(house, { type: "removeExpense", id: "nothing" }), house);
  assert.equal(applyAction(house, { type: "removeNote", id: "nothing" }), house);
});

// ---------- Chores ----------

test("addChore leaves the chore unassigned if its assignee was just removed", () => {
  const house = applyAction(houseWith("a"), { type: "addChore", chore: chore("c1", "gone") });
  assert.equal(house.chores[0].assigneeId, null);
});

test("updateChore only changes allowed fields and keeps the chore valid", () => {
  let house = applyAction(houseWith("a"), { type: "addChore", chore: chore("c1") });
  house = applyAction(house, {
    type: "updateChore", id: "c1", updates: { completed: true, completedWeek: "2026-11-23", id: "hijack" },
  });
  assert.equal(house.chores[0].id, "c1");
  assert.equal(house.chores[0].completed, true);
  assert.throws(
    () => applyAction(house, { type: "updateChore", id: "c1", updates: { title: "x".repeat(LIMITS.choreTitle + 1) } }),
    ActionError,
  );
});

test("rotateRoster moves each assigned chore to the next housemate and resets it", () => {
  let house = houseWith("a", "b", "c");
  house = applyAction(house, { type: "addChore", chore: chore("c1", "a", { completed: true, completedWeek: "w1" }) });
  house = applyAction(house, { type: "addChore", chore: chore("c2", "c") });
  house = applyAction(house, { type: "addChore", chore: chore("c3", null) });
  house = applyAction(house, { type: "rotateRoster", week: "w2" });
  const byId = Object.fromEntries(house.chores.map((c) => [c.id, c]));
  assert.equal(byId.c1.assigneeId, "b");
  assert.equal(byId.c1.completed, false);
  assert.equal(byId.c2.assigneeId, "a"); // wraps round to the first housemate
  assert.equal(byId.c3.assigneeId, null);
});

test("rotateRoster with fewer than two housemates does nothing", () => {
  const house = applyAction(houseWith("a"), { type: "addChore", chore: chore("c1", "a") });
  assert.equal(applyAction(house, { type: "rotateRoster", week: "w2" }), house);
});

// ---------- Bills, notes, name, decor ----------

test("addExpense refuses bills naming someone who isn't a housemate", () => {
  const house = houseWith("a", "b");
  const bill = { id: "e1", title: "Pizza", amount: 20, paidById: "a", splitBetweenIds: ["a", "b"], date: "2026-11-23" };
  assert.equal(applyAction(house, { type: "addExpense", expense: bill }).expenses.length, 1);
  assert.throws(
    () => applyAction(house, { type: "addExpense", expense: { ...bill, splitBetweenIds: ["a", "gone"] } }),
    /has been removed/,
  );
  assert.throws(() => applyAction(house, { type: "addExpense", expense: { ...bill, amount: -5 } }), ActionError);
});

test("addNote puts the newest note first and checks its length", () => {
  let house = applyAction(emptyHousehold(), { type: "addNote", note: { id: "n1", text: "First", createdAt: "t1" } });
  house = applyAction(house, { type: "addNote", note: { id: "n2", text: "Second", createdAt: "t2" } });
  assert.deepEqual(house.notes.map((n) => n.id), ["n2", "n1"]);
  assert.throws(
    () => applyAction(house, { type: "addNote", note: { id: "n3", text: "x".repeat(LIMITS.noteText + 1), createdAt: "t" } }),
    ActionError,
  );
});

test("setHouseholdName and setDecor validate and skip no-op changes", () => {
  const house = emptyHousehold();
  assert.equal(applyAction(house, { type: "setHouseholdName", name: "Maple St" }).householdName, "Maple St");
  assert.equal(applyAction(house, { type: "setHouseholdName", name: "" }), house);
  assert.throws(() => applyAction(house, { type: "setHouseholdName", name: "x".repeat(LIMITS.houseName + 1) }), ActionError);
  assert.equal(applyAction(house, { type: "setDecor", slot: "walls", style: "sage" }).decor.walls, "sage");
  assert.equal(applyAction(house, { type: "setDecor", slot: "walls", style: DECOR_OPTIONS.walls[0] }), house);
  assert.throws(() => applyAction(house, { type: "setDecor", slot: "walls", style: "tartan" }), ActionError);
});

test("unknown or malformed actions are rejected", () => {
  const house = emptyHousehold();
  assert.throws(() => applyAction(house, { type: "deleteEverything" }), ActionError);
  assert.throws(() => applyAction(house, null), ActionError);
  assert.throws(() => applyAction(house, "addRoommate"), ActionError);
});

test("applyAction never modifies the house it was given", () => {
  const house = houseWith("a", "b");
  const snapshot = structuredClone(house);
  applyAction(house, { type: "setLook", id: "a", part: "hair", value: "bun" });
  applyAction(house, { type: "removeRoommate", id: "b" });
  applyAction(house, { type: "addChore", chore: chore("c1", "a") });
  assert.deepEqual(house, snapshot);
});
