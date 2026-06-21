# Comet desktop shell

A thin **Electron** shell that renders the same Comet web UI in a native desktop
window. It does not contain app logic, database code, Stripe keys, or secrets.
Those still live in the Bun/TanStack server and are controlled by `.env`.

## Same computer, development mode

This starts/uses Vite at `http://localhost:5173` and opens Electron:

```bash
bun install
bun run desktop:dev
```

Use this while actively changing code.

## Same computer, production-style mode

This builds the app, starts the Bun server at `http://localhost:3000`, and opens
Electron:

```bash
bun install
bun run desktop:prod
```

Use this when you want to test the built app without Docker.

## Shell pointed at an existing server

Use this when the server is already running somewhere else, such as Docker, a LAN
machine, or a hosted URL:

```bash
bun run desktop -- --url=http://192.168.5.85:5173
```

You can also set `API_BASE_URL` or `COMET_URL`:

```bash
API_BASE_URL=http://localhost:3000 bun run desktop
```

On Windows PowerShell:

```powershell
$env:API_BASE_URL="http://localhost:3000"
bun run desktop
```

## Run on another desktop

Choose one of these deployment shapes:

1. **Other desktop opens your existing server**
   - Keep the Comet server running on this machine or a hosted server.
   - On the other desktop, install Bun and clone/copy this repo.
   - Run `bun install`.
   - Run `bun run desktop -- --url=http://<server-ip-or-host>:<port>`.
   - The other desktop does not need MongoDB credentials because it only loads the
     UI from the server.

2. **Other desktop runs its own local Comet server**
   - Install Bun on that desktop.
   - Clone/copy this repo and run `bun install`.
   - Create `.env`; point `MONGODB_URI` at Atlas or a reachable MongoDB.
   - If the database is empty, run `bun run seed` once.
   - Run `bun run desktop:prod`.
   - The app window uses `http://localhost:3000` on that desktop.

3. **Other desktop for development**
   - Install Bun, clone/copy the repo, run `bun install`, configure `.env`.
   - Run `bun run desktop:dev`.
   - The app window uses `http://localhost:5173`.

## What it does

- Opens a 1280×860 window loading `API_BASE_URL` (default `http://localhost:3000`).
- Opens external links (e.g. **Stripe Checkout** in real Stripe mode) in the
  system browser.
- Holds **no** app logic, DB, or secrets — everything still runs through the
  server functions → MongoDB / DMR / Stripe. Switching the DB to Atlas or
  enabling real Stripe is purely a server-side `.env` change; the shell is
  unaffected.
