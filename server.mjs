import { createServer } from "node:http";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
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

  return savedMessages.slice(-maxMessages);
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

function broadcastMessage(message) {
  for (const client of clients) {
    if (client.destroyed) {
      clients.delete(client);
      continue;
    }
    sendEvent(client, "message", message);
  }
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

function saveMessage(message) {
  const operation = writeQueue.then(async () => {
    const nextMessages = [...messages, message].slice(-maxMessages);
    await mkdir(dirname(storageFile), { recursive: true });
    const temporaryFile = `${storageFile}.tmp`;
    await writeFile(temporaryFile, JSON.stringify(nextMessages, null, 2), "utf8");
    await rename(temporaryFile, storageFile);
    messages = nextMessages;
  });

  writeQueue = operation.catch((error) => {
    console.error("Could not save chat message:", error);
  });
  return operation;
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

    const message = {
      id: randomUUID(),
      username,
      text,
      createdAt: new Date().toISOString(),
    };

    await saveMessage(message);
    broadcastMessage(message);
    sendJson(response, 201, { message });
    return;
  }

  sendJson(response, 404, { error: "Not found." });
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

  const port = Number(process.env.CHAT_PORT ?? 3001);
  const host = process.env.CHAT_HOST ?? "127.0.0.1";
  server.listen(port, host, () => {
    console.log(`House chat server listening on http://${host}:${port}`);
    console.log(`Saved chat messages: ${storageFile}`);
  });
}

start().catch((error) => {
  console.error("Could not start the chat server:", error);
  process.exitCode = 1;
});
