import { useState, type FormEvent } from "react";
import type { Household } from "../hooks/useHouseholdData";
import { apiRequest, markLegacyImported, parseHouseCode, readLegacyHousehold } from "../lib/house";

interface HouseGateProps {
  /** Explains why we are here (e.g. the house in the link was not found). */
  notice: string;
  /** A copy of a house that vanished from the server, kept on this device, offered for re-upload. */
  lostCopy: Household | null;
  onEnter: (code: string) => void;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function summarise(household: Household): string {
  return [
    plural(household.roommates.length, "housemate"),
    plural(household.chores.length, "chore"),
    plural(household.expenses.length, "bill"),
    plural(household.notes.length, "note"),
  ].join(", ");
}

const SLOW_HINT = "Connecting… if the server was asleep this can take up to a minute.";

/** Shown when this device is not in a house yet: start a new one or join with an invite. */
function HouseGate({ notice, lostCopy, onEnter }: HouseGateProps) {
  const [legacy] = useState(readLegacyHousehold);
  const importable = lostCopy ?? legacy;
  const [bringData, setBringData] = useState(true);
  const [joinInput, setJoinInput] = useState("");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [error, setError] = useState("");

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("create");
    setError("");
    const upload = importable && bringData ? importable : undefined;
    try {
      const result = await apiRequest<{ code: string }>("/api/houses", { household: upload });
      if (upload && upload === legacy) markLegacyImported();
      onEnter(result.code);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the house.");
      setBusy(null);
    }
  }

  async function handleJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = parseHouseCode(joinInput.trim());
    if (!code) {
      setError("That doesn't look like an invite link or house code (12 letters and numbers).");
      return;
    }
    setBusy("join");
    setError("");
    try {
      await apiRequest(`/api/houses/${code}`); // 404 if there is no such house
      onEnter(code);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not join the house.");
      setBusy(null);
    }
  }

  return (
    <section className="gate" aria-labelledby="gate-heading">
      <p className="eyebrow"><span>★</span> SAME ROOF, SAME TEAM</p>
      <h1 id="gate-heading">Set up<br /><span className="house-name">your house.</span></h1>
      <p className="hero-description">
        Chores, bills and notes are shared live with everyone who has your house’s invite link,
        on any phone or laptop.
      </p>

      {notice && <p className="storage-alert" role="alert">{notice}</p>}

      <div className="gate-options">
        <form className="inline-form gate-card" onSubmit={handleCreate}>
          <div className="form-heading">
            <div>
              <span className="form-kicker">FIRST ONE HERE?</span>
              <h2>Start a new house</h2>
            </div>
          </div>
          <p className="gate-text">You’ll get an invite link to send to your housemates.</p>
          {importable && (
            <label className="gate-check">
              <input
                type="checkbox"
                checked={bringData}
                onChange={(event) => setBringData(event.target.checked)}
              />
              <span>
                {lostCopy ? "Restore the copy saved on this device" : "Bring over what’s saved in this browser"}
                <small>{summarise(importable)}</small>
              </span>
            </label>
          )}
          <button className="add-chore-button gate-button" type="submit" disabled={busy !== null}>
            CREATE HOUSE <span aria-hidden="true">↗</span>
          </button>
        </form>

        <form className="inline-form gate-card" onSubmit={handleJoin}>
          <div className="form-heading">
            <div>
              <span className="form-kicker">GOT AN INVITE?</span>
              <h2>Join your housemates</h2>
            </div>
          </div>
          <label className="field-label gate-field">
            INVITE LINK OR HOUSE CODE
            <input
              value={joinInput}
              onChange={(event) => setJoinInput(event.target.value)}
              placeholder="e.g. ABCD-EFGH-JKMN"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <button className="add-chore-button gate-button" type="submit" disabled={busy !== null}>
            JOIN <span aria-hidden="true">→</span>
          </button>
        </form>
      </div>

      {busy && <p className="gate-text" role="status">{SLOW_HINT}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </section>
  );
}

export default HouseGate;
