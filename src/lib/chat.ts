// Sending to a house's chat. Used by the chat panel (HomeChat) and by the 3D flat's say box,
// so a message typed in either goes through the same checks and shows up in both.
import { readMemberToken } from "./house";

/** Every chat request carries this device's key, which proves it owns the name it uses. */
const memberToken = readMemberToken();

export const chatApi = (houseCode: string) => `/api/houses/${houseCode}/chat`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Small POST helper; chat extras (react/read/typing) fail quietly where they are used. */
export function postChat(path: string, body: Record<string, unknown>): Promise<Response> {
  return fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, token: memberToken }),
  });
}

/** The `token` for requests that go through `apiRequest` (claiming a name). */
export function chatToken(): string {
  return memberToken;
}

/**
 * Sends a message. `roommateId` says which housemate is talking (for the flat's speech
 * bubbles). Resolves to the saved message (unknown shape: the caller checks it); throws an Error
 * with the server's explanation (name taken, too fast...) if it was refused.
 */
export async function sendChatMessage(
  houseCode: string,
  message: { username: string; text: string; roommateId?: string | null },
): Promise<unknown> {
  const response = await postChat(`${chatApi(houseCode)}/messages`, {
    username: message.username,
    text: message.text,
    ...(message.roommateId ? { roommateId: message.roommateId } : {}),
  });
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      isRecord(result) && typeof result.error === "string"
        ? result.error
        : `The chat server returned HTTP ${response.status}.`,
    );
  }
  return isRecord(result) ? result.message : null;
}

/** Tells the house this person is typing (best-effort; ignored unless they hold the name). */
export function sendTyping(houseCode: string, username: string, roommateId?: string | null): void {
  postChat(`${chatApi(houseCode)}/typing`, { username, ...(roommateId ? { roommateId } : {}) }).catch(() => undefined);
}

/** Names as the chat compares them: case- and space-insensitive. */
export function sameName(a: string, b: string): boolean {
  const norm = (text: string) => text.toLowerCase().replace(/\s+/g, "");
  return norm(a) === norm(b);
}
