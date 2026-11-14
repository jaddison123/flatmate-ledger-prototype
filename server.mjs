// Chore Score server (Node built-ins only). Holds every house's shared data and chat, pushes
// changes live over server-sent events, and in production also serves the built site (dist/).
//
// Each house has a random code (its invite link is /h/<code>). Anyone with the code can see and
// change that house; there are no accounts.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomInt, randomUUID } from "node:crypto";
import { createStore } from "./storage.mjs";
import { ActionError, applyAction, emptyHousehold, normalizeHousehold } from "./shared/household.mjs";

const projectDirectory = dirname(fileURLToPath(import.meta.url));
const store = createStore(projectDirectory);
const maxMessages = 200;
const maxBodyBytes = 16_384;
const maxUploadBytes = 512 * 1024; // creating a house can upload a browser's existing data
const allStreams = new Set(); // every open event stream, for the keep-alive heartbeat

function isRecord(value) {
  return typeof value === "object" && value !== null;
}

function isChatMessage(value) {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.username === "string" &&
    typeof value.text === "string" &&
    typeof value.createdAt === "string"
  );
}

// Messages carry optional `reactions` ({ emoji: [usernames] }) and `readBy` ([usernames]).
function withExtras(message) {
  return { reactions: {}, readBy: [], ...message };
}

function cleanUsername(value) {
  const name = typeof value === "string" ? value.trim() : "";
  return name.length >= 1 && name.length <= 30 ? name : "";
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

// ---- Houses ----------------------------------------------------------------------------

// 12 characters from 31 easy-to-read symbols (no 0/O or 1/I/L): about 59 bits, so codes
// cannot realistically be guessed.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_PATTERN = /^[2-9A-HJKMNP-Z]{12}$/;

function newHouseCode() {
  let code = "";
  for (let i = 0; i < 12; i += 1) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

const houseKey = (code) => `house:${code}`;
const chatKey = (code) => `chat:${code}`;

// code -> Promise<House | null>. A House is
// { code, version, createdAt, household, messages, members, streams: Set, chatStreams: Set }.
// `version` goes up by one with every change so browsers can ignore out-of-date updates.
const houses = new Map();

async function loadHouse(code) {
  const [saved, savedChat] = await Promise.all([
    store.get(houseKey(code)),
    store.get(chatKey(code)),
  ]);
  if (saved === null) return null;
  const household = isRecord(saved) ? normalizeHousehold(saved.household) : null;
  if (!household || !Number.isInteger(saved.version)) {
    throw new Error(`Saved data for house ${code} has an invalid format.`);
  }
  // The chat used to be saved as a bare array of messages; now it is { messages, members }.
  const savedMessages = Array.isArray(savedChat) ? savedChat : isRecord(savedChat) ? savedChat.messages : [];
  const messages = Array.isArray(savedMessages)
    ? savedMessages.filter(isChatMessage).slice(-maxMessages).map(withExtras)
    : [];
  return {
    code,
    version: saved.version,
    createdAt: typeof saved.createdAt === "string" ? saved.createdAt : new Date().toISOString(),
    household,
    messages,
    members: loadMembers(isRecord(savedChat) ? savedChat.members : undefined),
    streams: new Set(),
    chatStreams: new Set(),
  };
}

// ---- Chat names ------------------------------------------------------------------------
//
// To stop people posting as someone else, each chat name belongs to one device. A device has a
// random secret `token` (kept in its localStorage); the server stores only its SHA-256 hash.
// The first device to use a name claims it; other devices get a 409 until it is released
// (a device holds one name at a time, so renaming releases the old one).
// Messages also carry `senderId`, a short public id derived from the hash, so a browser can
// tell its own messages apart even from someone who later takes over an old name.

const maxMembers = 60;

function loadMembers(value) {
  const members = {};
  if (!isRecord(value)) return members;
  for (const [key, member] of Object.entries(value)) {
    if (isRecord(member) && typeof member.name === "string" && typeof member.hash === "string") {
      members[key] = { name: member.name, hash: member.hash };
    }
  }
  return members;
}

/** Names are compared ignoring case and repeated spaces, so "Jude 1" and "jude  1" are the same. */
function nameKey(name) {
  return name.toLowerCase().replace(/\s+/g, " ");
}

/** Hashes the device token from a request body; throws 400 if it is missing or malformed. */
function memberHash(body) {
  const token = isRecord(body) && typeof body.token === "string" ? body.token : "";
  if (token.length < 20 || token.length > 100) throw httpError(400, "This device's chat key is missing. Reload the page.");
  return createHash("sha256").update(token).digest("hex");
}

const senderIdFor = (hash) => hash.slice(0, 16);

function holdsName(house, name, hash) {
  return house.members[nameKey(name)]?.hash === hash;
}

/**
 * Gives `name` to the device with `hash` (releasing any other name it held). Throws 409 if
 * another device holds it. Returns true if anything changed (so the caller saves).
 */
function claimName(house, name, hash) {
  const key = nameKey(name);
  const holder = house.members[key];
  if (holder && holder.hash !== hash) {
    throw httpError(409, `“${holder.name}” is already used by someone else in this house. Pick another name.`);
  }
  if (holder && holder.name === name) return false;
  if (!holder && Object.keys(house.members).length >= maxMembers) {
    throw httpError(409, "This house has too many chat names. Ask someone to free one up.");
  }
  for (const [otherKey, member] of Object.entries(house.members)) {
    if (member.hash === hash && otherKey !== key) delete house.members[otherKey];
  }
  house.members[key] = { name, hash };
  return true;
}

/** Loads a house once and keeps it in memory; resolves to null if it does not exist. */
function getHouse(code) {
  if (!CODE_PATTERN.test(code)) return Promise.resolve(null);
  let pending = houses.get(code);
  if (!pending) {
    pending = loadHouse(code);
    houses.set(code, pending);
    // Forget "not found" and failed loads so a later request can try again.
    const forget = () => {
      if (houses.get(code) === pending) houses.delete(code);
    };
    pending.then((house) => house || forget(), forget);
  }
  return pending;
}

function saveHouse(house) {
  return store.save(houseKey(house.code), {
    version: house.version,
    createdAt: house.createdAt,
    household: house.household,
  });
}

function saveChat(house) {
  return store.save(chatKey(house.code), { messages: house.messages, members: house.members });
}

function householdSnapshot(house, actionId) {
  return { version: house.version, household: house.household, ...(actionId ? { actionId } : {}) };
}

// ---- HTTP helpers ----------------------------------------------------------------------

function sendJson(response, status, value) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(value));
}

function sendEvent(response, eventName, value) {
  response.write(`event: ${eventName}\ndata: ${JSON.stringify(value)}\n\n`);
}

function broadcastEvent(streams, eventName, value) {
  for (const stream of streams) {
    if (stream.destroyed) streams.delete(stream);
    else sendEvent(stream, eventName, value);
  }
}

/** Starts a server-sent events stream and registers it in `streams` until it closes. */
function openEventStream(response, streams) {
  response.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  response.flushHeaders();
  streams.add(response);
  allStreams.add(response);
  response.on("close", () => {
    streams.delete(response);
    allStreams.delete(response);
  });
}

async function readRequestJson(request, limit = maxBodyBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw httpError(413, "Request body is too large.");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw httpError(400, "Request body must be valid JSON.");
  }
}

// ---- Rate limiting (in memory, sliding window) so a public server cannot be spammed -------

const requestHits = new Map(); // key -> timestamps (ms) of recent requests
const longestWindowMs = 60 * 60_000;

// Returns true if the request is allowed, and records it.
function allow(key, limit, windowMs) {
  const now = Date.now();
  const recent = (requestHits.get(key) ?? []).filter((time) => now - time < windowMs);
  if (recent.length >= limit) {
    requestHits.set(key, recent);
    return false;
  }
  recent.push(now);
  requestHits.set(key, recent);
  return true;
}

// Behind a host's proxy (Render) the real address is in X-Forwarded-For. That header can be
// forged, so per-house and overall caps back up the per-client limits.
function clientAddress(request) {
  const forwarded = request.headers["x-forwarded-for"];
  const first = typeof forwarded === "string" ? forwarded.split(",")[0].trim() : "";
  return first || request.socket.remoteAddress || "unknown";
}

function tooManyRequests(response, message) {
  response.writeHead(429, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Retry-After": "10",
  });
  response.end(JSON.stringify({ error: message }));
}

/** Returns an error message if this request is over a limit, otherwise null. */
function rateLimitMessage(method, route, client, code) {
  if (route === "create") {
    if (!allow(`create:${client}`, 5, 10 * 60_000) || !allow("all:create", 30, longestWindowMs)) {
      return "Too many houses created recently. Try again later.";
    }
  } else if (method === "GET") {
    // Opening a house (lookups and live connections).
    if (!allow(`open:${client}`, 60, 60_000)) return "Too many requests. Wait a minute and try again.";
  } else if (route === "/actions") {
    if (!allow(`act:${client}`, 30, 10_000)) return "You're making changes too fast. Slow down a little.";
  } else if (route === "/chat/messages") {
    // 5 messages per 10 seconds per person, 30 per minute per house, 120 per minute overall.
    if (
      !allow(`msg:${client}`, 5, 10_000) ||
      !allow(`msg-house:${code}`, 30, 60_000) ||
      !allow("all:msg", 120, 60_000)
    ) {
      return "You're sending messages too fast. Wait a few seconds and try again.";
    }
  } else if (!allow(`chat:${client}`, 40, 10_000)) {
    // Reactions, read receipts and typing hints get a looser limit.
    return "Too many requests. Slow down a little.";
  }
  return null;
}

// ---- Routes ----------------------------------------------------------------------------

async function createHouse(request, response) {
  const body = await readRequestJson(request, maxUploadBytes);
  let household = emptyHousehold();
  if (isRecord(body) && body.household !== undefined) {
    household = normalizeHousehold(body.household);
    if (!household) throw httpError(400, "The uploaded household data is not valid.");
  }

  let code = newHouseCode();
  while (houses.has(code) || (await store.get(houseKey(code))) !== null) code = newHouseCode();

  const house = {
    code,
    version: 1,
    createdAt: new Date().toISOString(),
    household,
    messages: [],
    members: {},
    streams: new Set(),
    chatStreams: new Set(),
  };
  await saveHouse(house);
  houses.set(code, Promise.resolve(house));
  sendJson(response, 201, { code, ...householdSnapshot(house) });
}

async function handleAction(house, request, response) {
  const body = await readRequestJson(request);
  const actionId = isRecord(body) && typeof body.actionId === "string" && body.actionId.length <= 100
    ? body.actionId
    : "";
  if (!actionId || !isRecord(body.action)) throw httpError(400, "A change needs an actionId and an action.");

  let next;
  try {
    next = applyAction(house.household, body.action);
  } catch (error) {
    if (error instanceof ActionError) throw httpError(400, error.message);
    throw error;
  }

  // Unchanged (e.g. deleting something already deleted): nothing to save or broadcast.
  if (next !== house.household) {
    house.household = next;
    house.version += 1;
    broadcastEvent(house.streams, "household", householdSnapshot(house, actionId));
    await saveHouse(house);
  }
  sendJson(response, 200, householdSnapshot(house, actionId));
}

async function handleChat(house, route, request, response) {
  // Live stream: GET .../chat/events sends `history`, then `message`, `update` and `typing`.
  if (request.method === "GET" && route === "/chat/events") {
    openEventStream(response, house.chatStreams);
    sendEvent(response, "history", house.messages);
    return true;
  }
  if (request.method !== "POST") return false;

  // Claim a chat name for this device: { name, token } -> { name, senderId }, or 409 if taken.
  if (route === "/chat/name") {
    const body = await readRequestJson(request);
    const name = cleanUsername(isRecord(body) ? body.name : "");
    if (!name) throw httpError(400, "Names must be between 1 and 30 characters.");
    const hash = memberHash(body);
    if (claimName(house, name, hash)) await saveChat(house);
    sendJson(response, 200, { name, senderId: senderIdFor(hash) });
    return true;
  }

  if (route === "/chat/messages") {
    const body = await readRequestJson(request);
    const username = cleanUsername(isRecord(body) ? body.username : "");
    const text = isRecord(body) && typeof body.text === "string" ? body.text.trim() : "";
    if (!username) throw httpError(400, "Username must be between 1 and 30 characters.");
    if (text.length === 0 || text.length > 500) {
      throw httpError(400, "Message must be between 1 and 500 characters.");
    }
    const hash = memberHash(body);
    claimName(house, username, hash); // 409 if someone else's name; saved with the message below
    const message = withExtras({
      id: randomUUID(),
      username,
      senderId: senderIdFor(hash),
      text,
      createdAt: new Date().toISOString(),
      readBy: [username],
    });
    house.messages = [...house.messages, message].slice(-maxMessages);
    broadcastEvent(house.chatStreams, "message", message);
    await saveChat(house);
    sendJson(response, 201, { message });
    return true;
  }

  // Toggle an emoji reaction: { id, username, emoji }
  if (route === "/chat/react") {
    const body = await readRequestJson(request);
    const username = cleanUsername(isRecord(body) ? body.username : "");
    const emoji = isRecord(body) && typeof body.emoji === "string" ? body.emoji : "";
    const id = isRecord(body) && typeof body.id === "string" ? body.id : "";
    if (!username || !emoji || emoji.length > 16) {
      throw httpError(400, "A username and a short emoji are required.");
    }
    const target = house.messages.find((message) => message.id === id);
    if (!target) throw httpError(404, "Message not found.");
    claimName(house, username, memberHash(body)); // saved with the reaction below
    const reactions = { ...target.reactions };
    const users = reactions[emoji] ?? [];
    const next = users.includes(username)
      ? users.filter((user) => user !== username)
      : [...users, username];
    if (next.length > 0) reactions[emoji] = next;
    else delete reactions[emoji];
    const updated = { ...target, reactions };
    house.messages = house.messages.map((message) => (message.id === id ? updated : message));
    broadcastEvent(house.chatStreams, "update", updated);
    await saveChat(house);
    sendJson(response, 200, { message: updated });
    return true;
  }

  // Mark every message as read: { username }
  if (route === "/chat/read") {
    const body = await readRequestJson(request);
    const username = cleanUsername(isRecord(body) ? body.username : "");
    if (!username) throw httpError(400, "A username is required.");
    // Only the device holding the name can mark messages read as that name; others are ignored.
    if (!holdsName(house, username, memberHash(body))) {
      sendJson(response, 200, { updated: 0 });
      return true;
    }
    const changed = [];
    house.messages = house.messages.map((message) => {
      if (message.readBy.includes(username)) return message;
      const updated = { ...message, readBy: [...message.readBy, username] };
      changed.push(updated);
      return updated;
    });
    if (changed.length > 0) {
      changed.forEach((message) => broadcastEvent(house.chatStreams, "update", message));
      await saveChat(house);
    }
    sendJson(response, 200, { updated: changed.length });
    return true;
  }

  // Typing indicator: { username } (not saved)
  if (route === "/chat/typing") {
    const body = await readRequestJson(request);
    const username = cleanUsername(isRecord(body) ? body.username : "");
    if (username && holdsName(house, username, memberHash(body))) {
      broadcastEvent(house.chatStreams, "typing", { username });
    }
    sendJson(response, 200, { ok: true });
    return true;
  }
  return false;
}

const HOUSE_ROUTE = /^\/api\/houses\/([^/]+)(\/.*)?$/;

async function handleRequest(request, response) {
  const { pathname } = new URL(request.url ?? "/", "http://localhost");
  const client = clientAddress(request);

  // Create a house: POST /api/houses { household? } -> { code, version, household }
  if (request.method === "POST" && pathname === "/api/houses") {
    const limited = rateLimitMessage("POST", "create", client, "");
    if (limited) return tooManyRequests(response, limited);
    return createHouse(request, response);
  }

  const match = HOUSE_ROUTE.exec(pathname);
  if (match && (request.method === "GET" || request.method === "POST")) {
    const code = match[1].toUpperCase();
    const route = match[2] ?? "";
    const limited = rateLimitMessage(request.method, route, client, code);
    if (limited) return tooManyRequests(response, limited);

    const house = await getHouse(code);
    if (!house) {
      return sendJson(response, 404, { error: "There is no house with that code. Check the invite link." });
    }

    // GET /api/houses/:code -> { version, household }
    if (request.method === "GET" && route === "") return sendJson(response, 200, householdSnapshot(house));

    // GET /api/houses/:code/events -> `snapshot` now, then `household` after every change.
    if (request.method === "GET" && route === "/events") {
      openEventStream(response, house.streams);
      sendEvent(response, "snapshot", householdSnapshot(house));
      return;
    }

    // POST /api/houses/:code/actions { actionId, action } -> { version, household, actionId }
    if (request.method === "POST" && route === "/actions") return handleAction(house, request, response);

    if (route.startsWith("/chat/") && (await handleChat(house, route, request, response))) return;
  }

  if (request.method === "GET" && !pathname.startsWith("/api/")) {
    if (await serveStatic(pathname, response)) return;
  }

  sendJson(response, 404, { error: "Not found." });
}

// ---- Static hosting: serves the built React app (dist/) so one service runs everything.
const distDirectory = resolve(projectDirectory, "dist");
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
};

async function serveStatic(pathname, response) {
  let relativePath;
  try {
    relativePath = decodeURIComponent(pathname);
  } catch {
    return false;
  }
  let filePath = resolve(distDirectory, "." + relativePath);
  // Block path traversal outside dist/.
  if (filePath !== distDirectory && !filePath.startsWith(distDirectory + sep)) return false;

  let body;
  try {
    body = await readFile(filePath);
  } catch {
    // Single-page app fallback: unknown paths without an extension (such as /h/<code>)
    // get index.html.
    if (extname(relativePath)) return false;
    try {
      filePath = resolve(distDirectory, "index.html");
      body = await readFile(filePath);
    } catch {
      return false; // dist/ has not been built
    }
  }
  response.writeHead(200, {
    "Content-Type": contentTypes[extname(filePath)] ?? "application/octet-stream",
  });
  response.end(body);
  return true;
}

function start() {
  const server = createServer((request, response) => {
    handleRequest(request, response).catch((error) => {
      if (response.headersSent) {
        response.destroy(error);
        return;
      }
      const status = Number.isInteger(error.status) ? error.status : 500;
      if (status === 500) console.error("Request failed:", error);
      sendJson(response, status, {
        error: status === 500 ? "The server could not complete the request." : error.message,
      });
    });
  });

  const heartbeat = setInterval(() => {
    // Keep-alive comment so proxies (e.g. Render) do not close idle event streams.
    for (const stream of allStreams) {
      if (stream.destroyed) allStreams.delete(stream);
      else stream.write(": keep-alive\n\n");
    }
    // Forget rate-limit entries older than the longest window.
    const cutoff = Date.now() - longestWindowMs;
    for (const [key, times] of requestHits) {
      if (times.length === 0 || times[times.length - 1] < cutoff) requestHits.delete(key);
    }
  }, 20_000);
  heartbeat.unref();

  // Hosting platforms (Render etc.) set PORT and need the server reachable from outside.
  const port = Number(process.env.PORT ?? process.env.CHAT_PORT ?? 3001);
  const host = process.env.CHAT_HOST ?? (process.env.PORT ? "0.0.0.0" : "127.0.0.1");
  server.listen(port, host, () => {
    console.log(`Chore Score server listening on http://${host}:${port}`);
    console.log(`Saving house data to ${store.description}`);
  });
}

start();
