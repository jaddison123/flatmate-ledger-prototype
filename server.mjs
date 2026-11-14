import { createServer } from "node:http";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const projectDirectory = dirname(fileURLToPath(import.meta.url));
const storageFile = process.env.CHAT_DATA_FILE
  ? resolve(projectDirectory, process.env.CHAT_DATA_FILE)
  : resolve(projectDirectory, "server-data", "chat-messages.json");
const maxMessages = 200;
const maxBodyBytes = 16_384;
const clients = new Set();
let messages = [];
let writeQueue = Promise.resolve();

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

async function loadMessages() {
  let contents;
  try {
    contents = await readFile(storageFile, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }

  let savedMessages;
  try {
    savedMessages = JSON.parse(contents);
  } catch (error) {
    throw new Error(`Could not parse saved chat messages at ${storageFile}.`, {
      cause: error,
    });
  }

  if (!Array.isArray(savedMessages) || !savedMessages.every(isChatMessage)) {
    throw new Error(`Saved chat messages at ${storageFile} have an invalid format.`);
  }

  return savedMessages.slice(-maxMessages).map(withExtras);
}

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

async function readRequestJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBodyBytes) {
      const error = new Error("Request body is too large.");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.status = 400;
    throw error;
  }
}

// Messages carry optional `reactions` ({ emoji: [usernames] }) and `readBy` ([usernames]).
function withExtras(message) {
  return { reactions: {}, readBy: [], ...message };
}

function broadcastEvent(eventName, value) {
  for (const client of clients) {
    if (client.destroyed) clients.delete(client);
    else sendEvent(client, eventName, value);
  }
}

// Write the full message list to disk (atomically) and keep it in memory.
function persistMessages(nextMessages) {
  const operation = writeQueue.then(async () => {
    await mkdir(dirname(storageFile), { recursive: true });
    const temporaryFile = `${storageFile}.tmp`;
    await writeFile(temporaryFile, JSON.stringify(nextMessages, null, 2), "utf8");
    await rename(temporaryFile, storageFile);
    messages = nextMessages;
  });
  writeQueue = operation.catch((error) => {
    console.error("Could not save chat messages:", error);
  });
  return operation;
}

function cleanUsername(value) {
  const name = typeof value === "string" ? value.trim() : "";
  return name.length >= 1 && name.length <= 30 ? name : "";
}

async function handleRequest(request, response) {
  const requestUrl = new URL(request.url ?? "/", "http://localhost");

  if (request.method === "GET" && requestUrl.pathname === "/api/chat/events") {
    response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    response.flushHeaders();
    clients.add(response);
    sendEvent(response, "history", messages);
    response.on("close", () => clients.delete(response));
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/chat/messages") {
    const body = await readRequestJson(request);
    const username = isRecord(body) && typeof body.username === "string"
      ? body.username.trim()
      : "";
    const text = isRecord(body) && typeof body.text === "string"
      ? body.text.trim()
      : "";

    if (username.length === 0 || username.length > 30) {
      sendJson(response, 400, { error: "Username must be between 1 and 30 characters." });
      return;
    }
    if (text.length === 0 || text.length > 500) {
      sendJson(response, 400, { error: "Message must be between 1 and 500 characters." });
      return;
    }

    const message = withExtras({
      id: randomUUID(),
      username,
      text,
      createdAt: new Date().toISOString(),
      readBy: [username],
    });

    await persistMessages([...messages, message].slice(-maxMessages));
    broadcastEvent("message", message);
    sendJson(response, 201, { message });
    return;
  }

  // Toggle an emoji reaction: POST /api/chat/react { id, username, emoji }
  if (request.method === "POST" && requestUrl.pathname === "/api/chat/react") {
    const body = await readRequestJson(request);
    const username = cleanUsername(isRecord(body) ? body.username : "");
    const emoji = isRecord(body) && typeof body.emoji === "string" ? body.emoji : "";
    const id = isRecord(body) && typeof body.id === "string" ? body.id : "";
    if (!username || !emoji || emoji.length > 16) {
      sendJson(response, 400, { error: "A username and a short emoji are required." });
      return;
    }
    const target = messages.find((message) => message.id === id);
    if (!target) {
      sendJson(response, 404, { error: "Message not found." });
      return;
    }
    const reactions = { ...target.reactions };
    const users = reactions[emoji] ?? [];
    const next = users.includes(username)
      ? users.filter((user) => user !== username)
      : [...users, username];
    if (next.length > 0) reactions[emoji] = next;
    else delete reactions[emoji];
    const updated = { ...target, reactions };
    await persistMessages(messages.map((message) => (message.id === id ? updated : message)));
    broadcastEvent("update", updated);
    sendJson(response, 200, { message: updated });
    return;
  }

  // Mark messages as read: POST /api/chat/read { username }
  if (request.method === "POST" && requestUrl.pathname === "/api/chat/read") {
    const body = await readRequestJson(request);
    const username = cleanUsername(isRecord(body) ? body.username : "");
    if (!username) {
      sendJson(response, 400, { error: "A username is required." });
      return;
    }
    const changed = [];
    const nextMessages = messages.map((message) => {
      if (message.readBy.includes(username)) return message;
      const updated = { ...message, readBy: [...message.readBy, username] };
      changed.push(updated);
      return updated;
    });
    if (changed.length > 0) {
      await persistMessages(nextMessages);
      changed.forEach((message) => broadcastEvent("update", message));
    }
    sendJson(response, 200, { updated: changed.length });
    return;
  }

  // Typing indicator: POST /api/chat/typing { username } (not persisted)
  if (request.method === "POST" && requestUrl.pathname === "/api/chat/typing") {
    const body = await readRequestJson(request);
    const username = cleanUsername(isRecord(body) ? body.username : "");
    if (username) broadcastEvent("typing", { username });
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "GET" && !requestUrl.pathname.startsWith("/api/")) {
    if (await serveStatic(requestUrl.pathname, response)) return;
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
    // Single-page app fallback: unknown paths without an extension get index.html.
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

async function start() {
  messages = await loadMessages();

  const server = createServer((request, response) => {
    handleRequest(request, response).catch((error) => {
      if (response.headersSent) {
        response.destroy(error);
        return;
      }

      const status = Number.isInteger(error.status) ? error.status : 500;
      if (status === 500) console.error("Chat request failed:", error);
      sendJson(response, status, {
        error: status === 500 ? "The chat server could not complete the request." : error.message,
      });
    });
  });
  // Keep-alive comment so proxies (e.g. Render) do not close idle event streams.
  const heartbeat = setInterval(() => {
    for (const client of clients) {
      if (client.destroyed) {
        clients.delete(client);
      } else {
        client.write(": keep-alive\n\n");
      }
    }
  }, 20_000);
  heartbeat.unref();

  // Hosting platforms (Render etc.) set PORT and need the server reachable from outside.
  const port = Number(process.env.PORT ?? process.env.CHAT_PORT ?? 3001);
  const host = process.env.CHAT_HOST ?? (process.env.PORT ? "0.0.0.0" : "127.0.0.1");
  server.listen(port, host, () => {
    console.log(`House chat server listening on http://${host}:${port}`);
    console.log(`Saved chat messages: ${storageFile}`);
  });
}

start().catch((error) => {
  console.error("Could not start the chat server:", error);
  process.exitCode = 1;
});
