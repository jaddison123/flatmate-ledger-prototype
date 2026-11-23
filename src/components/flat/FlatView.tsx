// The "flat" view of a house: the 3D scene (lazy-loaded), an overlay with the week's score and
// buttons for each room, and a sheet that slides in with the room's feature when one is opened.
// The buttons are the keyboard/screen-reader way in; clicking things in the scene is a shortcut.
import { Component, Suspense, lazy, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { ChatActivity } from "../HomeChat";
import type { Decor, Expense, Note, Roommate, SyncStatus } from "../../hooks/useHouseholdData";
import { useModalFocus } from "../../hooks/useModalFocus";
import PanelBoundary from "../PanelBoundary";
import { computeBalances, describeOwnBalance } from "../../lib/bills";
import { playSound, setSoundEnabled } from "../../lib/sfx";
import { FlatTour, TOUR_STEPS, hasSeenTour, markTourSeen, tourStepFor } from "./FlatTour";
import type { SceneChore } from "./liveParts";
import { ROOMS, ROOM_ORDER, type RoomId } from "./rooms";

const FlatScene = lazy(() => import("./FlatScene"));

const SOUND_KEY = "chore-score:sound";
const SIDE_SHEET_WIDTH = 460;
// The tour card (340 px, 72 px in from the right): the camera keeps rooms clear of it.
const TOUR_CARD_SPACE = 420;
const RECENT_MESSAGE_MS = 6000;
const NO_CHAT: ChatActivity = { ready: false, unread: 0, typing: [], latest: null };

/** True if this browser can draw WebGL (checked once). */
let webglSupport: boolean | null = null;
export function hasWebGL(): boolean {
  if (webglSupport === null) {
    try {
      const canvas = document.createElement("canvas");
      webglSupport = Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
    } catch {
      webglSupport = false;
    }
  }
  return webglSupport;
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, [query]);
  return matches;
}

function readSoundSetting(): boolean {
  try {
    return window.localStorage.getItem(SOUND_KEY) === "on";
  } catch {
    return false;
  }
}

/** If the 3D scene crashes (e.g. the GPU context is lost), offer the list view instead. */
class SceneErrorBoundary extends Component<{ onFallback: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("The 3D flat failed to draw:", error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flat-message" role="alert">
        <p>The 3D flat couldn’t be drawn on this device.</p>
        <button className="add-chore-button" type="button" onClick={this.props.onFallback}>
          SWITCH TO THE LIST VIEW
        </button>
      </div>
    );
  }
}

export interface FlatViewProps {
  roommates: Roommate[];
  chores: SceneChore[];
  expenses: Expense[];
  notes: Note[];
  householdName: string;
  decor: Decor;
  status: SyncStatus;
  darkMode: boolean;
  weekLabel: string;
  /** Status / error messages to show over the scene. */
  alerts: ReactNode;
  /** The contents of each room's sheet (the chat is handled separately: it stays connected). */
  panels: Record<Exclude<RoomId, "chat" | "looks">, ReactNode>;
  /** The bedroom doors' look picker, opened on the housemate whose door or avatar was clicked. */
  renderLooks: (personId: string | null) => ReactNode;
  renderChat: (active: boolean, onActivity: (activity: ChatActivity) => void) => ReactNode;
  /** The housemate using this device, if they've said. */
  me: Roommate | null;
  /**
   * The "Which one are you?" card while it should be asked, or null. It comes before the tour;
   * `onChosen` gets the chosen (or just added) housemate's id, so their look can open next.
   */
  whoAmI: ((onChosen: (id: string | null) => void) => ReactNode) | null;
  onUseListView: () => void;
}

function FlatView(props: FlatViewProps) {
  const { chores, notes, expenses, panels, renderChat, renderLooks } = props;
  const [room, setRoom] = useState<RoomId | null>(null);
  // Whose look the "looks" sheet opens on (null: the first housemate).
  const [lookPerson, setLookPerson] = useState<string | null>(null);
  const [recentreKey, setRecentreKey] = useState(0);
  const [chat, setChat] = useState<ChatActivity>(NO_CHAT);
  const [soundOn, setSoundOn] = useState(readSoundSetting);
  const wide = useMediaQuery(`(min-width: ${SIDE_SHEET_WIDTH + 300}px)`);
  const still = useMediaQuery("(prefers-reduced-motion: reduce)");
  const sheetRef = useRef<HTMLElement>(null);

  // A new device's first minute: "Which one are you?" → make your avatar (the Looks sheet) →
  // the tour. The question waits while a sheet is open, and the tour waits for the question.
  const asking = props.whoAmI !== null && room === null;
  // The first-visit tour's step, or null. `tour` is the step actually showing: it waits until
  // the question is answered and any open sheet (e.g. making your avatar) is closed.
  const [tourStep, setTour] = useState<number | null>(() => (hasSeenTour() ? null : 0));
  const tour = asking || room !== null ? null : tourStep;
  const tourRoom = tour !== null ? TOUR_STEPS[tour].room : null;

  const closeRoom = useCallback(() => setRoom(null), []);
  useModalFocus(sheetRef, room !== null, closeRoom);

  const endTour = useCallback(() => {
    markTourSeen();
    setTour(null);
  }, []);

  function startTour() {
    setRoom(null);
    setTour(0);
  }

  function goToTourStep(step: number) {
    if (TOUR_STEPS[step].room) playSound("open");
    setTour(step);
  }

  function openRoom(next: RoomId, personId?: string) {
    // Mid-tour, clicking a room (in the scene or the buttons) jumps the tour there instead.
    if (tour !== null) {
      goToTourStep(tourStepFor(next));
      return;
    }
    if (next !== room) playSound("open");
    if (next === "looks" && personId) setLookPerson(personId);
    setRoom(next);
  }

  useEffect(() => {
    setSoundEnabled(soundOn);
    try {
      window.localStorage.setItem(SOUND_KEY, soundOn ? "on" : "off");
    } catch {
      /* the setting just won't be remembered */
    }
  }, [soundOn]);

  // A message from someone else arriving (not the history loading) pops up over the sofa.
  const [recent, setRecent] = useState<ChatActivity["latest"]>(null);
  const [seen, setSeen] = useState({ ready: false, id: null as string | null });
  const latestId = chat.latest?.id ?? null;
  if (seen.ready !== chat.ready || seen.id !== latestId) {
    // Adjusting state while rendering: React re-renders straight away with both values.
    setSeen({ ready: chat.ready, id: latestId });
    if (seen.ready && chat.ready && chat.latest && !chat.latest.own) setRecent(chat.latest);
  }
  useEffect(() => {
    if (!recent) return;
    playSound("message");
    const timer = window.setTimeout(() => setRecent(null), RECENT_MESSAGE_MS);
    return () => window.clearTimeout(timer);
  }, [recent]);

  const done = chores.filter((chore) => chore.isComplete).length;
  const percent = chores.length ? Math.round((done / chores.length) * 100) : 0;
  const overdue = chores.filter((chore) => chore.isOverdue).length;
  const mine = props.me ? chores.filter((chore) => chore.assigneeId === props.me?.id) : [];
  const mineLeft = mine.filter((chore) => !chore.isComplete).length;
  const ownBalance = props.me && expenses.length > 0
    ? describeOwnBalance(computeBalances(expenses).get(props.me.id) ?? 0)
    : null;
  const badges: Record<RoomId, string> = {
    chores: chores.length - done > 0 ? String(chores.length - done) : "",
    league: "",
    notes: notes.length > 0 ? String(notes.length) : "",
    bills: expenses.length > 0 ? String(expenses.length) : "",
    chat: chat.unread > 0 ? String(chat.unread) : "",
    house: "",
    looks: "",
    decor: "",
  };

  return (
    <section
      className={`flat-stage${room ? " flat-stage-open" : ""}${tour !== null || asking ? " flat-stage-touring" : ""}`}
      aria-label="Your flat"
    >
      <SceneErrorBoundary onFallback={props.onUseListView}>
        <Suspense fallback={<div className="flat-message" role="status">Building your flat…</div>}>
          <FlatScene
            roommates={props.roommates}
            chores={chores}
            expenses={expenses}
            notes={notes}
            householdName={props.householdName}
            decor={props.decor}
            status={props.status}
            chat={chat}
            recentMessage={recent}
            darkMode={props.darkMode}
            focus={room ?? tourRoom}
            sheetWidth={wide ? (tour !== null ? TOUR_CARD_SPACE : SIDE_SHEET_WIDTH) : 0}
            meId={props.me?.id ?? null}
            recentreKey={recentreKey}
            still={still}
            onSelect={openRoom}
          />
        </Suspense>
      </SceneErrorBoundary>

      <div className="flat-hud" hidden={room !== null && !wide}>
        <div className="flat-score">
          <p className="eyebrow"><span>★</span> {props.weekLabel}</p>
          <h1 className="flat-title">{props.householdName.trim() || "Good house"}<span className="heading-period">.</span></h1>
          <div className="week-progress">
            <div
              className="progress-track"
              role="progressbar"
              aria-label="Weekly chores complete"
              aria-valuemin={0}
              aria-valuemax={chores.length || 1}
              aria-valuenow={done}
            >
              <span style={{ width: `${percent}%` }} />
            </div>
            <span>{done}/{chores.length}</span>
          </div>
          {overdue > 0 && <p className="flat-overdue">{overdue} overdue: look for the red rings</p>}
          {mine.length > 0 && (
            <p className="flat-mine">
              {mineLeft > 0
                ? `${mineLeft} ${mineLeft === 1 ? "job" : "jobs"} left for you this week`
                : "Your jobs are done this week ✓"}
            </p>
          )}
          {ownBalance && <p className={`flat-mine own-balance-${ownBalance.tone}`}>{ownBalance.text}</p>}
        </div>
        <div className="flat-tools">
          <button
            className="flat-tool"
            type="button"
            onClick={() => setRecentreKey((key) => key + 1)}
            aria-label="Recentre the view"
            title="Recentre the view"
          >⌖</button>
          <button
            className="flat-tool"
            type="button"
            onClick={() => setSoundOn((on) => !on)}
            aria-pressed={soundOn}
            aria-label={soundOn ? "Turn sound effects off" : "Turn sound effects on"}
            title={soundOn ? "Sound on" : "Sound off"}
          >{soundOn ? "🔊" : "🔈"}</button>
          <button
            className="flat-tool"
            type="button"
            onClick={() => (tour === null ? startTour() : endTour())}
            disabled={asking}
            aria-pressed={tour !== null}
            aria-label={tour === null ? "Take the tour of the flat" : "End the tour"}
            title={tour === null ? "Take the tour" : "End the tour"}
          >?</button>
        </div>
      </div>

      <div className="flat-alerts">{props.alerts}</div>

      {/* On phones the tour card takes the buttons' place at the bottom. */}
      <nav className="flat-rooms" aria-label="Rooms" hidden={(room !== null || tour !== null || asking) && !wide}>
        {ROOM_ORDER.map((id) => (
          <button
            key={id}
            type="button"
            className={`flat-room-button${room === id ? " active" : ""}${tourRoom === id ? " touring" : ""}`}
            onClick={() => (room === id ? closeRoom() : openRoom(id))}
            aria-pressed={room === id}
            title={`${ROOMS[id].label}: ${ROOMS[id].place}`}
          >
            <span className="flat-room-icon" aria-hidden="true">{ROOMS[id].icon}</span>
            <span className="flat-room-text">
              {ROOMS[id].label}
              <small>{ROOMS[id].place}</small>
            </span>
            {badges[id] && (
              <span className={`flat-badge${id === "chat" ? " flat-badge-hot" : ""}`}>{badges[id]}</span>
            )}
          </button>
        ))}
      </nav>
      <p className="flat-hint" aria-hidden="true">Drag to move · scroll or pinch to zoom · click anything that grows</p>

      {tour !== null && <FlatTour step={tour} onStep={goToTourStep} onClose={endTour} />}
      {asking && props.whoAmI?.((id) => {
        // Straight on to making their character.
        if (!id) return;
        setLookPerson(id);
        setRoom("looks");
      })}

      <aside
        ref={sheetRef}
        className="room-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={room ? `${ROOMS[room].label}: ${ROOMS[room].place}` : undefined}
        hidden={room === null}
      >
        <div className="room-sheet-bar">
          <span className="form-kicker">
            <span aria-hidden="true">{room ? ROOMS[room].icon : ""}</span> {room ? ROOMS[room].place.toUpperCase() : ""}
          </span>
          <button className="rotate-button room-sheet-close" type="button" onClick={closeRoom}>
            <span aria-hidden="true">←</span> BACK TO THE FLAT
          </button>
        </div>
        <div className="room-sheet-body">
          {/* key: a panel that crashed gets a fresh start when you open another room. */}
          {room && room !== "chat" && (
            <PanelBoundary key={room} label={ROOMS[room].label.toLowerCase()}>
              {room === "looks" ? renderLooks(lookPerson ?? props.me?.id ?? null) : panels[room]}
            </PanelBoundary>
          )}
          {/* The chat stays mounted (and connected) so the sofa can show new messages. */}
          <div hidden={room !== "chat"}>
            <PanelBoundary label="chat">{renderChat(room === "chat", setChat)}</PanelBoundary>
          </div>
        </div>
      </aside>
    </section>
  );
}

export default FlatView;
