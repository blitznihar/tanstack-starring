// Optional Electron macOS shell (§19 M8). Wraps the Comet web UI in a native
// desktop window pointing at API_BASE_URL.
//
//   bun run desktop -- --url=http://localhost:3000
//   bun run desktop:dev
//   bun run desktop:prod
//
// The DB/Stripe config is unchanged — the shell only renders the same
// server-rendered UI.
const { app, BrowserWindow, nativeImage, shell } = require("electron");
const path = require("node:path");

const APP_NAME = "Comet Academy";
const URL_TO_LOAD = process.env.API_BASE_URL || process.env.COMET_URL || "http://localhost:3000";
const PNG_ICON = path.join(__dirname, "assets", "comet-academy-icon.png");
const ICNS_ICON = path.join(__dirname, "assets", "comet-academy-icon.icns");
const ICO_ICON = path.join(__dirname, "assets", "comet-academy-icon.ico");
const WINDOW_ICON = process.platform === "darwin" ? ICNS_ICON : process.platform === "win32" ? ICO_ICON : PNG_ICON;

app.setName(APP_NAME);

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    title: APP_NAME,
    icon: WINDOW_ICON,
    backgroundColor: "#0E1430",
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  win.setTitle(APP_NAME);
  win.on("page-title-updated", (event) => {
    event.preventDefault();
    win.setTitle(APP_NAME);
  });
  win.loadURL(URL_TO_LOAD);
  // Open target=_blank links (and external hosts) in the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(() => {
  if (process.platform === "darwin" && app.dock) {
    app.dock.setIcon(nativeImage.createFromPath(PNG_ICON));
  }
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
