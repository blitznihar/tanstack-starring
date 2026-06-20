# Comet desktop shell (optional)

A thin **Electron** macOS shell that renders the same Comet web UI in a native
window. It is **optional** and intentionally **not** a bundled dependency, so the
web/server install stays lean.

## Run it

1. Start the app (web server + MongoDB) as usual:
   ```bash
   bun run dev        # or: bun run build && bun run start
   ```
2. Launch the shell, pointing it at the running server:
   ```bash
   API_BASE_URL=http://localhost:5173 bunx electron electron/main.cjs
   ```
   (Use `http://localhost:3000` for the production `bun run start` server.)

   If you'd rather not use `bunx`, add `electron` to `devDependencies` and run
   `bun run desktop`.

## What it does

- Opens a 1280×860 window loading `API_BASE_URL` (default `http://localhost:3000`).
- Opens external links (e.g. **Stripe Checkout** in real Stripe mode) in the
  system browser.
- Holds **no** app logic, DB, or secrets — everything still runs through the
  server functions → MongoDB / DMR / Stripe. Switching the DB to Atlas or
  enabling real Stripe is purely a server-side `.env` change; the shell is
  unaffected.
