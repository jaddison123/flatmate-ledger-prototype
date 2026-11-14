// Which house this browser is in, invite links, and small helpers for talking to the server.
import { hasHouseholdContent, normalizeHousehold, type Household } from "../../shared/household.mjs";

const HOUSE_KEY = "chore-score:house";
const CHAT_NAME_KEY = "chore-score:chat-name";
/** Where everything was stored before houses were shared. Kept (never renamed) for the upload offer. */
const LEGACY_KEY = "flatmate-ledger:household:v1";
const LEGACY_IMPORTED_KEY = "chore-score:legacy-imported";
const CODE_PATTERN = /^[2-9A-HJKMNP-Z]{12}$/;

// localStorage can throw (private windows, blocked storage); every access goes through these.
function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* not remembered on this device; everything else still works */
  }
}

/**
 * Pulls a house code out of whatever the user pasted: the code itself (any case, spaces or
 * dashes allowed) or a full invite link ending in /h/<code>.
 */
export function parseHouseCode(input: string): string | null {
  const fromLink = /\/h\/([A-Za-z0-9-]+)/.exec(input)?.[1] ?? input;
  const code = fromLink.replace(/[\s-]/g, "").toUpperCase();
  return CODE_PATTERN.test(code) ? code : null;
}

/** The house in the address bar (/h/<code>), if any. */
export function houseCodeFromUrl(): string | null {
  const match = /^\/h\/([^/]+)\/?$/.exec(window.location.pathname);
  return match ? parseHouseCode(match[1]) : null;
}

export function readSavedHouseCode(): string | null {
  const saved = readStorage(HOUSE_KEY);
  return saved ? parseHouseCode(saved) : null;
}

/** Remembers the house on this device and puts its invite link in the address bar. */
export function enterHouse(code: string): void {
  writeStorage(HOUSE_KEY, code);
  if (houseCodeFromUrl() !== code) window.history.replaceState(null, "", `/h/${code}`);
}

/** Forgets the house on this device only; the house and its data stay on the server. */
export function leaveHouse(): void {
  writeStorage(HOUSE_KEY, null);
  window.history.replaceState(null, "", "/");
}

export function inviteLink(code: string): string {
  return `${window.location.origin}/h/${code}`;
}

/** 12 characters shown in groups of four so they are easier to read out. */
export function formatHouseCode(code: string): string {
  return code.match(/.{1,4}/g)?.join("-") ?? code;
}

/** Data this browser saved before sharing existed, if there is any left to upload. */
export function readLegacyHousehold(): Household | null {
  if (readStorage(LEGACY_IMPORTED_KEY)) return null;
  try {
    const raw = readStorage(LEGACY_KEY);
    const household = raw ? normalizeHousehold(JSON.parse(raw)) : null;
    return household && hasHouseholdContent(household) ? household : null;
  } catch {
    return null;
  }
}

/** Stops offering the old data once it has been uploaded, so it is not copied into two houses. */
export function markLegacyImported(): void {
  writeStorage(LEGACY_IMPORTED_KEY, new Date().toISOString());
}

/** Your chat name stays on this device (it was part of the old per-browser data). */
export function readChatName(): string {
  const saved = readStorage(CHAT_NAME_KEY);
  if (saved !== null) return saved;
  try {
    const legacy: unknown = JSON.parse(readStorage(LEGACY_KEY) ?? "null");
    if (typeof legacy === "object" && legacy !== null && "chatUsername" in legacy) {
      return typeof legacy.chatUsername === "string" ? legacy.chatUsername : "";
    }
  } catch {
    /* fall through */
  }
  return "";
}

export function saveChatName(name: string): void {
  writeStorage(CHAT_NAME_KEY, name);
}

/** Last copy of a house seen on this device, shown instantly while the server wakes up. */
export function readHouseCache(code: string): { version: number; household: Household } | null {
  try {
    const parsed: unknown = JSON.parse(readStorage(`chore-score:house-cache:${code}`) ?? "null");
    if (typeof parsed !== "object" || parsed === null) return null;
    const { version, household } = parsed as { version?: unknown; household?: unknown };
    const clean = normalizeHousehold(household);
    return typeof version === "number" && clean ? { version, household: clean } : null;
  } catch {
    return null;
  }
}

export function writeHouseCache(code: string, value: { version: number; household: Household }): void {
  writeStorage(`chore-score:house-cache:${code}`, JSON.stringify(value));
}

/** Error carrying the HTTP status, so callers can tell "no such house" (404) apart. */
export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** fetch + JSON with the server's error message surfaced as an ApiError. */
export async function apiRequest<T>(path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, body === undefined
      ? { cache: "no-store" }
      : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new ApiError(0, "Could not reach the server. Check your connection.");
  }
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof result === "object" && result !== null && "error" in result &&
      typeof result.error === "string"
      ? result.error
      : `The server returned HTTP ${response.status}.`;
    throw new ApiError(response.status, message);
  }
  return result as T;
}
