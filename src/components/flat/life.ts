// The housemates' little lives in the 3D flat: where they wander, what they do there, and the
// emoji they swap when they bump into each other. Pure logic (no three.js): `Housemates.tsx`
// steps it every frame and draws the result. Each device runs its own copy, so housemates see
// different (but equally plausible) scenes; nothing here is shared or saved.
//
// How it works:
// - A small hand-placed graph of walkable points (`NODES`/`EDGES`) routes everyone round the
//   walls and furniture, using Dijkstra over ~20 nodes.
// - `Spot`s are the things to do (sofa seats, fridge, sink, mirror, bedroom doors...). Each is
//   entered from one graph node, optionally via an `approach` point, and holds one person.
// - Each agent loops: choose a spot (weighted by what they "care about": their open chores,
//   bills, being top of the league) → walk there → do it for a while → choose again.
// - Two agents who are both settled near each other sometimes "talk": a few emoji lines.
// - Events from the house (a chat message, a finished chore, a rota rotation) interrupt them.
import type { Decor } from "../../hooks/useHouseholdData";
import { WHITEBOARD_ANGLE, WHITEBOARD_SPOT, type MessZone } from "./rooms";

/** A point on the floor: [x, z]. */
export type P2 = [number, number];

export type Pose = "stand" | "sit" | "reach" | "scrub" | "dance" | "enter";
export type Prop = "phone" | "mug" | "snack" | "book" | "bag";
export type Kind =
  | "sofa" | "tv" | "fridge" | "table" | "sink" | "hob" | "mirror" | "board" | "bedroom" | "plant" | "porch" | "hang";

// ---------- Walkable graph (see the floor plan in rooms.ts) ----------

const NODES = {
  kitchenWest: [-5.3, -3.75],
  kitchenEast: [-1.8, -3.75],
  kitchenFront: [-4.9, -0.7],
  kitchenGap: [-1.8, -0.65],
  livingCornerW: [-5.75, -0.45],
  livingWest: [-5.8, 1.0],
  livingSW: [-5.7, 3.9],
  livingSouth: [-4.1, 4.4],
  livingSE: [-2.0, 4.4],
  livingEast: [-1.9, 1.5],
  livingDoor: [0.2, 2.0],
  bathOut: [0.55, -0.2],
  bathIn: [0.6, -1.6],
  bathroom: [1.4, -2.9],
  hallWest: [1.9, 2.0],
  hallCentre: [4.0, 2.4],
  hallNorth: [5.0, 0.0],
  landing: [5.0, -2.4],
  hallDoor: [4.75, 4.2],
  porch: [4.65, 5.75],
} satisfies Record<string, P2>;

type NodeId = keyof typeof NODES;

// Each pair can be walked in a straight line without going through a wall or furniture.
const EDGES: [NodeId, NodeId][] = [
  ["kitchenWest", "kitchenEast"], ["kitchenWest", "kitchenFront"], ["kitchenEast", "kitchenGap"],
  ["kitchenFront", "kitchenGap"], ["kitchenFront", "livingCornerW"], ["livingCornerW", "livingWest"],
  ["livingWest", "livingSW"], ["livingSW", "livingSouth"], ["livingSouth", "livingSE"], ["livingSE", "livingEast"],
  ["livingSE", "livingDoor"], ["livingEast", "kitchenGap"], ["livingEast", "livingDoor"], ["kitchenGap", "bathOut"],
  ["livingDoor", "bathOut"], ["bathOut", "bathIn"], ["bathIn", "bathroom"], ["livingDoor", "hallWest"],
  ["hallWest", "hallCentre"], ["hallWest", "hallNorth"], ["hallCentre", "hallNorth"], ["hallNorth", "landing"],
  ["hallCentre", "hallDoor"], ["hallDoor", "porch"],
];

const NODE_IDS = Object.keys(NODES) as NodeId[];
const NEIGHBOURS = new Map<NodeId, NodeId[]>(NODE_IDS.map((id) => [id, []]));
for (const [a, b] of EDGES) {
  NEIGHBOURS.get(a)!.push(b);
  NEIGHBOURS.get(b)!.push(a);
}

function distance(a: P2, b: P2): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/** Shortest chain of nodes from one node to another (Dijkstra; the graph is tiny). */
function findPath(from: NodeId, to: NodeId): NodeId[] {
  const cost = new Map<NodeId, number>([[from, 0]]);
  const previous = new Map<NodeId, NodeId>();
  const open = new Set<NodeId>([from]);
  while (open.size > 0) {
    let current: NodeId | null = null;
    for (const id of open) if (current === null || cost.get(id)! < cost.get(current)!) current = id;
    if (current === null || current === to) break;
    open.delete(current);
    for (const next of NEIGHBOURS.get(current)!) {
      const through = cost.get(current)! + distance(NODES[current], NODES[next]);
      if (through < (cost.get(next) ?? Infinity)) {
        cost.set(next, through);
        previous.set(next, current);
        open.add(next);
      }
    }
  }
  const path: NodeId[] = [to];
  while (path[0] !== from) {
    const step = previous.get(path[0]);
    if (!step) return [from, to]; // unreachable (should not happen): walk straight
    path.unshift(step);
  }
  return path;
}

function nearestNode(at: P2): NodeId {
  return NODE_IDS.reduce((best, id) => (distance(NODES[id], at) < distance(NODES[best], at) ? id : best));
}

/** Rough room of a point, so people only chat with someone in the same (or an open-plan) room. */
function areaOf([x, z]: P2): string {
  if (z < -1) return x < -1 ? "downstairs" : x < 3 ? "bath" : "landing";
  return x < 1 ? "downstairs" : "hall";
}

// ---------- Spots: the things to do ----------

export interface Spot {
  id: string;
  kind: Kind;
  /** The graph node it is entered from and left by. */
  node: NodeId;
  /** A point between the node and the spot (so nobody walks through the furniture). */
  approach?: P2;
  at: P2;
  /** What they look at while there. */
  face: P2;
  pose: Pose;
  /** Seat height, for sitting poses. */
  seatY?: number;
  /** Bedroom doors: only this housemate goes in. */
  owner?: string;
  /** Hang-out spots come in pairs facing each other. */
  partner?: string;
}

const TV: P2 = [-6.5, 2];

/** Where people sit on the living-room seating, which depends on the sofa style. */
function sofaSpots(style: Decor["sofa"]): Spot[] {
  const seats: { at: P2; face: P2; seatY: number }[] =
    style === "beanbags"
      ? [[-3.25, 1.1], [-3.1, 2.25], [-3.35, 3.35]].map(([x, z]) => ({ at: [x, z], face: [TV[0], z], seatY: 0.45 }))
      : [[-3.4, 1.45], [-3.4, 2.55]].map(([x, z]) => ({ at: [x, z], face: [TV[0], z], seatY: 0.54 }));
  // The corner sofa's L has one more seat, facing the room (+z).
  if (style === "corner") seats.push({ at: [-4.25, 0.45], face: [-4.25, 3], seatY: 0.54 });
  return seats.map((seat, index) => ({
    id: `sofa-${index}`,
    kind: "sofa",
    node: "livingSouth",
    // Down the gap between the coffee table and the sofa.
    approach: [-4.1, Math.max(seat.at[1], 1.2)],
    at: seat.at,
    face: seat.face,
    pose: "sit",
    seatY: seat.seatY,
  }));
}

/** In front of the chore board, a step away along the way it faces. */
const BOARD_VIEW: P2 = [
  WHITEBOARD_SPOT[0] + Math.sin(WHITEBOARD_ANGLE) * 1.05,
  WHITEBOARD_SPOT[2] + Math.cos(WHITEBOARD_ANGLE) * 1.05,
];

const HANG_PAIRS: [NodeId, P2, NodeId, P2][] = [
  ["livingEast", [-1.2, 2.3], "livingDoor", [-0.5, 2.9]],
  ["hallCentre", [2.6, 3.4], "hallCentre", [3.4, 3.8]],
  ["kitchenWest", [-5.0, -3.0], "kitchenWest", [-4.45, -3.5]],
  ["landing", [4.4, -2.0], "landing", [5.5, -2.5]],
];

/**
 * Every spot in the flat. `doorOwners[i]` is the housemate behind bedroom door i (the doors
 * along the landing's back wall, as drawn by `BedroomDoors`).
 */
export function buildSpots(sofa: Decor["sofa"], doorOwners: string[]): Spot[] {
  const spots: Spot[] = [
    ...sofaSpots(sofa),
    { id: "tv", kind: "tv", node: "livingSW", at: [-5.55, 3.55], face: TV, pose: "stand" },
    { id: "fridge", kind: "fridge", node: "kitchenWest", at: [-5.5, -2.3], face: [-6.5, -2.3], pose: "reach" },
    { id: "sink", kind: "sink", node: "kitchenWest", at: [-3.4, -3.95], face: [-3.4, -5], pose: "scrub" },
    { id: "hob", kind: "hob", node: "kitchenWest", at: [-5.6, -3.95], face: [-5.6, -5], pose: "scrub" },
    {
      id: "chair-back", kind: "table", node: "kitchenEast", approach: [-2.9, -3.75],
      at: [-2.9, -3.05], face: [-2.9, -2.2], pose: "sit", seatY: 0.51,
    },
    {
      id: "chair-front", kind: "table", node: "kitchenGap", approach: [-2.9, -0.7],
      at: [-2.9, -1.35], face: [-2.9, -2.2], pose: "sit", seatY: 0.51,
    },
    { id: "mirror", kind: "mirror", node: "bathroom", at: [1.7, -3.95], face: [1.7, -5], pose: "stand" },
    { id: "board", kind: "board", node: "hallCentre", at: BOARD_VIEW, face: [WHITEBOARD_SPOT[0], WHITEBOARD_SPOT[2]], pose: "stand" },
    { id: "plant", kind: "plant", node: "livingSE", at: [-0.25, 3.95], face: [0.3, 4.4], pose: "stand" },
    { id: "porch", kind: "porch", node: "porch", at: [5.75, 5.75], face: [6.6, 5.95], pose: "stand" },
  ];
  HANG_PAIRS.forEach(([nodeA, atA, nodeB, atB], index) => {
    const a = `hang-${index}a`;
    const b = `hang-${index}b`;
    spots.push({ id: a, kind: "hang", node: nodeA, at: atA, face: atB, pose: "stand", partner: b });
    spots.push({ id: b, kind: "hang", node: nodeB, at: atB, face: atA, pose: "stand", partner: a });
  });
  doorOwners.forEach((owner, index) => {
    const x = 3.65 + index * 0.9;
    spots.push({ id: `door-${owner}`, kind: "bedroom", node: "landing", at: [x, -4.35], face: [x, -5], pose: "enter", owner });
  });
  return spots;
}

// ---------- What each kind of spot is like ----------

interface KindInfo {
  weight: number;
  /** Seconds spent there: [min, max]. */
  time: [number, number];
  emotes: string[];
  /** Something held while there (null = hands free), picked at random. */
  props?: (Prop | null)[];
  /** Something they walk away with (and carry through their next activity). */
  gives?: Prop;
  label: string;
}

const KINDS: Record<Kind, KindInfo> = {
  sofa: { weight: 3, time: [10, 22], emotes: ["📱", "😌", "📺", "☕"], props: ["phone", "mug", null], label: "Chilling on the sofa" },
  tv: { weight: 1.2, time: [7, 14], emotes: ["📺", "😮", "⚽", "🍿"], label: "Watching TV" },
  fridge: { weight: 1.6, time: [3, 4.5], emotes: ["🍕", "🥪", "🧃", "🍫"], gives: "snack", label: "Raiding the fridge" },
  table: { weight: 1.4, time: [8, 16], emotes: ["📚", "💻", "🍝", "✍️"], props: ["book", "mug", null], label: "At the kitchen table" },
  sink: { weight: 0.7, time: [5, 9], emotes: ["🧽", "🍽️"], label: "Washing up" },
  hob: { weight: 0.7, time: [6, 10], emotes: ["🍳", "🍜", "🔥"], label: "Cooking" },
  mirror: { weight: 0.7, time: [4, 7], emotes: ["💇", "😎", "🪥"], label: "Checking the mirror" },
  board: { weight: 0.8, time: [4, 7], emotes: ["🤔", "📋", "👀"], label: "Reading the chore board" },
  bedroom: { weight: 1.2, time: [10, 25], emotes: ["💤", "🎧", "📚"], label: "In their room" },
  plant: { weight: 0.4, time: [4, 6], emotes: ["🌱", "💧"], label: "Watering the plant" },
  porch: { weight: 0.3, time: [5, 8], emotes: ["🌬️", "🚲", "👋"], label: "Getting some fresh air" },
  hang: { weight: 2.2, time: [8, 16], emotes: ["🎵", "🤷", "😄"], label: "Hanging out" },
};

const PROP_LABELS: Partial<Record<Prop, string>> = { phone: "On their phone", book: "Studying" };

// ---------- What each housemate cares about (from the house's data) ----------

export interface PersonFacts {
  /** Their open chores by where the mess is: first title, and whether any is overdue. */
  chores: Partial<Record<MessZone, { title: string; overdue: boolean }>>;
  /** Pence: positive = owed money, negative = owes. */
  balance: number;
  /** Top of this week's league. */
  star: boolean;
}

const NO_FACTS: PersonFacts = { chores: {}, balance: 0, star: false };

const ZONE_KIND: Record<MessZone, Kind> = {
  kitchen: "sink", bathroom: "mirror", laundry: "bedroom", bins: "porch", living: "hang", general: "board",
};
const ZONE_EMOTE: Record<MessZone, string> = {
  kitchen: "🧽", bathroom: "🧼", laundry: "🧺", bins: "🗑️", living: "🧹", general: "📋",
};

interface Reason {
  boost: number;
  emotes: string[];
  label: string;
  pose?: Pose;
  prop?: Prop;
}

/** Why someone might be drawn to each kind of spot, beyond its usual appeal. */
function reasonsFor(facts: PersonFacts): Partial<Record<Kind, Reason>> {
  const reasons: Partial<Record<Kind, Reason>> = {};
  const add = (kind: Kind, reason: Reason) => {
    if ((reasons[kind]?.boost ?? 0) < reason.boost) reasons[kind] = reason;
  };
  for (const [zone, chore] of Object.entries(facts.chores) as [MessZone, { title: string; overdue: boolean }][]) {
    add(ZONE_KIND[zone], {
      boost: chore.overdue ? 4.5 : 2.5,
      emotes: chore.overdue ? [ZONE_EMOTE[zone], "😬"] : [ZONE_EMOTE[zone]],
      label: `Should really do: ${chore.title}`,
      // Taking a bin bag out to the wheelie bin.
      prop: zone === "bins" ? "bag" : undefined,
    });
  }
  if (facts.star) add("tv", { boost: 4, emotes: ["🏆", "🕺", "🎉"], label: "Celebrating: top of the league", pose: "dance" });
  if (facts.balance < 0) add("table", { boost: 2.5, emotes: ["💸", "😬", "🧾"], label: "Worrying about the bills" });
  else if (facts.balance > 0) add("table", { boost: 1, emotes: ["🤑", "🧾"], label: "Totting up what they're owed" });
  return reasons;
}

// ---------- Agents ----------

interface Plan {
  spot: Spot;
  time: number;
  pose: Pose;
  prop: Prop | null;
  emotes: string[];
  /** Always show an emote on arrival (they're there for a reason). */
  loud: boolean;
  label: string;
}

interface Talk {
  a: Agent;
  b: Agent;
  lines: [0 | 1, string][];
  t: number;
  shown: number;
}

export interface Agent {
  id: string;
  index: number;
  x: number;
  z: number;
  yaw: number;
  yawGoal: number;
  phase: "idle" | "walk" | "do";
  route: P2[];
  leg: number;
  /** idle: seconds until choosing what next; walk: pause before setting off (getting up). */
  wait: number;
  /** The spot they're heading to or at (reserved for them). */
  spot: Spot | null;
  /** Where they leave from next time: points to walk through, then a graph node. */
  exit: P2[];
  node: NodeId;
  pose: Pose;
  doTime: number;
  doLeft: number;
  doTotal: number;
  plan: Plan | null;
  /** Stands still until then (they're saying something in the house chat). */
  holdUntil: number;
  prop: Prop | null;
  carry: Prop | null;
  lastKind: Kind | null;
  label: string;
  // Animation blends (0..1) and timers, read by the renderer.
  sit: number;
  seatY: number;
  lean: number;
  fade: number;
  moving: number;
  stride: number;
  hopAt: number;
  /** Visual sidestep so walkers don't pass through each other. */
  ox: number;
  oz: number;
  emote: string | null;
  emoteKey: number;
  emoteUntil: number;
  talk: Talk | null;
  talkCooldown: number;
}

export interface Life {
  time: number;
  agents: Map<string, Agent>;
  spots: Spot[];
  /** spot id → agent id */
  taken: Map<string, string>;
  talks: Talk[];
  talkCheck: number;
}

const WALK_SPEED = 1.25;
const TALK_LINE = 1.5;

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function pickWeighted<T>(items: [T, number][]): T | null {
  const total = items.reduce((sum, [, weight]) => sum + weight, 0);
  if (total <= 0) return null;
  let roll = Math.random() * total;
  for (const [item, weight] of items) {
    roll -= weight;
    if (roll <= 0) return item;
  }
  return items[items.length - 1][0];
}

function angleTo(from: P2, to: P2): number {
  return Math.atan2(to[0] - from[0], to[1] - from[1]);
}

/** Moves `value` towards `goal` by at most `step`. */
function approach(value: number, goal: number, step: number): number {
  return value < goal ? Math.min(goal, value + step) : Math.max(goal, value - step);
}

export function createLife(): Life {
  return { time: 0, agents: new Map(), spots: [], taken: new Map(), talks: [], talkCheck: 0 };
}

function newAgent(id: string, index: number, home: P2, yaw: number): Agent {
  return {
    id, index, x: home[0], z: home[1], yaw, yawGoal: yaw, phase: "idle", route: [], leg: 0,
    // Everyone starts in the living room and drifts off at different times.
    wait: rand(0.5, 4), spot: null, exit: [], node: nearestNode(home), pose: "stand",
    doTime: 0, doLeft: 0, doTotal: 0, plan: null, holdUntil: 0, prop: null, carry: null, lastKind: null, label: "",
    sit: 0, seatY: 0, lean: 0, fade: 1, moving: 0, stride: 0, hopAt: -Infinity, ox: 0, oz: 0,
    emote: null, emoteKey: 0, emoteUntil: 0, talk: null, talkCooldown: rand(3, 8),
  };
}

/** Adds newcomers (at their home spot) and drops housemates who have left. */
export function syncAgents(life: Life, people: { id: string; home: P2; yaw: number }[]): void {
  const keep = new Set(people.map((person) => person.id));
  for (const agent of life.agents.values()) {
    if (keep.has(agent.id)) continue;
    if (agent.talk) endTalk(life, agent.talk);
    for (const [spotId, holder] of life.taken) if (holder === agent.id) life.taken.delete(spotId);
    life.agents.delete(agent.id);
  }
  people.forEach((person, index) => {
    const agent = life.agents.get(person.id);
    if (agent) agent.index = index;
    else life.agents.set(person.id, newAgent(person.id, index, person.home, person.yaw));
  });
}

/** Swaps in a new set of spots (the sofa style changed, or bedroom doors moved). */
export function setSpots(life: Life, spots: Spot[]): void {
  life.spots = spots;
  const ids = new Set(spots.map((spot) => spot.id));
  for (const spotId of [...life.taken.keys()]) if (!ids.has(spotId)) life.taken.delete(spotId);
}

function say(life: Life, agent: Agent, text: string, seconds = 2.2): void {
  agent.emote = text;
  agent.emoteKey += 1;
  agent.emoteUntil = life.time + seconds;
}

/** Picks somewhere to go and reserves it. `only` limits the kinds (for interruptions). */
function makePlan(life: Life, agent: Agent, facts: PersonFacts, only?: Kind[]): Plan | null {
  const free = life.spots.filter((spot) =>
    !life.taken.has(spot.id) && (!spot.owner || spot.owner === agent.id) && (!only || only.includes(spot.kind)));
  const reasons = only ? {} : reasonsFor(facts);
  const kinds = [...new Set(free.map((spot) => spot.kind))];
  const kind = only
    ? only.find((k) => kinds.includes(k)) ?? null
    : pickWeighted(kinds.map((k) => [k, (KINDS[k].weight + (reasons[k]?.boost ?? 0)) * (k === agent.lastKind ? 0.25 : 1)]));
  if (!kind) return null;

  // Hang-out spots whose partner is taken are more inviting: someone to talk to.
  const spot = pickWeighted(free.filter((s) => s.kind === kind).map((s) =>
    [s, s.partner && life.taken.has(s.partner) ? 3 : 1] as [Spot, number]));
  if (!spot) return null;
  life.taken.set(spot.id, agent.id);

  const info = KINDS[kind];
  const reason = reasons[kind];
  const prop = reason?.prop ?? (info.props ? pick(info.props) : null);
  return {
    spot,
    time: rand(...info.time),
    pose: reason?.pose ?? spot.pose,
    prop,
    emotes: reason?.emotes ?? info.emotes,
    loud: reason !== undefined,
    label: reason?.label ?? (prop && PROP_LABELS[prop]) ?? info.label,
  };
}

/** Sets off for the next plan, or wanders back to the nearest node if nothing is free. */
function setOff(life: Life, agent: Agent, facts: PersonFacts): void {
  const plan = makePlan(life, agent, facts);
  // Getting up from a seat takes a moment.
  agent.wait = agent.sit > 0.1 ? 0.35 : 0;
  agent.phase = "walk";
  agent.leg = 0;
  agent.plan = plan;
  agent.spot = plan?.spot ?? null;
  agent.label = "";
  // A bin bag is carried out from the start.
  if (plan?.prop === "bag") agent.carry = "bag";
  const start = [...agent.exit, NODES[agent.node]];
  if (!plan) {
    agent.route = start;
    return;
  }
  const path = findPath(agent.node, plan.spot.node).slice(1).map((id) => NODES[id] as P2);
  agent.route = [...start, ...path, ...(plan.spot.approach ? [plan.spot.approach] : []), plan.spot.at];
}

function arrive(life: Life, agent: Agent): void {
  const plan = agent.plan;
  if (!plan) {
    // Nowhere free to go: idle here for a bit, then try again.
    agent.exit = [];
    agent.phase = "idle";
    agent.wait = rand(1.5, 3);
    return;
  }
  agent.phase = "do";
  agent.pose = plan.pose;
  agent.doTime = 0;
  agent.doTotal = agent.doLeft = plan.time;
  agent.prop = plan.prop === "bag" ? null : plan.prop;
  agent.seatY = plan.spot.seatY ?? 0;
  agent.label = plan.label;
  agent.yawGoal = angleTo(plan.spot.at, plan.spot.face);
  if (plan.loud || Math.random() < 0.55) say(life, agent, pick(plan.emotes));
}

function finish(life: Life, agent: Agent, facts: PersonFacts): void {
  const spot = agent.spot;
  if (spot) {
    if (life.taken.get(spot.id) === agent.id) life.taken.delete(spot.id);
    agent.exit = spot.approach ? [spot.approach] : [];
    agent.node = spot.node;
    agent.lastKind = spot.kind;
    // Things picked up last time are put down now; the fridge hands out a snack.
    agent.carry = KINDS[spot.kind].gives ?? null;
  }
  agent.prop = null;
  agent.pose = "stand";
  setOff(life, agent, facts);
}

// ---------- Talking ----------

const SMALL_TALK: string[][] = [
  ["👋", "👋"], ["😂", "🤣"], ["☕", "👍"], ["🍕", "🤤", "🙌"], ["🎮", "🔥"], ["📚", "😴"], ["🎉", "🥳"],
  ["🐱", "😍"], ["🌧️", "😒"], ["🎵", "💃"], ["🍻", "👍", "🙌"], ["❓", "🤷"], ["🍜", "😋"],
];

/** A short exchange of emoji. Sometimes it's about the house: debts, chores, the league. */
function script(fa: PersonFacts, fb: PersonFacts): [0 | 1, string][] {
  const chat = (lines: string[], first: 0 | 1 = 0) => lines.map((text, i) => [((first + i) % 2) as 0 | 1, text] as [0 | 1, string]);
  const overdue = (facts: PersonFacts) => Object.values(facts.chores).some((chore) => chore?.overdue);
  if (Math.random() < 0.5) {
    if (fa.balance > 0 && fb.balance < 0) return chat(["💸", "😅", "👀"]);
    if (fb.balance > 0 && fa.balance < 0) return chat(["💸", "😅", "👀"], 1);
    if (overdue(fb)) return chat(["🧹", "🙈"]);
    if (overdue(fa)) return chat(["🧹", "🙈"], 1);
    if (fb.star) return chat(["🏆", "😎"]);
    if (fa.star) return chat(["🏆", "😎"], 1);
  }
  return chat(pick(SMALL_TALK), Math.random() < 0.5 ? 0 : 1);
}

function canTalk(agent: Agent): boolean {
  if (agent.talk || agent.talkCooldown > 0 || agent.fade < 0.95 || agent.holdUntil > 0) return false;
  return agent.phase === "do" && agent.pose !== "enter" && agent.pose !== "reach" && agent.pose !== "dance";
}

function endTalk(life: Life, talk: Talk): void {
  life.talks = life.talks.filter((item) => item !== talk);
  for (const agent of [talk.a, talk.b]) {
    agent.talk = null;
    agent.talkCooldown = rand(10, 25);
  }
}

function startTalks(life: Life, facts: Map<string, PersonFacts>): void {
  const agents = [...life.agents.values()].filter(canTalk);
  for (let i = 0; i < agents.length; i++) {
    for (let j = i + 1; j < agents.length; j++) {
      const a = agents[i];
      const b = agents[j];
      if (a.talk || b.talk) continue;
      if (distance([a.x, a.z], [b.x, b.z]) > 2.3 || areaOf([a.x, a.z]) !== areaOf([b.x, b.z])) continue;
      const partners = a.spot?.partner !== undefined && a.spot.partner === b.spot?.id;
      if (Math.random() > (partners ? 0.6 : 0.15)) continue;
      const talk: Talk = { a, b, lines: script(facts.get(a.id) ?? NO_FACTS, facts.get(b.id) ?? NO_FACTS), t: 0, shown: -1 };
      a.talk = b.talk = talk;
      life.talks.push(talk);
    }
  }
}

function stepTalks(life: Life, dt: number): void {
  for (const talk of [...life.talks]) {
    talk.t += dt;
    const line = Math.floor(talk.t / TALK_LINE);
    if (line >= talk.lines.length) {
      endTalk(life, talk);
      continue;
    }
    if (line !== talk.shown) {
      talk.shown = line;
      const [who, text] = talk.lines[line];
      say(life, who === 0 ? talk.a : talk.b, text, TALK_LINE - 0.1);
    }
  }
}

// ---------- Events from the house ----------

/**
 * They're talking in the house chat (a speech bubble or "…" over their head): they stop where
 * they are until `seconds` from now, and step out of their bedroom if they're in it. Called
 * every frame while it lasts, so it simply keeps being extended.
 */
export function hold(life: Life, id: string, seconds: number): void {
  const agent = life.agents.get(id);
  if (!agent) return;
  if (agent.talk) endTalk(life, agent.talk);
  agent.holdUntil = Math.max(agent.holdUntil, life.time + seconds);
}

/** They just ticked off a chore. */
export function cheer(life: Life, id: string): void {
  const agent = life.agents.get(id);
  if (!agent) return;
  agent.hopAt = life.time;
  say(life, agent, pick(["✨", "💪", "🙌"]));
}

/** The rota rotated: everyone hops, one after another. */
export function hopAll(life: Life): void {
  for (const agent of life.agents.values()) agent.hopAt = life.time + agent.index * 0.08;
}

// ---------- The frame step ----------

function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

export function stepLife(life: Life, rawDt: number, facts: Map<string, PersonFacts>): void {
  // A long gap (hidden tab) shouldn't teleport anyone.
  const dt = Math.min(rawDt, 0.1);
  life.time += dt;
  const agents = [...life.agents.values()];

  for (const agent of agents) {
    const mine = facts.get(agent.id) ?? NO_FACTS;
    agent.talkCooldown -= dt;
    if (agent.emote && life.time > agent.emoteUntil) agent.emote = null;
    const held = life.time < agent.holdUntil;
    if (!held) agent.holdUntil = 0;

    if (agent.phase === "idle") {
      agent.wait -= dt;
      if (agent.wait <= 0 && !held) setOff(life, agent, mine);
    } else if (agent.phase === "walk") {
      if (held) {
        // Stopped mid-walk to talk.
      } else if (agent.wait > 0) {
        agent.wait -= dt;
      } else {
        let step = WALK_SPEED * dt;
        while (step > 0 && agent.leg < agent.route.length) {
          const [tx, tz] = agent.route[agent.leg];
          const dx = tx - agent.x;
          const dz = tz - agent.z;
          const left = Math.hypot(dx, dz);
          if (left > 0.01) agent.yawGoal = Math.atan2(dx, dz);
          if (left <= step) {
            agent.x = tx;
            agent.z = tz;
            step -= left;
            agent.leg += 1;
          } else {
            agent.x += (dx / left) * step;
            agent.z += (dz / left) * step;
            step = 0;
          }
        }
        agent.stride += dt * 9;
        if (agent.leg >= agent.route.length) arrive(life, agent);
      }
    } else {
      agent.doTime += dt;
      // In their room: come back out (the door fade needs half a second) to be seen talking.
      if (held && agent.pose === "enter") agent.doLeft = Math.min(agent.doLeft, 0.5);
      // Chatting (emoji small talk, or the house chat) holds them in place.
      if (!agent.talk && (!held || agent.pose === "enter")) agent.doLeft -= dt;
      const spot = agent.spot!;
      const base = angleTo(spot.at, spot.face);
      if (agent.talk && agent.pose !== "sit") {
        const other = agent.talk.a === agent ? agent.talk.b : agent.talk.a;
        agent.yawGoal = angleTo([agent.x, agent.z], [other.x, other.z]);
      } else {
        // People hanging about look around a little.
        agent.yawGoal = base + (spot.kind === "hang" ? Math.sin(agent.doTime * 0.6 + agent.index) * 0.6 : 0);
      }
      if (agent.doLeft <= 0) finish(life, agent, mine);
    }

    // Animation blends.
    const doing = agent.phase === "do";
    agent.sit = approach(agent.sit, doing && agent.pose === "sit" ? 1 : 0, dt / 0.35);
    const leanGoal = !doing ? 0
      : agent.pose === "reach" ? (agent.doTime < agent.doTotal * 0.7 ? 1 : 0)
        : agent.pose === "scrub" ? 0.35 : 0;
    agent.lean = approach(agent.lean, leanGoal, dt / 0.3);
    agent.fade = doing && agent.pose === "enter"
      // Fade out through the bedroom door, and back in when they come out.
      ? Math.min(1, Math.max(0, 1 - agent.doTime / 0.5, 1 - agent.doLeft / 0.5))
      : approach(agent.fade, 1, dt / 0.4);
    agent.moving = approach(agent.moving, agent.phase === "walk" && agent.wait <= 0 && !held ? 1 : 0, dt / 0.2);
    const turn = wrapAngle(agent.yawGoal - agent.yaw);
    agent.yaw += turn * Math.min(1, dt * 8);
  }

  // Walkers sidestep anyone in their way (visual only, so seats and routes stay exact).
  for (const agent of agents) {
    let px = 0;
    let pz = 0;
    if (agent.phase === "walk") {
      for (const other of agents) {
        if (other === agent || other.fade < 0.5) continue;
        const dx = agent.x - other.x;
        const dz = agent.z - other.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.001 && d < 0.6) {
          px += (dx / d) * (0.6 - d);
          pz += (dz / d) * (0.6 - d);
        }
      }
    }
    const length = Math.hypot(px, pz);
    if (length > 0.3) {
      px *= 0.3 / length;
      pz *= 0.3 / length;
    }
    const k = Math.min(1, dt * 4);
    agent.ox += (px - agent.ox) * k;
    agent.oz += (pz - agent.oz) * k;
  }

  stepTalks(life, dt);
  life.talkCheck -= dt;
  if (life.talkCheck <= 0) {
    life.talkCheck = 0.7;
    startTalks(life, facts);
  }
}
