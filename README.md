# Flatmate Ledger

A local-first household ledger and chore tracker for students sharing a rented home.

## Getting started

```sh
npm install
npm run dev
```

On Windows, Command Prompt cannot use a UNC network path as its working
directory. If it displays a warning and falls back to the Windows directory,
map the project share to a temporary drive before starting Vite:

```cmd
pushd "\\server\share\path\to\flatmate-ledger-prototype"
npm run dev
```

Replace the example path with the project's network path. `pushd` assigns a
temporary drive letter to the share. Alternatively, run `start-dev.cmd` from
the project folder; it uses `pushd` to do this automatically.

## Available scripts

- `npm run dev` starts the Vite development server.
- `npm run build` type-checks the app and creates a production build in `dist`.
- `npm run preview` serves the production build locally.

Tailwind CSS v4 is configured through the Vite plugin in `vite.config.ts`; add
utility classes in the React components and global styles in `src/index.css`.

## Household data

`useHouseholdData` in `src/hooks/useHouseholdData.ts` provides typed roommate,
chore, and expense state backed by browser `localStorage`. It returns each
collection, add/update/remove methods, and a `storageError` message if saved
data cannot be read or written. For example:

```tsx
const { roommates, addRoommate } = useHouseholdData();
addRoommate({ name: "Alex" });
```

## Features

- Organise housemates and weekly chores, assign tasks, rotate the roster, and
  track completions.
- Record household bills in GBP, choose who paid and who shares each bill, and
  see each housemate's net balance. Bills are split equally between the selected
  people.
- Leave short household chat messages under a username. No account is needed.
- Bills, chores, housemates, and usernames are saved in each browser. Chat
  messages are shared through the home chat server and saved on its computer.

## Real-time home chat

The chat server uses Node.js built-ins and needs no extra package. Start it in
one terminal from the project folder:

```sh
npm run chat-server
```

In a second terminal, start Vite so other devices on the home network can
connect:

```sh
npm run dev -- --host 0.0.0.0
```

If the project is on a Windows network share, run `pushd "<project path>"` in
each terminal before running its command.

On the computer running the app, find its home-network IPv4 address with
`ipconfig`. Housemates on the same Wi-Fi can open
`http://<IPv4-address>:<Vite-port>` using the port printed by Vite (5173 by
default). If Windows Firewall prompts, allow Vite on the private network. The
chat server itself listens only on this computer; Vite proxies chat requests to it.

For a production-build preview, run `npm run build` and then
`npm run preview -- --host 0.0.0.0` instead of the Vite development command.
Keep `npm run chat-server` running in either case. Chat history is stored in
`server-data/chat-messages.json` on the host computer and is excluded from Git.

There are no accounts: anyone who can reach the home-network app can post under
any username. Keep it on a trusted network and do not forward its port to the
public internet.
