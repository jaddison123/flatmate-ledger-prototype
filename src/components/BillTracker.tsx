import { useState, type FormEvent } from "react";
import type { Expense, Roommate } from "../hooks/useHouseholdData";

interface BillTrackerProps {
  roommates: Roommate[];
  expenses: Expense[];
  onAdd: (expense: Omit<Expense, "id">) => void;
  onRemove: (id: string) => void;
}

const currency = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
});

function formatMoney(cents: number): string {
  return currency.format(cents / 100);
}

function getLocalDateValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(value: string): string {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(date);
}

function getShares(expense: Expense): { id: string; cents: number }[] {
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

function BillTracker({
  roommates,
  expenses,
  onAdd,
  onRemove,
}: BillTrackerProps) {
  const [isAddingBill, setIsAddingBill] = useState(false);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [paidById, setPaidById] = useState("");
  const [splitBetweenIds, setSplitBetweenIds] = useState<string[]>([]);
  const [date, setDate] = useState(() => getLocalDateValue(new Date()));
  const [formError, setFormError] = useState("");

  const roommateById = new Map(roommates.map((roommate) => [roommate.id, roommate]));
  const balances = new Map<string, number>();

  for (const expense of expenses) {
    const totalCents = Math.round(expense.amount * 100);
    balances.set(
      expense.paidById,
      (balances.get(expense.paidById) ?? 0) + totalCents,
    );
    for (const share of getShares(expense)) {
      balances.set(share.id, (balances.get(share.id) ?? 0) - share.cents);
    }
  }

  const balanceIds = [
    ...roommates.map((roommate) => roommate.id),
    ...[...balances.keys()].filter((id) => !roommateById.has(id)),
  ];

  function openBillForm() {
    setTitle("");
    setAmount("");
    setPaidById(roommates[0]?.id ?? "");
    setSplitBetweenIds(roommates.map((roommate) => roommate.id));
    setDate(getLocalDateValue(new Date()));
    setFormError("");
    setIsAddingBill(true);
  }

  function handleAddBill(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cents = Math.round(Number(amount) * 100);
    const participants = splitBetweenIds.filter((id) => roommateById.has(id));

    if (!title.trim()) {
      setFormError("Add a name for this bill.");
      return;
    }
    if (!Number.isFinite(cents) || cents < 1) {
      setFormError("Enter an amount greater than zero.");
      return;
    }
    if (!roommateById.has(paidById)) {
      setFormError("Choose who paid this bill.");
      return;
    }
    if (participants.length === 0) {
      setFormError("Choose at least one person to split this bill with.");
      return;
    }

    onAdd({
      title: title.trim(),
      amount: cents / 100,
      paidById,
      splitBetweenIds: participants,
      date,
    });
    setIsAddingBill(false);
    setFormError("");
  }

  function toggleParticipant(id: string) {
    setSplitBetweenIds((current) =>
      current.includes(id)
        ? current.filter((participantId) => participantId !== id)
        : [...current, id],
    );
  }

  function roommateName(id: string): string {
    return roommateById.get(id)?.name ?? "Former housemate";
  }

  return (
    <section className="feature-panel bills-panel" aria-labelledby="bills-heading">
      <div className="feature-heading">
        <div>
          <p className="eyebrow"><span>£</span> KEEP IT FAIR</p>
          <h2 id="bills-heading">Bills &amp; balances<span className="heading-period">.</span></h2>
        </div>
        <button
          className="add-chore-button"
          type="button"
          onClick={openBillForm}
          disabled={roommates.length === 0}
        >
          <span aria-hidden="true">＋</span> ADD A BILL
        </button>
      </div>
      <p className="feature-description">
        Record who paid. Each bill is split evenly between the people you select.
      </p>

      <div className="bill-balances" aria-label="Housemate balances">
        {balanceIds.length === 0 ? (
          <p className="balance-empty">
            {expenses.length === 0
              ? "Add housemates and bills to see everyone’s balance."
              : "No housemates to show balances for."}
          </p>
        ) : balanceIds.map((id) => {
          const balance = balances.get(id) ?? 0;
          return (
            <div className="balance-card" key={id}>
              <span className="balance-name">{roommateName(id)}</span>
              <span className={`balance-value${balance < 0 ? " balance-owes" : ""}`}>
                {balance > 0
                  ? `gets ${formatMoney(balance)} back`
                  : balance < 0
                    ? `owes ${formatMoney(Math.abs(balance))}`
                    : "all settled"}
              </span>
            </div>
          );
        })}
      </div>

      {isAddingBill && (
        <form className="inline-form bill-form" onSubmit={handleAddBill}>
          <div className="form-heading">
            <div>
              <span className="form-kicker">SHARE A HOUSEHOLD COST</span>
              <h3>Add a bill.</h3>
            </div>
            <button
              className="icon-button"
              type="button"
              onClick={() => setIsAddingBill(false)}
              aria-label="Close add bill form"
            >×</button>
          </div>
          <label className="field-label">
            BILL
            <input
              autoFocus
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Electricity"
              maxLength={70}
            />
          </label>
          <div className="form-row">
            <label className="field-label">
              AMOUNT (£)
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0.00"
              />
            </label>
            <label className="field-label">
              PAID BY
              <select value={paidById} onChange={(event) => setPaidById(event.target.value)}>
                {roommates.map((roommate) => (
                  <option value={roommate.id} key={roommate.id}>{roommate.name}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="field-label bill-date-field">
            DATE
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
          <fieldset className="bill-split-field">
            <legend>Split equally between</legend>
            <div className="bill-split-list">
              {roommates.map((roommate) => (
                <label key={roommate.id}>
                  <input
                    type="checkbox"
                    checked={splitBetweenIds.includes(roommate.id)}
                    onChange={() => toggleParticipant(roommate.id)}
                  />
                  <span>{roommate.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {formError && <p className="form-error" role="alert">{formError}</p>}
          <div className="form-footer">
            <span>Any leftover pennies go to the first people selected.</span>
            <button className="add-chore-button" type="submit">SAVE BILL <span aria-hidden="true">↗</span></button>
          </div>
        </form>
      )}

      <div className="bill-list">
        {expenses.length === 0 ? (
          <div className="bill-empty">
            <h3>No bills yet.</h3>
            <p>Add a household cost to see how much each person owes.</p>
          </div>
        ) : [...expenses]
          .sort((a, b) => b.date.localeCompare(a.date))
          .map((expense) => {
            const shares = getShares(expense);
            return (
              <article className="bill-entry" key={expense.id}>
                <div className="bill-entry-main">
                  <h3>{expense.title}</h3>
                  <p>
                    {formatMoney(Math.round(expense.amount * 100))} paid by{" "}
                    {roommateName(expense.paidById)} · {formatDate(expense.date)}
                  </p>
                  <p className="bill-share-details">
                    Split: {shares.length > 0
                      ? shares.map(({ id, cents }) => `${roommateName(id)} ${formatMoney(cents)}`).join(" · ")
                      : "No participants"}
                  </p>
                </div>
                <button
                  className="bill-remove"
                  type="button"
                  onClick={() => onRemove(expense.id)}
                  aria-label={`Remove ${expense.title} bill`}
                  title="Remove bill"
                >×</button>
              </article>
            );
          })}
      </div>
      <p className="bill-note">Balances show each person’s net share across all saved bills.</p>
    </section>
  );
}

export default BillTracker;
