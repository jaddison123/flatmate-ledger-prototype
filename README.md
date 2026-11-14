# Chore Score

A household ledger, chore tracker and live chat for university students sharing a rented home. It is a prototype built as a university project.

## Features

- **Household name:** give your house a name; it replaces the headline tagline and the top-bar label.
- **Housemates:** add and remove the people in the house.
- **Chore board:** add chores, assign them, set optional due dates, tick them off, and filter by all / to do / done. Completions reset every Monday. "Rotate the roster" passes each assigned chore to the next housemate.
- **Bill tracker:** record bills in GBP, choose who paid and who shares each bill, and see each housemate's net balance. Bills are split equally, in whole pence; leftover pennies go to the first people selected.
- **Notes:** a small board for short reminders that are not chores (for example "Landlord visiting Friday"). Add a note, remove it when it is no longer needed.
- **House chat:** a WhatsApp-style live chat with message bubbles, emoji reactions (tap a message), read ticks (grey = sent, blue = seen), a typing indicator and an emoji picker. No account is needed, only a name.
- **Dark mode** by default, with a light mode toggle.

### Where data is stored

| Data | Stored |
| --- | --- |
| Housemates, chores, bills, notes, house name, chat name | In each person's own browser (`localStorage`). Not shared between devices. |
| Chat messages, reactions, read ticks | On the chat server (`server-data/chat-messages.json`, last 200 messages). Shared live with everyone connected. |

## Getting started

```sh
npm install
npm run dev
```

Open http://localhost:5173. `npm run dev` starts the website (Vite) and the chat server together; press Ctrl+C to stop both.

On Windows, Command Prompt cannot use a UNC network path as its working directory. Run `start-dev.cmd` from the project folder instead; it uses `pushd` to map the share to a temporary drive and then runs `npm run dev`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts Vite and the chat server together (`dev.mjs`). |
| `npm run dev:client` | Starts Vite only. |
| `npm run chat-server` | Starts the chat server only. Also serves the built site from `dist/` if it exists. |
| `npm run build` | Type-checks the app and builds it into `dist/`. |
| `npm run preview` | Serves the production build with Vite's preview server. |

Tailwind CSS v4 is set up through the Vite plugin. Most styling is in `src/index.css`, using CSS variables for the light and dark themes.

## Project structure

```
src/
  main.tsx                    entry point
  App.tsx                     layout, hero and house name, chore board, housemates dialog
  hooks/useHouseholdData.ts   typed household state saved to localStorage
  components/BillTracker.tsx  bills, equal splits, balances
  components/Notes.tsx        notes board for non-chore reminders
  components/HomeChat.tsx     live chat interface
server.mjs                    chat server (Node built-ins only); serves dist/ in production
dev.mjs                       runs Vite and the chat server together
```

`useHouseholdData` returns the roommates, chores and expenses, the chat name and house name, add / remove methods (plus update for chores), and a `storageError` message if saved data cannot be read or written. Saved data is validated when loaded.

## How the chat works

The browser opens a server-sent events connection to `/api/chat/events`. The server pushes new messages, reactions, read receipts and typing hints to everyone connected. The browser sends actions to these endpoints:

- `POST /api/chat/messages` sends a message.
- `POST /api/chat/react` toggles an emoji reaction.
- `POST /api/chat/read` marks messages as read.
- `POST /api/chat/typing` sends a typing hint.

In development, Vite forwards `/api/chat` to the chat server on `127.0.0.1:3001` (see `vite.config.ts`). In production the same Node process serves both the site and the chat.

## Trying it on other devices

**Same Wi-Fi (no hosting needed).** Build the site and let the server accept connections from other devices:

```powershell
npm run build
$env:CHAT_HOST = "0.0.0.0"
npm run chat-server
```

Find your computer's IPv4 address with `ipconfig`, then open `http://<that-address>:3001` on the other device. Allow Node through Windows Firewall on private networks if prompted.

**Anywhere (hosted).** See the next section.

## Deploying to Render

The whole app runs as one Render web service.

1. Push the project to GitHub.
2. On render.com choose **New, Web Service** and select the repository.
3. Use these settings:
   - **Runtime:** Node
   - **Build Command:** `npm install --include=dev && npm run build`
   - **Start Command:** `npm run chat-server`
   - **Instance type:** Free
4. Create the service. Render provides a public URL and redeploys automatically on every push to the selected branch.

Render sets the `PORT` variable itself, and the server then listens on all network interfaces. No other environment variables are needed.

Notes about the free tier:

- The service sleeps when idle. The first visit afterwards can take 30 to 60 seconds, so open it before a demo.
- The disk is temporary, so chat history may reset when the service restarts or redeploys.

Optional environment variables: `PORT`, `CHAT_PORT` (default 3001), `CHAT_HOST`, `CHAT_DATA_FILE`.

## Known limitations

- Chores, bills, notes, housemates and the house name are stored per browser, so housemates do not see each other's lists. Only the chat is shared.
- The chat limits how fast people can post (5 messages per 10 seconds each, 60 per minute overall), but it has no authentication. Anyone with the link can read it and post under any name, so only share the link with people you trust.
- Bills show net balances only. There is no "who pays whom" breakdown and no way to record a repayment.
- Chat history is limited to the last 200 messages and may be lost on free hosting.
- There is no automated test suite.
