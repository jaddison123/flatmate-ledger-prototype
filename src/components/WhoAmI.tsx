// "Which one are you?": asked once per device and house, before anything else, so the app can
// point out your avatar, your jobs and your balance. Pick yourself from the housemates, or add
// yourself if you're new (in an empty house that's the only option). Floats over the 3D flat,
// or sits above the chore board in the list view. The answer stays on this device
// (lib/house.ts, readMe).
import { useState, type FormEvent } from "react";
import { LIMITS, type Roommate } from "../hooks/useHouseholdData";
import { LookPreview } from "./LookPicker";

interface WhoAmIProps {
  roommates: Roommate[];
  /** A housemate's id, or null for "just looking" (don't ask again). */
  onChoose: (id: string | null) => void;
  /** Adds a new housemate with this name and makes them "me". */
  onAddMe: (name: string) => void;
  variant: "flat" | "list";
}

/** Names as the chat compares them: case- and space-insensitive. */
const sameName = (a: string, b: string) => a.toLowerCase().replace(/\s+/g, "") === b.toLowerCase().replace(/\s+/g, "");

export default function WhoAmI({ roommates, onChoose, onAddMe, variant }: WhoAmIProps) {
  const empty = roommates.length === 0;
  const canAdd = roommates.length < LIMITS.roommates;
  const [adding, setAdding] = useState(empty);
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Type your name to add yourself.");
      return;
    }
    const twin = roommates.find((person) => sameName(person.name, trimmed));
    if (twin) {
      setError(`There’s already a ${twin.name} here. If that’s you, pick them above.`);
      return;
    }
    onAddMe(trimmed);
  }

  return (
    <section className={`who-am-i who-am-i-${variant}`} aria-labelledby="who-am-i-title">
      <div className="who-am-i-top">
        <span className="form-kicker">ON THIS DEVICE</span>
        <button className="flat-tour-skip" type="button" onClick={() => onChoose(null)}>JUST LOOKING</button>
      </div>
      <h2 id="who-am-i-title">{empty ? "Add yourself first" : "Which one are you?"}</h2>
      <p>
        {empty
          ? "You’re the first one here. Add your name, then invite the others from the front door."
          : "We’ll point out your jobs, your bills and your avatar. Only this device remembers it."}
      </p>
      {!empty && (
        <div className="who-am-i-people">
          {roommates.map((person) => (
            <button key={person.id} type="button" className="who-am-i-person" onClick={() => onChoose(person.id)}>
              <LookPreview look={person.look} name={person.name} />
              <span>{person.name}</span>
            </button>
          ))}
          {canAdd && !adding && (
            <button type="button" className="who-am-i-person who-am-i-new" onClick={() => setAdding(true)}>
              <span className="who-am-i-plus" aria-hidden="true">＋</span>
              <span>I’m new here</span>
            </button>
          )}
        </div>
      )}
      {adding && canAdd && (
        <form className="who-am-i-add" onSubmit={handleAdd}>
          <label className="field-label" htmlFor="who-am-i-name">YOUR NAME</label>
          <div className="roommate-input-row">
            <input
              id="who-am-i-name"
              autoFocus
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setError("");
              }}
              placeholder="e.g. Sam"
              maxLength={LIMITS.roommateName}
            />
            <button className="add-chore-button" type="submit">ADD ME</button>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
        </form>
      )}
      {!canAdd && (
        <p className="who-am-i-full">
          This house is full ({LIMITS.roommates} housemates). If you’re not on the list, ask someone to make room.
        </p>
      )}
    </section>
  );
}
