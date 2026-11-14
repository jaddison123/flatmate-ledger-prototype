import { useEffect, useState, type FormEvent } from "react";
import { useHouseholdData } from "./hooks/useHouseholdData";
import BillTracker from "./components/BillTracker";
import HomeChat from "./components/HomeChat";

type ChoreFilter = "all" | "open" | "done";

function getWeekStart(date: Date): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysSinceMonday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - daysSinceMonday);
  return start;
}

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatWeek(date: Date): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatDueDate(value: string | null): string {
  if (!value) return "Any day";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function App() {
  const {
    roommates,
    chores,
    expenses,
    chatUsername,
    householdName,
    setHouseholdName,
    storageError,
    addRoommate,
    removeRoommate,
    addChore,
    updateChore,
    removeChore,
    addExpense,
    removeExpense,
    setChatUsername,
  } = useHouseholdData();
  const [darkMode, setDarkMode] = useState(true); // dark mode by default
  const [filter, setFilter] = useState<ChoreFilter>("all");
  const [isAddingChore, setIsAddingChore] = useState(false);
  const [isManagingHousemates, setIsManagingHousemates] = useState(false);
  const [choreTitle, setChoreTitle] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [roommateName, setRoommateName] = useState("");
  const [formError, setFormError] = useState("");
  const [today, setToday] = useState(() => new Date());
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  // Shown in the hero headline; falls back to the original tagline until a name is set.
  const houseName = householdName.trim();
  const headlineName = houseName || "Good house";
  const headlineText = /[.!?]$/.test(headlineName) ? headlineName : `${headlineName}.`;

  function handleSaveHouseName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setHouseholdName(nameDraft.trim());
    setIsEditingName(false);
  }

  useEffect(() => {
    const now = new Date();
    const nextMidnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
    );
    const timeoutId = window.setTimeout(
      () => setToday(new Date()),
      nextMidnight.getTime() - now.getTime(),
    );
    return () => window.clearTimeout(timeoutId);
  }, [today]);

  const weekStart = getWeekStart(today);
  const weekKey = toDateInputValue(weekStart);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  const choresWithStatus = chores.map((chore) => ({
    ...chore,
    isComplete: chore.completed && chore.completedWeek === weekKey,
  }));
  const completedCount = choresWithStatus.filter(
    (chore) => chore.isComplete,
  ).length;
  const openCount = chores.length - completedCount;
  const visibleChores = choresWithStatus
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

  const completionPercent = chores.length
    ? Math.round((completedCount / chores.length) * 100)
    : 0;

  function handleAddChore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = choreTitle.trim();
    if (!title) {
      setFormError("Give this chore a name before adding it.");
      return;
    }

    addChore({
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

  function handleAddRoommate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = roommateName.trim();
    if (!name) {
      setFormError("Enter a name to add a housemate.");
      return;
    }
    addRoommate({ name });
    setRoommateName("");
    setFormError("");
  }

  function handleRemoveRoommate(id: string) {
    removeRoommate(id);
    chores.forEach((chore) => {
      if (chore.assigneeId === id) updateChore(chore.id, { assigneeId: null });
    });
  }

  function rotateAssignments() {
    if (roommates.length < 2) return;
    chores.forEach((chore) => {
      if (!chore.assigneeId) return;
      const currentIndex = roommates.findIndex(
        (roommate) => roommate.id === chore.assigneeId,
      );
      const nextRoommate = roommates[(currentIndex + 1) % roommates.length];
      updateChore(chore.id, {
        assigneeId: nextRoommate.id,
        completed: false,
        completedWeek: weekKey,
      });
    });
  }

  return (
    <main className={`app-shell${darkMode ? " dark-mode" : ""}`}>
      <div className="dashboard">
        <header className="topbar">
          <a className="brand" href="/" aria-label="Flatmate Ledger home">
            <span className="brand-mark" aria-hidden="true">
              F<span>L</span>
            </span>
            <span className="brand-name">
              FLATMATE<span>LEDGER</span>
            </span>
          </a>
          <div className="topbar-actions">
            <span className="status-pill">
              <span className="status-dot" />
              <span className="status-pill-name">{houseName ? houseName.toUpperCase() : "HOUSEHOLD HQ"}</span>
            </span>
            <button
              className="theme-toggle"
              type="button"
              onClick={() => setDarkMode((enabled) => !enabled)}
              aria-label={`Switch to ${darkMode ? "light" : "dark"} mode`}
              aria-pressed={darkMode}
            >
              <span aria-hidden="true">{darkMode ? "☼" : "◐"}</span>
              <span>{darkMode ? "LIGHT" : "DARK"}</span>
            </button>
          </div>
        </header>

        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow"><span>★</span> THE WEEKLY RESET</p>
            <h1>Good week.<br /><span className="house-name">{headlineText}</span></h1>
            <p className="hero-description">
              The little jobs that keep your place running. Shared fairly,
              checked off together.
            </p>
            {isEditingName ? (
              <form className="house-name-form" onSubmit={handleSaveHouseName}>
                <label className="field-label" htmlFor="house-name-input">NAME OF YOUR HOUSE</label>
                <div className="house-name-row">
                  <input
                    autoFocus
                    id="house-name-input"
                    value={nameDraft}
                    onChange={(event) => setNameDraft(event.target.value)}
                    placeholder="e.g. 42 Maple Street"
                    maxLength={28}
                  />
                  <button className="add-chore-button" type="submit">SAVE</button>
                  <button
                    className="rotate-button"
                    type="button"
                    onClick={() => setIsEditingName(false)}
                  >CANCEL</button>
                </div>
              </form>
            ) : (
              <button
                className="rename-house-button"
                type="button"
                onClick={() => {
                  setNameDraft(houseName);
                  setIsEditingName(true);
                }}
              >
                <span aria-hidden="true">✎</span> {houseName ? "RENAME YOUR HOUSE" : "NAME YOUR HOUSE"}
              </button>
            )}
          </div>
          <div className="week-card" aria-label="Current week">
            <div className="week-card-top">
              <span className="week-label">ON THE ROSTER</span>
              <span className="week-spark" aria-hidden="true">✳</span>
            </div>
            <div className="week-date">{formatWeek(weekStart)} <span>—</span> {formatWeek(weekEnd)}</div>
            <div className="week-progress">
              <div
                className="progress-track"
                role="progressbar"
                aria-label="Weekly chores complete"
                aria-valuemin={0}
                aria-valuemax={chores.length || 1}
                aria-valuenow={completedCount}
              >
                <span style={{ width: `${completionPercent}%` }} />
              </div>
              <span>{completionPercent}%</span>
            </div>
            <div className="week-card-foot">
              <span>{completedCount} OF {chores.length} DONE</span>
              <span>YOU’VE GOT THIS <b>↗</b></span>
            </div>
          </div>
        </section>

        <section className="stats-row" aria-label="Household chore summary">
          <div className="stat-block">
            <span className="stat-label">STILL TO DO</span>
            <span className="stat-value">{String(openCount).padStart(2, "0")}</span>
            <span className="stat-note">little wins waiting</span>
          </div>
          <div className="stat-block stat-accent">
            <span className="stat-label">TICKED OFF</span>
            <span className="stat-value">{String(completedCount).padStart(2, "0")}</span>
            <span className="stat-note">nice one, team!</span>
          </div>
          <div className="stat-block">
            <span className="stat-label">YOUR HOUSEMATES</span>
            <span className="stat-value">{String(roommates.length).padStart(2, "0")}</span>
            <span className="stat-note">
              {roommates.length === 1 ? "person on the team" : "people on the team"}
            </span>
          </div>
          <button
            className="housemates-button"
            type="button"
            onClick={() => {
              setFormError("");
              setIsManagingHousemates(true);
            }}
          >
            <span className="housemates-icon" aria-hidden="true">＋</span>
            <span>HOUSEMATES<small>Manage your crew</small></span>
          </button>
        </section>

        {storageError && (
          <p className="storage-alert" role="alert">{storageError} Changes may not be saved.</p>
        )}

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
                onClick={rotateAssignments}
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
              return (
                <article className={`chore-row${chore.isComplete ? " chore-complete" : ""}`} key={chore.id}>
                  <span className="chore-number">{String(index + 1).padStart(2, "0")}</span>
                  <button
                    className="chore-check"
                    type="button"
                    role="checkbox"
                    aria-checked={chore.isComplete}
                    aria-label={`${chore.isComplete ? "Mark incomplete" : "Mark complete"}: ${chore.title}`}
                    onClick={() => updateChore(chore.id, {
                      completed: !chore.isComplete,
                      completedWeek: weekKey,
                    })}
                  >
                    {chore.isComplete && <span aria-hidden="true">✓</span>}
                  </button>
                  <div className="chore-details">
                    <h3>{chore.title}</h3>
                    <span>{chore.isComplete ? "DONE FOR THIS WEEK" : chore.dueDate ? `DUE ${formatDueDate(chore.dueDate).toUpperCase()}` : "THIS WEEK"}</span>
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
                    onClick={() => removeChore(chore.id)}
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

        <section className="household-features" aria-label="Household tools">
          <BillTracker
            roommates={roommates}
            expenses={expenses}
            onAdd={addExpense}
            onRemove={removeExpense}
          />
          <HomeChat
            username={chatUsername}
            onUsernameChange={setChatUsername}
          />
        </section>

        <footer className="page-footer">
          <span>FLATMATE LEDGER <b>—</b> MADE FOR THE EVERYDAY.</span>
          <span>A HOUSE THAT WORKS, WORKS FOR EVERYONE.</span>
        </footer>
      </div>

      {isManagingHousemates && (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsManagingHousemates(false);
          }}
        >
          <section
            className="housemates-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="housemates-title"
          >
            <div className="form-heading">
              <div>
                <span className="form-kicker">SAME ROOF, SAME TEAM</span>
                <h2 id="housemates-title">Your housemates.</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => setIsManagingHousemates(false)}
                aria-label="Close housemates"
              >×</button>
            </div>
            <p className="dialog-intro">Add your crew so everyone can take a turn.</p>
            <form className="roommate-form" onSubmit={handleAddRoommate}>
              <label className="field-label" htmlFor="roommate-name">NAME</label>
              <div className="roommate-input-row">
                <input
                  autoFocus
                  id="roommate-name"
                  value={roommateName}
                  onChange={(event) => setRoommateName(event.target.value)}
                  placeholder="e.g. Sam"
                  maxLength={40}
                />
                <button className="add-chore-button" type="submit">ADD <span aria-hidden="true">＋</span></button>
              </div>
              {formError && <p className="form-error" role="alert">{formError}</p>}
            </form>
            <div className="roommate-list">
              {roommates.length === 0 ? (
                <p className="roommate-empty">No housemates yet. Add the first name above.</p>
              ) : roommates.map((roommate) => (
                <div className="roommate-entry" key={roommate.id}>
                  <span className="avatar">{roommate.name.trim().charAt(0).toUpperCase()}</span>
                  <span>{roommate.name}</span>
                  <button
                    className="remove-roommate"
                    type="button"
                    onClick={() => handleRemoveRoommate(roommate.id)}
                    aria-label={`Remove ${roommate.name}`}
                  >REMOVE</button>
                </div>
              ))}
            </div>
            <p className="dialog-note">Removing someone leaves their chores unassigned.</p>
          </section>
        </div>
      )}
    </main>
  );
}

export default App;
