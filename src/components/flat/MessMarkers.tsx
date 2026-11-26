// Floating markers over the mess left by open chores (one per room that has some), and the
// popup that opens from a marker or a pile: each chore in that room with a "Done" button.
import { useEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { Roommate } from "../../hooks/useHouseholdData";
import { formatDueDate } from "../../lib/week";
import { layoutMess, type SceneChore } from "./liveParts";
import { Overlay } from "./Overlay";
import type { MessZone, Vec3 } from "./rooms";

export const ZONE_INFO: Record<MessZone, { icon: string; name: string }> = {
  kitchen: { icon: "🍽", name: "Kitchen" },
  bathroom: { icon: "🛁", name: "Bathroom" },
  laundry: { icon: "🧺", name: "Laundry" },
  bins: { icon: "🗑", name: "Bins" },
  living: { icon: "🧹", name: "Living room" },
  general: { icon: "📦", name: "Other jobs" },
};

/** How far above the pile's spot the marker sits (kitchen mess is already on the worktop). */
const MARKER_HEIGHT: Record<MessZone, number> = {
  kitchen: 0.7, bathroom: 0.8, laundry: 1, bins: 1.1, living: 0.8, general: 1,
};

/** Markers shrink to an icon on narrow screens until the camera zooms in this much. */
const NARROW_PX = 700;
const ZOOMED_IN = 1.4;

// Keeps the open popup on screen: room for its width and its height above the anchor.
const POPUP_MARGINS = { x: 150, top: 230, bottom: 130 };

interface ZoneGroup {
  zone: MessZone;
  at: Vec3;
  chores: SceneChore[];
}

/** Open chores grouped by the room their mess is in, anchored above the first pile. */
function groupByZone(chores: SceneChore[]): ZoneGroup[] {
  const groups = new Map<MessZone, ZoneGroup>();
  for (const item of layoutMess(chores)) {
    const group = groups.get(item.zone);
    if (group) group.chores.push(item.chore);
    else {
      const [x, y, z] = item.at;
      groups.set(item.zone, { zone: item.zone, at: [x, y + MARKER_HEIGHT[item.zone], z], chores: [item.chore] });
    }
  }
  return [...groups.values()];
}

function dueText(chore: SceneChore): string {
  if (chore.isOverdue) return `Overdue, was due ${formatDueDate(chore.dueDate)}`;
  return chore.dueDate ? `Due ${formatDueDate(chore.dueDate)}` : "Any day this week";
}

interface MessMarkersProps {
  chores: SceneChore[];
  roommates: Roommate[];
  meId: string | null;
  /** The camera's zoom when it shows the whole flat. */
  baseZoom: number;
  /** Hide everything (a room sheet or the tour has the camera). */
  hidden: boolean;
  /** The room whose popup is open, or null. */
  open: MessZone | null;
  onOpen: (zone: MessZone | null) => void;
  onComplete: (choreId: string) => void;
  onOpenBoard: () => void;
}

export function MessMarkers({ chores, roommates, meId, baseZoom, hidden, open, onOpen, onComplete, onOpenBoard }: MessMarkersProps) {
  const camera = useThree((state) => state.camera);
  const width = useThree((state) => state.size.width);
  // Re-render only when the zoom crosses the threshold, not every frame.
  const zoomedInRef = useRef(false);
  const [zoomedIn, setZoomedIn] = useState(false);
  useFrame(() => {
    const next = camera.zoom > baseZoom * ZOOMED_IN;
    if (next !== zoomedInRef.current) {
      zoomedInRef.current = next;
      setZoomedIn(next);
    }
  });

  const groups = groupByZone(chores);
  const openGroup = groups.find((group) => group.zone === open) ?? null;

  // Escape closes the popup.
  useEffect(() => {
    if (!openGroup) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onOpen(null);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [openGroup, onOpen]);

  if (hidden) return null;

  const names = new Map(roommates.map((person) => [person.id, person.name]));
  const who = (chore: SceneChore) =>
    chore.assigneeId === null ? "Up for grabs" : chore.assigneeId === meId ? "You" : names.get(chore.assigneeId) ?? "Up for grabs";
  const compact = width < NARROW_PX && !zoomedIn;

  return (
    <>
      {groups.map((group) => {
        const info = ZONE_INFO[group.zone];
        const overdue = group.chores.filter((chore) => chore.isOverdue).length;
        const single = group.chores.length === 1 ? group.chores[0] : null;

        if (group === openGroup) {
          return (
            <Overlay key={group.zone} position={group.at} className="flat-mess-anchor" interactive keepOnScreen={POPUP_MARGINS}>
              <div className="flat-mess-popup" role="dialog" aria-label={`${info.name} chores`}>
                <div className="flat-mess-popup-head">
                  <span><span aria-hidden="true">{info.icon}</span> {info.name.toUpperCase()}</span>
                  <button type="button" className="flat-mess-close" onClick={() => onOpen(null)} aria-label="Close">×</button>
                </div>
                <ul>
                  {group.chores.map((chore) => (
                    <li key={chore.id} className={chore.isOverdue ? "flat-mess-row-overdue" : undefined}>
                      <span className="flat-mess-row-text">
                        <b>{chore.title}</b>
                        <span>{who(chore)} · {dueText(chore)}</span>
                      </span>
                      <button type="button" className="flat-mess-done" onClick={() => onComplete(chore.id)}>
                        <span aria-hidden="true">✓</span> DONE
                      </button>
                    </li>
                  ))}
                </ul>
                <button type="button" className="flat-mess-board" onClick={onOpenBoard}>
                  Open the chore board <span aria-hidden="true">→</span>
                </button>
              </div>
            </Overlay>
          );
        }
        // While a popup is open, the other markers step aside so it reads clearly.
        if (openGroup) return null;

        const label = single
          ? `${info.name}: ${single.title}, ${who(single)}${single.isOverdue ? ", overdue" : ""}. Show chore`
          : `${info.name}: ${group.chores.length} chores${overdue ? `, ${overdue} overdue` : ""}. Show chores`;
        return (
          <Overlay key={group.zone} position={group.at} className="flat-mess-anchor" interactive>
            <button
              type="button"
              className={`flat-mess-marker${overdue ? " flat-mess-marker-overdue" : ""}${compact ? " flat-mess-marker-compact" : ""}`}
              onClick={() => onOpen(group.zone)}
              aria-label={label}
              title={label}
            >
              <span className="flat-mess-icon" aria-hidden="true">{info.icon}</span>
              {compact ? (
                group.chores.length > 1 && <span className="flat-mess-count" aria-hidden="true">{group.chores.length}</span>
              ) : (
                <span className="flat-mess-text" aria-hidden="true">
                  <b>{single ? single.title : `${group.chores.length} ${info.name.toLowerCase()} chores`}</b>
                  <span>
                    {single
                      ? `${who(single)}${single.isOverdue ? " · overdue" : ""}`
                      : overdue ? `${overdue} overdue` : "Tap to tick off"}
                  </span>
                </span>
              )}
            </button>
          </Overlay>
        );
      })}
    </>
  );
}
