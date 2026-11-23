// The housemates' avatars, living their own little lives in the flat (see life.ts for the brain).
// One `useFrame` steps the simulation; each avatar reads its agent every frame and poses itself
// (walk waddle, sitting, leaning into the fridge, dancing...) without re-rendering React. Only
// rare changes (a new emoji bubble, vanishing into a bedroom, the hover label) touch React state.
// With reduced motion they stand still in the living room, as before.
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import type { ChatActivity } from "../HomeChat";
import type { Decor, Expense, Roommate } from "../../hooks/useHouseholdData";
import { computeBalances } from "../../lib/bills";
import { computeLeague, starOfTheWeek } from "../../lib/league";
import { initial, nameColour } from "../../lib/nameColour";
import { Block, Cyl, Mat } from "./furniture";
import { Hotspot, Tag, hashOf, type SceneChore } from "./liveParts";
import {
  buildSpots, chatPing, cheer, createLife, hopAll, setSpots, stepLife, syncAgents,
  type Life, type PersonFacts, type Prop,
} from "./life";
import { Overlay } from "./Overlay";
import { AVATAR_SPOTS, MAX_BEDROOM_DOORS, messZone, type RoomId, type Vec3 } from "./rooms";

const SKIN_TONES = ["#f1c9a5", "#d9a066", "#a8714a", "#7a4b2f", "#e8b894"];
const HAIR = ["#2b2118", "#6b4a2b", "#c9a15a", "#1d1d1d", "#8a3b2a"];
const ORIGIN: Vec3 = [0, 0, 0];
const EMOTE_AT: Vec3 = [0, 1.62, 0];
const PROPS: Prop[] = ["phone", "mug", "snack", "book", "bag"];

/** Names as the chat compares them: case- and space-insensitive. */
function sameName(a: string, b: string): boolean {
  const norm = (text: string) => text.toLowerCase().replace(/\s+/g, "");
  return norm(a) === norm(b);
}

/** Faces the camera (roughly), with a little variety per person. */
function restYaw(seed: number): number {
  return Math.PI / 4 + ((seed % 5) - 2) * 0.15;
}

interface Ui {
  emote: string | null;
  emoteKey: number;
  hidden: boolean;
  label: string;
}

const REST_UI: Ui = { emote: null, emoteKey: 0, hidden: false, label: "" };

/** What they're holding. Each sits in front of the body (+z), at hand height. */
function HeldThings({ refs }: { refs: { current: Partial<Record<Prop, Group | null>> } }) {
  const bind = (prop: Prop) => (el: Group | null) => {
    refs.current[prop] = el;
  };
  return (
    <>
      <group ref={bind("phone")} visible={false} position={[0.08, 0.52, 0.25]} rotation={[-0.6, 0, 0]}>
        <Block size={[0.1, 0.17, 0.025]} at={[0, -0.085, 0]} color="#1c1c1c" shadow={false} />
        <mesh position={[0, 0, 0.014]}>
          <planeGeometry args={[0.08, 0.13]} />
          <meshBasicMaterial color="#8fd3ff" toneMapped={false} />
        </mesh>
      </group>
      <group ref={bind("mug")} visible={false}>
        <Cyl args={[0.055, 0.05, 0.11, 7]} at={[0.16, 0.45, 0.24]} color="#d94f3d" />
      </group>
      <group ref={bind("snack")} visible={false} position={[0.14, 0.5, 0.25]}>
        {/* A sandwich: bread, lettuce, bread. */}
        <Block size={[0.17, 0.03, 0.13]} at={[0, 0, 0]} color="#e8c07a" shadow={false} />
        <Block size={[0.18, 0.02, 0.14]} at={[0, 0.03, 0]} color="#6fae4f" shadow={false} />
        <Block size={[0.17, 0.03, 0.13]} at={[0, 0.05, 0]} color="#e8c07a" shadow={false} />
      </group>
      <group ref={bind("book")} visible={false} position={[0, 0.52, 0.26]} rotation={[-0.5, 0, 0]}>
        <Block size={[0.24, 0.03, 0.17]} at={[0, 0, 0]} color="#3d6fa8" shadow={false} />
        <Block size={[0.22, 0.01, 0.15]} at={[0, 0.03, 0]} color="#f4f1e8" shadow={false} />
      </group>
      <group ref={bind("bag")} visible={false} position={[0.32, 0.1, 0.05]}>
        <mesh position={[0, 0.12, 0]} castShadow>
          <dodecahedronGeometry args={[0.17, 0]} />
          <Mat color="#26272b" />
        </mesh>
        <mesh position={[0, 0.31, 0]}>
          <coneGeometry args={[0.05, 0.1, 5]} />
          <Mat color="#26272b" />
        </mesh>
      </group>
    </>
  );
}

function Housemate({
  person, life, home, still, onSelect,
}: { person: Roommate; life: Life; home: Vec3; still: boolean; onSelect: (room: RoomId) => void }) {
  const root = useRef<Group>(null);
  const body = useRef<Group>(null);
  const held = useRef<Partial<Record<Prop, Group | null>>>({});
  const seed = hashOf(person.id) % 100;
  const [ui, setUi] = useState<Ui>(REST_UI);
  const shown = useRef<Ui>(REST_UI);

  useFrame(({ clock }) => {
    const g = root.current;
    const b = body.current;
    if (!g || !b) return;
    const agent = still ? undefined : life.agents.get(person.id);

    // Rare changes go through React: the emoji bubble, vanishing, the hover label.
    const next: Ui = agent
      ? { emote: agent.emote, emoteKey: agent.emoteKey, hidden: agent.fade < 0.05, label: agent.label }
      : REST_UI;
    const prev = shown.current;
    if (prev.emote !== next.emote || prev.emoteKey !== next.emoteKey || prev.hidden !== next.hidden || prev.label !== next.label) {
      shown.current = next;
      setUi(next);
    }

    if (!agent) {
      // Reduced motion (or not added yet): stand still at their spot in the living room.
      g.position.set(...home);
      g.rotation.y = restYaw(seed);
      g.scale.setScalar(1);
      g.visible = true;
      b.position.y = 0;
      b.rotation.set(0, 0, 0);
      for (const prop of PROPS) if (held.current[prop]) held.current[prop]!.visible = false;
      return;
    }

    const doing = agent.phase === "do";
    g.position.set(agent.x + agent.ox, 0, agent.z + agent.oz);
    // Stepping through the bedroom door as they fade.
    if (doing && agent.pose === "enter") g.position.z -= (1 - agent.fade) * 0.45;
    g.scale.setScalar(Math.max(0.001, agent.fade));
    g.visible = agent.fade > 0.02;

    // Sitting sinks the body into the seat; walking bobs and waddles; standing breathes.
    let y = agent.sit * (agent.seatY - 0.3);
    y += Math.abs(Math.sin(agent.stride)) * 0.07 * agent.moving;
    y += Math.sin(clock.elapsedTime * 2 + seed) * 0.02 * (1 - agent.moving);
    const hop = (life.time - agent.hopAt) / 0.55;
    if (hop > 0 && hop < 1) y += Math.sin(hop * Math.PI) * 0.45;
    let yaw = agent.yaw;
    let roll = Math.sin(agent.stride) * 0.09 * agent.moving;
    if (doing && agent.pose === "dance") {
      y += Math.abs(Math.sin(agent.doTime * 5)) * 0.2;
      yaw += Math.sin(agent.doTime * 2.5) * 0.9;
    }
    if (doing && agent.pose === "scrub") roll += Math.sin(agent.doTime * 9) * 0.05;
    g.rotation.y = yaw;
    b.position.y = y;
    b.rotation.set(agent.lean * 0.35, 0, roll);

    // The fridge hands over a sandwich just before they step back.
    const holding = agent.prop ?? agent.carry ??
      (doing && agent.pose === "reach" && agent.doTime > agent.doTotal * 0.6 ? "snack" : null);
    for (const prop of PROPS) if (held.current[prop]) held.current[prop]!.visible = prop === holding;
  });

  const colour = nameColour(person.name);
  const skin = SKIN_TONES[hashOf(person.name) % SKIN_TONES.length];

  return (
    <group ref={root}>
      <Hotspot
        room="house"
        at={ORIGIN}
        onSelect={onSelect}
        tagHeight={1.8}
        label={<><b>{person.name}</b>{ui.label && <span className="flat-tag-sub">{ui.label}</span>}</>}
      >
        <group ref={body}>
          <mesh position={[0, 0.36, 0]} castShadow>
            <cylinderGeometry args={[0.17, 0.26, 0.72, 6]} />
            <Mat color={colour} />
          </mesh>
          <mesh position={[0, 0.93, 0]} castShadow>
            <icosahedronGeometry args={[0.21, 0]} />
            <Mat color={skin} />
          </mesh>
          {/* Eyes and a hat-like tuft of hair in a darker shade. */}
          <Block size={[0.04, 0.05, 0.02]} at={[-0.07, 0.94, 0.18]} color="#1c1c1c" shadow={false} />
          <Block size={[0.04, 0.05, 0.02]} at={[0.07, 0.94, 0.18]} color="#1c1c1c" shadow={false} />
          <mesh position={[0, 1.1, -0.02]} castShadow>
            <coneGeometry args={[0.17, 0.16, 5]} />
            <Mat color={HAIR[seed % HAIR.length]} />
          </mesh>
          <HeldThings refs={held} />
          {!ui.hidden && <Tag position={[0, 1.35, 0]} className="flat-initial">{initial(person.name)}</Tag>}
          {ui.emote && !ui.hidden && (
            <Overlay position={EMOTE_AT} className="flat-emote">
              <span key={ui.emoteKey} className="flat-emote-text" aria-hidden="true">{ui.emote}</span>
            </Overlay>
          )}
        </group>
      </Hotspot>
    </group>
  );
}

/** What each housemate cares about right now: their open chores, bills, the league. */
function useFacts(roommates: Roommate[], chores: SceneChore[], expenses: Expense[]): Map<string, PersonFacts> {
  return useMemo(() => {
    const balances = computeBalances(expenses);
    const star = starOfTheWeek(computeLeague(roommates, chores));
    return new Map(roommates.map((person) => {
      const facts: PersonFacts = { chores: {}, balance: balances.get(person.id) ?? 0, star: star?.person.id === person.id };
      for (const chore of chores) {
        if (chore.assigneeId !== person.id || chore.isComplete) continue;
        const zone = messZone(chore.title);
        const known = facts.chores[zone];
        facts.chores[zone] = { title: known?.title ?? chore.title, overdue: (known?.overdue ?? false) || chore.isOverdue };
      }
      return [person.id, facts];
    }));
  }, [roommates, chores, expenses]);
}

export interface Cheer {
  key: number;
  /** Housemates who just finished a chore. */
  ids: string[];
}

export function Housemates({
  roommates, chores, expenses, sofa, chat, hopKey, cheers, still, onSelect,
}: {
  roommates: Roommate[];
  chores: SceneChore[];
  expenses: Expense[];
  sofa: Decor["sofa"];
  chat: ChatActivity;
  hopKey: number;
  cheers: Cheer;
  still: boolean;
  onSelect: (room: RoomId) => void;
}) {
  const [life] = useState(createLife);
  const people = roommates.slice(0, AVATAR_SPOTS.length);
  const facts = useFacts(roommates, chores, expenses);
  const factsRef = useRef(facts);

  useEffect(() => {
    factsRef.current = facts;
  }, [facts]);

  const peopleKey = people.map((person) => person.id).join(",");
  useEffect(() => {
    syncAgents(life, people.map((person, index) => {
      const [x, , z] = AVATAR_SPOTS[index];
      return { id: person.id, home: [x, z], yaw: restYaw(hashOf(person.id) % 100) };
    }));
    // Bedroom doors follow `BedroomDoors`: one per housemate, the last says "+N more" if they don't fit.
    const owners = roommates.length > MAX_BEDROOM_DOORS ? roommates.slice(0, MAX_BEDROOM_DOORS - 1) : roommates;
    setSpots(life, buildSpots(sofa, owners.map((person) => person.id)));
    // `people` changes identity every render; its ids are what matter.
  }, [life, peopleKey, sofa, roommates]);

  // Someone posted in the house chat: their avatar gets their phone out.
  const lastChat = useRef<{ ready: boolean; id: string | null }>({ ready: chat.ready, id: chat.latest?.id ?? null });
  useEffect(() => {
    const latest = chat.latest;
    const before = lastChat.current;
    lastChat.current = { ready: chat.ready, id: latest?.id ?? null };
    if (!before.ready || !chat.ready || !latest || latest.id === before.id) return;
    const sender = roommates.find((person) => sameName(person.name, latest.username));
    if (sender) chatPing(life, sender.id, factsRef.current.get(sender.id) ?? { chores: {}, balance: 0, star: false });
  }, [chat.ready, chat.latest, roommates, life]);

  useEffect(() => {
    for (const id of cheers.ids) cheer(life, id);
  }, [cheers, life]);

  const firstHop = useRef(hopKey);
  useEffect(() => {
    if (hopKey !== firstHop.current) hopAll(life);
  }, [hopKey, life]);

  useFrame((_, delta) => {
    if (!still) stepLife(life, delta, factsRef.current);
  });

  return (
    <>
      {people.map((person, index) => (
        <Housemate key={person.id} person={person} life={life} home={AVATAR_SPOTS[index]} still={still} onSelect={onSelect} />
      ))}
    </>
  );
}
