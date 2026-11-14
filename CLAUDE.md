# Chore Score

(Formerly "Flatmate Ledger"; the repo, package name and localStorage key `flatmate-ledger:household:v1` keep the old name on purpose, so do not rename them: it would break the repo link and wipe users' saved data.)

A student-project prototype for university students sharing a rented home. It tracks chores, shared bills and notes and has a live house chat, all shared between housemates' devices through a house invite link. Dark mode is the default theme.

## Commands

- `npm run dev` — starts the Vite dev server (http://localhost:5173) **and** the chat server (port 3001) together via `dev.mjs`. Ctrl+C stops both.
- `npm run dev:client` — Vite only. `npm run chat-server` — chat server only.
- `npm run build` — `tsc -b` type-check, then Vite build into `dist/`. Run this before finishing any change; `npx tsc -b` alone is a quick check.
- There is no test suite or linter configured.

## Stack and constraints

- React 19 + TypeScript + Vite, Tailwind CSS v4 (via `@tailwindcss/vite`), plus a plain Node chat server (`server.mjs`) that uses only built-ins.
- Keep the dependency list minimal: do not add libraries for things the platform or a few lines of code can do (for example `dev.mjs` replaces `concurrently`).
- Keep code modular, clean and commented where the reason is not obvious. Match the existing style: functional components, typed props, small helper functions at the top of the file.
- Most styling is hand-written in `src/index.css` using CSS variables (`--red`, `--ink`, `--muted`, `--line`, `--paper`...). Reuse those variables so light and dark mode both work. Chat styles are prefixed `wa-`.

## Architecture

```
src/
  main.tsx                 entry point
  App.tsx                  App (theme, which house) + HouseDashboard (hero, chore board, housemates dialog with invite link)
  hooks/useHouseholdData.ts  a house's shared data, synced with the server (optimistic actions + SSE)
  lib/house.ts               house codes, invite links, per-device localStorage, apiRequest helper
  components/HouseGate.tsx   start / join a house (offers to upload old per-browser data)
  components/TopBar.tsx      logo, house name + connection dot, theme toggle
  components/BillTracker.tsx bills, equal splits, net balances
  components/Notes.tsx       small board of non-chore reminders (140 chars each, newest first)
  components/HomeChat.tsx    WhatsApp-style live chat UI (per house)
shared/household.mjs       household types (household.d.mts), validation, applyAction: used by server AND browser
server.mjs                 houses API + chat API + serves dist/ in production
storage.mjs                Upstash Redis (if env vars set) or JSON files; coalesced writes
dev.mjs                    runs vite + server together
```

### Houses and shared data
- A house has a random 12-char code (alphabet without 0/O/1/I/L); its invite link is `/h/<code>`. No accounts: the code is the only access control.
- The server is the source of truth. Household data = `roommates`, `chores`, `expenses`, `notes`, `householdName` (type `Household` in `shared/household.d.mts`). Stored per house as `{ version, createdAt, household }` under key `house:<code>`, chat under `chat:<code>` (prefixed `chore-score:` in Redis; files `server-data/house-<code>.json` locally).
- Clients never upload whole state. They send one action (`addChore`, `updateChore`, `rotateRoster`, `removeRoommate`...) to `POST /api/houses/<code>/actions` with an `actionId`. `applyAction` in `shared/household.mjs` validates and applies it; the server bumps `version` and broadcasts a `household` event `{ version, household, actionId }` on `/api/houses/<code>/events` (which sends a `snapshot` on connect).
- The browser shows pending actions on top of the last server copy and drops them when the server confirms (by `actionId`) or rejects them. Copies with a lower `version` are ignored.
- **To add a new kind of change**: add a case to `applyAction`, its type to `HouseholdAction` in `household.d.mts`, and a method in `useHouseholdData`. **To add a field**: add it to the validator and to `normalizeHousehold` with a default, so already-saved houses keep loading.
- Removals of things already gone return the same object, so the server treats them as no change.
- `removeRoommate` also unassigns their chores, server side, in one step.
- Per device (localStorage): `chore-score:house` (current code), `chore-score:chat-name`, `chore-score:theme`, `chore-score:house-cache:<code>` (last copy, shown while the server wakes). The old key `flatmate-ledger:household:v1` is only read to offer uploading pre-sharing data when creating a house (then `chore-score:legacy-imported` is set); never write or rename it.
- If a house returns 404 (wrong link, or data lost on a server without Upstash), the app goes back to the start screen and offers to recreate the house from the cached copy.

### Chores
- A chore is "complete" only if `completed` is true **and** `completedWeek` equals the current Monday-start week key, so everything resets each Monday with no timer.
- "Rotate the roster" moves each assigned chore to the next housemate and resets it. Removing a housemate unassigns their chores.

### Bills
- Money is held in pence (integers) when splitting; leftover pennies go to the first people selected. Display currency is GBP.
- Balance = amount paid minus the person's share, summed over all bills. Only net balances are shown; there is no settle-up feature yet.

### House chat
- Each house has its own chat. `HomeChat.tsx` subscribes to `/api/houses/<code>/chat/events` (server-sent events) and posts to `.../chat/messages`, `.../chat/react`, `.../chat/read` and `.../chat/typing`.
- Events: `history`, `message`, `update` (reaction/read-receipt change for one message), `typing`.
- The server keeps the last 200 messages per house. Messages have optional `reactions` (`emoji -> usernames`) and `readBy`.
- In dev, Vite proxies `/api` to `127.0.0.1:3001` (`vite.config.ts`). In production `server.mjs` serves `dist/` itself (with an SPA fallback so `/h/<code>` loads the app), so one process handles everything.
- Rate limits (`rateLimitMessage` in `server.mjs`): house creation 5 per 10 min per client and 30 per hour overall; opening houses 60 per minute per client; actions 30 per 10 s per client; chat messages 5 per 10 s per client, 30 per minute per house, 120 per minute overall; 40 reactions/read/typing requests per 10 s per client. Over the limit returns HTTP 429 with a message the UI shows. The client address comes from `X-Forwarded-For`, which can be forged, hence the per-house and overall caps.
- Chat names belong to one device. Each device has a random secret in localStorage (`chore-score:member-token`), sent as `token` with every chat POST; the server keeps only its SHA-256 hash in the house's `members` (saved with the chat as `{ messages, members }`). `POST .../chat/name` claims a name (HomeChat calls it 700 ms after typing stops); sending or reacting with a name held by another device returns 409, and read/typing from a non-holder are ignored. Names match case- and space-insensitively. A name used to send or react is marked `used` and stays reserved for that device permanently (so old messages can't be impersonated); names only typed, never used, are released when the device switches name.
- Messages carry `senderId` (first 16 hex chars of the hash); HomeChat decides "my message" by `senderId`, not by name, so renaming doesn't flip whose messages look like yours.
- There are no accounts: anyone with the invite link can join under a free name. Clearing site data, or using a second device, means picking a different name.

## Deployment

Hosted as a single Render web service (free tier): build `npm install --include=dev && npm run build`, start `npm run chat-server`. Render sets `PORT`; the server then binds to `0.0.0.0`. Auto-deploys on push to `main`. The free tier sleeps when idle and its disk is temporary, so persistent data needs `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` set in Render (free Upstash Redis, reached with `fetch`, no driver dependency). Without them, every deploy/restart wipes all houses.

## Things to know
- Fonts rely on system fonts (Impact, Arial Narrow). Do not re-enable `font-feature-settings` such as `ss01` on `:root`: it garbled letters in Impact.
- `FormEvent` deprecation hints in the editor are harmless.
