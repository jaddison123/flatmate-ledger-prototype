// The flat's say box: type a line and it pops up in a speech bubble over your avatar, like a
// game's chat line. It is an ordinary house chat message underneath (same name rules and rate
// limits), so it also lands in the chat log, which the LOG button opens.
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import type { Roommate } from "../../hooks/useHouseholdData";
import { sendChatMessage, sendTyping } from "../../lib/chat";
import { initial, nameColour } from "../../lib/nameColour";

/** How often "is typing" is sent while typing (the server's hint lasts 3.5 s). */
const TYPING_EVERY_MS = 2500;

interface SayBoxProps {
  hidden: boolean;
  houseCode: string;
  /** The housemate using this device; without one there is no avatar to talk through. */
  me: Roommate | null;
  /** This device's chat name (falls back to the housemate's name). */
  chatName: string;
  onChatNameChange: (name: string) => void;
  unread: number;
  onOpenLog: () => void;
  /** Whether Enter (with nothing else focused) jumps into the box. */
  shortcut: boolean;
  /** Told when there is (or stops being) an unsent line, so your own avatar shows "…". */
  onDraftingChange: (drafting: boolean) => void;
}

function SayBox({ hidden, houseCode, me, chatName, onChatNameChange, unread, onOpenLog, shortcut, onDraftingChange }: SayBoxProps) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastTyping = useRef(0);
  const name = chatName.trim() || me?.name || "";
  // Only while it's on screen: a line left in a hidden box isn't being typed.
  const drafting = !hidden && text.trim() !== "";

  useEffect(() => {
    onDraftingChange(drafting);
  }, [drafting, onDraftingChange]);

  // Enter anywhere in the page (when nothing else has focus) starts typing, like in a game.
  useEffect(() => {
    if (!shortcut || !me) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Enter" || event.defaultPrevented || event.isComposing) return;
      const focused = document.activeElement;
      if (focused && focused !== document.body && !(focused instanceof HTMLCanvasElement)) return;
      event.preventDefault();
      inputRef.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shortcut, me]);

  function handleChange(value: string) {
    setText(value);
    setError("");
    const now = Date.now();
    if (me && name && value.trim() && now - lastTyping.current > TYPING_EVERY_MS) {
      lastTyping.current = now;
      sendTyping(houseCode, name, me.id);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = text.trim();
    if (!message || !me || !name || sending) return;
    // Use their housemate name in the chat too, if this device hasn't picked one.
    if (!chatName.trim()) onChatNameChange(me.name);
    setSending(true);
    setError("");
    try {
      await sendChatMessage(houseCode, { username: name, text: message, roommateId: me.id });
      setText("");
      lastTyping.current = 0;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Couldn’t say that. Check the connection and try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <form className="flat-say-box" onSubmit={handleSubmit} hidden={hidden}>
      {error && <p className="flat-say-error" role="alert">{error}</p>}
      <div className="flat-say-row">
        {me ? (
          <>
            <span className="flat-say-who" style={{ "--who": nameColour(name) } as CSSProperties} aria-hidden="true">
              {initial(name)}
            </span>
            <input
              ref={inputRef}
              value={text}
              onChange={(event) => handleChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") event.currentTarget.blur();
              }}
              placeholder={shortcut ? "Say something… (Enter)" : "Say something…"}
              maxLength={500}
              aria-label={`Say something to the house, as ${name}`}
              autoComplete="off"
              enterKeyHint="send"
            />
            <button className="flat-say-send" type="submit" disabled={!drafting || sending} aria-label="Say it">➤</button>
          </>
        ) : (
          <p className="flat-say-hint">Say which housemate you are (front door → “This is me”) to talk here.</p>
        )}
        <button
          className="flat-say-log"
          type="button"
          onClick={onOpenLog}
          aria-label={unread > 0 ? `Open the chat log: ${unread} unread` : "Open the chat log"}
          title="The whole house chat"
        >
          LOG
          {unread > 0 && <span className="flat-say-count">{unread}</span>}
        </button>
      </div>
    </form>
  );
}

export default SayBox;
