// The house pet (a decor slot): a cat that wanders the flat, a goldfish bowl on the kitchen
// worktop, or a hamster cage on the side table. Like the housemates, the cat's life runs on each
// device on its own (nothing is synced): it walks the housemates' routes (`walkPoints` in
// life.ts) between a few favourite spots, eats, naps and watches the birds. Click it to stroke it.
// The frame loop moves it through refs; React state changes only for its emoji and hover label.
// With reduced motion everything stays still (the cat naps on the hall rug).
import { useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useCursor } from "@react-three/drei";
import type { Group, Mesh } from "three";
import type { Decor } from "../../hooks/useHouseholdData";
import { playSound } from "../../lib/sfx";
import { Block, Cyl, Mat } from "./furniture";
import { Tag } from "./liveParts";
import { walkPoints, type NodeId, type P2 } from "./life";
import { Overlay } from "./Overlay";
import type { ScenePalette } from "./palette";

// ---------- The cat's brain ----------

type CatPose = "sit" | "sleep" | "eat";

interface CatSpot {
  /** The walkable graph node it is reached from (see life.ts). */
  node: NodeId;
  at: P2;
  /** What it looks at while there. */
  face: P2;
  pose: CatPose;
  /** Seconds spent there: [min, max]. */
  time: [number, number];
  emotes: string[];
}

/** The food bowl, by the kitchen partition. */
const BOWL: P2 = [-1.4, -2.5];

// Kept clear of the mess spots, the housemates' own spots and the furniture.
const CAT_SPOTS: CatSpot[] = [
  { node: "kitchenGap", at: [BOWL[0], BOWL[1] + 0.38], face: BOWL, pose: "eat", time: [4, 7], emotes: ["🐟", "😋"] },
  { node: "livingSW", at: [-6.35, 3.55], face: [-7, 3.55], pose: "sit", time: [8, 15], emotes: ["👀", "🐦"] },
  { node: "livingCornerW", at: [-6.35, -0.5], face: [-5, -0.5], pose: "sleep", time: [14, 26], emotes: ["💤"] },
  { node: "hallWest", at: [2.7, 2.45], face: [3.5, 2.45], pose: "sleep", time: [12, 24], emotes: ["💤"] },
  { node: "landing", at: [6.3, -2.0], face: [5, -2.0], pose: "sit", time: [6, 12], emotes: ["😼"] },
  { node: "porch", at: [3.7, 6.0], face: [3.7, 7], pose: "sit", time: [6, 12], emotes: ["🦋", "😺"] },
];
/** Where it naps when nothing moves (reduced motion), and where it starts. */
const STILL_SPOT = CAT_SPOTS[3];

const CAT_SPEED = 0.95;

interface CatState {
  x: number;
  z: number;
  yaw: number;
  yawGoal: number;
  phase: "walk" | "do";
  route: P2[];
  leg: number;
  spot: CatSpot;
  doLeft: number;
  stride: number;
  /** Blends towards the pose while settled (0 standing .. 1 fully in pose). */
  settle: number;
  emote: string | null;
  emoteKey: number;
  emoteLeft: number;
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function angleTo(from: P2, to: P2): number {
  return Math.atan2(to[0] - from[0], to[1] - from[1]);
}

function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function newCat(): CatState {
  const spot = STILL_SPOT;
  return {
    x: spot.at[0], z: spot.at[1], yaw: angleTo(spot.at, spot.face), yawGoal: angleTo(spot.at, spot.face),
    phase: "do", route: [], leg: 0, spot, doLeft: rand(3, 8), stride: 0, settle: 1,
    emote: null, emoteKey: 0, emoteLeft: 0,
  };
}

function say(cat: CatState, text: string, seconds = 2.2): void {
  cat.emote = text;
  cat.emoteKey += 1;
  cat.emoteLeft = seconds;
}

/** Off to another favourite spot, out the way it came in. */
function setOff(cat: CatState): void {
  const next = pick(CAT_SPOTS.filter((spot) => spot !== cat.spot));
  cat.route = [...walkPoints(cat.spot.node, next.node), next.at];
  cat.leg = 0;
  cat.spot = next;
  cat.phase = "walk";
}

function stepCat(cat: CatState, dt: number): void {
  if (cat.emote) {
    cat.emoteLeft -= dt;
    if (cat.emoteLeft <= 0) cat.emote = null;
  }
  if (cat.phase === "walk") {
    let step = CAT_SPEED * dt;
    while (step > 0 && cat.leg < cat.route.length) {
      const [tx, tz] = cat.route[cat.leg];
      const dx = tx - cat.x;
      const dz = tz - cat.z;
      const left = Math.hypot(dx, dz);
      if (left > 0.01) cat.yawGoal = Math.atan2(dx, dz);
      if (left <= step) {
        cat.x = tx;
        cat.z = tz;
        step -= left;
        cat.leg += 1;
      } else {
        cat.x += (dx / left) * step;
        cat.z += (dz / left) * step;
        step = 0;
      }
    }
    cat.stride += dt * 14;
    cat.settle = Math.max(0, cat.settle - dt / 0.3);
    if (cat.leg >= cat.route.length) {
      cat.phase = "do";
      cat.doLeft = rand(...cat.spot.time);
      cat.yawGoal = angleTo(cat.spot.at, cat.spot.face);
      if (Math.random() < 0.6) say(cat, pick(cat.spot.emotes));
    }
  } else {
    cat.doLeft -= dt;
    cat.settle = Math.min(1, cat.settle + dt / 0.5);
    // Sleepy cats snore now and then.
    if (cat.spot.pose === "sleep" && !cat.emote && Math.random() < dt / 6) say(cat, "💤", 1.8);
    if (cat.doLeft <= 0) setOff(cat);
  }
  cat.yaw += wrapAngle(cat.yawGoal - cat.yaw) * Math.min(1, dt * 7);
}

// ---------- The cat's body ----------

const GINGER = "#e08a3c";
const STRIPE = "#b8632a";
const CREAM = "#f6e7d2";

/** A low-poly ginger cat, facing +z, standing on y = 0. Legs are separate so they can walk. */
function CatBody({ legs, head, tail, torso }: {
  legs: { current: (Mesh | null)[] };
  head: { current: Group | null };
  tail: { current: Group | null };
  torso: { current: Group | null };
}) {
  const legAt: [number, number][] = [[-0.07, 0.13], [0.07, 0.13], [-0.07, -0.13], [0.07, -0.13]];
  return (
    <group>
      <group ref={torso}>
        <Block size={[0.2, 0.16, 0.4]} at={[0, 0.12, 0]} color={GINGER} />
        {[-0.08, 0.04].map((z) => (
          <Block key={z} size={[0.21, 0.03, 0.05]} at={[0, 0.25, z]} color={STRIPE} shadow={false} />
        ))}
        <Block size={[0.12, 0.1, 0.04]} at={[0, 0.13, 0.19]} color={CREAM} shadow={false} />
        <group ref={tail} position={[0, 0.22, -0.19]}>
          <Block size={[0.05, 0.05, 0.3]} at={[0, -0.025, -0.15]} color={GINGER} />
          <Block size={[0.055, 0.05, 0.07]} at={[0, -0.025, -0.28]} color={STRIPE} shadow={false} />
        </group>
      </group>
      <group ref={head} position={[0, 0.3, 0.22]}>
        <Block size={[0.19, 0.16, 0.16]} at={[0, -0.06, 0]} color={GINGER} />
        <Block size={[0.1, 0.06, 0.04]} at={[0, -0.06, 0.08]} color={CREAM} shadow={false} />
        {[-0.06, 0.06].map((x) => (
          <mesh key={x} position={[x, 0.13, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
            <coneGeometry args={[0.04, 0.08, 4]} />
            <Mat color={GINGER} />
          </mesh>
        ))}
        {[-0.045, 0.045].map((x) => (
          <Block key={x} size={[0.03, 0.03, 0.01]} at={[x, 0.02, 0.081]} color="#1b1c1f" shadow={false} />
        ))}
      </group>
      {legAt.map(([x, z], index) => (
        <mesh
          key={index}
          ref={(el) => {
            legs.current[index] = el;
          }}
          position={[x, 0.08, z]}
          castShadow
        >
          <boxGeometry args={[0.05, 0.12, 0.05]} />
          <Mat color={index < 2 ? CREAM : GINGER} />
        </mesh>
      ))}
    </group>
  );
}

function Cat({ p, still }: { p: ScenePalette; still: boolean }) {
  const [cat] = useState(newCat);
  const root = useRef<Group>(null);
  const torso = useRef<Group>(null);
  const head = useRef<Group>(null);
  const tail = useRef<Group>(null);
  const legs = useRef<(Mesh | null)[]>([]);
  const [emote, setEmote] = useState<{ text: string; key: number } | null>(null);
  const [hover, setHover] = useState(false);
  useCursor(hover);

  useFrame(({ clock }, rawDt) => {
    const g = root.current;
    if (!g) return;
    const dt = Math.min(rawDt, 0.1);
    if (!still) stepCat(cat, dt);
    const spot = still ? STILL_SPOT : cat.spot;
    const x = still ? spot.at[0] : cat.x;
    const z = still ? spot.at[1] : cat.z;
    g.position.set(x, 0.04, z);
    g.rotation.y = still ? angleTo(spot.at, spot.face) : cat.yaw;

    // Pose: sitting lifts the front, sleeping curls up low, eating dips the head.
    const settled = still ? 1 : cat.settle;
    const pose = spot.pose;
    const walking = !still && cat.phase === "walk";
    const t = clock.elapsedTime;
    if (torso.current) {
      torso.current.rotation.x = pose === "sit" ? -0.45 * settled : 0;
      torso.current.position.y = pose === "sleep" ? -0.08 * settled : walking ? Math.abs(Math.sin(cat.stride)) * 0.02 : 0;
      torso.current.position.z = pose === "sit" ? -0.05 * settled : 0;
    }
    if (head.current) {
      const breathe = still ? 0 : Math.sin(t * 2) * 0.01;
      head.current.position.y = 0.3 + (pose === "sit" ? 0.1 : pose === "sleep" ? -0.17 : pose === "eat" ? -0.12 : 0) * settled + breathe;
      head.current.rotation.x = pose === "eat" ? 0.5 * settled : 0;
      // A sleeping cat tucks its head round to one side.
      head.current.rotation.y = pose === "sleep" ? 0.6 * settled : 0;
    }
    if (tail.current) {
      const swish = still ? 0 : Math.sin(t * (walking ? 6 : 1.5)) * (pose === "sleep" ? 0.05 : 0.35);
      tail.current.rotation.set(pose === "sleep" ? 0.1 : -0.6 + (pose === "sit" ? 0.5 * settled : 0), swish + (pose === "sleep" ? 1.4 * settled : 0), 0);
    }
    legs.current.forEach((leg, index) => {
      if (!leg) return;
      const swing = walking ? Math.sin(cat.stride + (index === 0 || index === 3 ? 0 : Math.PI)) * 0.6 : 0;
      leg.rotation.x = swing;
      // Tucked away when curled up.
      leg.visible = !(pose === "sleep" && settled > 0.6);
    });

    // React state only when the emoji changes.
    const next = cat.emote && !still ? { text: cat.emote, key: cat.emoteKey } : null;
    if (next?.key !== emote?.key || (next === null) !== (emote === null)) setEmote(next);
  });

  function stroke(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation();
    if (event.delta > 6) return; // a drag to pan, not a click
    playSound("open");
    say(cat, cat.spot.pose === "sleep" ? "😺" : "💕", 2.5);
    // Petting holds it there a little longer.
    if (cat.phase === "do") cat.doLeft = Math.max(cat.doLeft, 4);
  }

  return (
    <>
      {/* The food bowl stays put while the cat roams. */}
      <Cyl args={[0.16, 0.13, 0.08, 10]} at={[BOWL[0], 0.04, BOWL[1]]} color={p.red} />
      <Cyl args={[0.12, 0.12, 0.02, 10]} at={[BOWL[0], 0.1, BOWL[1]]} color="#8a5a35" />
      <group
        ref={root}
        onPointerOver={(event) => {
          event.stopPropagation();
          setHover(true);
        }}
        onPointerOut={() => setHover(false)}
        onClick={stroke}
      >
        <CatBody legs={legs} head={head} tail={tail} torso={torso} />
        {hover && (
          <Tag position={[0, 0.75, 0]}>
            <b>The house cat</b>
            <span className="flat-tag-sub">Click to stroke</span>
          </Tag>
        )}
        {emote && (
          <Overlay position={[0, 0.55, 0]} className="flat-emote">
            <span key={emote.key} className="flat-emote-text" aria-hidden="true">{emote.text}</span>
          </Overlay>
        )}
      </group>
    </>
  );
}

// ---------- The goldfish ----------

/** A round bowl on the kitchen worktop, between the sink and the end of the counter. */
function FishBowl({ p, still }: { p: ScenePalette; still: boolean }) {
  const fish = useRef<Group>(null);
  const at: [number, number, number] = [-2.3, 0.98, -4.55];
  useFrame(({ clock }) => {
    const f = fish.current;
    if (!f || still) return;
    const t = clock.elapsedTime * 0.9;
    // Lazy laps of the bowl, bobbing up and down a little.
    f.position.set(Math.cos(t) * 0.07, 0.15 + Math.sin(t * 2.3) * 0.02, Math.sin(t) * 0.07);
    f.rotation.y = -t;
  });
  return (
    <group position={at}>
      <Cyl args={[0.12, 0.1, 0.03, 10]} at={[0, 0, 0]} color="#d9c7a4" />
      <mesh position={[0, 0.14, 0]}>
        <sphereGeometry args={[0.18, 12, 9]} />
        <meshStandardMaterial color={p.night ? "#6fa8c9" : "#9fd3ef"} transparent opacity={0.4} roughness={0.1} />
      </mesh>
      {/* A bit of weed in the gravel. */}
      <Cyl args={[0.01, 0.015, 0.12, 4]} at={[0.05, 0.03, -0.04]} color={p.plant} />
      <group ref={fish} position={[0.07, 0.15, 0]}>
        <mesh>
          <sphereGeometry args={[0.04, 7, 5]} />
          <Mat color="#ff8a1f" glow={0.15} />
        </mesh>
        {/* The tail trails behind the way it swims (it turns towards -x as it laps). */}
        <mesh position={[0, 0, -0.05]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.03, 0.04, 4]} />
          <Mat color="#ffb35c" />
        </mesh>
      </group>
    </group>
  );
}

// ---------- The hamster ----------

/** The hamster's height in its wheel (from the wheel's middle): running along the bottom. */
const HAMSTER_Y = -0.07;

/** A cage on the living-room side table (the mug makes way), with a hamster in its wheel. */
function HamsterCage({ p, still }: { p: ScenePalette; still: boolean }) {
  const wheel = useRef<Group>(null);
  const hamster = useRef<Group>(null);
  useFrame(({ clock }, delta) => {
    if (still) return;
    if (wheel.current) wheel.current.rotation.x -= delta * 5;
    if (hamster.current) hamster.current.position.y = HAMSTER_Y + Math.abs(Math.sin(clock.elapsedTime * 10)) * 0.012;
  });
  const top = 0.5;
  return (
    <group position={[-2.9, top, 3.75]}>
      <Block size={[0.46, 0.06, 0.36]} at={[0, 0, 0]} color={p.red} />
      <Block size={[0.42, 0.015, 0.32]} at={[0, 0.06, 0]} color="#e9d9a8" shadow={false} />
      {/* Bars: a wireframe box. */}
      <mesh position={[0, 0.06 + 0.16, 0]}>
        <boxGeometry args={[0.44, 0.32, 0.34, 8, 4, 6]} />
        <meshBasicMaterial color={p.metal} wireframe />
      </mesh>
      <Block size={[0.46, 0.02, 0.36]} at={[0, 0.38, 0]} color={p.metal} />
      {/* The wheel spins round the x axis (its face towards the camera's side). */}
      <group position={[0.06, 0.2, 0]}>
        <group ref={wheel}>
          <mesh rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[0.11, 0.012, 5, 14]} />
            <Mat color={p.dark} />
          </mesh>
          {[0, Math.PI / 3, (2 * Math.PI) / 3].map((angle) => (
            <Block key={angle} size={[0.008, 0.22, 0.008]} at={[0, -0.11, 0]} rotation={[angle, 0, 0]} color={p.dark} shadow={false} />
          ))}
        </group>
        <group ref={hamster} position={[0, HAMSTER_Y, 0]}>
          <mesh position={[0, 0, 0]}>
            <sphereGeometry args={[0.045, 7, 5]} />
            <Mat color="#d9a066" />
          </mesh>
          <mesh position={[0, 0.005, 0.04]}>
            <sphereGeometry args={[0.025, 6, 4]} />
            <Mat color="#f6e7d2" />
          </mesh>
        </group>
      </group>
      {/* Water bottle on the side. */}
      <Cyl args={[0.03, 0.03, 0.14, 6]} at={[-0.24, 0.17, 0.05]} color="#9fd3ef" />
    </group>
  );
}

export function Pet({ p, style, still }: { p: ScenePalette; style: Decor["pet"]; still: boolean }) {
  switch (style) {
    case "cat":
      return <Cat p={p} still={still} />;
    case "fish":
      return <FishBowl p={p} still={still} />;
    case "hamster":
      return <HamsterCage p={p} still={still} />;
    default:
      return null;
  }
}
