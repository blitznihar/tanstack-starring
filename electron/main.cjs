// Optional Electron macOS shell (§19 M8). Wraps the Comet web UI in a native
// desktop window pointing at API_BASE_URL. Electron is NOT a bundled dependency
// (keeps the web install lean) — run it on demand:
//
//   API_BASE_URL=http://localhost:3000 bunx electron electron/main.cjs
//
// or add `electron` to devDependencies and run `bun run desktop`. The DB/Stripe
// config is unchanged — the shell only renders the same server-rendered UI.
const { app, BrowserWindow, shell } = require("electron");

const URL_TO_LOAD = process.env.API_BASE_URL || process.env.COMET_URL || "http://localhost:3000";

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    title: "Comet",
    backgroundColor: "#0E1430",
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  win.loadURL(URL_TO_LOAD);
  // Open target=_blank links (and external hosts) in the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
