// The parts of the flat that show the house's data and open a feature when clicked:
// fridge (notes), kitchen table (bills), sofa and phone (chat), whiteboard (chores), TV (league),
// front door and bedroom doors (house), bathroom mirror (decor), and the mess left by open chores.
// The housemates' avatars are in Housemates.tsx.
import { useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useCursor } from "@react-three/drei";
import type { Group, Mesh, MeshStandardMaterial, PointLight } from "three";
import type { ChatActivity } from "../HomeChat";
import type { Chore, Decor, Expense, Note, Roommate, SyncStatus } from "../../hooks/useHouseholdData";
import { computeBalances, formatMoney } from "../../lib/bills";
import { computeLeague, starOfTheWeek } from "../../lib/league";
import { nameColour } from "../../lib/nameColour";
import { Block, Cyl, Mat } from "./furniture";
import { Overlay } from "./Overlay";
import type { ScenePalette } from "./palette";
import {
  FRONT_DOOR_SPOT, MAX_BEDROOM_DOORS, MESS_SPOTS, WHITEBOARD_ANGLE, WHITEBOARD_SPOT, messZone,
  type MessZone, type RoomId, type Vec3,
} from "./rooms";
import { BODY_FONT, HEADING_FONT, fitText, useCanvasTexture } from "./textures";

export type SceneChore = Chore & { isComplete: boolean; isOverdue: boolean };
/** Opens a room; `personId` says which housemate (the bedroom doors and avatars open their look). */
export type Select = (room: RoomId, personId?: string) => void;

const DAY_MS = 86_400_000;
const NOTE_COLOURS = ["#f6d55c", "#f4a6b8", "#a6dcb0", "#a7c7f2"];

export function hashOf(text: string): number {
  let hash = 0;
  for (const char of text) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash;
}

/** A floating label (plain HTML, so it uses the page's fonts and stays crisp). */
export function Tag({ position, children, className = "" }: { position: Vec3; children: ReactNode; className?: string }) {
  return (
    <Overlay position={position} className={`flat-tag ${className}`}>
      {children}
    </Overlay>
  );
}

interface HotspotProps {
  room: RoomId;
  at: Vec3;
  rotation?: Vec3;
  label: ReactNode;
  /** Height of the hover label above `at`. */
  tagHeight?: number;
  onSelect: Select;
  children: ReactNode;
}

/** Something you can click to open a room's panel. Grows a little and shows a label on hover. */
export function Hotspot({ room, at, rotation, label, tagHeight = 2.3, onSelect, children }: HotspotProps) {
  const group = useRef<Group>(null);
  const [hover, setHover] = useState(false);
  useCursor(hover);

  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    const goal = hover ? 1.06 : 1;
    g.scale.setScalar(g.scale.x + (goal - g.scale.x) * Math.min(1, delta * 12));
  });

  return (
    <group
      ref={group}
      position={at}
      rotation={rotation}
      onPointerOver={(event) => {
        event.stopPropagation();
        setHover(true);
      }}
      onPointerOut={() => setHover(false)}
      onClick={(event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation();
        if (event.delta > 6) return; // that was a drag to pan, not a click
        onSelect(room);
      }}
    >
      {children}
      {hover && <Tag position={[0, tagHeight, 0]}>{label}</Tag>}
    </group>
  );
}

/** A soft glow that pulses (for things that want attention). Respects reduced motion. */
function usePulse(ref: RefObject<Mesh | null>, on: boolean, still: boolean, base = 0.15, peak = 0.9) {
  useFrame(({ clock }) => {
    const material = ref.current?.material as MeshStandardMaterial | undefined;
    if (!material) return;
    material.emissiveIntensity = !on ? base : still ? peak : base + (peak - base) * (0.5 + 0.5 * Math.sin(clock.elapsedTime * 4));
  });
}

// ---------- Notes: the fridge ----------

/** The fridge's body. Every style keeps the same box and front (+x) face, where the magnets go. */
function FridgeBody({ p, style }: { p: ScenePalette; style: Decor["fridge"] }) {
  if (style === "steel") {
    // American-style: two tall doors side by side, long bar handles.
    return (
      <>
        <Block size={[0.85, 1.95, 0.85]} at={[0, 0, 0]} color={p.metal} />
        <Block size={[0.02, 1.85, 0.02]} at={[0.43, 0.05, 0]} color={p.dark} shadow={false} />
        <Block size={[0.05, 0.9, 0.04]} at={[0.46, 0.6, -0.06]} color={p.white} shadow={false} />
        <Block size={[0.05, 0.9, 0.04]} at={[0.46, 0.6, 0.06]} color={p.white} shadow={false} />
      </>
    );
  }
  if (style === "retro") {
    // Cream with a chrome trim strip, a chunky lever handle and a little badge.
    const cream = p.night ? "#a8997a" : "#f1dfb8";
    return (
      <>
        <Block size={[0.85, 1.85, 0.85]} at={[0, 0, 0]} color={cream} />
        <Block size={[0.8, 0.1, 0.8]} at={[0, 1.85, 0]} color={cream} />
        <Block size={[0.02, 0.05, 0.84]} at={[0.43, 1.42, 0]} color={p.metal} shadow={false} />
        <Block size={[0.08, 0.32, 0.08]} at={[0.46, 0.95, 0.33]} color={p.metal} />
        <Block size={[0.02, 0.06, 0.2]} at={[0.435, 1.6, 0]} color={p.red} shadow={false} />
      </>
    );
  }
  return (
    <>
      <Block size={[0.85, 1.95, 0.85]} at={[0, 0, 0]} color={p.white} />
      {/* Split between freezer and fridge doors, and two handles. */}
      <Block size={[0.02, 0.03, 0.8]} at={[0.43, 1.35, 0]} color={p.wallCap} shadow={false} />
      <Block size={[0.05, 0.3, 0.05]} at={[0.45, 1.5, 0.3]} color={p.metal} shadow={false} />
      <Block size={[0.05, 0.45, 0.05]} at={[0.45, 0.75, 0.3]} color={p.metal} shadow={false} />
    </>
  );
}

export function Fridge({
  p, style, notes, still, onSelect,
}: { p: ScenePalette; style: Decor["fridge"]; notes: Note[]; still: boolean; onSelect: Select }) {
  const newest = notes[0];
  const isFresh = newest ? Date.now() - new Date(newest.createdAt).getTime() < 2 * DAY_MS : false;
  const freshRef = useRef<Mesh>(null);
  usePulse(freshRef, isFresh, still, 0.1, 0.7);

  return (
    <Hotspot
      room="notes"
      at={[-6.5, 0, -2.3]}
      onSelect={onSelect}
      label={
        <>
          <b>Notes</b> · {notes.length}
          {newest && <span className="flat-tag-sub">“{newest.text}”</span>}
        </>
      }
    >
      <FridgeBody p={p} style={style} />
      {/* One magnet note per house note (up to 9), newest top-left. */}
      {notes.slice(0, 9).map((note, index) => {
        const row = Math.floor(index / 3);
        const col = index % 3;
        return (
          <mesh
            key={note.id}
            ref={index === 0 ? freshRef : undefined}
            position={[0.44, 1.12 - row * 0.32, -0.27 + col * 0.24]}
            rotation={[((hashOf(note.id) % 7) - 3) * 0.04, 0, 0]}
            castShadow
          >
            <boxGeometry args={[0.02, 0.24, 0.19]} />
            <Mat color={NOTE_COLOURS[hashOf(note.id) % NOTE_COLOURS.length]} glow={0.15} />
          </mesh>
        );
      })}
    </Hotspot>
  );
}

// ---------- Decor: the bathroom mirror ----------

/** A mirror above the basin on the bathroom's back wall; opens the decor picker. */
export function Mirror({
  p, style, still, onSelect,
}: { p: ScenePalette; style: Decor["mirror"]; still: boolean; onSelect: Select }) {
  const glassRef = useRef<Mesh>(null);
  // A slow shimmer hints that it does something (steady glow with reduced motion).
  usePulse(glassRef, true, still, 0.15, 0.4);
  const glass = <Mat color={p.night ? "#9fb4c4" : "#dbeef5"} glow={0.15} />;
  const glint = (at: Vec3, length: number) => (
    <Block size={[0.06, length, 0.01]} at={at} rotation={[0, 0, -0.6]} color="#ffffff" glow={0.6} shadow={false} />
  );

  let body: ReactNode;
  if (style === "round") {
    // Wooden ring with round glass (cylinders turned to face the room).
    body = (
      <>
        <mesh position={[0, 1.45, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.4, 0.4, 0.05, 18]} />
          <Mat color={p.wood} />
        </mesh>
        <mesh ref={glassRef} position={[0, 1.45, 0.03]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.33, 0.33, 0.02, 18]} />
          {glass}
        </mesh>
        {glint([-0.08, 1.27, 0.045], 0.38)}
      </>
    );
  } else if (style === "cabinet") {
    // A white wall cabinet whose door is the mirror.
    body = (
      <>
        <Block size={[0.7, 0.75, 0.2]} at={[0, 1.05, 0.06]} color={p.white} />
        <mesh ref={glassRef} position={[0, 1.425, 0.17]}>
          <boxGeometry args={[0.6, 0.65, 0.02]} />
          {glass}
        </mesh>
        <Block size={[0.03, 0.14, 0.03]} at={[0.25, 1.35, 0.19]} color={p.metal} shadow={false} />
        {glint([-0.1, 1.2, 0.185], 0.48)}
      </>
    );
  } else {
    body = (
      <>
        <Block size={[0.64, 0.82, 0.05]} at={[0, 1.02, 0]} color={COIN_GOLD} />
        <mesh ref={glassRef} position={[0, 1.43, 0.035]}>
          <boxGeometry args={[0.52, 0.7, 0.02]} />
          {glass}
        </mesh>
        {glint([-0.08, 1.18, 0.05], 0.5)}
      </>
    );
  }

  return (
    <Hotspot
      room="decor"
      at={[1.7, 0, -4.95]}
      onSelect={onSelect}
      tagHeight={2.2}
      label={<><b>Mirror</b><span className="flat-tag-sub">Redecorate the flat</span></>}
    >
      {body}
    </Hotspot>
  );
}

// ---------- Bills: the kitchen table ----------

const COIN_GOLD = "#e8b93a";

export function BillsTable({
  p, style, expenses, roommates, still, onSelect,
}: { p: ScenePalette; style: Decor["table"]; expenses: Expense[]; roommates: Roommate[]; still: boolean; onSelect: Select }) {
  const balances = useMemo(() => computeBalances(expenses), [expenses]);
  const total = expenses.reduce((sum, expense) => sum + Math.round(expense.amount * 100), 0);
  const newestDate = expenses.reduce((latest, expense) => (expense.date > latest ? expense.date : latest), "");
  const hasNewBill = newestDate !== "" && Date.now() - new Date(`${newestDate}T12:00:00`).getTime() < 3 * DAY_MS;
  const envelopeRef = useRef<Mesh>(null);
  usePulse(envelopeRef, hasNewBill, still, 0, 0.6);
  const people = roommates.slice(0, 6);

  return (
    <Hotspot
      room="bills"
      at={[-3.2, 0, -2.2]}
      onSelect={onSelect}
      tagHeight={1.9}
      label={
        <>
          <b>Bills</b> · {formatMoney(total)} logged
          {people.map((person) => {
            const balance = balances.get(person.id) ?? 0;
            return (
              <span className="flat-tag-sub" key={person.id}>
                {person.name}: {balance > 0 ? `gets ${formatMoney(balance)}` : balance < 0 ? `owes ${formatMoney(-balance)}` : "settled"}
              </span>
            );
          })}
        </>
      }
    >
      {/* Table (same height either way, so the envelopes and coins sit on it) and two chairs. */}
      {style === "round" ? (
        <>
          <Cyl args={[0.85, 0.85, 0.08, 12]} at={[0, 0.72, 0]} color={p.wood} />
          <Cyl args={[0.08, 0.1, 0.72, 6]} at={[0, 0, 0]} color={p.woodDark} />
          <Cyl args={[0.34, 0.4, 0.05, 8]} at={[0, 0, 0]} color={p.woodDark} />
        </>
      ) : (
        <>
          <Block size={[1.8, 0.08, 1.1]} at={[0, 0.72, 0]} color={p.wood} />
          {[[-0.8, -0.45], [0.8, -0.45], [-0.8, 0.45], [0.8, 0.45]].map(([x, z]) => (
            <Block key={`${x}${z}`} size={[0.08, 0.72, 0.08]} at={[x, 0, z]} color={p.woodDark} />
          ))}
        </>
      )}
      {[-0.85, 0.85].map((z) => (
        <group key={z}>
          <Block size={[0.45, 0.06, 0.45]} at={[0.3, 0.45, z]} color={p.woodDark} />
          <Block size={[0.45, 0.5, 0.06]} at={[0.3, 0.45, z + (z < 0 ? -0.2 : 0.2)]} color={p.woodDark} />
          {[[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]].map(([x, dz]) => (
            <Block key={`${x}${dz}`} size={[0.05, 0.45, 0.05]} at={[0.3 + x, 0, z + dz]} color={p.woodDark} />
          ))}
        </group>
      ))}
      {/* A pile of envelopes, one per bill (up to 6); the top one glows when a bill is new. */}
      {expenses.slice(0, 6).map((expense, index) => (
        <mesh
          key={expense.id}
          ref={index === Math.min(expenses.length, 6) - 1 ? envelopeRef : undefined}
          position={[-0.45, 0.815 + index * 0.025, -0.1]}
          rotation={[0, ((hashOf(expense.id) % 9) - 4) * 0.08, 0]}
          castShadow
        >
          <boxGeometry args={[0.42, 0.02, 0.28]} />
          <Mat color={p.white} emissive={p.red} glow={0} />
        </mesh>
      ))}
      {/* Coin stacks per housemate: gold if they're owed money, red if they owe. One coin ≈ £10. */}
      {people.map((person, index) => {
        const balance = balances.get(person.id) ?? 0;
        const coins = balance === 0 ? 1 : Math.min(10, Math.max(1, Math.ceil(Math.abs(balance) / 1000)));
        const colour = balance > 0 ? COIN_GOLD : balance < 0 ? p.red : p.metal;
        const x = 0.05 + (index % 3) * 0.26;
        const z = -0.22 + Math.floor(index / 3) * 0.42;
        return (
          <group key={person.id} position={[x, 0.8, z]}>
            {Array.from({ length: coins }, (_, coin) => (
              <mesh key={coin} position={[(coin % 2) * 0.008, 0.02 + coin * 0.036, 0]} castShadow>
                <cylinderGeometry args={[0.09, 0.09, 0.034, 8]} />
                <Mat color={colour} glow={balance > 0 ? 0.15 : 0} />
              </mesh>
            ))}
          </group>
        );
      })}
    </Hotspot>
  );
}

// ---------- Chat: the sofa, coffee table and phone ----------

/** The seating, facing the TV (towards -x). The coffee table and phone stay put whatever the style. */
function Sofa({ p, style }: { p: ScenePalette; style: Decor["sofa"] }) {
  if (style === "beanbags") {
    return (
      <>
        {[[0.05, -0.9], [0.2, 0.25], [-0.05, 1.35]].map(([x, z], index) => (
          <mesh key={index} position={[x, 0.26, z]} scale={[1, 0.62, 1]} castShadow receiveShadow>
            <icosahedronGeometry args={[0.45, 1]} />
            <Mat color={p.fabric} />
          </mesh>
        ))}
      </>
    );
  }
  const corner = style === "corner";
  return (
    <>
      <Block size={[0.95, 0.42, 2.4]} at={[0, 0, 0]} color={p.fabric} />
      <Block size={[0.28, 0.95, 2.4]} at={[0.4, 0, 0]} color={p.fabric} />
      <Block size={[0.95, 0.62, 0.25]} at={[0, 0, 1.2]} color={p.fabric} />
      <Block size={[0.7, 0.12, 1.0]} at={[-0.1, 0.42, -0.55]} color={p.white} />
      <Block size={[0.7, 0.12, 1.0]} at={[-0.1, 0.42, 0.55]} color={p.white} />
      {corner ? (
        <>
          {/* The L wraps round the coffee table's far end (towards the kitchen). */}
          <Block size={[1.4, 0.42, 0.95]} at={[-0.95, 0, -1.65]} color={p.fabric} />
          <Block size={[0.28, 0.95, 1.0]} at={[0.4, 0, -1.7]} color={p.fabric} />
          <Block size={[2.0, 0.95, 0.28]} at={[-0.6, 0, -2.2]} color={p.fabric} />
          <Block size={[0.25, 0.62, 0.95]} at={[-1.75, 0, -1.65]} color={p.fabric} />
          <Block size={[1.0, 0.12, 0.7]} at={[-0.95, 0.42, -1.6]} color={p.white} />
        </>
      ) : (
        <Block size={[0.95, 0.62, 0.25]} at={[0, 0, -1.2]} color={p.fabric} />
      )}
    </>
  );
}

export function ChatCorner({
  p, sofa, chat, recent, still, onSelect,
}: {
  p: ScenePalette;
  sofa: Decor["sofa"];
  chat: ChatActivity;
  /** A message from someone else that just arrived (shown in a bubble for a few seconds). */
  recent: ChatActivity["latest"];
  still: boolean;
  onSelect: Select;
}) {
  const phoneRef = useRef<Mesh>(null);
  usePulse(phoneRef, chat.unread > 0, still, 0.2, 1.2);

  const typing = chat.typing;
  const showBubble = recent !== null || typing.length > 0 || chat.unread > 0;

  return (
    <Hotspot
      room="chat"
      at={[-3.3, 0, 2]}
      onSelect={onSelect}
      tagHeight={1.6}
      label={<><b>House chat</b>{chat.unread > 0 ? ` · ${chat.unread} unread` : ""}</>}
    >
      <Sofa p={p} style={sofa} />
      {/* Coffee table with the phone on it. */}
      <Block size={[0.75, 0.06, 1.2]} at={[-1.5, 0.36, 0]} color={p.wood} />
      {[[-0.3, -0.5], [0.3, -0.5], [-0.3, 0.5], [0.3, 0.5]].map(([x, z]) => (
        <Block key={`${x}${z}`} size={[0.06, 0.36, 0.06]} at={[-1.5 + x, 0, z]} color={p.woodDark} />
      ))}
      <Block size={[0.2, 0.03, 0.36]} at={[-1.5, 0.42, -0.2]} color={p.dark} />
      <mesh ref={phoneRef} position={[-1.5, 0.455, -0.2]}>
        <boxGeometry args={[0.16, 0.01, 0.3]} />
        <Mat color={chat.unread > 0 ? "#25d366" : "#3b5f7a"} glow={0.2} />
      </mesh>

      {showBubble && (
        <Overlay position={[-0.6, 1.9, 0]} interactive>
          <button
            type="button"
            className="flat-chat-bubble"
            onClick={() => onSelect("chat")}
            aria-label={chat.unread > 0 ? `Open the house chat: ${chat.unread} unread` : "Open the house chat"}
          >
            {recent ? (
              <span className="flat-chat-text"><b>{recent.username}</b> {recent.text}</span>
            ) : typing.length > 0 ? (
              <span className="flat-chat-text">
                {typing.join(", ")} {typing.length === 1 ? "is" : "are"} typing
                <span className="wa-dots" aria-hidden="true"><i /><i /><i /></span>
              </span>
            ) : (
              <span className="flat-chat-text">💬 New messages</span>
            )}
            {chat.unread > 0 && <span className="flat-chat-count">{chat.unread}</span>}
          </button>
        </Overlay>
      )}
    </Hotspot>
  );
}

// ---------- Chores: the whiteboard in the hallway ----------

/** What the chore board stands on: an easel, an A-frame, or a pair of metal poles. */
function BoardStand({ p, style }: { p: ScenePalette; style: Decor["board"] }) {
  if (style === "chalkboard") {
    return (
      <>
        {[-0.78, 0.78].map((x) => (
          <group key={x}>
            <Block size={[0.09, 2.0, 0.09]} at={[x, 0, 0]} rotation={[-0.12, 0, 0]} color={p.woodDark} />
            <Block size={[0.07, 1.85, 0.07]} at={[x, 0, -0.45]} rotation={[0.25, 0, 0]} color={p.woodDark} />
          </group>
        ))}
        <Block size={[1.6, 0.05, 0.05]} at={[0, 0.5, -0.3]} color={p.woodDark} />
      </>
    );
  }
  if (style === "cork") {
    return (
      <>
        {[-0.75, 0.75].map((x) => (
          <group key={x}>
            <Cyl args={[0.03, 0.03, 1.95, 6]} at={[x, 0, -0.02]} color={p.metal} />
            <Block size={[0.08, 0.04, 0.6]} at={[x, 0, -0.02]} color={p.metal} />
          </group>
        ))}
      </>
    );
  }
  return (
    <>
      {/* Easel legs. */}
      <Block size={[0.07, 1.95, 0.07]} at={[-0.7, 0, 0]} rotation={[-0.08, 0, 0]} color={p.woodDark} />
      <Block size={[0.07, 1.95, 0.07]} at={[0.7, 0, 0]} rotation={[-0.08, 0, 0]} color={p.woodDark} />
      <Block size={[0.07, 1.8, 0.07]} at={[0, 0, -0.35]} rotation={[0.2, 0, 0]} color={p.woodDark} />
    </>
  );
}

/** Ink colours for the board's text, per board style. */
function boardInk(p: ScenePalette, style: Decor["board"]) {
  if (style === "chalkboard") {
    return { surface: "#2e4136", ink: "#f2f0e8", muted: "#b9c4bb", heading: "#ffd27a", done: "#9fe3ad", late: "#ff9b8a" };
  }
  // The corkboard has a cream sheet of paper pinned to it.
  const surface = style === "cork" ? "#f6efd9" : "#fbfbf8";
  return { surface, ink: "#242323", muted: "#77736f", heading: p.red, done: p.green, late: p.red };
}

export function Whiteboard({
  p, style, chores, roommates, shuffleKey, still, onSelect,
}: {
  p: ScenePalette;
  style: Decor["board"];
  chores: SceneChore[];
  roommates: Roommate[];
  shuffleKey: number;
  still: boolean;
  onSelect: Select;
}) {
  const names = new Map(roommates.map((person) => [person.id, person.name]));
  // Open chores first, then done ones; the board fits seven rows.
  const rows = [...chores].sort((a, b) => Number(a.isComplete) - Number(b.isComplete)).slice(0, 7);
  const c = boardInk(p, style);
  const key = JSON.stringify([
    rows.map((chore) => [chore.title, chore.isComplete, chore.isOverdue, names.get(chore.assigneeId ?? "") ?? ""]),
    chores.length,
    style,
    c,
  ]);

  const texture = useCanvasTexture(512, 340, key, (ctx, w, h) => {
    ctx.fillStyle = c.surface;
    ctx.fillRect(0, 0, w, h);
    if (style === "cork") {
      // Drawing pins in the paper's corners.
      ctx.fillStyle = "#d73932";
      for (const [x, y] of [[12, 12], [w - 12, 12], [12, h - 12], [w - 12, h - 12]]) {
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.fillStyle = c.heading;
    ctx.font = `34px ${HEADING_FONT}`;
    ctx.fillText("THIS WEEK", 22, 46);
    ctx.fillStyle = c.muted;
    ctx.font = `bold 20px ${BODY_FONT}`;
    const done = chores.filter((chore) => chore.isComplete).length;
    ctx.textAlign = "right";
    ctx.fillText(`${done}/${chores.length} DONE`, w - 22, 44);
    ctx.textAlign = "left";
    if (rows.length === 0) {
      ctx.fillStyle = c.muted;
      ctx.font = `26px ${BODY_FONT}`;
      ctx.fillText("Nothing on the board yet.", 22, 110);
      ctx.fillText("Click to add a chore.", 22, 146);
    }
    rows.forEach((chore, index) => {
      const y = 92 + index * 36;
      ctx.fillStyle = chore.isComplete ? c.done : chore.isOverdue ? c.late : c.ink;
      ctx.font = `26px ${BODY_FONT}`;
      ctx.fillText(chore.isComplete ? "✓" : "○", 22, y);
      const who = names.get(chore.assigneeId ?? "") ?? "anyone";
      ctx.fillText(fitText(ctx, chore.title, 300), 58, y);
      ctx.fillStyle = c.muted;
      ctx.font = `bold 20px ${BODY_FONT}`;
      ctx.textAlign = "right";
      ctx.fillText(fitText(ctx, who.toUpperCase(), 120), w - 22, y);
      ctx.textAlign = "left";
      if (chore.isComplete) {
        ctx.strokeStyle = c.done;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(58, y - 8);
        ctx.lineTo(58 + Math.min(300, ctx.measureText(chore.title).width * 1.25), y - 8);
        ctx.stroke();
      }
    });
    if (chores.length > rows.length) {
      ctx.fillStyle = c.muted;
      ctx.font = `bold 18px ${BODY_FONT}`;
      ctx.fillText(`+${chores.length - rows.length} MORE`, 22, h - 14);
    }
  });

  // When the roster rotates, the board gives a little wobble.
  const board = useRef<Group>(null);
  const shuffleStart = useRef<{ key: number; time: number | null }>({ key: shuffleKey, time: null });
  useFrame(({ clock }) => {
    const g = board.current;
    if (!g) return;
    if (shuffleStart.current.key !== shuffleKey) shuffleStart.current = { key: shuffleKey, time: clock.elapsedTime };
    const started = shuffleStart.current.time;
    const t = started === null || still ? 1 : (clock.elapsedTime - started) / 0.9;
    g.rotation.z = t < 1 ? Math.sin(t * Math.PI * 5) * 0.06 * (1 - t) : 0;
  });

  return (
    <Hotspot
      room="chores"
      // In the hallway by the low wall to the landing, turned to face whoever comes in the front door.
      at={WHITEBOARD_SPOT}
      rotation={[0, WHITEBOARD_ANGLE, 0]}
      onSelect={onSelect}
      tagHeight={2.4}
      label={<><b>Chore board</b> · {chores.filter((chore) => !chore.isComplete).length} to do</>}
    >
      <BoardStand p={p} style={style} />
      <group ref={board} position={[0, 1.3, 0.06]}>
        {style === "cork" ? (
          <>
            {/* Cork in a wooden frame; the list is a sheet of paper pinned to it. */}
            <Block size={[1.8, 1.25, 0.05]} at={[0, -0.625, -0.01]} color={p.woodDark} />
            <Block size={[1.7, 1.15, 0.06]} at={[0, -0.575, 0]} color={p.night ? "#8a6644" : "#c89b62"} />
          </>
        ) : (
          <Block size={[1.7, 1.15, 0.06]} at={[0, -0.575, 0]} color={style === "chalkboard" ? p.woodDark : p.metal} />
        )}
        <mesh position={[0, 0, 0.035]}>
          <planeGeometry args={style === "cork" ? [1.4, 0.93] : [1.6, 1.06]} />
          <meshBasicMaterial map={texture} toneMapped={false} />
        </mesh>
        {style === "whiteboard" && (
          <>
            {/* Marker tray with a red pen. */}
            <Block size={[1.4, 0.04, 0.12]} at={[0, -0.62, 0.06]} color={p.metal} />
            <Block size={[0.3, 0.04, 0.04]} at={[0.3, -0.58, 0.06]} color={p.red} shadow={false} />
          </>
        )}
        {style === "chalkboard" && (
          <>
            {/* Ledge with a stick of chalk. */}
            <Block size={[1.5, 0.05, 0.12]} at={[0, -0.63, 0.06]} color={p.woodDark} />
            <Block size={[0.2, 0.04, 0.04]} at={[-0.35, -0.58, 0.06]} color="#f2f0e8" shadow={false} />
          </>
        )}
      </group>
    </Hotspot>
  );
}

// ---------- League: the living-room TV ----------

const TV_ROWS = 4;

/** Everything but the picture, which stays in the same spot (facing +x) for every style. */
function TvBody({ p, style }: { p: ScenePalette; style: Decor["tv"] }) {
  if (style === "crt") {
    // A deep wood-effect box with a dark bezel and rabbit-ear aerials.
    return (
      <>
        <Block size={[0.5, 1.0, 1.7]} at={[-0.22, 0.5, 0]} color={p.woodDark} />
        <Block size={[0.04, 0.92, 1.6]} at={[0.02, 0.54, 0]} color={p.dark} />
        {[-0.5, 0.5].map((tilt) => (
          <Block key={tilt} size={[0.02, 0.55, 0.02]} at={[-0.22, 1.5, tilt * 0.2]} rotation={[tilt, 0, 0]} color={p.metal} shadow={false} />
        ))}
      </>
    );
  }
  if (style === "projector") {
    // A pull-down screen on a roller, and a little projector on the floor pointing at it.
    return (
      <>
        <Block size={[0.02, 0.95, 1.65]} at={[0.02, 0.52, 0]} color={p.white} shadow={false} />
        <mesh position={[0.03, 1.5, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.05, 0.05, 1.8, 8]} />
          <Mat color={p.dark} />
        </mesh>
        <group position={[1.1, 0, 0.9]}>
          <Block size={[0.34, 0.14, 0.3]} at={[0, 0, 0]} color={p.white} />
          <mesh position={[-0.18, 0.07, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.05, 0.05, 0.04, 10]} />
            <Mat color="#cfe3ff" glow={0.9} />
          </mesh>
        </group>
      </>
    );
  }
  return <Block size={[0.08, 0.9, 1.55]} at={[0, 0.55, 0]} color={p.dark} />;
}

/** The TV shows the house league: housemates ranked by chores done this week. */
export function Television({
  p, style, roommates, chores, onSelect,
}: { p: ScenePalette; style: Decor["tv"]; roommates: Roommate[]; chores: SceneChore[]; onSelect: Select }) {
  const league = useMemo(() => computeLeague(roommates, chores), [roommates, chores]);
  const star = starOfTheWeek(league);
  const shown = league.slice(0, TV_ROWS);
  const key = JSON.stringify([shown.map((row) => [row.person.name, row.rank, row.done, row.assigned, row.overdue]), star?.person.id, league.length, p.red]);

  const texture = useCanvasTexture(384, 216, key, (ctx, w, h) => {
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, "#1d2438");
    gradient.addColorStop(1, "#111522");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    // Channel strip along the top.
    ctx.fillStyle = p.red;
    ctx.fillRect(0, 0, w, 40);
    ctx.fillStyle = "#ffffff";
    ctx.font = `28px ${HEADING_FONT}`;
    ctx.fillText("HOUSE LEAGUE", 18, 31);
    ctx.font = `bold 15px ${BODY_FONT}`;
    ctx.textAlign = "right";
    ctx.fillText("● LIVE", w - 16, 27);
    ctx.textAlign = "left";

    if (shown.length === 0) {
      ctx.fillStyle = "#9aa3b8";
      ctx.font = `bold 22px ${BODY_FONT}`;
      ctx.textAlign = "center";
      ctx.fillText("ADD HOUSEMATES TO PLAY", w / 2, 128);
      return;
    }
    shown.forEach((row, index) => {
      const y = 76 + index * 40;
      const isStar = row === star;
      if (isStar) {
        ctx.fillStyle = "#2d3550";
        ctx.fillRect(8, y - 28, w - 16, 38);
      }
      ctx.fillStyle = isStar ? "#ffcf6b" : "#9aa3b8";
      ctx.font = `26px ${HEADING_FONT}`;
      ctx.fillText(isStar ? "★" : String(row.rank), 20, y);
      ctx.fillStyle = nameColour(row.person.name);
      ctx.beginPath();
      ctx.arc(64, y - 9, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = `24px ${HEADING_FONT}`;
      ctx.fillText(fitText(ctx, row.person.name.toUpperCase(), 190), 86, y);
      ctx.textAlign = "right";
      ctx.font = `bold 20px ${BODY_FONT}`;
      ctx.fillStyle = row.overdue ? p.red : "#ffffff";
      ctx.fillText(row.assigned ? `${row.done}/${row.assigned}` : "—", w - 20, y);
      ctx.textAlign = "left";
    });
    if (league.length > shown.length) {
      ctx.fillStyle = "#9aa3b8";
      ctx.font = `bold 13px ${BODY_FONT}`;
      ctx.fillText(`+${league.length - shown.length} MORE`, 20, h - 6);
    }
  });

  return (
    <Hotspot
      room="league"
      at={[-6.5, 0, 2]}
      onSelect={onSelect}
      tagHeight={2}
      label={
        <>
          <b>House league</b>
          <span className="flat-tag-sub">{star ? `★ ${star.person.name} leads` : "Nobody’s ahead yet"}</span>
        </>
      }
    >
      <TvBody p={p} style={style} />
      <mesh position={[0.045, 1, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[1.45, 0.8]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </Hotspot>
  );
}

// ---------- House: front door, porch light, doormat ----------

const PORCH_COLOURS: Record<SyncStatus, string> = {
  connecting: "#ffd37a",
  live: "#ffcf6b",
  reconnecting: "#ff7a45",
  missing: "#555555",
};

const DOOR_COLOURS: Record<Exclude<Decor["frontDoor"], "red">, { day: string; night: string }> = {
  navy: { day: "#2c3e66", night: "#3a5080" },
  green: { day: "#2f5d46", night: "#27493a" },
};

export function FrontDoor({
  p, style, householdName, status, still, onSelect,
}: { p: ScenePalette; style: Decor["frontDoor"]; householdName: string; status: SyncStatus; still: boolean; onSelect: Select }) {
  const doorColour = style === "red" ? p.red : p.night ? DOOR_COLOURS[style].night : DOOR_COLOURS[style].day;
  const lampRef = useRef<Mesh>(null);
  const lightRef = useRef<PointLight>(null);
  const label = householdName.trim() || "WELCOME";

  const matTexture = useCanvasTexture(320, 180, label, (ctx, w, h) => {
    ctx.fillStyle = "#7b5a3c";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#5c4029";
    ctx.lineWidth = 10;
    ctx.strokeRect(10, 10, w - 20, h - 20);
    ctx.fillStyle = "#f2e6d4";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let size = 56;
    ctx.font = `${size}px ${HEADING_FONT}`;
    while (size > 22 && ctx.measureText(label.toUpperCase()).width > w - 50) {
      size -= 2;
      ctx.font = `${size}px ${HEADING_FONT}`;
    }
    ctx.fillText(label.toUpperCase(), w / 2, h / 2 + 2);
  });

  // The porch light shows the connection: steady when live, a slow pulse while connecting,
  // a flicker while reconnecting, off if the house is missing.
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    let level = 1;
    if (status === "connecting") level = still ? 0.7 : 0.45 + 0.35 * Math.sin(t * 3);
    if (status === "reconnecting") level = still ? 0.5 : Math.sin(t * 23) > 0.2 || Math.sin(t * 7) > 0.6 ? 0.9 : 0.1;
    if (status === "missing") level = 0;
    const material = lampRef.current?.material as MeshStandardMaterial | undefined;
    if (material) material.emissiveIntensity = 0.2 + level * 1.6;
    if (lightRef.current) lightRef.current.intensity = level * (p.night ? 6 : 1.5);
  });

  const statusText: Record<SyncStatus, string> = {
    connecting: "connecting…",
    live: "porch light on: live",
    reconnecting: "light flickering: reconnecting",
    missing: "house not found",
  };

  return (
    <Hotspot
      room="house"
      at={FRONT_DOOR_SPOT}
      onSelect={onSelect}
      tagHeight={2.9}
      label={<><b>Front door</b> · housemates &amp; invite<span className="flat-tag-sub">{statusText[status]}</span></>}
    >
      {/* Frame. */}
      <Block size={[0.12, 2.15, 0.26]} at={[-0.6, 0, 0]} color={p.white} />
      <Block size={[0.12, 2.15, 0.26]} at={[0.6, 0, 0]} color={p.white} />
      <Block size={[1.32, 0.16, 0.26]} at={[0, 2.15, 0]} color={p.white} />
      {/* The door, hinged on the left and standing open (inwards). */}
      <group position={[-0.54, 0, 0]} rotation={[0, 1.05, 0]}>
        <Block size={[1.06, 2.1, 0.07]} at={[0.53, 0.02, 0]} color={doorColour} />
        {style === "navy" ? (
          // A frosted glass panel that glows from the hall light.
          <Block size={[0.5, 0.62, 0.02]} at={[0.53, 1.22, 0.045]} color={p.windowGlass} glow={p.night ? 0.6 : 0.25} shadow={false} />
        ) : (
          <Block size={[0.6, 0.6, 0.02]} at={[0.53, 1.25, 0.045]} color={doorColour} emissive="#000000" glow={0} shadow={false} />
        )}
        {style === "green" && (
          // Brass knocker: a ring under a little mount.
          <>
            <Block size={[0.1, 0.06, 0.03]} at={[0.53, 1.62, 0.05]} color={COIN_GOLD} shadow={false} />
            <mesh position={[0.53, 1.52, 0.07]}>
              <torusGeometry args={[0.08, 0.018, 6, 12]} />
              <Mat color={COIN_GOLD} />
            </mesh>
          </>
        )}
        <mesh position={[0.9, 1.05, 0.06]}>
          <sphereGeometry args={[0.05, 6, 4]} />
          <Mat color={COIN_GOLD} />
        </mesh>
        {/* Letterbox. */}
        <Block size={[0.36, 0.06, 0.02]} at={[0.53, 0.9, 0.045]} color={COIN_GOLD} shadow={false} />
      </group>
      {/* Porch light above the door. */}
      {style === "green" && <Block size={[0.24, 0.05, 0.24]} at={[0, 2.66, 0.2]} color={p.dark} shadow={false} />}
      <mesh ref={lampRef} position={[0, 2.5, 0.2]}>
        {style === "green" ? <cylinderGeometry args={[0.1, 0.13, 0.3, 6]} /> : <boxGeometry args={[0.22, 0.26, 0.14]} />}
        <Mat color={PORCH_COLOURS[status]} emissive={PORCH_COLOURS[status]} glow={1} />
      </mesh>
      <pointLight ref={lightRef} position={[0, 2.35, 0.6]} color={PORCH_COLOURS[status]} distance={5} decay={1.5} />
      {/* Doormat with the house name. */}
      <mesh position={[0, 0.03, 0.85]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[1.25, 0.7]} />
        <meshStandardMaterial map={matTexture} roughness={1} />
      </mesh>
    </Hotspot>
  );
}

/** Wheelie bin on the porch (bin-day chores leave bags next to it). */
export function WheelieBin({ p }: { p: ScenePalette }) {
  return (
    <group position={[6.6, 0, 5.95]}>
      <Block size={[0.6, 0.85, 0.6]} at={[0, 0, 0]} color={p.night ? "#3f5e45" : "#4f7a57"} />
      <Block size={[0.66, 0.07, 0.66]} at={[0, 0.85, 0]} color={p.night ? "#33503a" : "#41684a"} />
      {[-0.22, 0.22].map((x) => (
        <mesh key={x} position={[x, 0.08, -0.3]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.08, 0.08, 0.06, 6]} />
          <Mat color={p.dark} />
        </mesh>
      ))}
    </group>
  );
}

// ---------- House: bedroom doors with name plates ----------

function DoorPlate({ text }: { text: string }) {
  const texture = useCanvasTexture(256, 80, text, (ctx, w, h) => {
    ctx.fillStyle = "#fbfaf7";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#242323";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `40px ${HEADING_FONT}`;
    ctx.fillText(fitText(ctx, text.toUpperCase(), w - 24), w / 2, h / 2 + 2);
  });
  return (
    <mesh position={[0, 1.45, 0.04]}>
      <planeGeometry args={[0.55, 0.17]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}

export function BedroomDoors({ p, roommates, meId, onSelect }: {
  p: ScenePalette;
  roommates: Roommate[];
  meId: string | null;
  onSelect: Select;
}) {
  // One door per housemate, opening their look picker; if there are more than fit, the last door
  // says "+N more" and opens the first of those. With no housemates there are no bedroom doors.
  const overflow = roommates.length > MAX_BEDROOM_DOORS;
  const shown = overflow ? roommates.slice(0, MAX_BEDROOM_DOORS - 1) : roommates;
  const doors: { key: string; personId: string; text: string; colour: string }[] = shown.map((person) => ({
    key: person.id,
    personId: person.id,
    text: person.name,
    colour: nameColour(person.name),
  }));
  if (overflow) {
    doors.push({
      key: "more",
      personId: roommates[shown.length].id,
      text: `+${roommates.length - shown.length} more`,
      colour: p.muted,
    });
  }

  return (
    <>
      {doors.map((door, index) => (
        <Hotspot
          key={door.key}
          room="looks"
          at={[3.65 + index * 0.9, 0, -4.97]}
          onSelect={(room) => onSelect(room, door.personId)}
          tagHeight={2.2}
          label={<><b>{door.text}</b><span className="flat-tag-sub">{door.personId === meId && door.key !== "more" ? "Your room: change your look" : "Change their look"}</span></>}
        >
          <Block size={[0.86, 1.9, 0.04]} at={[0, 0, -0.01]} color={p.white} />
          <Block size={[0.74, 1.82, 0.06]} at={[0, 0, 0]} color={door.colour} />
          <mesh position={[0.27, 0.9, 0.05]}>
            <sphereGeometry args={[0.04, 6, 4]} />
            <Mat color={COIN_GOLD} />
          </mesh>
          <DoorPlate text={door.text} />
        </Hotspot>
      ))}
    </>
  );
}

// ---------- Mess: one object per open chore, in the room it belongs to ----------

/** Where each open chore's mess goes; extra chores in a zone share its last spot. */
export function layoutMess(chores: SceneChore[]): { chore: SceneChore; zone: MessZone; at: Vec3 }[] {
  const used: Partial<Record<MessZone, number>> = {};
  return chores
    .filter((chore) => !chore.isComplete)
    .map((chore) => {
      const zone = messZone(chore.title);
      const spots = MESS_SPOTS[zone];
      const index = used[zone] ?? 0;
      used[zone] = index + 1;
      const base = spots[Math.min(index, spots.length - 1)];
      // Pile overflow up a little so it is visibly "more mess".
      const extra = Math.max(0, index - spots.length + 1);
      return { chore, zone, at: [base[0] + extra * 0.12, base[1], base[2] - extra * 0.1] as Vec3 };
    });
}

function MessShape({ zone, p, seed }: { zone: MessZone; p: ScenePalette; seed: number }) {
  switch (zone) {
    case "kitchen": // a stack of dirty plates and a mug
      return (
        <group>
          {[0, 1, 2].map((i) => (
            <mesh key={i} position={[(i % 2) * 0.03, 0.02 + i * 0.035, 0]} castShadow>
              <cylinderGeometry args={[0.19, 0.15, 0.03, 8]} />
              <Mat color={i === 2 ? "#e6dccb" : p.white} />
            </mesh>
          ))}
          <mesh position={[0.06, 0.13, 0.02]}>
            <sphereGeometry args={[0.05, 5, 3]} />
            <Mat color="#a0703a" />
          </mesh>
          <Cyl args={[0.06, 0.06, 0.12, 6]} at={[0.26, 0, 0.08]} color={p.red} />
        </group>
      );
    case "bathroom": // a grimy puddle with bubbles
      return (
        <group>
          <Cyl args={[0.36, 0.36, 0.015, 7]} at={[0, 0, 0]} color="#8f9a5d" transparent opacity={0.85} />
          {[[0.1, 0.05], [-0.12, -0.08], [0.02, -0.15]].map(([x, z]) => (
            <mesh key={`${x}${z}`} position={[x, 0.05, z]}>
              <icosahedronGeometry args={[0.05, 0]} />
              <Mat color="#dfe8d0" />
            </mesh>
          ))}
        </group>
      );
    case "laundry": // a pile of clothes
      return (
        <group>
          {["#5a7698", p.red, "#e0c36a", "#7c6ca8"].map((colour, i) => (
            <mesh key={colour} position={[(i % 2) * 0.16 - 0.08, 0.08 + i * 0.06, Math.floor(i / 2) * 0.14 - 0.07]} scale={[1, 0.45, 1]} rotation={[0, i + seed, 0]} castShadow>
              <icosahedronGeometry args={[0.2, 0]} />
              <Mat color={colour} />
            </mesh>
          ))}
        </group>
      );
    case "bins": // a full bin bag
      return (
        <group>
          <mesh position={[0, 0.26, 0]} scale={[1, 0.9, 1]} rotation={[0, seed, 0]} castShadow>
            <dodecahedronGeometry args={[0.28, 0]} />
            <Mat color="#26272b" />
          </mesh>
          <mesh position={[0, 0.55, 0]}>
            <coneGeometry args={[0.07, 0.14, 5]} />
            <Mat color="#26272b" />
          </mesh>
        </group>
      );
    case "living": // dust bunnies and crumbs
      return (
        <group>
          {[[0, 0, 0.14], [0.2, 0.08, 0.1], [-0.15, 0.12, 0.09]].map(([x, z, r]) => (
            <mesh key={`${x}${z}`} position={[x, r, z]} castShadow>
              <icosahedronGeometry args={[r, 0]} />
              <Mat color="#9d9a94" />
            </mesh>
          ))}
        </group>
      );
    default: // cardboard clutter
      return (
        <group rotation={[0, seed, 0]}>
          <Block size={[0.45, 0.32, 0.38]} at={[0, 0, 0]} color="#c49a6c" />
          <Block size={[0.3, 0.22, 0.28]} at={[0.05, 0.32, 0.02]} color="#b38959" rotation={[0, 0.5, 0]} />
        </group>
      );
  }
}

function MessItem({
  item, p, names, still, onSelect,
}: { item: ReturnType<typeof layoutMess>[number]; p: ScenePalette; names: Map<string, string>; still: boolean; onSelect: Select }) {
  const ring = useRef<Mesh>(null);
  usePulse(ring, item.chore.isOverdue, still, 0.3, 1.1);
  const who = names.get(item.chore.assigneeId ?? "") ?? "Up for grabs";
  return (
    <Hotspot
      room="chores"
      at={item.at}
      onSelect={onSelect}
      tagHeight={1}
      label={
        <>
          <b>{item.chore.title}</b>
          <span className="flat-tag-sub">{who}{item.chore.isOverdue ? " · overdue" : ""}</span>
        </>
      }
    >
      <MessShape zone={item.zone} p={p} seed={hashOf(item.chore.id) % 6} />
      {item.chore.isOverdue && (
        <mesh ref={ring} position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.36, 0.44, 10]} />
          <meshStandardMaterial color={p.red} emissive={p.red} emissiveIntensity={0.6} flatShading />
        </mesh>
      )}
    </Hotspot>
  );
}

export function Mess({
  p, chores, roommates, still, onSelect,
}: { p: ScenePalette; chores: SceneChore[]; roommates: Roommate[]; still: boolean; onSelect: Select }) {
  const names = new Map(roommates.map((person) => [person.id, person.name]));
  return (
    <>
      {layoutMess(chores).map((item) => (
        <MessItem key={item.chore.id} item={item} p={p} names={names} still={still} onSelect={onSelect} />
      ))}
    </>
  );
}

// ---------- Sparkle burst when a chore is ticked off ----------

const SPARK_COUNT = 12;

export function Burst({ at, colour, onDone }: { at: Vec3; colour: string; onDone: () => void }) {
  const group = useRef<Group>(null);
  const start = useRef<number | null>(null);
  // Random directions, fixed for this burst.
  const directions = useMemo(
    () => Array.from({ length: SPARK_COUNT }, (_, i) => {
      const angle = (i / SPARK_COUNT) * Math.PI * 2;
      return [Math.cos(angle) * (0.6 + Math.random() * 0.6), 1.2 + Math.random() * 1.2, Math.sin(angle) * (0.6 + Math.random() * 0.6)];
    }),
    [],
  );

  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;
    start.current ??= clock.elapsedTime;
    const t = (clock.elapsedTime - start.current) / 1.1;
    if (t >= 1) {
      if (!g.userData.finished) onDone();
      g.userData.finished = true;
      return;
    }
    g.children.forEach((child, i) => {
      const [dx, dy, dz] = directions[i];
      child.position.set(dx * t, dy * t - 1.6 * t * t + 0.3, dz * t);
      child.scale.setScalar(1 - t);
      child.rotation.y = t * 6;
    });
  });

  return (
    <group ref={group} position={at}>
      {directions.map((_, i) => (
        <mesh key={i}>
          <octahedronGeometry args={[0.07, 0]} />
          <meshBasicMaterial color={i % 3 === 0 ? COIN_GOLD : colour} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}
