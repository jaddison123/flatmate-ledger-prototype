import type { SyncStatus } from "../hooks/useHouseholdData";

interface TopBarProps {
  /** Text in the status pill (already upper-case). */
  label: string;
  /** Connection state shown by the pill's dot; omit when not in a house. */
  status?: SyncStatus;
  darkMode: boolean;
  onToggleTheme: () => void;
  /** Which way the house is shown; omit to hide the switch (e.g. on the start screen). */
  view?: "flat" | "list";
  onToggleView?: () => void;
}

const STATUS_TITLES: Record<SyncStatus, string> = {
  connecting: "Connecting to your house…",
  live: "Live: changes are shared with your housemates",
  reconnecting: "Offline: trying to reconnect",
  missing: "House not found",
};

function TopBar({ label, status, darkMode, onToggleTheme, view, onToggleView }: TopBarProps) {
  return (
    <header className="topbar">
      <a className="brand" href="/" aria-label="Chore Score home">
        <span className="brand-mark" aria-hidden="true">
          C<span>S</span>
        </span>
        <span className="brand-name">
          CHORE<span>SCORE</span>
        </span>
      </a>
      <div className="topbar-actions">
        <span className="status-pill" title={status ? STATUS_TITLES[status] : undefined}>
          <span className={`status-dot${status ? ` status-${status}` : ""}`} />
          <span className="status-pill-name">{label}</span>
          {status && <span className="visually-hidden">{STATUS_TITLES[status]}</span>}
        </span>
        {view && onToggleView && (
          <button
            className="theme-toggle view-toggle"
            type="button"
            onClick={onToggleView}
            aria-label={view === "flat" ? "Show as a list" : "Show as a 3D flat"}
            title={view === "flat" ? "Show as a list" : "Show as a 3D flat"}
          >
            <span aria-hidden="true">{view === "flat" ? "☰" : "⌂"}</span>
            <span>{view === "flat" ? "LIST" : "FLAT"}</span>
          </button>
        )}
        <button
          className="theme-toggle"
          type="button"
          onClick={onToggleTheme}
          aria-label={`Switch to ${darkMode ? "light (daytime)" : "dark (night-time)"} mode`}
          aria-pressed={darkMode}
        >
          <span aria-hidden="true">{darkMode ? "☼" : "◐"}</span>
          <span>{darkMode ? "DAY" : "NIGHT"}</span>
        </button>
      </div>
    </header>
  );
}

export default TopBar;
