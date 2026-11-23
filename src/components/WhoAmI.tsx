// "Which one are you?": asks once per device and house which housemate is using it, so the app
// can point out your avatar, your jobs and your look. Floats over the 3D flat, or sits above
// the chore board in the list view. The answer stays on this device (lib/house.ts, readMe).
import type { Roommate } from "../hooks/useHouseholdData";
import { LookPreview } from "./LookPicker";

interface WhoAmIProps {
  roommates: Roommate[];
  /** A housemate's id, or null for "just looking" (don't ask again). */
  onChoose: (id: string | null) => void;
  variant: "flat" | "list";
}

export default function WhoAmI({ roommates, onChoose, variant }: WhoAmIProps) {
  return (
    <section className={`who-am-i who-am-i-${variant}`} aria-labelledby="who-am-i-title">
      <div className="who-am-i-top">
        <span className="form-kicker">ON THIS DEVICE</span>
        <button className="flat-tour-skip" type="button" onClick={() => onChoose(null)}>JUST LOOKING</button>
      </div>
      <h2 id="who-am-i-title">Which one are you?</h2>
      <p>We’ll point out your jobs and your avatar. Only this device remembers it.</p>
      <div className="who-am-i-people">
        {roommates.map((person) => (
          <button key={person.id} type="button" className="who-am-i-person" onClick={() => onChoose(person.id)}>
            <LookPreview look={person.look} name={person.name} />
            <span>{person.name}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
