# Flatmate Ledger & Chore Tracker

A student-project prototype for university students sharing a rented home. It tracks chores, shared bills and has a live house chat. Dark mode is the default theme.

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
  App.tsx                  page layout, hero + house name, chore board, housemates dialog
  hooks/useHouseholdData.ts  all household state, persisted to localStorage
  components/BillTracker.tsx bills, equal splits, net balances
  components/HomeChat.tsx    WhatsApp-style live chat UI
server.mjs                 chat API + serves dist/ in production
dev.mjs                    runs vite + chat server together
```

### Household data (browser only)
`useHouseholdData` holds `roommates`, `chores`, `expenses`, `chatUsername` and `householdName` under the localStorage key `flatmate-ledger:household:v1`. Stored data is validated with type guards on load; invalid data resets to empty and sets `storageError`. When adding a field, make it optional in the stored type and default it on read so existing saved data keeps working (see how `householdName` was added).

### Chores
- A chore is "complete" only if `completed` is true **and** `completedWeek` equals the current Monday-start week key, so everything resets each Monday with no timer.
- "Rotate the roster" moves each assigned chore to the next housemate and resets it. Removing a housemate unassigns their chores.

### Bills
- Money is held in pence (integers) when splitting; leftover pennies go to the first people selected. Display currency is GBP.
- Balance = amount paid minus the person's share, summed over all bills. Only net balances are shown; there is no settle-up feature yet.

### House chat
- `HomeChat.tsx` subscribes to `/api/chat/events` (server-sent events) and posts to `/api/chat/messages`, `/api/chat/react`, `/api/chat/read` and `/api/chat/typing`.
- Events: `history`, `message`, `update` (reaction/read-receipt change for one message), `typing`.
- The server keeps the last 200 messages in `server-data/chat-messages.json` (git-ignored). Messages have optional `reactions` (`emoji -> usernames`) and `readBy`.
- In dev, Vite proxies `/api/chat` to `127.0.0.1:3001` (`vite.config.ts`). In production `server.mjs` serves `dist/` itself, so one process handles site and chat.
- There is no authentication: anyone with the link can post under any name. Known limitation, fine for the prototype.

## Deployment

Hosted as a single Render web service (free tier): build `npm install --include=dev && npm run build`, start `npm run chat-server`. Render sets `PORT`; the server then binds to `0.0.0.0`. Auto-deploys on push to `main`. The free tier sleeps when idle and its disk is temporary, so chat history can reset.

## Things to know

- Chores, bills, housemates and the house name live in each browser's localStorage and are **not** shared between devices. Only chat is shared.
- Fonts rely on system fonts (Impact, Arial Narrow). Do not re-enable `font-feature-settings` such as `ss01` on `:root`: it garbled letters in Impact.
- `FormEvent` deprecation hints in the editor are harmless.
