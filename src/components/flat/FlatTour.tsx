// A first-visit walkthrough of the flat: a small card that steps through each room while the
// camera flies to it. It shows once per device (remembered in localStorage) and can be replayed
// from the "?" button. FlatView owns which step is showing; this file is just the steps and card.
import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { ROOMS, type RoomId } from "./rooms";

const TOUR_KEY = "chore-score:tour";

export interface TourStep {
  /** The room the camera visits, or null for the whole flat. */
  room: RoomId | null;
  title: string;
  body: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    room: null,
    title: "Welcome to your flat",
    body: "Everything your house shares lives somewhere in here. Here’s a quick look round. It takes about 30 seconds.",
  },
  {
    room: "chores",
    title: "The chore whiteboard",
    body: "Add chores, give them to housemates and tick them off. Everything resets on Monday. Chores still to do leave mess around the flat, so you can see what’s waiting.",
  },
  {
    room: "league",
    title: "The league on the TV",
    body: "Who has done the most chores this week. Whoever is top of the table gets to dance in front of the telly.",
  },
  {
    room: "notes",
    title: "Notes on the fridge",
    body: "Short reminders that aren’t chores, like “boiler check Tuesday” or “we’re out of milk”.",
  },
  {
    room: "bills",
    title: "Bills on the kitchen table",
    body: "Log who paid for what and split it between housemates. The coin stacks show who is up and who owes.",
  },
  {
    room: "chat",
    title: "Chat on the sofa",
    body: "A live group chat just for this house. New messages pop up over the sofa, and the sender wanders over to their phone.",
  },
  {
    room: "house",
    title: "The front door",
    body: "Copy the invite link to bring your housemates in, add their names or rename the house. The porch light shows whether you’re connected.",
  },
  {
    room: "looks",
    title: "The bedroom doors",
    body: "Each housemate gets a door. Click one, or a housemate wandering about, to pick their hair, clothes and style. Everyone sees the same look.",
  },
  {
    room: "decor",
    title: "The bathroom mirror",
    body: "Pick the wall paint, floor and furniture. Everyone in the house sees the same flat, so choose together.",
  },
  {
    room: null,
    title: "That’s the tour",
    body: "Click or tap anything that grows under your pointer, or use the room buttons. You can replay this tour any time with the ? button.",
  },
];

/** The step that shows a room, so clicking something mid-tour can jump straight to it. */
export function tourStepFor(room: RoomId): number {
  return TOUR_STEPS.findIndex((step) => step.room === room);
}

export function hasSeenTour(): boolean {
  try {
    return window.localStorage.getItem(TOUR_KEY) === "done";
  } catch {
    return true; // storage blocked: don't show the tour on every visit
  }
}

export function markTourSeen() {
  try {
    window.localStorage.setItem(TOUR_KEY, "done");
  } catch {
    /* it will just show again next time */
  }
}

interface FlatTourProps {
  step: number;
  onStep: (step: number) => void;
  onClose: () => void;
}

export function FlatTour({ step, onStep, onClose }: FlatTourProps) {
  const nextRef = useRef<HTMLButtonElement>(null);
  const current = TOUR_STEPS[step];
  const last = step === TOUR_STEPS.length - 1;

  // Keep keyboard focus on the main button as the steps change.
  useEffect(() => {
    nextRef.current?.focus({ preventScroll: true });
  }, [step]);

  // Escape skips the tour from anywhere (no room sheet is open while it runs).
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Arrow keys only while focus is in the card, so they never fight with typing or panning.
  function onKeyDown(event: ReactKeyboardEvent) {
    if (event.key === "ArrowRight" && !last) onStep(step + 1);
    if (event.key === "ArrowLeft" && step > 0) onStep(step - 1);
  }

  return (
    <div className="flat-tour" role="dialog" aria-modal="false" aria-labelledby="flat-tour-title" onKeyDown={onKeyDown}>
      <div className="flat-tour-top">
        <span className="form-kicker">
          {current.room ? (
            <><span aria-hidden="true">{ROOMS[current.room].icon}</span> {ROOMS[current.room].place.toUpperCase()}</>
          ) : (
            "HOUSE TOUR"
          )}
        </span>
        <button className="flat-tour-skip" type="button" onClick={onClose}>
          {last ? "CLOSE" : "SKIP"}
        </button>
      </div>
      {/* key: re-run the entrance animation and announce the new step to screen readers */}
      <div key={step} className="flat-tour-content" aria-live="polite">
        <h2 id="flat-tour-title">{current.title}</h2>
        <p>{current.body}</p>
      </div>
      <div className="flat-tour-bottom">
        <ol className="flat-tour-dots" aria-label={`Step ${step + 1} of ${TOUR_STEPS.length}`}>
          {TOUR_STEPS.map((_, index) => (
            <li key={index} className={index === step ? "active" : index < step ? "seen" : ""} />
          ))}
        </ol>
        <div className="flat-tour-buttons">
          {step > 0 && (
            <button className="rotate-button" type="button" onClick={() => onStep(step - 1)}>BACK</button>
          )}
          <button
            ref={nextRef}
            className="add-chore-button"
            type="button"
            onClick={() => (last ? onClose() : onStep(step + 1))}
          >
            {step === 0 ? "SHOW ME ROUND" : last ? "START" : "NEXT"}
          </button>
        </div>
      </div>
    </div>
  );
}
