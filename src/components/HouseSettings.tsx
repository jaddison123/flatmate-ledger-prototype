import { useState, type FormEvent } from "react";
import { LIMITS, type Roommate } from "../hooks/useHouseholdData";
import { formatHouseCode, inviteLink } from "../lib/house";
import { initial } from "../lib/nameColour";

interface HouseSettingsProps {
  houseCode: string;
  householdName: string;
  roommates: Roommate[];
  /** Show the "name of your house" form (the list view has it in the hero instead). */
  showRename?: boolean;
  onRename: (name: string) => void;
  onAddRoommate: (name: string) => void;
  onRemoveRoommate: (id: string) => void;
  /** Asks for confirmation itself, then calls this. */
  onLeave: () => void;
}

/** Housemates, invite link, house name and "leave this house": the "edit house" contents. */
function HouseSettings({
  houseCode,
  householdName,
  roommates,
  showRename = false,
  onRename,
  onAddRoommate,
  onRemoveRoommate,
  onLeave,
}: HouseSettingsProps) {
  const [roommateName, setRoommateName] = useState("");
  const [formError, setFormError] = useState("");
  const [nameDraft, setNameDraft] = useState(householdName);
  const [copied, setCopied] = useState(false);
  const houseFull = roommates.length >= LIMITS.roommates;

  function handleAddRoommate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = roommateName.trim();
    if (!name) {
      setFormError("Enter a name to add a housemate.");
      return;
    }
    if (houseFull) {
      setFormError(`A house can have up to ${LIMITS.roommates} housemates.`);
      return;
    }
    onAddRoommate(name);
    setRoommateName("");
    setFormError("");
  }

  function handleRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onRename(nameDraft.trim());
  }

  async function copyInviteLink() {
    try {
      await navigator.clipboard.writeText(inviteLink(houseCode));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard needs HTTPS (or localhost); otherwise select the link for a manual copy.
      document.querySelector<HTMLInputElement>("#invite-link")?.select();
    }
  }

  function handleLeave() {
    if (window.confirm("Leave this house on this device? You'll need the invite link to come back.")) {
      onLeave();
    }
  }

  return (
    <>
      {showRename && (
        <form className="house-name-form settings-rename" onSubmit={handleRename}>
          <label className="field-label" htmlFor="settings-house-name">NAME OF YOUR HOUSE</label>
          <div className="roommate-input-row">
            <input
              id="settings-house-name"
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              placeholder="e.g. 42 Maple Street"
              maxLength={28}
            />
            <button
              className="add-chore-button"
              type="submit"
              disabled={nameDraft.trim() === householdName.trim()}
            >SAVE</button>
          </div>
        </form>
      )}
      <p className="dialog-intro">Add your crew so everyone can take a turn.</p>
      <form className="roommate-form" onSubmit={handleAddRoommate}>
        <label className="field-label" htmlFor="roommate-name">
          NAME <span className="roommate-count">{roommates.length}/{LIMITS.roommates}</span>
        </label>
        <div className="roommate-input-row">
          <input
            autoFocus={!showRename}
            id="roommate-name"
            value={roommateName}
            onChange={(event) => setRoommateName(event.target.value)}
            placeholder={houseFull ? "House full" : "e.g. Sam"}
            maxLength={40}
            disabled={houseFull}
          />
          <button className="add-chore-button" type="submit" disabled={houseFull}>
            ADD <span aria-hidden="true">＋</span>
          </button>
        </div>
        {formError && <p className="form-error" role="alert">{formError}</p>}
        {houseFull && (
          <p className="dialog-note">
            That’s the most a house can have ({LIMITS.roommates}). Remove someone to add another.
          </p>
        )}
      </form>
      <div className="roommate-list">
        {roommates.length === 0 ? (
          <p className="roommate-empty">No housemates yet. Add the first name above.</p>
        ) : roommates.map((roommate) => (
          <div className="roommate-entry" key={roommate.id}>
            <span className="avatar">{initial(roommate.name)}</span>
            <span>{roommate.name}</span>
            <button
              className="remove-roommate"
              type="button"
              onClick={() => onRemoveRoommate(roommate.id)}
              aria-label={`Remove ${roommate.name}`}
            >REMOVE</button>
          </div>
        ))}
      </div>
      <p className="dialog-note">Removing someone leaves their chores unassigned.</p>

      <div className="invite-box">
        <label className="field-label" htmlFor="invite-link">INVITE LINK</label>
        <div className="roommate-input-row">
          <input
            id="invite-link"
            readOnly
            value={inviteLink(houseCode)}
            onFocus={(event) => event.currentTarget.select()}
          />
          <button className="add-chore-button" type="button" onClick={copyInviteLink}>
            {copied ? "COPIED" : "COPY"}
          </button>
        </div>
        <p className="dialog-note">
          House code <b>{formatHouseCode(houseCode)}</b>. Send the link to your housemates:
          anyone who has it can see and change this house.
        </p>
        <button className="remove-roommate leave-house" type="button" onClick={handleLeave}>
          LEAVE THIS HOUSE ON THIS DEVICE
        </button>
      </div>
    </>
  );
}

export default HouseSettings;
