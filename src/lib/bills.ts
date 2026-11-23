// Bill maths shared by the bill tracker and the 3D flat. Money is split in pence (integers).
import type { Expense } from "../../shared/household.mjs";

const currency = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

export function formatMoney(pence: number): string {
  return currency.format(pence / 100);
}

/** Equal shares in pence; leftover pennies go to the first people selected. */
export function getShares(expense: Expense): { id: string; cents: number }[] {
  const participantIds = [...new Set(expense.splitBetweenIds)];
  if (participantIds.length === 0) return [];

  const totalCents = Math.round(expense.amount * 100);
  const baseShare = Math.floor(totalCents / participantIds.length);
  const remainder = totalCents % participantIds.length;

  return participantIds.map((id, index) => ({
    id,
    cents: baseShare + (index < remainder ? 1 : 0),
  }));
}

/**
 * One person's balance in their own words, for the "This is me" summary. Positive = others
 * owe them. The tone ("owe" / "owed") is returned too, so the UI can colour it.
 */
export function describeOwnBalance(pence: number): { tone: "owe" | "owed" | "square"; text: string } {
  if (pence < 0) return { tone: "owe", text: `You owe ${formatMoney(-pence)}` };
  if (pence > 0) return { tone: "owed", text: `You’re owed ${formatMoney(pence)}` };
  return { tone: "square", text: "You’re all square" };
}

/** Net balance per person in pence: amount paid minus their share, over all bills. */
export function computeBalances(expenses: Expense[]): Map<string, number> {
  const balances = new Map<string, number>();
  for (const expense of expenses) {
    const totalCents = Math.round(expense.amount * 100);
    balances.set(expense.paidById, (balances.get(expense.paidById) ?? 0) + totalCents);
    for (const share of getShares(expense)) {
      balances.set(share.id, (balances.get(share.id) ?? 0) - share.cents);
    }
  }
  return balances;
}
