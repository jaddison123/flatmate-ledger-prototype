import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useHouseholdData, type Household } from "./hooks/useHouseholdData";
import { useModalFocus } from "./hooks/useModalFocus";
import {
  NOT_ME,
  enterHouse,
  houseCodeFromUrl,
  leaveHouse,
  readHouseCache,
  readMe,
  readSavedHouseCode,
  saveMe,
} from "./lib/house";
import { formatWeek, getWeekStart, toDateInputValue } from "./lib/week";
import { sameName } from "./lib/chat";
import { hasHouseholdContent } from "../shared/household.mjs";
import BillTracker from "./components/BillTracker";
import ChoreBoard from "./components/ChoreBoard";
import HomeChat from "./components/HomeChat";
import HouseGate from "./components/HouseGate";
import HouseSettings from "./components/HouseSettings";
import Notes from "./components/Notes";
import TopBar from "./components/TopBar";
// FlatView is small; it lazy-loads the three.js scene itself.
import FlatView, { hasWebGL } from "./components/flat/FlatView";
import DecorPicker from "./components/DecorPicker";
import LookPicker from "./components/LookPicker";
import HouseLeague from "./components/HouseLeague";
import WhoAmI from "./components/WhoAmI";
import PanelBoundary from "./components/PanelBoundary";

const THEME_KEY = "chore-score:theme";
const VIEW_KEY = "chore-score:view";

type ViewMode = "flat" | "list";

// Dark is the default; only an explicit "light" choice is remembered otherwise.
function readSavedDarkMode(): boolean {
  try {
    return window.localStorage.getItem(THEME_KEY) !== "light";
  } catch {
    return true; // storage blocked (e.g. private window)
  }
}

// The 3D flat is the default where WebGL works; the list view is the fallback and an option.
function readSavedView(): ViewMode {
  let saved: string | null = null;
  try {
    saved = window.localStorage.getItem(VIEW_KEY);
  } catch {
    /* use the default */
  }
  if (saved === "list" || !hasWebGL()) return "list";
  return "flat";
}

interface HouseDashboardProps {
  houseCode: string;
  darkMode: boolean;
  onToggleTheme: () => void;
  view: ViewMode;
  onSetView: (view: ViewMode) => void;
  /** Forget this house on this device and go back to the start screen. */
  onLeave: () => void;
  /** The server says this house does not exist (wrong link, or its data was lost). */
  onMissing: () => void;
}

function HouseDashboard({ houseCode, darkMode, onToggleTheme, view, onSetView, onLeave, onMissing }: HouseDashboardProps) {
  const {
    roommates,
    chores,
    expenses,
    notes,
    addNote,
    removeNote,
    chatUsername,
    householdName,
    setHouseholdName,
    decor,
    setDecor,
    setLook,
    isLoaded,
    status,
    syncError,
    addRoommate,
    removeRoommate,
    addChore,
    updateChore,
    removeChore,
    rotateRoster,
    addExpense,
    removeExpense,
    setChatUsername,
  } = useHouseholdData(houseCode);
  const dialogRef = useRef<HTMLElement>(null);
  const [isManagingHousemates, setIsManagingHousemates] = useState(false);
  const [today, setToday] = useState(() => new Date());
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  // Which housemate uses this device ("This is me"). Kept only on this device, per house.
  const [meSaved, setMeSaved] = useState(() => readMe(houseCode));
  const me = roommates.find((person) => person.id === meSaved) ?? null;
  // Ask until answered (also in an empty house: "add yourself first"), unless they said "just
  // looking". Asked again if the chosen person has since been removed, or if adding yourself
  // was refused by the server (the id never turns up).
  const askWhoAmI = me === null && meSaved !== NOT_ME;

  /** `name` is given when the person was only just added (not in `roommates` yet). */
  function chooseMe(id: string | null, name?: string) {
    const value = id ?? NOT_ME;
    saveMe(houseCode, value);
    setMeSaved(value);
    const personName = name ?? roommates.find((roommate) => roommate.id === id)?.name;
    // Chat as them too, so the log matches the names on the avatars (it can still be changed).
    if (personName) setChatUsername(personName);
  }

  // A chat name that is the housemate's name spelt differently ("sam" for "Sam") takes their
  // spelling. The server sees both as the same name, so this device keeps holding it. Checked
  // when the page opens or "me" changes, not while typing (that would eat the space in "Sam S").
  const meName = me?.name ?? "";
  const latestChatName = useRef(chatUsername);
  latestChatName.current = chatUsername;
  useEffect(() => {
    const current = latestChatName.current;
    if (meName && current !== meName && sameName(current, meName)) setChatUsername(meName);
    // Only on "me" changing; setChatUsername is a new function each render.
  }, [meName]);

  /** "I'm new here": adds a housemate and makes them this device's "me". Returns their id. */
  function addMe(name: string): string {
    const id = addRoommate({ name });
    chooseMe(id, name);
    return id;
  }

  // Shown in the hero headline; falls back to the original tagline until a name is set.
  const houseName = householdName.trim();
  const headlineText = houseName || "Good house";

  function handleSaveHouseName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setHouseholdName(nameDraft.trim());
    setIsEditingName(false);
  }

  // Re-render at midnight so "today", overdue chores and the Monday reset stay current.
  useEffect(() => {
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const timeoutId = window.setTimeout(() => setToday(new Date()), nextMidnight.getTime() - now.getTime());
    return () => window.clearTimeout(timeoutId);
  }, [today]);

  useEffect(() => {
    if (status === "missing") onMissing();
  }, [status, onMissing]);

  const closeHousemates = useCallback(() => setIsManagingHousemates(false), []);
  useModalFocus(dialogRef, isManagingHousemates, closeHousemates);

  const weekStart = getWeekStart(today);
  const todayKey = toDateInputValue(today);
  const weekKey = toDateInputValue(weekStart);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  const choresWithStatus = chores.map((chore) => {
    const isComplete = chore.completed && chore.completedWeek === weekKey;
    // Overdue = not done and the due date is before today (date strings compare correctly).
    const isOverdue = !isComplete && chore.dueDate !== null && chore.dueDate < todayKey;
    return { ...chore, isComplete, isOverdue };
  });
  const completedCount = choresWithStatus.filter((chore) => chore.isComplete).length;
  const openCount = chores.length - completedCount;
  const completionPercent = chores.length ? Math.round((completedCount / chores.length) * 100) : 0;

  const topBar = (
    <TopBar
      label={houseName ? houseName.toUpperCase() : "HOUSEHOLD HQ"}
      status={status}
      darkMode={darkMode}
      onToggleTheme={onToggleTheme}
      view={isLoaded ? view : undefined}
      onToggleView={() => onSetView(view === "flat" ? "list" : "flat")}
    />
  );

  // First visit on this device: nothing cached yet, so wait for the server.
  if (!isLoaded) {
    return (
      <div className="dashboard">
        {topBar}
        <section className="gate" aria-live="polite">
          <p className="eyebrow"><span>★</span> ONE MOMENT</p>
          <h1>Loading<br /><span className="house-name">your house.</span></h1>
          <p className="hero-description">
            {status === "reconnecting"
              ? "Can’t reach the server yet. If it was asleep this can take up to a minute; we’ll keep trying."
              : "Fetching the latest chores, bills and notes…"}
          </p>
          <button className="rename-house-button" type="button" onClick={onLeave}>
            USE A DIFFERENT HOUSE
          </button>
        </section>
      </div>
    );
  }

  const alerts = (
    <>
      {status === "reconnecting" && (
        <p className="storage-alert" role="status">
          Can’t reach the server, so you’re seeing the last copy saved on this device. Changes
          won’t be saved until the connection is back.
        </p>
      )}
      {syncError && <p className="storage-alert" role="alert">{syncError}</p>}
    </>
  );

  // The same feature components are used by both views.
  const choreBoard = (
    <ChoreBoard
      roommates={roommates}
      chores={choresWithStatus}
      weekStart={weekStart}
      weekKey={weekKey}
      todayKey={todayKey}
      meId={me?.id ?? null}
      onAdd={addChore}
      onToggle={(id, complete) => updateChore(id, { completed: complete, completedWeek: weekKey })}
      onRemove={removeChore}
      onRotate={() => rotateRoster(weekKey)}
    />
  );
  const notesBoard = <Notes notes={notes} onAdd={addNote} onRemove={removeNote} />;
  const billTracker = (
    <BillTracker
      roommates={roommates}
      expenses={expenses}
      meId={me?.id ?? null}
      onAdd={addExpense}
      onRemove={removeExpense}
    />
  );
  const houseSettings = (showRename: boolean) => (
    <HouseSettings
      houseCode={houseCode}
      householdName={householdName}
      roommates={roommates}
      meId={me?.id ?? null}
      onChooseMe={chooseMe}
      showRename={showRename}
      onRename={setHouseholdName}
      onAddRoommate={(name) => addRoommate({ name })}
      onRemoveRoommate={removeRoommate}
      onLeave={onLeave}
    />
  );

  if (view === "flat") {
    return (
      <div className="dashboard dashboard-flat">
        {topBar}
        <FlatView
            roommates={roommates}
            chores={choresWithStatus}
            expenses={expenses}
            notes={notes}
            householdName={householdName}
            decor={decor}
            status={status}
            darkMode={darkMode}
            weekLabel={`WEEK OF ${formatWeek(weekStart).toUpperCase()} — ${formatWeek(weekEnd).toUpperCase()}`}
            alerts={alerts}
            panels={{
              chores: choreBoard,
              league: <HouseLeague roommates={roommates} chores={choresWithStatus} />,
              notes: notesBoard,
              bills: billTracker,
              house: (
                <section className="house-panel" aria-labelledby="house-panel-title">
                  <p className="eyebrow"><span>⌂</span> SAME ROOF, SAME TEAM</p>
                  <h2 id="house-panel-title">Edit your house<span className="heading-period">.</span></h2>
                  {houseSettings(true)}
                </section>
              ),
              decor: <DecorPicker decor={decor} onChange={setDecor} />,
            }}
            renderLooks={(personId) => (
              <LookPicker roommates={roommates} personId={personId ?? me?.id ?? null} meId={me?.id ?? null} onChange={setLook} />
            )}
            houseCode={houseCode}
            chatName={chatUsername}
            onChatNameChange={setChatUsername}
            me={me}
            whoAmI={askWhoAmI ? (onChosen) => (
              <WhoAmI
                roommates={roommates}
                onChoose={(id) => {
                  chooseMe(id);
                  onChosen(id);
                }}
                onAddMe={(name) => onChosen(addMe(name))}
                variant="flat"
              />
            ) : null}
            renderChat={(active, onActivity) => (
              <HomeChat
                houseCode={houseCode}
                username={chatUsername}
                onUsernameChange={setChatUsername}
                active={active}
                onActivity={onActivity}
                roommateId={me?.id ?? null}
              />
            )}
            onUseListView={() => onSetView("list")}
          />
      </div>
    );
  }

  return (
    <>
      <div className="dashboard">
        {topBar}

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
            onClick={() => setIsManagingHousemates(true)}
          >
            <span className="housemates-icon" aria-hidden="true">＋</span>
            <span>EDIT HOUSE<small>Housemates, invite, leave</small></span>
          </button>
        </section>

        {alerts}

        {askWhoAmI && (
          <WhoAmI roommates={roommates} onChoose={(id) => chooseMe(id)} onAddMe={(name) => addMe(name)} variant="list" />
        )}

        <PanelBoundary label="chores">{choreBoard}</PanelBoundary>

        <PanelBoundary label="notes">{notesBoard}</PanelBoundary>

        <section className="household-features" aria-label="Household tools">
          <PanelBoundary label="bills">{billTracker}</PanelBoundary>
          <PanelBoundary label="chat">
            <HomeChat
              houseCode={houseCode}
              username={chatUsername}
              onUsernameChange={setChatUsername}
              roommateId={me?.id ?? null}
            />
          </PanelBoundary>
        </section>

        <footer className="page-footer">
          <span>CHORE SCORE <b>—</b> MADE FOR THE EVERYDAY.</span>
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
            ref={dialogRef}
            className="housemates-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="housemates-title"
          >
            <div className="form-heading">
              <div>
                <span className="form-kicker">SAME ROOF, SAME TEAM</span>
                <h2 id="housemates-title">Edit your house.</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => setIsManagingHousemates(false)}
                aria-label="Close housemates"
              >×</button>
            </div>
            {houseSettings(false)}
          </section>
        </div>
      )}
    </>
  );
}

const NOT_FOUND_NOTICE =
  "That house wasn't found on the server. The link may be wrong, or the server lost its data.";

function App() {
  const [darkMode, setDarkMode] = useState(readSavedDarkMode);
  const [view, setView] = useState(readSavedView);
  // The house in the address bar wins (someone opened an invite link), then the one remembered here.
  const [houseCode, setHouseCode] = useState(() => houseCodeFromUrl() ?? readSavedHouseCode());
  const [notice, setNotice] = useState("");
  const [lostCopy, setLostCopy] = useState<Household | null>(null);

  // Remember the theme and view between visits.
  useEffect(() => {
    try {
      window.localStorage.setItem(THEME_KEY, darkMode ? "dark" : "light");
      window.localStorage.setItem(VIEW_KEY, view);
    } catch {
      /* both still work for this visit if storage is unavailable */
    }
  }, [darkMode, view]);

  // Keep the address bar and saved house in step with the house being shown.
  useEffect(() => {
    if (houseCode) enterHouse(houseCode);
    else if (window.location.pathname !== "/") window.history.replaceState(null, "", "/");
  }, [houseCode]);

  function goToGate(message: string, copy: Household | null) {
    leaveHouse();
    setNotice(message);
    setLostCopy(copy);
    setHouseCode(null);
  }

  function handleMissing() {
    // Offer to recreate the house from this device's cached copy, if it had anything in it.
    const cached = houseCode ? readHouseCache(houseCode)?.household ?? null : null;
    goToGate(NOT_FOUND_NOTICE, cached && hasHouseholdContent(cached) ? cached : null);
  }

  function handleEnter(code: string) {
    setNotice("");
    setLostCopy(null);
    setHouseCode(code);
  }

  const toggleTheme = () => setDarkMode((enabled) => !enabled);

  return (
    <main className={`app-shell${darkMode ? " dark-mode" : ""}${houseCode && view === "flat" ? " app-shell-flat" : ""}`}>
      {houseCode ? (
        <HouseDashboard
          key={houseCode}
          houseCode={houseCode}
          darkMode={darkMode}
          onToggleTheme={toggleTheme}
          view={view}
          onSetView={setView}
          onLeave={() => goToGate("", null)}
          onMissing={handleMissing}
        />
      ) : (
        <div className="dashboard">
          <TopBar label="HOUSEHOLD HQ" darkMode={darkMode} onToggleTheme={toggleTheme} />
          <HouseGate notice={notice} lostCopy={lostCopy} onEnter={handleEnter} />
        </div>
      )}
    </main>
  );
}

export default App;
