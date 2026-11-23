// Tests for src/lib/bills.ts (Node runs the TypeScript file directly by stripping its types).
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeBalances, describeOwnBalance, formatMoney, getShares } from "../src/lib/bills.ts";

function bill(amount, paidById, splitBetweenIds) {
  return { id: "e", title: "Bill", amount, paidById, splitBetweenIds, date: "2026-11-23" };
}

test("getShares splits in pence and gives leftover pennies to the first people", () => {
  assert.deepEqual(getShares(bill(10, "a", ["a", "b", "c"])), [
    { id: "a", cents: 334 },
    { id: "b", cents: 333 },
    { id: "c", cents: 333 },
  ]);
});

test("getShares always adds up to the bill, even with awkward amounts", () => {
  for (const amount of [0.01, 0.1, 9.99, 33.33, 100, 1234.56]) {
    for (const people of [["a"], ["a", "b"], ["a", "b", "c"], ["a", "b", "c", "d", "e", "f", "g"]]) {
      const total = getShares(bill(amount, "a", people)).reduce((sum, share) => sum + share.cents, 0);
      assert.equal(total, Math.round(amount * 100), `${amount} between ${people.length}`);
    }
  }
});

test("getShares ignores someone listed twice", () => {
  assert.deepEqual(getShares(bill(10, "a", ["a", "a", "b"])).map((s) => s.id), ["a", "b"]);
});

test("computeBalances: payer is owed by the others, and balances sum to zero", () => {
  const balances = computeBalances([bill(30, "a", ["a", "b", "c"]), bill(12, "b", ["a", "b"])]);
  assert.equal(balances.get("a"), 3000 - 1000 - 600);
  assert.equal(balances.get("b"), 1200 - 1000 - 600);
  assert.equal(balances.get("c"), -1000);
  assert.equal([...balances.values()].reduce((sum, value) => sum + value, 0), 0);
});

test("computeBalances keeps people who are no longer housemates", () => {
  assert.equal(computeBalances([bill(10, "gone", ["a"])]).get("gone"), 1000);
});

test("describeOwnBalance says who owes whom, in pounds", () => {
  assert.deepEqual(describeOwnBalance(-1240), { tone: "owe", text: `You owe ${formatMoney(1240)}` });
  assert.deepEqual(describeOwnBalance(800), { tone: "owed", text: `You’re owed ${formatMoney(800)}` });
  assert.equal(describeOwnBalance(0).tone, "square");
  assert.match(formatMoney(1240), /£12\.40/);
});
