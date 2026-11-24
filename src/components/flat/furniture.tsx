// The flat itself: floors, walls, windows and the furniture that does not show any data.
// Pieces the house can swap in the decor picker take their style as a prop.
// Everything is built from a handful of flat-shaded primitives (no model files), so the
// low-poly look comes from low segment counts and `flatShading`.
import type { ReactNode } from "react";
import type { Decor } from "../../hooks/useHouseholdData";
import type { ScenePalette } from "./palette";
import type { Vec3 } from "./rooms";

interface MatProps {
  color: string;
  /** Emissive colour (defaults to `color`) and how strongly it glows. */
  emissive?: string;
  glow?: number;
  transparent?: boolean;
  opacity?: number;
}

export function Mat({ color, emissive, glow = 0, transparent, opacity }: MatProps) {
  return (
    <meshStandardMaterial
      color={color}
      flatShading
      roughness={0.85}
      metalness={0.02}
      emissive={emissive ?? color}
      emissiveIntensity={glow}
      transparent={transparent}
      opacity={opacity}
    />
  );
}

interface BlockProps extends MatProps {
  size: Vec3;
  /** Bottom-centre of the box (so things sit on the floor at y = 0). */
  at: Vec3;
  rotation?: Vec3;
  shadow?: boolean;
  children?: ReactNode;
}

/** A box positioned by its bottom-centre. */
export function Block({ size, at, rotation, shadow = true, children, ...material }: BlockProps) {
  return (
    <mesh
      position={[at[0], at[1] + size[1] / 2, at[2]]}
      rotation={rotation}
      castShadow={shadow}
      receiveShadow
    >
      <boxGeometry args={size} />
      <Mat {...material} />
      {children}
    </mesh>
  );
}

interface CylProps extends MatProps {
  /** [top radius, bottom radius, height, sides] */
  args: [number, number, number, number];
  at: Vec3;
  rotation?: Vec3;
}

/** A low-sided cylinder positioned by its bottom-centre. */
export function Cyl({ args, at, rotation, ...material }: CylProps) {
  return (
    <mesh position={[at[0], at[1] + args[2] / 2, at[2]]} rotation={rotation} castShadow receiveShadow>
      <cylinderGeometry args={args} />
      <Mat {...material} />
    </mesh>
  );
}

const WALL_HEIGHT = 2.4;
const PARTITION_HEIGHT = 1.05;
const EDGE_HEIGHT = 0.32;
const T = 0.18; // wall thickness

/** Floors, walls, windows and the front porch. */
export function FlatShell({ p }: { p: ScenePalette }) {
  const windowGlow = p.night ? 0.55 : 0.35;
  return (
    <group>
      {/* Base slab under the whole flat, and the porch in front of the door. */}
      <Block size={[14.6, 0.35, 10.6]} at={[0, -0.35, 0]} color={p.base} shadow={false} />
      <Block size={[4.2, 0.25, 1.4]} at={[5.2, -0.25, 5.95]} color={p.base} shadow={false} />

      {/* Floors, one colour per room. */}
      <Block size={[6, 0.04, 4]} at={[-4, 0, -3]} color={p.floorKitchen} shadow={false} />
      <Block size={[4, 0.04, 4]} at={[1, 0, -3]} color={p.floorBath} shadow={false} />
      <Block size={[4, 0.04, 4]} at={[5, 0, -3]} color={p.floorBedroom} shadow={false} />
      <Block size={[8, 0.04, 6]} at={[-3, 0, 2]} color={p.floorLiving} shadow={false} />
      <Block size={[6, 0.04, 6]} at={[4, 0, 2]} color={p.floorHall} shadow={false} />
      {/* Kitchen floor tiles: a checker of slightly darker squares. */}
      {Array.from({ length: 24 }, (_, i) => {
        const col = i % 6;
        const row = Math.floor(i / 6);
        if ((col + row) % 2) return null;
        return (
          <Block
            key={i}
            size={[0.98, 0.045, 0.98]}
            at={[-6.5 + col, 0, -4.5 + row]}
            color={p.wallCap}
            shadow={false}
          />
        );
      })}

      {/* Tall outer walls at the back and left (the camera looks from the front-right). */}
      <Block size={[14.2 + T, WALL_HEIGHT, T]} at={[0, 0, -5 - T / 2]} color={p.wall} />
      <Block size={[T, WALL_HEIGHT, 10.2]} at={[-7 - T / 2, 0, 0]} color={p.wall} />
      {/* Wall caps: a darker top edge, typical of cut-away dioramas. */}
      <Block size={[14.2 + T, 0.06, T + 0.02]} at={[0, WALL_HEIGHT, -5 - T / 2]} color={p.wallCap} shadow={false} />
      <Block size={[T + 0.02, 0.06, 10.2]} at={[-7 - T / 2, WALL_HEIGHT, 0]} color={p.wallCap} shadow={false} />

      {/* Windows: kitchen (over the sink), bathroom, living room. */}
      <Block size={[1.5, 0.8, 0.06]} at={[-3.4, 1.35, -4.98]} color={p.windowGlass} glow={windowGlow} shadow={false} />
      <Block size={[0.9, 0.6, 0.06]} at={[0.2, 1.5, -4.98]} color={p.windowGlass} glow={windowGlow} shadow={false} />
      <Block size={[0.06, 1.1, 1.5]} at={[-6.98, 1.0, 4.0]} color={p.windowGlass} glow={windowGlow} shadow={false} />
      <WindowFrame at={[-3.4, 1.35, -4.95]} width={1.5} height={0.8} p={p} />
      <WindowFrame at={[0.2, 1.5, -4.95]} width={0.9} height={0.6} p={p} />
      <WindowFrame at={[-6.95, 1.0, 4.0]} width={1.5} height={1.1} p={p} side />

      {/* Half-height partitions between rooms, with gaps for doorways. */}
      <Block size={[T, PARTITION_HEIGHT, 4]} at={[-1, 0, -3]} color={p.wall} />
      <Block size={[T, PARTITION_HEIGHT, 4]} at={[3, 0, -3]} color={p.wall} />
      <Block size={[1.2, PARTITION_HEIGHT, T]} at={[-0.4, 0, -1]} color={p.wall} />
      <Block size={[1.6, PARTITION_HEIGHT, T]} at={[2.2, 0, -1]} color={p.wall} />
      <Block size={[1, PARTITION_HEIGHT, T]} at={[3.5, 0, -1]} color={p.wall} />
      <Block size={[1, PARTITION_HEIGHT, T]} at={[6.5, 0, -1]} color={p.wall} />
      <Block size={[T, PARTITION_HEIGHT, 1.6]} at={[1, 0, -0.2]} color={p.wall} />
      <Block size={[T, PARTITION_HEIGHT, 1.6]} at={[1, 0, 4.2]} color={p.wall} />
      {/* A low counter-height divider between the kitchen and the living room. */}
      <Block size={[1.6, 0.5, T]} at={[-6.2, 0, -1]} color={p.wall} />

      {/* Low front edges so the rooms read as rooms without hiding anything. */}
      <Block size={[11 + T, EDGE_HEIGHT, T]} at={[-1.55, 0, 5 + T / 2]} color={p.wall} />
      <Block size={[2.1, EDGE_HEIGHT, T]} at={[6.15, 0, 5 + T / 2]} color={p.wall} />
      <Block size={[T, EDGE_HEIGHT, 10.2 + T]} at={[7 + T / 2, 0, 0]} color={p.wall} />
    </group>
  );
}

function WindowFrame({ at, width, height, p, side = false }: { at: Vec3; width: number; height: number; p: ScenePalette; side?: boolean }) {
  // Two bars: a sill under the glass and a cross bar through the middle.
  const sill: Vec3 = side ? [0.16, 0.06, width + 0.2] : [width + 0.2, 0.06, 0.16];
  const bar: Vec3 = side ? [0.08, height, 0.05] : [0.05, height, 0.08];
  return (
    <group>
      <Block size={sill} at={[at[0], at[1] - 0.06, at[2]]} color={p.white} shadow={false} />
      <Block size={bar} at={at} color={p.white} shadow={false} />
    </group>
  );
}

const KITCHEN_UNITS: Record<Decor["kitchen"], (p: ScenePalette) => { units: string; top: string }> = {
  white: (p) => ({ units: p.white, top: p.woodDark }),
  wood: (p) => ({ units: p.wood, top: p.white }),
  mint: (p) => ({ units: p.night ? "#4f7a68" : "#a8d8c2", top: p.woodDark }),
};

/** Kitchen counter, sink, hob, cupboards and a bin. */
export function Kitchen({ p, style }: { p: ScenePalette; style: Decor["kitchen"] }) {
  const { units, top } = KITCHEN_UNITS[style](p);
  return (
    <group>
      <Block size={[4.9, 0.9, 0.7]} at={[-4.45, 0, -4.62]} color={units} />
      <Block size={[5, 0.08, 0.78]} at={[-4.45, 0.9, -4.6]} color={top} />
      {/* Sink under the window, with a tap. */}
      <Block size={[0.9, 0.04, 0.5]} at={[-3.4, 0.96, -4.6]} color={p.metal} />
      <Cyl args={[0.03, 0.03, 0.35, 6]} at={[-3.4, 0.98, -4.9]} color={p.metal} />
      <Block size={[0.06, 0.04, 0.22]} at={[-3.4, 1.3, -4.8]} color={p.metal} />
      {/* Hob with four rings and an oven door. */}
      <Block size={[0.9, 0.03, 0.55]} at={[-5.6, 0.98, -4.6]} color={p.dark} />
      {[-0.2, 0.2].flatMap((dx) =>
        [-0.12, 0.12].map((dz) => (
          <Cyl key={`${dx}${dz}`} args={[0.09, 0.09, 0.02, 8]} at={[-5.6 + dx, 1.01, -4.6 + dz]} color={p.metal} />
        )),
      )}
      <Block size={[0.8, 0.55, 0.04]} at={[-5.6, 0.18, -4.25]} color={p.dark} />
      {/* Wall cupboards on the left of the window. */}
      <Block size={[2.2, 0.7, 0.4]} at={[-5.75, 1.6, -4.78]} color={units} />
      <Block size={[0.02, 0.6, 0.02]} at={[-5.75, 1.65, -4.57]} color={p.wallCap} shadow={false} />
      {/* Pedal bin by the counter. */}
      <Cyl args={[0.2, 0.18, 0.55, 7]} at={[-1.6, 0, -4.5]} color={p.metal} />
    </group>
  );
}

/** Bath or walk-in shower, toilet, basin and washing machine. The mirror is a live part. */
export function Bathroom({ p, bath }: { p: ScenePalette; bath: Decor["bath"] }) {
  return (
    <group>
      {bath === "bath" ? (
        <>
          <Block size={[2, 0.6, 0.85]} at={[0.2, 0, -4.52]} color={p.white} />
          <Block size={[1.7, 0.05, 0.6]} at={[0.2, 0.56, -4.52]} color={p.floorBath} glow={0.15} shadow={false} />
        </>
      ) : (
        <>
          {/* Shower tray, two glass screens and a rail with the head on top. */}
          <Block size={[1.2, 0.08, 1.1]} at={[-0.2, 0, -4.4]} color={p.white} />
          <Block size={[1.0, 0.02, 0.9]} at={[-0.2, 0.08, -4.4]} color={p.floorBath} glow={0.15} shadow={false} />
          <Block size={[1.2, 1.75, 0.04]} at={[-0.2, 0.08, -3.85]} color={p.windowGlass} transparent opacity={0.3} shadow={false} />
          <Block size={[0.04, 1.75, 1.1]} at={[0.4, 0.08, -4.4]} color={p.windowGlass} transparent opacity={0.3} shadow={false} />
          <Cyl args={[0.025, 0.025, 1.9, 6]} at={[-0.5, 0, -4.9]} color={p.metal} />
          <Block size={[0.26, 0.04, 0.26]} at={[-0.5, 1.85, -4.75]} color={p.metal} />
        </>
      )}
      {/* Toilet: bowl, seat and cistern. */}
      <Cyl args={[0.24, 0.18, 0.4, 7]} at={[2.4, 0, -4.35]} color={p.white} />
      <Cyl args={[0.26, 0.26, 0.05, 7]} at={[2.4, 0.4, -4.35]} color={p.white} />
      <Block size={[0.5, 0.45, 0.2]} at={[2.4, 0.4, -4.82]} color={p.white} />
      {/* Basin on a pedestal against the back wall, under the mirror (a live part). */}
      <Cyl args={[0.08, 0.1, 0.75, 6]} at={[1.7, 0, -4.72]} color={p.white} />
      <Block size={[0.55, 0.12, 0.42]} at={[1.7, 0.75, -4.72]} color={p.white} />
      {/* Washing machine with a round door facing the camera. */}
      <Block size={[0.75, 0.85, 0.75]} at={[-0.45, 0, -1.65]} color={p.white} />
      <Cyl args={[0.22, 0.22, 0.04, 10]} at={[-0.45, 0.4, -1.27]} rotation={[Math.PI / 2, 0, 0]} color={p.dark} glow={0.1} />
      {/* Bath mat, in front of the bath or the shower. */}
      <Block size={[0.9, 0.02, 0.5]} at={[bath === "bath" ? 0.4 : -0.2, 0.04, -3.5]} color={p.red} shadow={false} />
    </group>
  );
}

function Rug({ p, style }: { p: ScenePalette; style: Decor["rug"] }) {
  switch (style) {
    case "round":
      return (
        <mesh position={[-4.7, 0.055, 2]} receiveShadow>
          <cylinderGeometry args={[1.5, 1.5, 0.03, 18]} />
          <Mat color={p.rug} />
        </mesh>
      );
    case "striped":
      return (
        <group>
          <Block size={[3.4, 0.03, 3]} at={[-4.7, 0.04, 2]} color={p.rug} shadow={false} />
          {[-1.05, -0.35, 0.35, 1.05].map((dz) => (
            <Block key={dz} size={[3.4, 0.032, 0.28]} at={[-4.7, 0.041, 2 + dz]} color={p.wallCap} shadow={false} />
          ))}
        </group>
      );
    case "none":
      return null;
    default:
      return <Block size={[3.4, 0.03, 3]} at={[-4.7, 0.04, 2]} color={p.rug} shadow={false} />;
  }
}

function Plant({ p, style }: { p: ScenePalette; style: Decor["plant"] }) {
  if (style === "cactus") {
    return (
      <group position={[0.3, 0, 4.4]}>
        <Cyl args={[0.22, 0.16, 0.35, 6]} at={[0, 0, 0]} color={p.red} />
        <Cyl args={[0.14, 0.16, 0.9, 6]} at={[0, 0.35, 0]} color={p.plant} />
        {/* Two arms, each a short stub out and a short stalk up. */}
        <Block size={[0.22, 0.1, 0.1]} at={[0.2, 0.7, 0]} color={p.plant} />
        <Cyl args={[0.06, 0.06, 0.3, 6]} at={[0.28, 0.7, 0]} color={p.plant} />
        <Block size={[0.2, 0.09, 0.09]} at={[-0.18, 0.9, 0]} color={p.plant} />
        <Cyl args={[0.05, 0.05, 0.25, 6]} at={[-0.26, 0.9, 0]} color={p.plant} />
        <mesh position={[0, 1.28, 0]}>
          <icosahedronGeometry args={[0.07, 0]} />
          <Mat color="#f4a6b8" glow={0.1} />
        </mesh>
      </group>
    );
  }
  if (style === "palm") {
    return (
      <group position={[0.3, 0, 4.4]}>
        <Cyl args={[0.24, 0.2, 0.5, 6]} at={[0, 0, 0]} color={p.white} />
        <Cyl args={[0.05, 0.07, 1.25, 5]} at={[0, 0.5, 0]} color={p.woodDark} />
        {/* Six drooping fronds around the top of the trunk. */}
        {Array.from({ length: 6 }, (_, i) => (
          <group key={i} position={[0, 1.72, 0]} rotation={[0, (i * Math.PI) / 3, 0]}>
            <Block size={[0.85, 0.03, 0.2]} at={[0.38, -0.12, 0]} rotation={[0, 0, -0.4]} color={p.plant} />
          </group>
        ))}
      </group>
    );
  }
  return (
    <group>
      <Cyl args={[0.25, 0.18, 0.45, 6]} at={[0.3, 0, 4.4]} color={p.red} />
      <mesh position={[0.3, 0.95, 4.4]} castShadow>
        <icosahedronGeometry args={[0.45, 0]} />
        <Mat color={p.plant} />
      </mesh>
      <mesh position={[0.15, 1.3, 4.5]} castShadow>
        <icosahedronGeometry args={[0.28, 0]} />
        <Mat color={p.plant} />
      </mesh>
    </group>
  );
}

const FAIRY_COLOURS = ["#ffd58a", "#ffb37a", "#fff1c2"];

/** The living room's light. At night the scene adds a warm point light in this corner. */
function Lamp({ p, style }: { p: ScenePalette; style: Decor["lamp"] }) {
  const shadeColour = p.night ? "#ffd58a" : p.white;
  const shadeGlow = p.night ? 0.9 : 0;
  if (style === "arc") {
    return (
      <group>
        <Block size={[0.4, 0.06, 0.4]} at={[-6.4, 0, 4.55]} color={p.metal} />
        <Cyl args={[0.03, 0.03, 1.85, 6]} at={[-6.4, 0, 4.55]} color={p.metal} />
        {/* Arm reaching towards the middle of the room (rotating +x towards -z). */}
        <group position={[-6.4, 1.85, 4.55]} rotation={[0, Math.PI / 4, 0]}>
          <Block size={[1.15, 0.04, 0.04]} at={[0.57, -0.02, 0]} color={p.metal} />
          <Cyl args={[0.1, 0.28, 0.26, 8]} at={[1.12, -0.3, 0]} color={shadeColour} glow={shadeGlow} />
        </group>
      </group>
    );
  }
  if (style === "fairy") {
    // A string of bulbs along the left wall, sagging between hooks.
    return (
      <group>
        {Array.from({ length: 16 }, (_, i) => {
          const sag = Math.abs(Math.sin((i / 15) * Math.PI * 3)) * 0.16;
          return (
            <mesh key={i} position={[-6.88, 2.12 - sag, -0.6 + i * 0.35]}>
              <icosahedronGeometry args={[0.05, 0]} />
              <Mat color={FAIRY_COLOURS[i % FAIRY_COLOURS.length]} glow={p.night ? 1.3 : 0.35} />
            </mesh>
          );
        })}
      </group>
    );
  }
  return (
    <group>
      <Cyl args={[0.25, 0.25, 0.04, 8]} at={[-6.4, 0, 4.55]} color={p.dark} />
      <Cyl args={[0.03, 0.03, 1.5, 6]} at={[-6.4, 0, 4.55]} color={p.dark} />
      <Cyl args={[0.2, 0.38, 0.4, 8]} at={[-6.4, 1.45, 4.55]} color={shadeColour} glow={shadeGlow} />
    </group>
  );
}

/** Rug, TV stand, plant, lamp and side table. The sofa, TV screen and phone show data (see live parts). */
export function LivingRoom({ p, decor }: { p: ScenePalette; decor: Decor }) {
  return (
    <group>
      <Rug p={p} style={decor.rug} />
      <Block size={[0.5, 0.5, 1.9]} at={[-6.65, 0, 2]} color={p.woodDark} />
      <Plant p={p} style={decor.plant} />
      <Lamp p={p} style={decor.lamp} />
      {/* Side table with a mug by the sofa (unless the hamster's cage is on it: see pets.tsx). */}
      <Block size={[0.5, 0.5, 0.5]} at={[-2.9, 0, 3.75]} color={p.wood} />
      {decor.pet !== "hamster" && <Cyl args={[0.07, 0.07, 0.14, 7]} at={[-2.9, 0.5, 3.75]} color={p.red} />}
    </group>
  );
}

/** Coat hooks and a shoe rack by the front door. */
export function Hallway({ p }: { p: ScenePalette }) {
  return (
    <group>
      <Block size={[1, 0.35, 0.4]} at={[6.4, 0, 4.4]} color={p.wood} />
      {[6.15, 6.4, 6.65].map((x, i) => (
        <Block key={x} size={[0.2, 0.08, 0.32]} at={[x, 0.35, 4.4]} color={[p.red, p.dark, p.rug][i]} />
      ))}
      <Block size={[1.4, 0.04, 0.9]} at={[2.8, 0.04, 2.2]} color={p.red} glow={0.05} shadow={false} />
    </group>
  );
}
