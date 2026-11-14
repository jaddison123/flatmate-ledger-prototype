import { useState, type FormEvent } from "react";
import type { Note } from "../hooks/useHouseholdData";

interface NotesProps {
  notes: Note[];
  onAdd: (text: string) => void;
  onRemove: (id: string) => void;
}

const MAX_NOTE_LENGTH = 140;

function formatNoteDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(date);
}

/** Small board of short reminders that are not chores. */
function Notes({ notes, onAdd, onRemove }: NotesProps) {
  const [text, setText] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setText("");
  }

  return (
    <section className="feature-panel notes-panel" aria-labelledby="notes-heading">
      <div className="notes-top">
        <div>
          <p className="eyebrow"><span>✎</span> JUST SO WE REMEMBER</p>
          <h2 id="notes-heading">Notes<span className="heading-period">.</span></h2>
        </div>
        <form className="notes-form" onSubmit={handleSubmit}>
          <label className="visually-hidden" htmlFor="note-input">New note</label>
          <input
            id="note-input"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="e.g. Landlord visiting Friday at 2pm"
            maxLength={MAX_NOTE_LENGTH}
            autoComplete="off"
          />
          <button className="add-chore-button" type="submit" disabled={!text.trim()}>
            <span aria-hidden="true">＋</span> ADD
          </button>
        </form>
      </div>

      {notes.length === 0 ? (
        <p className="notes-empty">No notes yet. Pin a reminder for the house.</p>
      ) : (
        <ul className="notes-list">
          {notes.map((note) => (
            <li className="note-card" key={note.id}>
              <p>{note.text}</p>
              <div className="note-foot">
                <span>{formatNoteDate(note.createdAt)}</span>
                <button
                  className="bill-remove"
                  type="button"
                  onClick={() => onRemove(note.id)}
                  aria-label={`Remove note: ${note.text}`}
                  title="Remove note"
                >×</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default Notes;
