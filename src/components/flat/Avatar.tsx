// A housemate's body, drawn from their shared `look` (chosen at their bedroom door). Same peg-person
// shape as before: bottoms 0–0.36, top 0.36–0.72, head centred at 0.93. Facing +z.
// The torso is a six-sided cylinder turned 30° so a flat face points forward, which lets
// pockets, collars and buttons sit flush on it.
import type { Look } from "../../hooks/useHouseholdData";
import { Block, Mat } from "./furniture";
import { BOTTOM_COLOURS, HAIR_COLOURS, SKIN_COLOURS, bodyShape, topColour, trimColour } from "./looks";

const FACE_ON = Math.PI / 6; // turns a 6-sided cylinder so a face (not an edge) points at +z
const FLAT = Math.cos(FACE_ON); // a face's distance from the centre, per unit of radius
const WAIST_Y = 0.36;
const SHOULDER_Y = 0.72;
const HEAD_Y = 0.93;
const EYE_Y = 0.94;
const SHADE = "#000"; // a translucent layer of this darkens the fabric under it (pockets)

/** A six-sided slice of the body between two heights. */
function Slice({ y0, y1, r0, r1, color }: { y0: number; y1: number; r0: number; r1: number; color: string }) {
  return (
    <mesh position={[0, (y0 + y1) / 2, 0]} rotation={[0, FACE_ON, 0]} castShadow>
      <cylinderGeometry args={[r1, r0, y1 - y0, 6]} />
      <Mat color={color} />
    </mesh>
  );
}

/**
 * A flat patch on the front of the top (collar strip, buttons, pocket), tilted to lie on the
 * torso's sloping front face between heights y0 and y1.
 */
function FrontPatch({ y0, y1, width, shape, color, opacity }: {
  y0: number; y1: number; width: number; shape: { shoulders: number; waist: number }; color: string; opacity?: number;
}) {
  const depthAt = (y: number) => {
    const t = (y - WAIST_Y) / (SHOULDER_Y - WAIST_Y);
    return (shape.waist + (shape.shoulders - shape.waist) * t) * FLAT;
  };
  const z0 = depthAt(y0);
  const z1 = depthAt(y1);
  const tilt = Math.atan2(z1 - z0, y1 - y0);
  return (
    <mesh position={[0, (y0 + y1) / 2, (z0 + z1) / 2 + 0.006]} rotation={[tilt, 0, 0]}>
      <boxGeometry args={[width, Math.hypot(y1 - y0, z1 - z0), 0.01]} />
      <Mat color={color} transparent={opacity !== undefined} opacity={opacity} />
    </mesh>
  );
}

function Bottoms({ look, shape, skin }: { look: Look; shape: ReturnType<typeof bodyShape>; skin: string }) {
  const color = BOTTOM_COLOURS[look.bottomColour];
  const { waist, hips } = shape;
  if (look.bottoms === "shorts") {
    return (
      <>
        <Slice y0={0.17} y1={WAIST_Y} r0={hips} r1={waist} color={color} />
        <Slice y0={0} y1={0.17} r0={hips * 0.75} r1={hips * 0.82} color={skin} />
      </>
    );
  }
  if (look.bottoms === "skirt") {
    return (
      <>
        <Slice y0={0.1} y1={WAIST_Y} r0={hips + 0.07} r1={waist} color={color} />
        <Slice y0={0} y1={0.1} r0={hips * 0.6} r1={hips * 0.6} color={skin} />
      </>
    );
  }
  return <Slice y0={0} y1={WAIST_Y} r0={hips} r1={waist} color={color} />;
}

function Top({ look, name, shape }: { look: Look; name: string; shape: ReturnType<typeof bodyShape> }) {
  const color = topColour(look, name);
  const trim = trimColour(look);
  const { waist, shoulders } = shape;
  const radiusAt = (y: number) => waist + (shoulders - waist) * ((y - WAIST_Y) / (SHOULDER_Y - WAIST_Y)) + 0.006;
  return (
    <>
      <Slice y0={WAIST_Y} y1={SHOULDER_Y} r0={waist} r1={shoulders} color={color} />
      {look.top === "hoodie" && (
        <>
          {/* The hood bunched behind the neck, a front pocket and two drawstrings. */}
          <mesh position={[0, 0.74, -0.12]} scale={[1.25, 0.7, 0.85]} castShadow>
            <sphereGeometry args={[0.14, 7, 5]} />
            <Mat color={color} />
          </mesh>
          <FrontPatch y0={0.39} y1={0.5} width={0.22} shape={shape} color={SHADE} opacity={0.18} />
          <group position={[-0.045, 0, 0]}>
            <FrontPatch y0={0.58} y1={0.7} width={0.015} shape={shape} color={trim} />
          </group>
          <group position={[0.045, 0, 0]}>
            <FrontPatch y0={0.58} y1={0.7} width={0.015} shape={shape} color={trim} />
          </group>
        </>
      )}
      {look.top === "shirt" && (
        <>
          <FrontPatch y0={0.66} y1={0.72} width={0.18} shape={shape} color={trim} />
          <FrontPatch y0={0.38} y1={0.66} width={0.028} shape={shape} color={trim} opacity={0.7} />
        </>
      )}
      {/* An open jacket: the T-shirt underneath shows down the middle. */}
      {look.top === "jacket" && <FrontPatch y0={0.37} y1={0.72} width={0.1} shape={shape} color={trim} />}
      {look.top === "stripes" && [0.44, 0.56].map((y) => (
        <Slice
          key={y}
          y0={y}
          y1={y + 0.05}
          r0={radiusAt(y)}
          r1={radiusAt(y + 0.05)}
          color={look.topColour === "white" ? "#2c3a5e" : trim}
        />
      ))}
    </>
  );
}

/** A half-dome of hair over the top of the head (also the base of most styles). */
function Dome({ radius, squash, color, y = 1.0 }: { radius: number; squash: number; color: string; y?: number }) {
  return (
    <mesh position={[0, y, -0.01]} scale={[1, squash, 1]} castShadow>
      <sphereGeometry args={[radius, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2]} />
      <Mat color={color} />
    </mesh>
  );
}

function Hair({ look }: { look: Look }) {
  const color = HAIR_COLOURS[look.hairColour];
  // A hat covers the top: skip the bits that would poke through it.
  const hat = look.extra === "beanie" || look.extra === "cap";
  const back = <Block size={[0.36, 0.14, 0.1]} at={[0, 0.88, -0.15]} color={color} />;
  switch (look.hair) {
    case "bald":
      return null;
    case "buzz":
      return <Dome radius={0.214} squash={0.62} color={color} y={0.99} />;
    case "afro":
      return hat ? <Dome radius={0.225} squash={0.75} color={color} /> : (
        <mesh position={[0, 1.06, -0.1]} castShadow>
          <icosahedronGeometry args={[0.27, 1]} />
          <Mat color={color} />
        </mesh>
      );
    default:
      break;
  }
  return (
    <>
      <Dome radius={0.225} squash={0.75} color={color} />
      {back}
      {look.hair === "quiff" && !hat && (
        <Block size={[0.2, 0.09, 0.15]} at={[0, 1.1, 0.07]} rotation={[-0.45, 0, 0]} color={color} />
      )}
      {look.hair === "curly" && !hat && [0, 1, 2, 3, 4, 5].map((i) => {
        const angle = (i / 6) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.sin(angle) * 0.17, 1.07 + (i % 2) * 0.04, Math.cos(angle) * 0.15 - 0.02]} castShadow>
            <icosahedronGeometry args={[0.075, 0]} />
            <Mat color={color} />
          </mesh>
        );
      })}
      {look.hair === "bob" && <Block size={[0.46, 0.24, 0.24]} at={[0, 0.78, -0.07]} color={color} />}
      {look.hair === "long" && <Block size={[0.44, 0.42, 0.2]} at={[0, 0.6, -0.1]} color={color} />}
      {look.hair === "ponytail" && (
        <>
          <mesh position={[0, 1.0, -0.24]}>
            <sphereGeometry args={[0.07, 6, 4]} />
            <Mat color={color} />
          </mesh>
          <mesh position={[0, 0.83, -0.27]} rotation={[0.2, 0, Math.PI]} castShadow>
            <coneGeometry args={[0.065, 0.28, 5]} />
            <Mat color={color} />
          </mesh>
        </>
      )}
      {look.hair === "bun" && !hat && (
        <mesh position={[0, 1.17, -0.08]} castShadow>
          <icosahedronGeometry args={[0.1, 0]} />
          <Mat color={color} />
        </mesh>
      )}
    </>
  );
}

function Eyes({ look }: { look: Look }) {
  if (look.extra === "shades") {
    return (
      <>
        <Block size={[0.1, 0.06, 0.012]} at={[-0.068, 0.925, 0.195]} color="#111" shadow={false} />
        <Block size={[0.1, 0.06, 0.012]} at={[0.068, 0.925, 0.195]} color="#111" shadow={false} />
        <Block size={[0.05, 0.015, 0.01]} at={[0, 0.965, 0.195]} color="#111" shadow={false} />
      </>
    );
  }
  if (look.extra === "glasses") {
    // Frame, pale lens, then the eye drawn on the lens.
    return (
      <>
        {[-0.07, 0.07].map((x) => (
          <group key={x}>
            <Block size={[0.1, 0.075, 0.01]} at={[x, 0.92, 0.198]} color="#1c1c1c" shadow={false} />
            <Block size={[0.078, 0.055, 0.01]} at={[x, 0.93, 0.203]} color="#d4e9f6" shadow={false} />
            <Block size={[0.035, 0.04, 0.006]} at={[x, 0.937, 0.21]} color="#1c1c1c" shadow={false} />
          </group>
        ))}
        <Block size={[0.04, 0.015, 0.01]} at={[0, 0.965, 0.198]} color="#1c1c1c" shadow={false} />
      </>
    );
  }
  return (
    <>
      <Block size={[0.04, 0.05, 0.02]} at={[-0.07, EYE_Y, 0.18]} color="#1c1c1c" shadow={false} />
      <Block size={[0.04, 0.05, 0.02]} at={[0.07, EYE_Y, 0.18]} color="#1c1c1c" shadow={false} />
    </>
  );
}

function Headwear({ look, name }: { look: Look; name: string }) {
  const color = topColour(look, name);
  if (look.extra === "beanie") {
    return (
      <>
        <Dome radius={0.236} squash={0.85} color={color} y={0.99} />
        <mesh position={[0, 1.0, -0.01]} rotation={[0, FACE_ON, 0]}>
          <cylinderGeometry args={[0.24, 0.24, 0.06, 8]} />
          <Mat color={trimColour(look)} />
        </mesh>
        <mesh position={[0, 1.2, -0.01]}>
          <icosahedronGeometry args={[0.055, 0]} />
          <Mat color={trimColour(look)} />
        </mesh>
      </>
    );
  }
  if (look.extra === "cap") {
    return (
      <>
        <Dome radius={0.233} squash={0.7} color={color} y={0.99} />
        <Block size={[0.24, 0.02, 0.18]} at={[0, 0.99, 0.18]} color={color} />
      </>
    );
  }
  if (look.extra === "headphones") {
    return (
      <>
        {/* torusGeometry's arc runs from +x over the top to -x */}
        <mesh position={[0, HEAD_Y, -0.01]}>
          <torusGeometry args={[0.235, 0.022, 4, 12, Math.PI]} />
          <Mat color="#26272b" />
        </mesh>
        {[-0.225, 0.225].map((x) => (
          <mesh key={x} position={[x, HEAD_Y - 0.02, -0.01]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.065, 0.065, 0.06, 8]} />
            <Mat color="#26272b" />
          </mesh>
        ))}
      </>
    );
  }
  return null;
}

export function Avatar({ look, name }: { look: Look; name: string }) {
  const shape = bodyShape(look.build);
  const skin = SKIN_COLOURS[look.skin];
  return (
    <>
      <Bottoms look={look} shape={shape} skin={skin} />
      <Top look={look} name={name} shape={shape} />
      <mesh position={[0, HEAD_Y, 0]} castShadow>
        <icosahedronGeometry args={[0.21, 0]} />
        <Mat color={skin} />
      </mesh>
      <Eyes look={look} />
      <Hair look={look} />
      <Headwear look={look} name={name} />
    </>
  );
}
