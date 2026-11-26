# Chore Score

(Formerly "Flatmate Ledger"; the repo, package name and localStorage key `flatmate-ledger:household:v1` keep the old name on purpose, so do not rename them: it would break the repo link and wipe users' saved data.)

A student-project prototype for university students sharing a rented home. It tracks chores, shared bills and notes and has a live house chat, all shared between housemates' devices through a house invite link. Dark mode is the default theme.

## Commands

- `npm run dev` — starts the Vite dev server (http://localhost:5173) **and** the chat server (port 3001) together via `dev.mjs`. Ctrl+C stops both.
- `npm run dev:client` — Vite only. `npm run chat-server` — chat server only.
- `npm run build` — `tsc -b` type-check, then Vite build into `dist/`. Run this before finishing any change; `npx tsc -b` alone is a quick check.
- `npm test` — Node's built-in test runner on `tests/*.test.mjs`: `shared/household.mjs` (validation, every action, loading old data) and `src/lib/bills.ts` (Node runs the .ts by stripping types). No test dependencies. Run it after changing shared data or bill maths, and add a test for any new action or field. No linter is configured.

## Stack and constraints

- React 19 + TypeScript + Vite, Tailwind CSS v4 (via `@tailwindcss/vite`), plus a plain Node chat server (`server.mjs`) that uses only built-ins.
- The 3D flat uses `three`, `@react-three/fiber` and `@react-three/drei` (only `OrbitControls` and `useCursor`): a deliberate exception to the minimal-dependency rule. It is lazy-loaded (`FlatScene` chunk, ~260 kB gzipped) so the start screen and list view never download it.
- The invite link's QR code uses `qrcode-generator` (no dependencies of its own, ~7 kB gzipped): the other agreed exception, since a QR encoder is not "a few lines". `InviteQr.tsx` is lazy-loaded, so it only downloads when someone presses SHOW QR CODE.
- Keep the dependency list minimal: do not add libraries for things the platform or a few lines of code can do (for example `dev.mjs` replaces `concurrently`).
- Keep code modular, clean and commented where the reason is not obvious. Match the existing style: functional components, typed props, small helper functions at the top of the file.
- Most styling is hand-written in `src/index.css` using CSS variables (`--red`, `--ink`, `--muted`, `--line`, `--paper`...). Reuse those variables so light and dark mode both work. Chat styles are prefixed `wa-`, 3D flat styles `flat-` / `room-sheet`.

## Architecture

```
src/
  main.tsx                 entry point
  App.tsx                  App (theme, view, which house) + HouseDashboard (flat view, or list view with hero + housemates dialog)
  lib/week.ts, lib/bills.ts, lib/nameColour.ts, lib/sfx.ts   week keys, bill maths, person colours, Web Audio blips
  hooks/useModalFocus.ts     Escape / Tab trap / focus return for dialogs and the room sheet
  components/ChoreBoard.tsx  chore list, filters, add form, rotate button (used by both views)
  components/HouseSettings.tsx housemates ("This is me"), invite link + QR code, rename, leave (list dialog and the flat's front door)
  components/InviteQr.tsx    the invite link as a QR code (lazy, with its encoder)
  components/WhoAmI.tsx      "Which one are you?" / "I'm new here" card (floats in the flat, banner in the list view)
  components/PanelBoundary.tsx error boundary round each panel: a crash shows "try again" there, not a blank page
  components/flat/           the 3D flat (see "3D flat" below)
  hooks/useHouseholdData.ts  a house's shared data, synced with the server (optimistic actions + SSE)
  lib/house.ts               house codes, invite links, per-device localStorage, apiRequest helper
  components/HouseGate.tsx   start / join a house (offers to upload old per-browser data)
  components/TopBar.tsx      logo, house name + connection dot, theme toggle
  components/BillTracker.tsx bills, equal splits, net balances
  components/Notes.tsx       small board of non-chore reminders (140 chars each, newest first)
  components/HouseLeague.tsx  the TV's panel: this week's league table (flat view only)
  components/DecorPicker.tsx the bathroom mirror's panel: swap the 3D flat's furniture (shared by the house)
  components/LookPicker.tsx  the bedroom doors' panel: a housemate's avatar look (shared), with an SVG preview
  components/HomeChat.tsx    WhatsApp-style live chat UI (per house); in the flat it is the "chat log"
  lib/chat.ts                sending to the chat (messages, typing), shared by HomeChat and the flat's SayBox
shared/household.mjs       household types (household.d.mts), validation, applyAction: used by server AND browser
server.mjs                 houses API + chat API + serves dist/ in production
storage.mjs                Upstash Redis (if env vars set) or JSON files; coalesced writes
dev.mjs                    runs vite + server together
```

### Houses and shared data
- A house has a random 12-char code (alphabet without 0/O/1/I/L); its invite link is `/h/<code>`. No accounts: the code is the only access control.
- The server is the source of truth. Household data = `roommates` (each with a `look`), `chores`, `expenses`, `notes`, `householdName`, `decor` (type `Household` in `shared/household.d.mts`). Stored per house as `{ version, createdAt, household }` under key `house:<code>`, chat under `chat:<code>` (prefixed `chore-score:` in Redis; files `server-data/house-<code>.json` locally).
- Clients never upload whole state. They send one action (`addChore`, `updateChore`, `rotateRoster`, `removeRoommate`...) to `POST /api/houses/<code>/actions` with an `actionId`. `applyAction` in `shared/household.mjs` validates and applies it; the server bumps `version` and broadcasts a `household` event `{ version, household, actionId }` on `/api/houses/<code>/events` (which sends a `snapshot` on connect).
- The browser shows pending actions on top of the last server copy and drops them when the server confirms (by `actionId`) or rejects them. Copies with a lower `version` are ignored.
- **To add a new kind of change**: add a case to `applyAction`, its type to `HouseholdAction` in `household.d.mts`, and a method in `useHouseholdData`. **To add a field**: add it to the validator and to `normalizeHousehold` with a default, so already-saved houses keep loading.
- Removals of things already gone return the same object, so the server treats them as no change.
- `removeRoommate` also unassigns their chores, server side, in one step.
- At most 8 housemates can be added (`LIMITS.roommates`, one avatar spot each); houses saved before the cap may hold up to `LIMITS.storedRoommates` (30) and must keep loading, so validation of stored data uses that.
- Per device (localStorage): `chore-score:house` (current code), `chore-score:chat-name`, `chore-score:theme`, `chore-score:view` (`flat`/`list`), `chore-score:sound` (`on`/`off`), `chore-score:tour` (`done` once the flat tour is finished or skipped), `chore-score:me:<code>` (which housemate this device is: a roommate id, or `none` for "just looking"), `chore-score:house-cache:<code>` (last copy, shown while the server wakes). The old key `flatmate-ledger:household:v1` is only read to offer uploading pre-sharing data when creating a house (then `chore-score:legacy-imported` is set); never write or rename it.
- "This is me": each device can say which housemate it is (`readMe`/`saveMe` in `lib/house.ts`, held in `HouseDashboard`). It is never sent to the server. `WhoAmI` asks until answered, before anything else (also in an empty house, as "Add yourself first"); "I'm new here" adds a housemate and picks them in one go (refused if the name is taken or the house is full). In the flat view a new device goes: question → Looks sheet on that person ("Make it you") → the tour, which waits while the question or any sheet is showing. It asks again if the chosen person is removed or their add was refused. Choosing someone also sets the chat name to theirs (still editable in the chat log), and on load a chat name that only differs in case/spaces from "me" takes the housemate's spelling. Effects: a red ring and "YOU" tag on your avatar, "Your room" on your door, your jobs and your bill balance (`describeOwnBalance`) on the flat's score card, the bills panel and the kitchen table's label, a MINE filter on the chore board, and the Looks panel opening on you.
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
- Messages and typing hints may carry `roommateId` (the device's "This is me"), so the 3D flat puts the speech bubble on the right avatar whatever the chat name. The server keeps it only if it is one of the house's housemates (`chatRoommateId` in `shared/household.mjs`); older messages without it are matched by name. Like looks, anyone could claim to be any housemate (there are no accounts).
- There are no accounts: anyone with the invite link can join under a free name. Clearing site data, or using a second device, means picking a different name.

### 3D flat (`src/components/flat/`)
- The default view when WebGL works (`hasWebGL()`); the top bar's FLAT/LIST button switches, and a crash in the scene offers the list view. Both views use the same feature components.
- `FlatView.tsx` (small, not lazy): score card, room buttons (the keyboard/screen-reader way in), the say box, and the `room-sheet` dialog (side sheet ≥ 760 px wide, bottom sheet on phones) showing the open room's component. HomeChat stays mounted (hidden) so the scene can show chat activity; it only sends read receipts while `active`, and reports `ChatActivity` via `onActivity`.
- Talking in the flat: `SayBox.tsx` (not lazy) is a game-style chat line above the room buttons (Enter focuses it when nothing else has focus, Esc leaves). It sends ordinary chat messages tagged with `roommateId`, so they also appear in the chat log (its LOG button, or the sofa). It needs "This is me"; without it, it explains how. FlatView turns each new live message into a `Speech` bubble over the sender's avatar (3.5 s + 60 ms per character, max 10 s; a newer message replaces it). Bubbles type themselves out (40 ms a letter, done within 1.4 s; invisible placeholder letters keep the size steady) with a per-housemate "voice" blip (`playBlip` in `lib/sfx.ts`, pitch hashed from their id) when sound is on; with reduced motion they appear whole and the message chime plays instead and typing hints into "…" (your own too, while you have an unsent line). Speakers stop where they are while talking (`hold` in `life.ts`) and step out of their bedroom if inside. A bubble whose speaker is off view is pinned to the screen edge with an arrow (`Overlay`'s `keepOnScreen`). Messages from people without an avatar (not a housemate, or beyond the 8 avatar spots) pop up over the sofa instead. A hidden live region reads bubbles to screen readers.
- `FlatTour.tsx` (not lazy): the first-visit tour. `TOUR_STEPS` (welcome, one per room, finish) each name a room; FlatView feeds the step's room to the scene as `focus` (so the camera flies there, kept clear of the card via `TOUR_CARD_SPACE`) and pulses that room's button. It shows once per device and can be replayed with the `?` tool button. Clicking a room mid-tour jumps to its step. If you add a room, add a step for it.
- `FlatScene.tsx` (lazy): `Canvas` with an orthographic isometric camera. `CameraRig` flies to `ROOMS[room].focus`/`zoom` and offsets so the room stays clear of the sheet; OrbitControls only pans/zooms (no rotation). Also detects chores being completed (sparkle burst) and roster rotations (avatars hop, whiteboard wobbles) by comparing with the previous render.
- `rooms.ts` (no three.js): room → feature map, the floor plan in world units, `messZone()` (guesses where a chore's mess goes from keywords in its title) and the mess / avatar spots. Feature → place: chores = hallway whiteboard (`WHITEBOARD_SPOT`), league = living-room TV (housemates ranked by chores done this week, `lib/league.ts`), notes = fridge magnets, bills = kitchen table (envelopes, coin stacks per housemate), chat = sofa + phone (the chat log; a bubble over it for messages from people without an avatar) and the say box, house = front door (porch light = connection status, doormat = house name), looks = bedroom doors (one per housemate, max 4: the last says "+N more") and the housemates' avatars, both opening that person's look picker, decor = bathroom mirror (opens the decor picker; the camera zooms out to show the whole flat).
- Mess: each open chore leaves a pile (`Mess` in `liveParts.tsx`, room guessed by `messZone()`). `MessMarkers.tsx` floats one marker over each room's piles (title + who for one chore, a count for several; red and bobbing if any is overdue; icon only on screens under 700 px until zoomed in). A marker or pile opens that room's popup listing its chores with a DONE button (`onCompleteChore`, passed down from `App` through `FlatView`) and a link to the chore board; the other markers hide while it is open, and Escape or opening a room closes it. Markers are hidden while a room sheet or tour step has the camera.
- `Avatar.tsx` a housemate's body from their look; `furniture.tsx` static flat from primitives (`Block` is positioned by its bottom-centre); `liveParts.tsx` data-driven, clickable parts (`Hotspot`).
- Housemates live their own lives: `life.ts` (no three.js) is the brain, `Housemates.tsx` draws it. A hand-placed walkable graph (`NODES`/`EDGES`, routed with Dijkstra) takes them round walls and furniture to `Spot`s (sofa seats per sofa style, fridge, sink, hob, table chairs, mirror, chore board, TV, plant, porch, paired hang-out spots, each housemate's own bedroom door). Each spot holds one person and is entered from one node, via an optional `approach` point; if you move furniture, move its spot and check the route still clears it. Choices are weighted by `PersonFacts` (open chores pull them to that zone, owing money to the table, top of the league dances at the TV). Settled neighbours in the same area swap short emoji "talks". A chat message or typing stops the speaker where they are (see "Talking in the flat"); finishing a chore makes the doer hop; a rotation makes everyone hop. Each device simulates on its own (nothing is synced). The frame loop mutates refs; React state changes only for the emoji bubble, vanishing into a bedroom and the hover label. With reduced motion they stand still at `AVATAR_SPOTS`. Text on objects is drawn to canvas textures (`textures.ts`); floating labels use `Overlay.tsx`, not drei `<Html>` (which threw `removeChild` errors when the scene unmounted).
- Decor: `DECOR_OPTIONS` in `shared/household.mjs` lists each slot's style ids (first = default) and is what the server validates `setDecor` against; `flat/decor.ts` holds the picker labels and swatches. Unknown or missing choices fall back to the default when loading, so styles can be retired safely. To add a style: add its id to `DECOR_OPTIONS`, the `Decor` type in `household.d.mts` and `decor.ts`, then draw it in the slot's component (`furniture.tsx` for plain furniture; in `liveParts.tsx`, `Sofa`, `BillsTable`, `FridgeBody`, `TvBody`, `BoardStand` + `boardInk`, `FrontDoor` and `Mirror` for the clickable, data-showing ones). Variants keep the same footprint so mess spots, avatar spots and attached data (phone, envelopes, coins) still line up. Two slots have their own files: `art` (`wallArt.tsx`: print, gig poster, housemate polaroids drawn from the roommates, neon sign, none; on the living room's left wall between the kitchen divider and the TV, below the fairy-light hooks) and `pet` (`pets.tsx`; default `none` so older houses look unchanged): a cat with its own small brain on each device (favourite `CAT_SPOTS` reached over the housemates' graph via `walkPoints`, eats at its bowl by the kitchen partition, naps, sits; click to stroke; naps still on the hall rug with reduced motion), a goldfish bowl on the kitchen worktop, or a hamster cage on the living-room side table (which then hides the mug). If you move furniture near a cat spot, move the spot too.
- Looks: each `Roommate` has a `look` (skin, hair, hairColour, top, topColour, bottoms, bottomColour, extra, plus `build` 0–10 from the male↔female slider). `LOOK_OPTIONS` in `shared/household.mjs` lists the ids the server accepts; `defaultLook(id)` (hashed from the id, same on server and browser) fills missing or retired choices, so older houses load. `setLook` changes one part at a time. `flat/looks.ts` (no three.js) has labels, colours and `bodyShape()`; `flat/Avatar.tsx` draws the 3D body and `LookPicker.tsx`'s `LookPreview` draws the same look in SVG, so keep the two in step when adding an option (id in `LOOK_OPTIONS`, the `Look` type, `looks.ts`, then both drawings). The slider sends its value once it settles, to stay under the action rate limit. Anyone in the house can change anyone's look (there are no accounts).
- Colours: `palette.ts` reads `--red`, `--green`, etc. from `.app-shell`, so night (dark mode: lamps on, moonlight) and day follow the theme. `withDecor()` then applies the house's chosen wall paint, floorboards and sofa fabric.
- `prefers-reduced-motion` turns off camera flights, bobbing, pulses and bursts. Sound effects (`lib/sfx.ts`) are off unless the user turns them on.

## Deployment

Hosted as a single Render web service (free tier): build `npm install --include=dev && npm run build`, start `npm run chat-server`. Render sets `PORT`; the server then binds to `0.0.0.0`. Auto-deploys on push to `main`. The free tier sleeps when idle and its disk is temporary, so persistent data needs `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` set in Render (free Upstash Redis, reached with `fetch`, no driver dependency). Without them, every deploy/restart wipes all houses.

## Things to know
- Fonts rely on system fonts (Impact, Arial Narrow). Do not re-enable `font-feature-settings` such as `ss01` on `:root`: it garbled letters in Impact.
- `FormEvent` deprecation hints in the editor are harmless.
