import { useEffect, useRef, useState, type FormEvent } from "react";
import { apiRequest, readMemberToken } from "../lib/house";

interface HomeChatProps {
  /** Each house has its own chat under /api/houses/<code>/chat. */
  houseCode: string;
  username: string;
  onUsernameChange: (username: string) => void;
}

interface ChatMessage {
  id: string;
  username: string;
  /** Public id of the sending device (older messages may not have one). */
  senderId?: string;
  text: string;
  createdAt: string;
  /** emoji -> usernames who reacted with it */
  reactions?: Record<string, string[]>;
  /** usernames who have seen the message (includes the sender) */
  readBy?: string[];
}

const QUICK_REACTIONS = ["👍", "❤️", "😂", "🔥", "🎉", "🙏"];
const EMOJI_PICKER = [
  "😀", "😂", "😅", "😍", "😎", "🤔", "😴", "😭",
  "👍", "👏", "🙌", "🙏", "💪", "🎉", "🔥", "❤️",
  "🧹", "🗑️", "🍕", "☕", "🍺", "🛒", "💸", "✅",
];
// Name colours, picked deterministically per username (like WhatsApp groups).
const NAME_COLOURS = ["#6d4bd1", "#e0682e", "#1f8a70", "#c2377a", "#2b7bbd", "#a37a00"];

function nameColour(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return NAME_COLOURS[hash % NAME_COLOURS.length];
}

function formatChatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit" }).format(date);
}

function formatDay(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOf(new Date()) - startOf(date)) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(date);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isChatMessage(value: unknown): value is ChatMessage {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.username === "string" &&
    typeof value.text === "string" &&
    typeof value.createdAt === "string"
  );
}

/** Every chat request carries this device's key, which proves it owns the name it uses. */
const memberToken = readMemberToken();

/** Small POST helper; chat extras (react/read/typing) fail quietly. */
function postJson(path: string, body: Record<string, unknown>): Promise<Response> {
  return fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, token: memberToken }),
  });
}

/** How long the name must stay unchanged before it is claimed, so typing doesn't claim "J", "Ju"... */
const NAME_CLAIM_DELAY_MS = 700;

function HomeChat({ houseCode, username, onUsernameChange }: HomeChatProps) {
  const api = `/api/houses/${houseCode}/chat`;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connectionState, setConnectionState] = useState<
    "connecting" | "connected" | "reconnecting"
  >("connecting");
  const [connectionError, setConnectionError] = useState("");
  const [text, setText] = useState("");
  const [formError, setFormError] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [reactingTo, setReactingTo] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<Record<string, number>>({});
  const messagesRef = useRef<HTMLOListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastTypingPost = useRef(0);
  const me = username.trim();
  // The name the server has confirmed belongs to this device, and this device's public id.
  const [claimedName, setClaimedName] = useState("");
  const [senderId, setSenderId] = useState("");
  const [nameError, setNameError] = useState("");
  const nameIsMine = me !== "" && claimedName === me;

  // Claim the chat name once the user stops typing it.
  useEffect(() => {
    setNameError("");
    if (!me) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      apiRequest<{ name: string; senderId: string }>(`${api}/name`, { name: me, token: memberToken })
        .then((result) => {
          if (cancelled) return;
          setClaimedName(result.name);
          setSenderId(result.senderId);
        })
        .catch((error: unknown) => {
          if (!cancelled) setNameError(error instanceof Error ? error.message : "Could not use that name.");
        });
    }, NAME_CLAIM_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [api, me]);

  /** Messages from this device. Older messages without a senderId fall back to the name. */
  function isOwn(message: ChatMessage): boolean {
    if (message.senderId) return senderId !== "" && message.senderId === senderId;
    return me !== "" && message.username === me;
  }

  useEffect(() => {
    const eventSource = new EventSource(`${api}/events`);
    eventSource.onopen = () => {
      setConnectionState("connected");
      setConnectionError("");
    };
    eventSource.onerror = () => {
      setConnectionState("reconnecting");
      setConnectionError("Connection lost. Trying to reconnect to the home chat.");
    };
    eventSource.addEventListener("history", (event) => {
      try {
        const history: unknown = JSON.parse((event as MessageEvent<string>).data);
        if (!Array.isArray(history) || !history.every(isChatMessage)) {
          throw new Error("The chat server sent an invalid message history.");
        }
        setMessages(history.slice(-200));
        setConnectionError("");
      } catch (error) {
        console.error("Could not read chat history:", error);
        setConnectionError("Could not read chat history from the server.");
      }
    });
    eventSource.addEventListener("message", (event) => {
      try {
        const message: unknown = JSON.parse((event as MessageEvent<string>).data);
        if (!isChatMessage(message)) throw new Error("The chat server sent an invalid message.");
        setMessages((current) =>
          current.some((existing) => existing.id === message.id)
            ? current
            : [...current, message].slice(-200),
        );
        // The sender has stopped typing once their message arrives.
        setTypingUsers((current) => {
          const { [message.username]: _removed, ...rest } = current;
          return rest;
        });
        setConnectionError("");
      } catch (error) {
        console.error("Could not read chat message:", error);
        setConnectionError("Could not read a message from the chat server.");
      }
    });
    // Reactions and read receipts arrive as a replacement for one message.
    eventSource.addEventListener("update", (event) => {
      try {
        const message: unknown = JSON.parse((event as MessageEvent<string>).data);
        if (!isChatMessage(message)) return;
        setMessages((current) => current.map((m) => (m.id === message.id ? message : m)));
      } catch (error) {
        console.error("Could not read chat update:", error);
      }
    });
    eventSource.addEventListener("typing", (event) => {
      try {
        const data: unknown = JSON.parse((event as MessageEvent<string>).data);
        if (isRecord(data) && typeof data.username === "string") {
          const name = data.username;
          setTypingUsers((current) => ({ ...current, [name]: Date.now() + 3500 }));
        }
      } catch {
        /* typing hints are best-effort */
      }
    });

    return () => eventSource.close();
  }, [api]);

  // Expire typing indicators.
  useEffect(() => {
    if (Object.keys(typingUsers).length === 0) return;
    const id = window.setTimeout(() => {
      const now = Date.now();
      setTypingUsers((current) =>
        Object.fromEntries(Object.entries(current).filter(([, until]) => until > now)),
      );
    }, 1000);
    return () => window.clearTimeout(id);
  }, [typingUsers]);

  // Keep the newest message in view.
  const typingNames = Object.keys(typingUsers).filter((name) => name !== me);
  useEffect(() => {
    const list = messagesRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages.length, typingNames.length]);

  // Send a read receipt when there are messages from others we haven't seen.
  const hasUnread = nameIsMine && messages.some((m) => !(m.readBy ?? []).includes(me));
  useEffect(() => {
    if (!hasUnread) return;
    postJson(`${api}/read`, { username: me }).catch(() => undefined);
  }, [api, hasUnread, me, messages.length]);

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = text.trim();

    if (!me) {
      setFormError("Choose a username before sending a message.");
      return;
    }
    if (nameError) {
      setFormError(nameError);
      return;
    }
    if (!message) return;

    setIsSending(true);
    setFormError("");
    setShowEmojiPicker(false);
    try {
      const response = await postJson(`${api}/messages`, { username: me, text: message });
      if (!response.ok) {
        const result: unknown = await response.json().catch(() => null);
        const serverMessage =
          isRecord(result) && typeof result.error === "string"
            ? result.error
            : `The chat server returned HTTP ${response.status}.`;
        throw new Error(serverMessage);
      }
      // Sending also claims the name, in case it was sent before the claim timer fired.
      const sent: unknown = await response.json().catch(() => null);
      if (isRecord(sent) && isChatMessage(sent.message) && sent.message.senderId) {
        setClaimedName(me);
        setSenderId(sent.message.senderId);
      }
      setText("");
      inputRef.current?.focus();
    } catch (error) {
      setFormError(
        error instanceof Error
          ? `Could not send message: ${error.message}`
          : "Could not send message. Check the home chat connection and try again.",
      );
    } finally {
      setIsSending(false);
    }
  }

  function handleTextChange(value: string) {
    setText(value);
    const now = Date.now();
    if (nameIsMine && value && now - lastTypingPost.current > 2500) {
      lastTypingPost.current = now;
      postJson(`${api}/typing`, { username: me }).catch(() => undefined);
    }
  }

  function handleReact(id: string, emoji: string) {
    setReactingTo(null);
    if (!me) {
      setFormError("Choose a username before reacting.");
      return;
    }
    postJson(`${api}/react`, { id, username: me, emoji })
      .then(async (response) => {
        if (response.ok) return;
        const result: unknown = await response.json().catch(() => null);
        setFormError(isRecord(result) && typeof result.error === "string" ? result.error : "Could not add that reaction.");
      })
      .catch(() => setFormError("Could not add that reaction."));
  }

  function insertEmoji(emoji: string) {
    setText((current) => current + emoji);
    inputRef.current?.focus();
  }

  // The server keeps (and sends) the last 200 messages; show them all.
  const visibleMessages = messages;

  return (
    <section className="feature-panel chat-panel" aria-labelledby="chat-heading">
      <div className="feature-heading">
        <div>
          <p className="eyebrow"><span>✳</span> THE HOUSE CHAT</p>
          <h2 id="chat-heading">House chat<span className="heading-period">.</span></h2>
        </div>
        <span className={`chat-connection chat-${connectionState}`} role="status">
          {connectionState === "connected"
            ? "LIVE"
            : connectionState === "connecting"
              ? "CONNECTING"
              : "RECONNECTING"}
        </span>
      </div>

      <label className="chat-username field-label">
        YOUR NAME
        <input
          value={username}
          onChange={(event) => onUsernameChange(event.target.value)}
          placeholder="e.g. Sam"
          maxLength={30}
          autoComplete="nickname"
          aria-invalid={nameError !== ""}
        />
      </label>
      {nameError && <p className="form-error chat-name-error" role="alert">{nameError}</p>}

      {connectionError && <p className="chat-server-error" role="alert">{connectionError}</p>}

      <div className="wa-chat">
        <ol
          className="wa-messages"
          aria-label="House chat messages"
          aria-live="polite"
          ref={messagesRef}
        >
          {visibleMessages.length === 0 ? (
            <li className="chat-empty">No messages yet. Say hi to your housemates 👋</li>
          ) : (
            visibleMessages.map((message, index) => {
              const own = isOwn(message);
              const previous = visibleMessages[index - 1];
              const newDay = !previous || formatDay(previous.createdAt) !== formatDay(message.createdAt);
              const startsGroup = newDay || previous.username !== message.username;
              const reactions = Object.entries(message.reactions ?? {});
              const seen = (message.readBy ?? []).some((name) => name !== message.username);
              const colour = nameColour(message.username);

              return (
                <li className="wa-row-wrap" key={message.id}>
                  {newDay && <div className="wa-day"><span>{formatDay(message.createdAt)}</span></div>}
                  <div className={`wa-row${own ? " wa-own" : ""}${startsGroup ? " wa-first" : ""}`}>
                    {!own && (
                      <span
                        className="wa-avatar"
                        style={{ background: startsGroup ? colour : "transparent" }}
                        aria-hidden="true"
                      >
                        {startsGroup ? message.username.charAt(0).toUpperCase() : ""}
                      </span>
                    )}
                    <div className="wa-bubble-col">
                      <div
                        className="wa-bubble"
                        onClick={() => setReactingTo((current) => (current === message.id ? null : message.id))}
                        role="button"
                        tabIndex={0}
                        aria-label={`Message from ${message.username}. Press to react.`}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setReactingTo((current) => (current === message.id ? null : message.id));
                          }
                        }}
                      >
                        {!own && startsGroup && (
                          <strong className="wa-name" style={{ color: colour }}>{message.username}</strong>
                        )}
                        <span className="wa-text">{message.text}</span>
                        <span className="wa-meta">
                          {formatChatTime(message.createdAt)}
                          {own && (
                            <span className={`wa-ticks${seen ? " wa-seen" : ""}`} aria-label={seen ? "Seen" : "Sent"}>
                              {seen ? "✓✓" : "✓"}
                            </span>
                          )}
                        </span>
                      </div>
                      {reactingTo === message.id && (
                        <div className="wa-react-picker" role="group" aria-label="React to message">
                          {QUICK_REACTIONS.map((emoji) => (
                            <button
                              type="button"
                              key={emoji}
                              onClick={() => handleReact(message.id, emoji)}
                              aria-label={`React ${emoji}`}
                            >{emoji}</button>
                          ))}
                        </div>
                      )}
                      {reactions.length > 0 && (
                        <div className="wa-reactions">
                          {reactions.map(([emoji, users]) => (
                            <button
                              type="button"
                              key={emoji}
                              className={me && users.includes(me) ? "wa-reaction wa-reaction-mine" : "wa-reaction"}
                              onClick={() => handleReact(message.id, emoji)}
                              title={users.join(", ")}
                            >
                              {emoji}{users.length > 1 && <span>{users.length}</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })
          )}
          {typingNames.length > 0 && (
            <li className="wa-typing" aria-live="polite">
              {typingNames.join(", ")} {typingNames.length === 1 ? "is" : "are"} typing
              <span className="wa-dots" aria-hidden="true"><i /><i /><i /></span>
            </li>
          )}
        </ol>

        {showEmojiPicker && (
          <div className="wa-emoji-picker" role="group" aria-label="Emoji picker">
            {EMOJI_PICKER.map((emoji) => (
              <button type="button" key={emoji} onClick={() => insertEmoji(emoji)}>{emoji}</button>
            ))}
          </div>
        )}

        <form className="wa-form" onSubmit={handleSend}>
          <div className="wa-input-pill">
            <button
              type="button"
              className="wa-icon-btn"
              onClick={() => setShowEmojiPicker((open) => !open)}
              aria-label="Choose an emoji"
              aria-expanded={showEmojiPicker}
            >😊</button>
            <input
              ref={inputRef}
              value={text}
              onChange={(event) => handleTextChange(event.target.value)}
              placeholder="Message"
              maxLength={500}
              disabled={isSending}
              aria-label="Message"
              autoComplete="off"
            />
          </div>
          <button className="wa-send" type="submit" disabled={isSending || !text.trim()} aria-label="Send message">
            ➤
          </button>
        </form>
      </div>
      {formError && <p className="form-error" role="alert">{formError}</p>}
      <p className="chat-local-note">
        Tap a message to react. Messages are shared live with everyone in this house.
      </p>
    </section>
  );
}

export default HomeChat;
