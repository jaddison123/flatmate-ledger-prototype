import { useEffect, useRef, useState, type FormEvent } from "react";

interface HomeChatProps {
  username: string;
  onUsernameChange: (username: string) => void;
}

interface ChatMessage {
  id: string;
  username: string;
  text: string;
  createdAt: string;
}

function formatChatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "time unavailable"
    : new Intl.DateTimeFormat("en-GB", {
        hour: "numeric",
        minute: "2-digit",
      }).format(date);
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

function HomeChat({ username, onUsernameChange }: HomeChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connectionState, setConnectionState] = useState<
    "connecting" | "connected" | "reconnecting"
  >("connecting");
  const [connectionError, setConnectionError] = useState("");
  const [text, setText] = useState("");
  const [formError, setFormError] = useState("");
  const [isSending, setIsSending] = useState(false);
  const messagesRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const eventSource = new EventSource("/api/chat/events");
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
        if (!isChatMessage(message)) {
          throw new Error("The chat server sent an invalid message.");
        }
        setMessages((current) =>
          current.some((existing) => existing.id === message.id)
            ? current
            : [...current, message].slice(-200),
        );
        setConnectionError("");
      } catch (error) {
        console.error("Could not read chat message:", error);
        setConnectionError("Could not read a message from the chat server.");
      }
    });

    return () => eventSource.close();
  }, []);

  useEffect(() => {
    const list = messagesRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages.length]);

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = username.trim();
    const message = text.trim();

    if (!name) {
      setFormError("Choose a username before sending a message.");
      return;
    }
    if (!message) {
      setFormError("Write a message before sending.");
      return;
    }

    setIsSending(true);
    setFormError("");
    try {
      const response = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: name, text: message }),
      });
      if (!response.ok) {
        const result: unknown = await response.json().catch(() => null);
        const serverMessage =
          isRecord(result) && typeof result.error === "string"
            ? result.error
            : `The chat server returned HTTP ${response.status}.`;
        throw new Error(serverMessage);
      }
      setText("");
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
      <p className="feature-description">
        Message your housemates in real time. No accounts, just a username.
      </p>

      <label className="chat-username field-label">
        YOUR USERNAME
        <input
          value={username}
          onChange={(event) => onUsernameChange(event.target.value)}
          placeholder="e.g. Sam"
          maxLength={30}
          autoComplete="nickname"
        />
      </label>

      {connectionError && <p className="chat-server-error" role="alert">{connectionError}</p>}

      <ol
        className="chat-messages"
        aria-label="House chat messages"
        aria-live="polite"
        ref={messagesRef}
      >
        {messages.length === 0 ? (
          <li className="chat-empty">No messages yet. Start the conversation.</li>
        ) : messages.slice(-40).map((message) => (
          <li
            className={`chat-message${message.username === username.trim() ? " chat-message-own" : ""}`}
            key={message.id}
          >
            <div className="chat-message-heading">
              <strong>{message.username}</strong>
              <time dateTime={message.createdAt}>{formatChatTime(message.createdAt)}</time>
            </div>
            <p>{message.text}</p>
          </li>
        ))}
      </ol>
      {messages.length > 40 && (
        <p className="chat-history-note">Showing the most recent 40 messages.</p>
      )}

      <form className="chat-form" onSubmit={handleSend}>
        <label className="field-label" htmlFor="chat-message">MESSAGE</label>
        <textarea
          id="chat-message"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="What does the house need to know?"
          maxLength={500}
          rows={3}
          disabled={isSending}
        />
        {formError && <p className="form-error" role="alert">{formError}</p>}
        <div className="chat-form-footer">
          <span>{text.length}/500</span>
          <button className="add-chore-button" type="submit" disabled={isSending}>
            {isSending ? "SENDING…" : "SEND"} <span aria-hidden="true">↗</span>
          </button>
        </div>
      </form>
      <p className="chat-local-note">
        Messages are shared live with everyone connected to this home network.
      </p>
    </section>
  );
}

export default HomeChat;
