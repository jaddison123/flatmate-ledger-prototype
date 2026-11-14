// Where the server saves each house's data and chat. Two interchangeable back ends:
//
// - Upstash Redis, used when UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set.
//   It is reached over plain HTTPS with fetch, so no database driver is needed. Use this on
//   Render: the free tier's disk is wiped on every deploy and restart.
// - JSON files in server-data/ (or DATA_DIR) otherwise. Fine for local development.
//
// Both offer get(key) -> value | null and save(key, value). Values are JSON-serialisable.
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

function createFileBackend(directory) {
  // Keys are only ever built from fixed prefixes and validated house codes ("house:ABC...").
  const fileFor = (key) => resolve(directory, `${key.replaceAll(":", "-")}.json`);
  return {
    description: `JSON files in ${directory}`,
    async get(key) {
      try {
        return JSON.parse(await readFile(fileFor(key), "utf8"));
      } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
      }
    },
    async set(key, value) {
      const file = fileFor(key);
      await mkdir(dirname(file), { recursive: true });
      // Write then rename, so a crash mid-write never leaves a half-written file.
      await writeFile(`${file}.tmp`, JSON.stringify(value), "utf8");
      await rename(`${file}.tmp`, file);
    },
  };
}

function createUpstashBackend(url, token) {
  // Upstash's REST API takes a Redis command as a JSON array, e.g. ["GET", "house:ABC"].
  async function command(args) {
    const response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.error) {
      throw new Error(`Upstash ${args[0]} failed: ${result.error ?? `HTTP ${response.status}`}`);
    }
    return result.result;
  }
  return {
    description: `Upstash Redis at ${new URL(url).host}`,
    async get(key) {
      const raw = await command(["GET", `chore-score:${key}`]);
      return raw === null || raw === undefined ? null : JSON.parse(raw);
    },
    async set(key, value) {
      await command(["SET", `chore-score:${key}`, JSON.stringify(value)]);
    },
  };
}

export function createStore(projectDirectory) {
  const { UPSTASH_REDIS_REST_URL: url, UPSTASH_REDIS_REST_TOKEN: token, DATA_DIR } = process.env;
  const backend = url && token
    ? createUpstashBackend(url, token)
    : createFileBackend(resolve(projectDirectory, DATA_DIR ?? "server-data"));

  // Saves are coalesced per key: while one write is in flight, later saves just replace the value
  // waiting to be written, so a burst of changes becomes at most two writes.
  const writers = new Map(); // key -> { latest, dirty, done }

  async function runWrites(key, entry) {
    try {
      while (entry.dirty) {
        entry.dirty = false;
        await backend.set(key, entry.latest);
      }
    } finally {
      writers.delete(key);
    }
  }

  return {
    description: backend.description,
    get: (key) => backend.get(key),
    /** Resolves once a write containing this value (or a newer one) has finished. */
    save(key, value) {
      const existing = writers.get(key);
      if (existing) {
        existing.latest = value;
        existing.dirty = true;
        return existing.done;
      }
      const entry = { latest: value, dirty: true, done: null };
      writers.set(key, entry);
      entry.done = runWrites(key, entry);
      return entry.done;
    },
  };
}
