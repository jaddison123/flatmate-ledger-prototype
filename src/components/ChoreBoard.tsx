import { useState, type FormEvent } from "react";
import type { Chore, Roommate } from "../hooks/useHouseholdData";
import { formatDueDate, formatWeek } from "../lib/week";

type ChoreFilter = "all" | "open" | "done";

export type ChoreWithStatus = Chore & { isComplete: boolean };

interface ChoreBoardProps {
  roommates: Roommate[];
  /** Chores with `isComplete` already worked out for the current week. */
  chores: ChoreWithStatus[];
  weekStart: Date;
  weekKey: string;
  todayKey: string;
  onAdd: (chore: Omit<Chore, "id">) => void;
  onToggle: (id: string, complete: boolean) => void;
  onRemove: (id: string) => void;
  onRotate: () => void;
}

/** The chore list with filters, the add form and the rotate button. */
function ChoreBoard({
  roommates,
  chores,
  weekStart,
  weekKey,
  todayKey,
  onAdd,
  onToggle,
  onRemove,
  onRotate,
}: ChoreBoardProps) {
  const [filter, setFilter] = useState<ChoreFilter>("all");
  const [isAddingChore, setIsAddingChore] = useState(false);
  const [choreTitle, setChoreTitle] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [formError, setFormError] = useState("");

  const completedCount = chores.filter((chore) => chore.isComplete).length;
  const openCount = chores.length - completedCount;
  const visibleChores = chores
    .filter((chore) => {
      if (filter === "open") return !chore.isComplete;
      if (filter === "done") return chore.isComplete;
      return true;
    })
    .sort((a, b) => {
      if (a.isComplete !== b.isComplete) return Number(a.isComplete) - Number(b.isComplete);
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    });

  function handleAddChore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = choreTitle.trim();
    if (!title) {
      setFormError("Give this chore a name before adding it.");
      return;
    }

    onAdd({
      title,
      assigneeId: assigneeId || null,
      dueDate: dueDate || null,
      completed: false,
      completedWeek: weekKey,
    });
    setChoreTitle("");
    setAssigneeId("");
    setDueDate("");
    setFormError("");
    setIsAddingChore(false);
  }

  return (
    <section className="chores-section" aria-labelledby="chores-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow"><span>✳</span> FAIR’S FAIR</p>
          <h2 id="chores-heading">The chore board<span className="heading-period">.</span></h2>
        </div>
        <div className="board-actions">
          <button
            className="rotate-button"
            type="button"
            onClick={onRotate}
            disabled={roommates.length < 2 || chores.length === 0}
            title={roommates.length < 2 ? "Add at least two housemates to rotate chores" : "Pass each chore to the next housemate"}
          >
            <span aria-hidden="true">↻</span> ROTATE THE ROSTER
          </button>
          <button
            className="add-chore-button"
            type="button"
            onClick={() => {
              setFormError("");
              setIsAddingChore(true);
            }}
          >
            <span aria-hidden="true">＋</span> ADD A CHORE
          </button>
        </div>
      </div>

      <div className="board-toolbar">
        <div className="filter-tabs" role="group" aria-label="Filter chores">
          {(["all", "open", "done"] as const).map((value) => (
            <button
              className={filter === value ? "filter-tab active" : "filter-tab"}
              type="button"
              key={value}
              onClick={() => setFilter(value)}
              aria-pressed={filter === value}
            >
              {value === "all" ? "EVERYTHING" : value === "open" ? "TO DO" : "DONE"}
              <span>{value === "all" ? chores.length : value === "open" ? openCount : completedCount}</span>
            </button>
          ))}
        </div>
        <span className="board-week-label">WEEKLY HOUSEHOLD ROUTINE <span>•</span> WEEK {formatWeek(weekStart).toUpperCase()}</span>
      </div>

      {isAddingChore && (
        <form className="inline-form chore-form" onSubmit={handleAddChore}>
          <div className="form-heading">
            <div>
              <span className="form-kicker">ADD TO THE ROSTER</span>
              <h3>A little job, handled.</h3>
            </div>
            <button
              className="icon-button"
              type="button"
              onClick={() => setIsAddingChore(false)}
              aria-label="Close add chore form"
            >×</button>
          </div>
          <label className="field-label">
            CHORE
            <input
              autoFocus
              value={choreTitle}
              onChange={(event) => setChoreTitle(event.target.value)}
              placeholder="e.g. Take the bins out"
              maxLength={70}
            />
          </label>
          <div className="form-row">
            <label className="field-label">
              WHO’S ON IT?
              <select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
                <option value="">Anyone can grab it</option>
                {roommates.map((roommate) => (
                  <option value={roommate.id} key={roommate.id}>{roommate.name}</option>
                ))}
              </select>
            </label>
            <label className="field-label">
              DUE DATE <span className="optional-label">OPTIONAL</span>
              <input
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </label>
          </div>
          {formError && <p className="form-error" role="alert">{formError}</p>}
          <div className="form-footer">
            <span>Tasks reset each Monday. Assignments stick until you rotate.</span>
            <button className="add-chore-button" type="submit">ADD IT <span aria-hidden="true">↗</span></button>
          </div>
        </form>
      )}

      <div className="chore-list">
        {visibleChores.map((chore, index) => {
          const roommate = roommates.find((person) => person.id === chore.assigneeId);
          // Overdue = not done and the due date is before today (date strings compare correctly).
          const isOverdue = !chore.isComplete && chore.dueDate !== null && chore.dueDate < todayKey;
          return (
            <article
              className={`chore-row${chore.isComplete ? " chore-complete" : ""}${isOverdue ? " chore-overdue" : ""}`}
              key={chore.id}
            >
              <span className="chore-number">{String(index + 1).padStart(2, "0")}</span>
              <button
                className="chore-check"
                type="button"
                role="checkbox"
                aria-checked={chore.isComplete}
                aria-label={`${chore.isComplete ? "Mark incomplete" : "Mark complete"}: ${chore.title}`}
                onClick={() => onToggle(chore.id, !chore.isComplete)}
              >
                {chore.isComplete && <span aria-hidden="true">✓</span>}
              </button>
              <div className="chore-details">
                <h3>{chore.title}</h3>
                <span>
                  {chore.isComplete
                    ? "DONE FOR THIS WEEK"
                    : isOverdue
                      ? `OVERDUE · WAS DUE ${formatDueDate(chore.dueDate).toUpperCase()}`
                      : chore.dueDate
                        ? `DUE ${formatDueDate(chore.dueDate).toUpperCase()}`
                        : "THIS WEEK"}
                </span>
              </div>
              <div className="assignee">
                <span className={`avatar${roommate ? "" : " avatar-unassigned"}`} aria-hidden="true">
                  {roommate ? roommate.name.trim().charAt(0).toUpperCase() : "?"}
                </span>
                <span>{roommate?.name ?? "Up for grabs"}</span>
              </div>
              <button
                className="delete-chore"
                type="button"
                onClick={() => onRemove(chore.id)}
                aria-label={`Remove ${chore.title}`}
                title="Remove chore"
              >×</button>
            </article>
          );
        })}
        {visibleChores.length === 0 && (
          <div className="empty-board">
            <span className="empty-icon" aria-hidden="true">{chores.length === 0 ? "✳" : "✓"}</span>
            <h3>{chores.length === 0 ? "A fresh board." : filter === "open" ? "All caught up!" : "Nothing checked off yet."}</h3>
            <p>
              {chores.length === 0
                ? "Add your first household task and share the load."
                : filter === "open"
                  ? "You’ve handled everything on the list. Go enjoy it."
                  : "Tick off a chore when it’s done. We’ll keep score."}
            </p>
            {chores.length === 0 && (
              <button className="add-chore-button" type="button" onClick={() => setIsAddingChore(true)}>
                ＋ ADD YOUR FIRST CHORE
              </button>
            )}
          </div>
        )}
      </div>
      <div className="board-footer">
        <span><b>✳</b> GOOD ROOMMATES. GREAT HOUSE.</span>
        <span>ONE WEEK AT A TIME.</span>
      </div>
    </section>
  );
}

export default ChoreBoard;
