import { useState, type FormEvent } from "react";
import type { ChatMessage } from "../hooks/useHouseholdData";

interface HomeChatProps {
  username: string;
  messages: ChatMessage[];
  onUsernameChange: (username: string) => void;
  onSend: (username: string, text: string) => void;
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

function HomeChat({
  username,
  messages,
  onUsernameChange,
  onSend,
}: HomeChatProps) {
  const [text, setText] = useState("");
  const [formError, setFormError] = useState("");

  function handleSend(event: FormEvent<HTMLFormElement>) {
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

    onSend(name, message);
    setText("");
    setFormError("");
  }

  return (
    <section className="feature-panel chat-panel" aria-labelledby="chat-heading">
      <div className="feature-heading">
        <div>
          <p className="eyebrow"><span>✳</span> THE HOUSE CHAT</p>
          <h2 id="chat-heading">Quick messages<span className="heading-period">.</span></h2>
        </div>
      </div>
      <p className="feature-description">
        Leave a note for the house. No accounts, just a username.
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

      <ol className="chat-messages" aria-label="House chat messages" aria-live="polite">
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
        />
        {formError && <p className="form-error" role="alert">{formError}</p>}
        <div className="chat-form-footer">
          <span>{text.length}/500</span>
          <button className="add-chore-button" type="submit">SEND <span aria-hidden="true">↗</span></button>
        </div>
      </form>
      <p className="chat-local-note">Messages are saved in this browser only.</p>
    </section>
  );
}

export default HomeChat;
