// The bedroom doors' panel: change how a housemate's avatar looks in the 3D flat. Like the decor,
// choices are shared with the whole house. A flat front-view drawing previews the look, since the
// avatar itself may be wandering about (or in their room).
import { useEffect, useRef, useState } from "react";
import {
  LOOK_BUILD_MAX, type Look, type LookListPart, type LookPart, type Roommate,
} from "../hooks/useHouseholdData";
import { initial, nameColour } from "../lib/nameColour";
import {
  BOTTOM_COLOURS, HAIR_COLOURS, LOOK_ORDER, LOOK_PARTS, SKIN_COLOURS, bodyShape, topColour, trimColour,
  type LookPartInfo,
} from "./flat/looks";

const BUILD_SETTLE_MS = 350; // the slider only sends its value once you stop dragging

interface LookPickerProps {
  roommates: Roommate[];
  /** The housemate whose door (or avatar) was clicked. */
  personId: string | null;
  /** The housemate using this device: their own look gets a "make it you" welcome. */
  meId?: string | null;
  onChange: <P extends LookPart>(id: string, part: P, value: Look[P]) => void;
}

// ---------- Preview: a front view in SVG, using the same proportions as Avatar.tsx ----------

const PX = 100; // SVG units per world unit
const GROUND = 150;
const y = (world: number) => GROUND - world * PX;

/** A trapezoid between two heights, half-widths r0 (bottom) and r1 (top). */
function band(y0: number, y1: number, r0: number, r1: number): string {
  return `${-r0 * PX},${y(y0)} ${r0 * PX},${y(y0)} ${r1 * PX},${y(y1)} ${-r1 * PX},${y(y1)}`;
}

function HairBack({ look, colour }: { look: Look; colour: string }) {
  // Hair that hangs behind the head and shoulders.
  if (look.hair === "long") return <rect x={-22} y={y(1.02)} width={44} height={42} rx={4} fill={colour} />;
  if (look.hair === "bob") return <rect x={-23} y={y(1.02)} width={46} height={24} rx={6} fill={colour} />;
  if (look.hair === "ponytail") return <polygon points={`-6,${y(0.98)} 6,${y(0.98)} 9,${y(0.7)} 0,${y(0.66)} -9,${y(0.7)}`} fill={colour} transform="translate(17 0) rotate(8)" />;
  if (look.hair === "afro" && look.extra !== "beanie" && look.extra !== "cap") return <circle cx={0} cy={y(1.04)} r={28} fill={colour} />;
  return null;
}

function HairTop({ look, colour }: { look: Look; colour: string }) {
  const hat = look.extra === "beanie" || look.extra === "cap";
  if (look.hair === "bald" || (look.hair === "afro" && !hat)) return null;
  const top = y(1.0);
  const dome = look.hair === "buzz"
    ? <path d={`M-21,${top} A21,13 0 0 1 21,${top} Z`} fill={colour} />
    : <path d={`M-22.5,${top + 1} A22.5,17 0 0 1 22.5,${top + 1} Z`} fill={colour} />;
  return (
    <>
      {dome}
      {look.hair === "quiff" && !hat && <ellipse cx={4} cy={top - 15} rx={11} ry={6} fill={colour} transform={`rotate(-12 4 ${top - 15})`} />}
      {look.hair === "curly" && !hat && [-16, -6, 6, 16].map((x) => <circle key={x} cx={x} cy={top - 11 + Math.abs(x) * 0.25} r={7} fill={colour} />)}
      {look.hair === "bun" && !hat && <circle cx={0} cy={top - 19} r={9} fill={colour} />}
    </>
  );
}

function FaceExtras({ look, name }: { look: Look; name: string }) {
  const eyeY = y(0.965);
  if (look.extra === "shades") {
    return <path d={`M-12,${eyeY - 3} h10 v6 h-10 Z M2,${eyeY - 3} h10 v6 h-10 Z M-2,${eyeY - 2} h4`} fill="#111" stroke="#111" strokeWidth={1.2} />;
  }
  const eyes = [-7, 7].map((x) => <rect key={x} x={x - 2} y={eyeY - 2.5} width={4} height={5} fill="#1c1c1c" />);
  const glasses = look.extra === "glasses" && (
    <g fill="#d4e9f6" fillOpacity={0.55} stroke="#1c1c1c" strokeWidth={1.6}>
      <rect x={-12.5} y={eyeY - 4} width={10} height={8} rx={1.5} />
      <rect x={2.5} y={eyeY - 4} width={10} height={8} rx={1.5} />
      <path d={`M-2.5,${eyeY - 1} h5`} fill="none" />
    </g>
  );
  const hatColour = topColour(look, name);
  const hat = look.extra === "beanie" ? (
    <>
      <path d={`M-23.5,${y(0.99)} A23.5,20 0 0 1 23.5,${y(0.99)} Z`} fill={hatColour} />
      <rect x={-24} y={y(1.03)} width={48} height={6} fill={trimColour(look)} />
      <circle cx={0} cy={y(1.2)} r={5.5} fill={trimColour(look)} />
    </>
  ) : look.extra === "cap" ? (
    <>
      <path d={`M-23.3,${y(0.99)} A23.3,16 0 0 1 23.3,${y(0.99)} Z`} fill={hatColour} />
      <rect x={-12} y={y(1.0)} width={24} height={3} fill={hatColour} style={{ filter: "brightness(0.85)" }} />
    </>
  ) : look.extra === "headphones" ? (
    <g fill="#26272b">
      <path d={`M-23.5,${y(0.93)} A23.5,23.5 0 0 1 23.5,${y(0.93)}`} fill="none" stroke="#26272b" strokeWidth={4} />
      <rect x={-27} y={y(0.97)} width={7} height={11} rx={2} />
      <rect x={20} y={y(0.97)} width={7} height={11} rx={2} />
    </g>
  ) : null;
  return <>{eyes}{glasses}{hat}</>;
}

export function LookPreview({ look, name }: { look: Look; name: string }) {
  const { shoulders, waist, hips } = bodyShape(look.build);
  const skin = SKIN_COLOURS[look.skin];
  const hair = HAIR_COLOURS[look.hairColour];
  const top = topColour(look, name);
  const trim = trimColour(look);
  const bottom = BOTTOM_COLOURS[look.bottomColour];
  const legs = look.bottoms === "shorts" ? 0.17 : look.bottoms === "skirt" ? 0.1 : 0;
  const lowerR0 = look.bottoms === "skirt" ? hips + 0.07 : hips;
  const at = (world: number) => (waist + (shoulders - waist) * ((world - 0.36) / 0.36)) * PX;
  return (
    <svg className="look-preview" viewBox="-40 10 80 145" role="img" aria-label={`Preview of ${name}’s look`}>
      <ellipse cx={0} cy={GROUND} rx={30} ry={4} fill="currentColor" opacity={0.12} />
      <HairBack look={look} colour={hair} />
      {legs > 0 && <polygon points={band(0, legs, hips * (legs > 0.12 ? 0.75 : 0.6), hips * (legs > 0.12 ? 0.82 : 0.6))} fill={skin} />}
      <polygon points={band(legs, 0.36, lowerR0, waist)} fill={bottom} />
      <polygon points={band(0.36, 0.72, waist, shoulders)} fill={top} />
      {look.top === "hoodie" && (
        <>
          <ellipse cx={0} cy={y(0.73)} rx={17} ry={6} fill={top} style={{ filter: "brightness(0.9)" }} />
          <rect x={-11} y={y(0.5)} width={22} height={11} fill="#000" opacity={0.18} />
          <path d={`M-4.5,${y(0.7)} v11 M4.5,${y(0.7)} v11`} stroke={trim} strokeWidth={1.5} />
        </>
      )}
      {look.top === "shirt" && (
        <>
          <polygon points={`-9,${y(0.72)} 9,${y(0.72)} 0,${y(0.65)}`} fill={trim} />
          <rect x={-1.4} y={y(0.65)} width={2.8} height={28} fill={trim} opacity={0.7} />
        </>
      )}
      {look.top === "jacket" && <rect x={-5} y={y(0.72)} width={10} height={35} fill={trim} />}
      {look.top === "stripes" && [0.44, 0.56].map((w) => (
        <polygon key={w} points={`${-at(w)},${y(w)} ${at(w)},${y(w)} ${at(w + 0.05)},${y(w + 0.05)} ${-at(w + 0.05)},${y(w + 0.05)}`} fill={look.topColour === "white" ? "#2c3a5e" : trim} />
      ))}
      <circle cx={0} cy={y(0.93)} r={21} fill={skin} />
      <HairTop look={look} colour={hair} />
      <FaceExtras look={look} name={name} />
    </svg>
  );
}

// ---------- Picker ----------

function PartChoices<P extends LookListPart>({ part, person, onChange }: {
  part: P;
  person: Roommate;
  onChange: LookPickerProps["onChange"];
}) {
  const info = LOOK_PARTS[part] as LookPartInfo<P>;
  const current = person.look[part];
  const options = Object.keys(info.options) as Look[P][];
  const swatchFor = (option: Look[P]) =>
    part === "topColour" && option === "name" ? nameColour(person.name) : info.swatches?.[option];
  return (
    <div className="decor-slot" role="group" aria-labelledby={`look-${part}`}>
      <p className="decor-slot-name" id={`look-${part}`}>{info.label}</p>
      <div className="decor-options">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            className={`decor-option${option === current ? " active" : ""}`}
            aria-pressed={option === current}
            onClick={() => onChange(person.id, part, option)}
          >
            {swatchFor(option) && (
              <span className="decor-swatch" style={{ background: swatchFor(option) }} aria-hidden="true" />
            )}
            {info.options[option]}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The male ↔ female slider. While dragging, `draft` moves the preview; the change is sent once
 * the slider settles, so dragging doesn't fire dozens of changes (and hit the rate limit).
 */
function BuildSlider({ person, draft, onDraft, onChange }: {
  person: Roommate;
  draft: number | null;
  onDraft: (value: number | null) => void;
  onChange: LookPickerProps["onChange"];
}) {
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const value = draft ?? person.look.build;

  function update(next: number) {
    onDraft(next);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      // The change shows at once (optimistically), so the draft can go straight away.
      if (next !== person.look.build) onChange(person.id, "build", next);
      onDraft(null);
    }, BUILD_SETTLE_MS);
  }

  return (
    <div className="decor-slot">
      <label className="decor-slot-name" htmlFor="look-build">Build</label>
      <div className="look-build">
        <span aria-hidden="true">Male</span>
        <input
          id="look-build"
          type="range"
          min={0}
          max={LOOK_BUILD_MAX}
          step={1}
          value={value}
          onChange={(event) => update(Number(event.target.value))}
          aria-valuetext={buildText(value)}
        />
        <span aria-hidden="true">Female</span>
      </div>
    </div>
  );
}

function buildText(build: number): string {
  if (build === LOOK_BUILD_MAX / 2) return "In between";
  return build < LOOK_BUILD_MAX / 2 ? "More male" : "More female";
}

export default function LookPicker({ roommates, personId, meId = null, onChange }: LookPickerProps) {
  const [selectedId, setSelectedId] = useState(personId);
  // The build slider's value while it is being dragged (not sent yet).
  const [draftBuild, setDraftBuild] = useState<number | null>(null);
  // A different door was clicked while the panel was open: follow it.
  const [lastPropId, setLastPropId] = useState(personId);
  if (lastPropId !== personId) {
    setLastPropId(personId);
    setSelectedId(personId);
    setDraftBuild(null);
  }
  const person = roommates.find((roommate) => roommate.id === selectedId) ?? roommates[0];


  return (
    <section className="house-panel" aria-labelledby="look-panel-title">
      <h2 id="look-panel-title">
        {person && person.id === meId ? "Make it you" : "Change their look"}<span className="heading-period">.</span>
      </h2>
      {!person ? (
        <p className="decor-intro">No housemates yet. Add them at the front door, then come back to dress them up.</p>
      ) : (
        <>
          <p className="decor-intro">
            {person.id === meId
              ? "This is how you’ll walk around everyone’s flat. Changes show up for them straight away."
              : "Changes show up in everyone’s flat straight away."}
          </p>
          {roommates.length > 1 && (
            <div className="look-people" role="group" aria-label="Housemate">
              {roommates.map((roommate) => (
                <button
                  key={roommate.id}
                  type="button"
                  className={`decor-option${roommate.id === person.id ? " active" : ""}`}
                  aria-pressed={roommate.id === person.id}
                  onClick={() => {
                    setSelectedId(roommate.id);
                    setDraftBuild(null);
                  }}
                >
                  <span className="look-person-dot" style={{ background: nameColour(roommate.name) }} aria-hidden="true">
                    {initial(roommate.name)}
                  </span>
                  {roommate.name}
                </button>
              ))}
            </div>
          )}
          <div className="look-stage">
            <LookPreview look={draftBuild === null ? person.look : { ...person.look, build: draftBuild }} name={person.name} />
            <p className="look-name">{person.name}</p>
          </div>
          <BuildSlider key={person.id} person={person} draft={draftBuild} onDraft={setDraftBuild} onChange={onChange} />
          {LOOK_ORDER.map((part) => (
            <PartChoices key={part} part={part} person={person} onChange={onChange} />
          ))}
        </>
      )}
    </section>
  );
}
