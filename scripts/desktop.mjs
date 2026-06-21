#!/usr/bin/env bun
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const mode = args.includes("--dev") ? "dev" : args.includes("--prod") ? "prod" : "shell";
const urlArg = readArg("--url");
const envUrl = process.env.API_BASE_URL || process.env.COMET_URL;
const defaultUrl = mode === "dev" ? "http://localhost:5173" : "http://localhost:3000";
const appUrl = urlArg || envUrl || defaultUrl;
const urlWasProvided = Boolean(urlArg || envUrl);
const shouldManageServer = mode !== "shell" && !urlWasProvided;

let serverProcess = null;
let electronProcess = null;

function readArg(name) {
  const exact = args.indexOf(name);
  if (exact !== -1) return args[exact + 1];
  const prefixed = args.find((arg) => arg.startsWith(`${name}=`));
  return prefixed ? prefixed.slice(name.length + 1) : undefined;
}

function electronBin() {
  const bin = process.platform === "win32" ? "electron.cmd" : "electron";
  return join(root, "node_modules", ".bin", bin);
}

function localServerOptions(url) {
  const parsed = new URL(url);
  if (!["localhost", "127.0.0.1"].includes(parsed.hostname)) {
    throw new Error(`Cannot start a managed local server for non-local URL: ${url}`);
  }
  return {
    hostname: "127.0.0.1",
    port: parsed.port || (parsed.protocol === "https:" ? "443" : "80"),
  };
}

async function reachable(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch(url, { method: "HEAD", signal: controller.signal });
    return response.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function waitFor(url, label) {
  const started = Date.now();
  while (Date.now() - started < 30000) {
    if (await reachable(url)) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${label} did not become reachable at ${url}`);
}

function run(command, commandArgs, options = {}) {
  return spawn(command, commandArgs, {
    cwd: root,
    env: { ...process.env, ...options.env },
    stdio: "inherit",
  });
}

function runChecked(command, commandArgs, label) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? "unknown"}`);
  }
}

async function startManagedServer() {
  if (!shouldManageServer) return;
  if (await reachable(appUrl)) {
    console.log(`Using existing server at ${appUrl}`);
    return;
  }

  const { hostname, port } = localServerOptions(appUrl);
  if (mode === "prod") {
    runChecked("bun", ["run", "build"], "Production build");
    serverProcess = run("bun", ["run", "start"], { env: { HOST: hostname, PORT: port } });
  } else {
    serverProcess = run("bun", ["run", "dev", "--", "--host", hostname]);
  }

  serverProcess.on("exit", (code, signal) => {
    if (!electronProcess || electronProcess.exitCode !== null) return;
    console.error(`Comet server exited (${signal || code}). Closing desktop shell.`);
    electronProcess.kill();
  });

  await waitFor(appUrl, "Comet server");
}

function launchElectron() {
  const bin = electronBin();
  if (!existsSync(bin)) {
    throw new Error("Electron is not installed. Run `bun install`, then try again.");
  }

  console.log(`Opening Comet desktop shell at ${appUrl}`);
  const electronEnv = { ...process.env, API_BASE_URL: appUrl, COMET_URL: appUrl };
  delete electronEnv.ELECTRON_RUN_AS_NODE;

  electronProcess = spawn(bin, [join(root, "electron", "main.cjs")], {
    cwd: root,
    env: electronEnv,
    stdio: "inherit",
  });

  electronProcess.on("exit", (code) => {
    cleanup();
    process.exit(code ?? 0);
  });
}

function cleanup() {
  if (serverProcess && serverProcess.exitCode === null) {
    serverProcess.kill();
  }
}

process.on("SIGINT", () => {
  if (electronProcess && electronProcess.exitCode === null) electronProcess.kill();
  cleanup();
  process.exit(130);
});
process.on("SIGTERM", () => {
  if (electronProcess && electronProcess.exitCode === null) electronProcess.kill();
  cleanup();
  process.exit(143);
});

try {
  new URL(appUrl);
  await startManagedServer();
  launchElectron();
} catch (error) {
  cleanup();
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
