// The living room's wall art (a decor slot): hung on the left wall between the kitchen divider
// and the TV, clear of the fairy lights' hooks above. Pictures with words or faces are drawn on
// canvas textures (textures.ts); plain shapes are blocks.
import type { Decor, Roommate } from "../../hooks/useHouseholdData";
import { initial, nameColour } from "../../lib/nameColour";
import { Block } from "./furniture";
import type { ScenePalette } from "./palette";
import { HEADING_FONT, fitText, useCanvasTexture } from "./textures";
import type { Vec3 } from "./rooms";

/** The inside face of the left wall, and the middle of the free stretch of it. */
const WALL_X = -6.97;
const CENTRE_Z = -0.1;
const CENTRE_Y = 1.4;
/** Planes face +z when unrotated; this turns them to face into the room (+x). */
const FACE_ROOM: Vec3 = [0, Math.PI / 2, 0];
const MAX_PHOTOS = 8;

/** A framed abstract print: a few bold shapes in the house colours. */
function Print({ p }: { p: ScenePalette }) {
  // Blocks are centred in x, so each layer sits a little further off the wall than the last.
  return (
    <group>
      <Block size={[0.05, 0.95, 0.78]} at={[WALL_X, CENTRE_Y - 0.475, CENTRE_Z]} color={p.woodDark} />
      <Block size={[0.06, 0.85, 0.68]} at={[WALL_X + 0.005, CENTRE_Y - 0.425, CENTRE_Z]} color={p.white} shadow={false} />
      <Block size={[0.07, 0.36, 0.3]} at={[WALL_X + 0.01, CENTRE_Y - 0.05, CENTRE_Z + 0.13]} color={p.red} shadow={false} />
      <Block size={[0.07, 0.1, 0.5]} at={[WALL_X + 0.01, CENTRE_Y - 0.32, CENTRE_Z]} color={p.rug} shadow={false} />
      <mesh position={[WALL_X + 0.045, CENTRE_Y + 0.08, CENTRE_Z - 0.12]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.13, 0.13, 0.02, 14]} />
        <meshStandardMaterial color="#d9a53a" flatShading />
      </mesh>
    </group>
  );
}

/** A gig poster, taped up unframed. */
function Poster({ p }: { p: ScenePalette }) {
  const texture = useCanvasTexture(256, 384, "poster", (ctx, w, h) => {
    ctx.fillStyle = "#2b1d4a";
    ctx.fillRect(0, 0, w, h);
    // A burst of rays behind the band name.
    ctx.fillStyle = "#3f2a6b";
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(w / 2, h * 0.42);
      ctx.lineTo(w / 2 + Math.cos(a) * 300, h * 0.42 + Math.sin(a) * 300);
      ctx.lineTo(w / 2 + Math.cos(a + 0.22) * 300, h * 0.42 + Math.sin(a + 0.22) * 300);
      ctx.fill();
    }
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffd23f";
    ctx.font = `64px ${HEADING_FONT}`;
    ctx.fillText("THE", w / 2, 120);
    ctx.fillText("FLAT", w / 2, 185);
    ctx.fillText("MATES", w / 2, 250);
    ctx.fillStyle = "#ff6b9a";
    ctx.font = `30px ${HEADING_FONT}`;
    ctx.fillText("LIVE · FRI 9PM", w / 2, 315);
    ctx.fillStyle = "#f4efe6";
    ctx.font = `20px ${HEADING_FONT}`;
    ctx.fillText("THE LIVING ROOM", w / 2, 350);
  });
  return (
    <group>
      <mesh position={[WALL_X + 0.01, CENTRE_Y, CENTRE_Z]} rotation={FACE_ROOM} receiveShadow>
        <planeGeometry args={[0.66, 0.99]} />
        <meshStandardMaterial map={texture} roughness={0.9} />
      </mesh>
      {/* Tape on the corners. */}
      {[[0.45, 0.28], [0.45, -0.28], [-0.45, 0.28], [-0.45, -0.28]].map(([dy, dz]) => (
        <Block key={`${dy}${dz}`} size={[0.02, 0.06, 0.12]} at={[WALL_X + 0.015, CENTRE_Y + dy - 0.03, CENTRE_Z + dz]} color={p.white} shadow={false} />
      ))}
    </group>
  );
}

/** Polaroids of the housemates, one each in their colour with their initial. */
function Photos({ roommates }: { roommates: Roommate[] }) {
  const people = roommates.slice(0, MAX_PHOTOS);
  const key = people.map((person) => person.name).join("|");
  const texture = useCanvasTexture(512, 320, key, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    // Empty house: three blank polaroids waiting for faces.
    const slots = people.length > 0 ? people.map((person) => person.name) : ["", "", ""];
    const perRow = slots.length > 4 ? Math.ceil(slots.length / 2) : slots.length;
    const rows = Math.ceil(slots.length / perRow);
    const cardW = Math.min(110, (w - 20) / perRow - 14);
    const cardH = cardW * 1.2;
    slots.forEach((name, index) => {
      const row = Math.floor(index / perRow);
      const inRow = Math.min(perRow, slots.length - row * perRow);
      const col = index % perRow;
      const cx = w / 2 + (col - (inRow - 1) / 2) * (cardW + 14);
      const cy = h / 2 + (row - (rows - 1) / 2) * (cardH + 12);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(((index * 37) % 9 - 4) * 0.02); // a little wonky, as if stuck up by hand
      ctx.fillStyle = "#fbfaf7";
      ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
      ctx.shadowBlur = 6;
      ctx.fillRect(-cardW / 2, -cardH / 2, cardW, cardH);
      ctx.shadowBlur = 0;
      const photo = cardW - 12;
      ctx.fillStyle = name ? nameColour(name) : "#c9c8c4";
      ctx.fillRect(-photo / 2, -cardH / 2 + 6, photo, photo);
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `${Math.round(photo * 0.6)}px ${HEADING_FONT}`;
      ctx.fillText(name ? initial(name) : "?", 0, -cardH / 2 + 6 + photo / 2);
      ctx.fillStyle = "#3a3a3d";
      ctx.font = `${Math.round(cardW * 0.15)}px ${HEADING_FONT}`;
      ctx.fillText(fitText(ctx, name.toUpperCase(), photo), 0, cardH / 2 - (cardH - photo - 6) / 2 + 1);
      ctx.restore();
    });
  });
  return (
    <mesh position={[WALL_X + 0.01, CENTRE_Y, CENTRE_Z]} rotation={FACE_ROOM}>
      <planeGeometry args={[1.5, 0.94]} />
      <meshStandardMaterial map={texture} transparent roughness={0.9} />
    </mesh>
  );
}

/** A pink neon "home" with a heart, brighter at night (when it also lights the wall). */
function Neon({ p }: { p: ScenePalette }) {
  const texture = useCanvasTexture(512, 256, "neon", (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.font = `italic 120px "Brush Script MT", "Segoe Script", cursive`;
    // Glow first, then the bright tube on top.
    ctx.shadowColor = "#ff4fa3";
    ctx.shadowBlur = 24;
    ctx.strokeStyle = "#ff7cc0";
    ctx.lineWidth = 9;
    ctx.strokeText("home", w / 2 - 30, h / 2 + 6);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#ffe3f2";
    ctx.lineWidth = 3;
    ctx.strokeText("home", w / 2 - 30, h / 2 + 6);
    // A heart after the word.
    ctx.save();
    ctx.translate(w - 85, h / 2 - 10);
    ctx.beginPath();
    ctx.moveTo(0, 22);
    ctx.bezierCurveTo(-40, -6, -18, -36, 0, -14);
    ctx.bezierCurveTo(18, -36, 40, -6, 0, 22);
    ctx.shadowColor = "#ff4fa3";
    ctx.shadowBlur = 20;
    ctx.strokeStyle = "#ff7cc0";
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.restore();
  });
  return (
    <group>
      {/* Clear acrylic backing. */}
      <Block size={[0.02, 0.62, 1.3]} at={[WALL_X, CENTRE_Y - 0.31, CENTRE_Z]} color={p.white} transparent opacity={0.25} shadow={false} />
      <mesh position={[WALL_X + 0.02, CENTRE_Y, CENTRE_Z]} rotation={FACE_ROOM}>
        <planeGeometry args={[1.3, 0.65]} />
        <meshBasicMaterial map={texture} transparent toneMapped={false} />
      </mesh>
      {p.night && <pointLight position={[WALL_X + 0.5, CENTRE_Y, CENTRE_Z]} intensity={2.5} distance={3} decay={1.6} color="#ff6fb5" />}
    </group>
  );
}

export function WallArt({ p, style, roommates }: { p: ScenePalette; style: Decor["art"]; roommates: Roommate[] }) {
  switch (style) {
    case "poster":
      return <Poster p={p} />;
    case "photos":
      return <Photos roommates={roommates} />;
    case "neon":
      return <Neon p={p} />;
    case "none":
      return null;
    default:
      return <Print p={p} />;
  }
}
