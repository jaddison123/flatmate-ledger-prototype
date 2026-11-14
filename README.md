# Chore Score

A household ledger, chore tracker and live chat for university students sharing a rented home. It is a prototype built as a university project.

## Features

- **Shared houses:** the first person creates a house and gets an invite link (`/h/<code>`). Everyone who opens it sees the same chores, bills, notes, housemates and chat, live, on any device. The invite link and a "leave this house" button are in the Housemates dialog.
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
| Housemates, chores, bills, notes, house name | On the server, per house. Shared live with everyone who has the invite link. Each browser also keeps a copy so the page shows instantly while the server wakes up. |
| Chat messages, reactions, read ticks | On the server, per house (last 200 messages). |
| Your chat name, which house you're in, theme | In your own browser (`localStorage`). |

The server saves to **Upstash Redis** when `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set, otherwise to JSON files in `server-data/` (see `storage.mjs`).

Data saved in a browser before houses were shared is not lost: when that browser creates a house, it offers to upload it.

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
  hooks/useHouseholdData.ts   a house's shared data, synced live with the server
  lib/house.ts                house codes, invite links, per-device settings, API helper
  components/HouseGate.tsx    start a new house or join one
  components/TopBar.tsx       logo, house name with live/offline dot, theme toggle
  components/BillTracker.tsx  bills, equal splits, balances
  components/Notes.tsx        notes board for non-chore reminders
  components/HomeChat.tsx     live chat interface
shared/household.mjs          household types, validation and actions (used by server and browser)
server.mjs                    API server (Node built-ins only); serves dist/ in production
storage.mjs                   saves house data to Upstash Redis or JSON files
dev.mjs                       runs Vite and the server together
```

`useHouseholdData(houseCode)` returns the house's roommates, chores, expenses, notes and name, methods to change them, the connection `status` (`connecting`, `live`, `reconnecting`, `missing`) and a `syncError` message if a change was rejected. Everything the server sends is validated before use.

## How sharing works

Every house has a random 12-character code. All API routes live under `/api/houses`:

- `POST /api/houses` creates a house (optionally with uploaded data) and returns its code.
- `GET /api/houses/<code>` returns `{ version, household }`, or 404 if there is no such house.
- `GET /api/houses/<code>/events` is a server-sent events stream: a `snapshot` on connect, then a `household` event after every change.
- `POST /api/houses/<code>/actions` applies one change, such as `{ type: "addChore", chore }`, `{ type: "rotateRoster", week }` or `{ type: "removeNote", id }`.

Changes are sent as small actions rather than a whole copy of the data, so two people editing at the same time don't overwrite each other. The list of actions and their validation is in `shared/household.mjs`, which both the server and the browser use. The browser shows a change straight away and swaps in the server's version when it arrives. If the server rejects the change, it disappears and an error is shown.

The chat works the same way under `/api/houses/<code>/chat`: `events` (stream of `history`, `message`, `update`, `typing`), plus `POST` to `messages`, `react`, `read` and `typing`.

In development, Vite forwards `/api` to the server on `127.0.0.1:3001` (see `vite.config.ts`). In production the same Node process serves both the site and the API.

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

Render sets the `PORT` variable itself, and the server then listens on all network interfaces.

### Keeping data between deploys (Upstash)

Render's free disk is wiped on every deploy and restart, which would delete every house. To keep the data, use a free Upstash Redis database:

1. Sign up at upstash.com and create a **Redis** database (free plan; pick the region closest to your Render service).
2. On the database page, under **REST API**, copy `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
3. In Render, open the service's **Environment** tab and add both variables with those values. Render redeploys.

The server log then says `Saving house data to Upstash Redis at …`. No npm package is needed; the server talks to Upstash over HTTPS.

Notes about the free tier:

- The service sleeps when idle. The first visit afterwards can take 30 to 60 seconds, so open it before a demo. The app shows the last saved copy while it waits.
- Without Upstash, houses and chat are lost whenever the service restarts or redeploys. If that happens, the app offers to recreate the house from the copy saved in the browser (with a new invite link).

Optional environment variables: `PORT`, `CHAT_PORT` (default 3001), `CHAT_HOST`, `DATA_DIR` (folder for the JSON files, default `server-data`), `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.

## Known limitations

- There are no accounts. Anyone with a house's invite link can see and change everything in it, so only share the link with your housemates. Codes are long and random, so they cannot be guessed.
- A chat name belongs to the device that first used it (via a secret key in that browser), so nobody else in the house can post or react under it. Using the same name on a second device, or after clearing the browser's data, isn't possible; pick a slightly different name. Changing your name frees the old one for others.
- The server limits how fast people can make changes (30 per 10 seconds each) and post (5 messages per 10 seconds each, 30 per minute per house, 120 per minute overall), and how many houses can be created (5 per 10 minutes each).
- Changes need a connection. While offline you see the last saved copy, but edits are not queued.
- Bills show net balances only. There is no "who pays whom" breakdown and no way to record a repayment.
- Chat history is limited to the last 200 messages per house.
- There is no automated test suite.
