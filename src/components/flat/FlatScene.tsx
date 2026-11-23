// The 3D flat (loaded lazily: three.js is large, and the start screen does not need it).
// A fixed isometric camera looks at a cut-away flat; clicking things opens their feature.
import { useEffect, useLayoutEffect, useRef, useState, type ComponentRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { MOUSE, TOUCH, Vector3, type OrthographicCamera } from "three";
import type { ChatActivity } from "../HomeChat";
import type { Expense, Note, Roommate, SyncStatus } from "../../hooks/useHouseholdData";
import { playSound } from "../../lib/sfx";
import { Bathroom, FlatShell, Hallway, Kitchen, LivingRoom } from "./furniture";
import {
  Avatars, BedroomDoors, BillsTable, Burst, ChatCorner, FrontDoor, Fridge, Mess, Television,
  WheelieBin, Whiteboard, layoutMess, type SceneChore,
} from "./liveParts";
import { readPalette, type ScenePalette } from "./palette";
import { ROOMS, type RoomId, type Vec3 } from "./rooms";

export interface FlatSceneProps {
  roommates: Roommate[];
  chores: SceneChore[];
  expenses: Expense[];
  notes: Note[];
  householdName: string;
  status: SyncStatus;
  chat: ChatActivity;
  recentMessage: ChatActivity["latest"];
  darkMode: boolean;
  /** The open room (camera zooms to it), or null for the whole flat. */
  focus: RoomId | null;
  /** A side sheet covers the right of the screen: keep the room in the visible part. */
  sheetWidth: number;
  /** Bumped by the "recentre" button. */
  recentreKey: number;
  still: boolean;
  onSelect: (room: RoomId) => void;
}

// Camera direction: from the front-right corner, looking down at the flat.
const CAMERA_DIRECTION = new Vector3(1, 1.05, 1).normalize();
const CAMERA_DISTANCE = 40;
const SCREEN_RIGHT = new Vector3(1, 0, -1).normalize();
// Slightly in front of the middle, so the flat sits above the room buttons.
const OVERVIEW_TARGET = new Vector3(0.9, 0.3, 1.6);

/** Zoom (pixels per world unit) that fits the whole flat in the canvas. */
function fitZoom(width: number, height: number): number {
  // The flat's isometric outline is about 17.5 units wide and 12.5 tall, including walls;
  // leave room for the score card and the room buttons.
  // Phones in portrait fit the width more tightly (the corners can go off-screen a little).
  const widthFit = width < 600 ? width / 16.5 : width / 19;
  return Math.max(8, Math.min(widthFit, height / 14.5));
}

function CameraRig({ focus, sheetWidth, recentreKey, still }: Pick<FlatSceneProps, "focus" | "sheetWidth" | "recentreKey" | "still">) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const camera = useThree((state) => state.camera) as OrthographicCamera;
  const size = useThree((state) => state.size);
  const goal = useRef({ target: OVERVIEW_TARGET.clone(), zoom: fitZoom(size.width, size.height), moving: true });
  const baseZoom = fitZoom(size.width, size.height);

  useEffect(() => {
    const room = focus ? ROOMS[focus] : null;
    // On small screens the sheet covers the bottom instead; zoom a little less there.
    const zoom = room ? baseZoom * room.zoom * (sheetWidth ? 1 : 0.8) : baseZoom;
    const target = room ? new Vector3(...room.focus) : OVERVIEW_TARGET.clone();
    // Shift the camera right so the room sits in the middle of the part the sheet leaves free.
    if (room && sheetWidth) target.addScaledVector(SCREEN_RIGHT, sheetWidth / 2 / zoom);
    // On phones the bottom sheet covers the lower half: shift the room up into view.
    if (room && !sheetWidth) target.y -= (size.height * 0.3) / zoom;
    goal.current = { target, zoom, moving: true };
  }, [focus, baseZoom, sheetWidth, recentreKey, size.height]);

  useFrame((_, delta) => {
    const c = controls.current;
    const g = goal.current;
    if (!c || !g.moving) return;
    const k = still ? 1 : 1 - Math.exp(-delta * 5);
    c.target.lerp(g.target, k);
    camera.zoom += (g.zoom - camera.zoom) * k;
    camera.position.copy(c.target).addScaledVector(CAMERA_DIRECTION, CAMERA_DISTANCE);
    camera.updateProjectionMatrix();
    c.update();
    if (c.target.distanceTo(g.target) < 0.005 && Math.abs(camera.zoom - g.zoom) < 0.05) g.moving = false;
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableRotate={false}
      enableDamping={false}
      screenSpacePanning
      zoomToCursor
      minZoom={baseZoom * 0.7}
      maxZoom={baseZoom * 4}
      mouseButtons={{ LEFT: MOUSE.PAN, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN }}
      touches={{ ONE: TOUCH.PAN, TWO: TOUCH.DOLLY_PAN }}
      // The user is panning or zooming: stop flying the camera.
      onStart={() => {
        goal.current.moving = false;
      }}
    />
  );
}

function Lights({ p }: { p: ScenePalette }) {
  if (!p.night) {
    return (
      <>
        <hemisphereLight args={[p.sky, p.ground, 1.5]} />
        <directionalLight
          position={[9, 16, 7]}
          intensity={2.4}
          color="#fff4e0"
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-11}
          shadow-camera-right={11}
          shadow-camera-top={11}
          shadow-camera-bottom={-11}
          shadow-bias={-0.0005}
        />
      </>
    );
  }
  // Night: a dim blue moon, and warm lamps on inside.
  return (
    <>
      <hemisphereLight args={[p.sky, p.ground, 0.55]} />
      <directionalLight
        position={[-5, 14, 9]}
        intensity={0.5}
        color="#9fb2ff"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-11}
        shadow-camera-right={11}
        shadow-camera-top={11}
        shadow-camera-bottom={-11}
        shadow-bias={-0.0005}
      />
      <ambientLight intensity={0.25} color="#ffe2b8" />
      <pointLight position={[-6.4, 1.7, 4.4]} intensity={9} distance={9} decay={1.4} color="#ffc777" />
      <pointLight position={[-3.6, 2.3, -2.6]} intensity={8} distance={8} decay={1.4} color="#ffd9a0" />
      <pointLight position={[3.6, 2.3, 2]} intensity={6} distance={8} decay={1.4} color="#ffd9a0" />
      <pointLight position={[1, 2.1, -3]} intensity={4} distance={6} decay={1.4} color="#e8f0ff" />
      <pointLight position={[5, 2.1, -3]} intensity={4} distance={6} decay={1.4} color="#ffd0a0" />
    </>
  );
}

interface BurstItem {
  id: number;
  at: Vec3;
}

function Flat(props: FlatSceneProps & { p: ScenePalette }) {
  const { p, roommates, chores, still, onSelect } = props;

  // Spot of each open chore's mess, remembered so a just-finished chore can sparkle there.
  const messSpots = useRef(new Map<string, Vec3>());
  const previousDone = useRef<Map<string, boolean> | null>(null);
  const previousAssignees = useRef<string | null>(null);
  const [bursts, setBursts] = useState<BurstItem[]>([]);
  const [shuffleKey, setShuffleKey] = useState(0);
  const nextBurstId = useRef(0);

  useEffect(() => {
    // Sparkle where a chore's mess was when it gets ticked off (here or by a housemate).
    const done = new Map(chores.map((chore) => [chore.id, chore.isComplete]));
    if (previousDone.current) {
      const fresh: BurstItem[] = [];
      for (const chore of chores) {
        const spot = messSpots.current.get(chore.id);
        if (chore.isComplete && previousDone.current.get(chore.id) === false && spot) {
          fresh.push({ id: nextBurstId.current++, at: spot });
        }
      }
      if (fresh.length > 0) {
        playSound("sparkle");
        if (!still) setBursts((current) => [...current, ...fresh]);
      }
    }
    previousDone.current = done;
    messSpots.current = new Map(layoutMess(chores).map((item) => [item.chore.id, item.at]));

    // A rotation changes who has which chore without adding or removing chores: everyone hops.
    const idsKey = chores.map((chore) => chore.id).join(",");
    const assignees = `${idsKey}|${chores.map((chore) => chore.assigneeId ?? "").join(",")}`;
    if (previousAssignees.current !== null && previousAssignees.current !== assignees &&
        previousAssignees.current.startsWith(`${idsKey}|`)) {
      setShuffleKey((key) => key + 1);
      playSound("shuffle");
    }
    previousAssignees.current = assignees;
  }, [chores, still]);

  const done = chores.filter((chore) => chore.isComplete).length;

  return (
    <>
      <Lights p={p} />
      <FlatShell p={p} />
      <Kitchen p={p} />
      <Bathroom p={p} />
      <LivingRoom p={p} />
      <Hallway p={p} />
      <WheelieBin p={p} />

      <Fridge p={p} notes={props.notes} still={still} onSelect={onSelect} />
      <BillsTable p={p} expenses={props.expenses} roommates={roommates} still={still} onSelect={onSelect} />
      <ChatCorner p={p} chat={props.chat} recent={props.recentMessage} still={still} onSelect={onSelect} />
      <Television p={p} done={done} total={chores.length} onSelect={onSelect} />
      <Whiteboard p={p} chores={chores} roommates={roommates} shuffleKey={shuffleKey} still={still} onSelect={onSelect} />
      <FrontDoor p={p} householdName={props.householdName} status={props.status} still={still} onSelect={onSelect} />
      <BedroomDoors p={p} roommates={roommates} onSelect={onSelect} />
      <Avatars roommates={roommates} hopKey={shuffleKey} still={still} onSelect={onSelect} />
      <Mess p={p} chores={chores} roommates={roommates} still={still} onSelect={onSelect} />

      {bursts.map((burst) => (
        <Burst
          key={burst.id}
          at={burst.at}
          colour={p.green}
          onDone={() => setBursts((current) => current.filter((item) => item.id !== burst.id))}
        />
      ))}
    </>
  );
}

function FlatScene(props: FlatSceneProps) {
  // Colours follow the page's CSS variables, which change after the theme class is applied.
  const [palette, setPalette] = useState(() => readPalette(props.darkMode));
  useLayoutEffect(() => setPalette(readPalette(props.darkMode)), [props.darkMode]);

  return (
    <Canvas
      className="flat-canvas"
      orthographic
      shadows
      flat
      dpr={[1, 1.75]}
      camera={{ position: [24, 25, 24], zoom: 20, near: 0.1, far: 200 }}
      gl={{ antialias: true, alpha: true }}
    >
      <CameraRig focus={props.focus} sheetWidth={props.sheetWidth} recentreKey={props.recentreKey} still={props.still} />
      <Flat {...props} p={palette} />
    </Canvas>
  );
}

export default FlatScene;
