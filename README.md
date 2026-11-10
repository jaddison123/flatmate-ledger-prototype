# Flatmate Ledger

A React and TypeScript starter for a shared household ledger and chore tracker.

## Getting started

```sh
npm install
npm run dev
```

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
