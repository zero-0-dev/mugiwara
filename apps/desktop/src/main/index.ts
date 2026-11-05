import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import path from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { ServerManager } from "./server-manager";

// Keep a global reference to prevent garbage collection
let mainWindow: BrowserWindow | null = null;
let serverManager: ServerManager | null = null;
let currentServerPort = 0;
// A deep link can arrive before the window (or the embedded server) exists.
let pendingDeepLinkPath = "";
const DEEP_LINK_SCHEME = "mugiwara";

// Development mode flag
const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;
const DEV_SERVER_PORT = 3001;

// Optional: point the desktop shell at a Mugiwara server running elsewhere on
// the LAN instead of starting an embedded server.
const EXTERNAL_SERVER_URL =
  process.env.MUGIWARA_SERVER_URL?.replace(/\/+$/, "") || "";

// The embedded server is local-only from the renderer's perspective, but it
// still requires authentication. The main process provisions a token through
// loopback pairing (or MUGIWARA_AUTH_TOKEN) and hands it to the renderer via
// the preload bridge. The token is never written to logs.
let desktopAuthToken = "";

function tokenStorePath(): string {
  const dir = app.getPath("userData");
  mkdirSync(dir, { recursive: true });
  return path.join(dir, "auth-tokens.json");
}

function readTokenStore(): Record<string, string> {
  try {
    const file = tokenStorePath();
    if (!existsSync(file)) return {};
    return JSON.parse(readFileSync(file, "utf8")) as Record<string, string>;
  } catch {
    return {};
  }
}

function writeTokenStore(store: Record<string, string>): void {
  try {
    writeFileSync(tokenStorePath(), JSON.stringify(store, null, 2), {
      mode: 0o600,
    });
  } catch (error) {
    console.warn(
      "[Main] Could not persist auth token:",
      error instanceof Error ? error.message : error,
    );
  }
}

function serverBaseUrl(serverPort: number): string {
  if (EXTERNAL_SERVER_URL) return EXTERNAL_SERVER_URL;
  const port = serverPort || serverManager?.getPort() || DEV_SERVER_PORT;
  // In dev the web UI is served by Vite (:5173) and proxies /api to the server,
  // but pairing calls go straight to the loopback server.
  return `http://127.0.0.1:${port}`;
}

function isLoopbackUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

async function callJson(
  url: string,
  init: RequestInit,
): Promise<{ response: Response; body: any }> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function validateAuthToken(
  base: string,
  token: string,
): Promise<boolean> {
  if (!token) return false;
  try {
    const { response } = await callJson(`${base}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function pairViaLoopback(base: string): Promise<string> {
  if (!isLoopbackUrl(base)) return "";
  try {
    const init = await callJson(`${base}/api/auth/pairing/init`, {
      method: "POST",
    });
    const code = init.body?.code;
    if (!init.response.ok || typeof code !== "string") return "";
    const paired = await callJson(`${base}/api/auth/pair`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, deviceLabel: "Mugiwara Desktop" }),
    });
    if (!paired.response.ok || typeof paired.body?.token !== "string")
      return "";
    return paired.body.token;
  } catch {
    return "";
  }
}

async function provisionAuthToken(base: string): Promise<string> {
  // In dev the API server runs in another process and may still be starting.
  for (let attempt = 0; attempt < 20; attempt++) {
    const token = await provisionAuthTokenOnce(base);
    if (token) return token;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return "";
}

async function provisionAuthTokenOnce(base: string): Promise<string> {
  const envToken = process.env.MUGIWARA_AUTH_TOKEN || "";
  if (envToken) return envToken;

  const store = readTokenStore();
  const storedToken = store[base] ?? "";
  if (await validateAuthToken(base, storedToken)) {
    return storedToken;
  }

  const token = await pairViaLoopback(base);
  if (token) {
    store[base] = token;
    writeTokenStore(store);
  }
  return token;
}

function getAppUrl(serverPort: number): string {
  if (EXTERNAL_SERVER_URL) return EXTERNAL_SERVER_URL;
  return isDev ? "http://localhost:5173" : `http://127.0.0.1:${serverPort}`;
}

/** Convert `mugiwara://manga/abc` into the router path `/manga/abc`. */
function parseDeepLink(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== `${DEEP_LINK_SCHEME}:`) return null;
    const host = url.host ? `/${url.host}` : "";
    const pathname = url.pathname === "/" ? "" : url.pathname;
    return `${host}${pathname}${url.search}${url.hash}` || "/";
  } catch {
    return null;
  }
}

function findDeepLinkPath(argv: string[]): string | null {
  for (const arg of argv) {
    const path = parseDeepLink(arg);
    if (path) return path;
  }
  return null;
}

function openDeepLink(path: string): void {
  pendingDeepLinkPath = path;
  if (!mainWindow) return;

  const port = currentServerPort || serverManager?.getPort() || DEV_SERVER_PORT;
  void mainWindow.loadURL(`${getAppUrl(port)}${path}`);
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}

function registerDeepLinkProtocol(): void {
  // In dev the executable is electron itself; pass the app entry so the OS
  // launches the right project.
  if (process.defaultApp && process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME, process.execPath, [
      path.resolve(process.argv[1] ?? "."),
    ]);
  } else {
    app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME);
  }
}

function getApiBase(apiPath: string): string {
  if (EXTERNAL_SERVER_URL) return `${EXTERNAL_SERVER_URL}${apiPath}`;
  const port = isDev
    ? DEV_SERVER_PORT
    : serverManager?.getPort() || DEV_SERVER_PORT;
  return `http://127.0.0.1:${port}${apiPath}`;
}

async function loadAppWindow(url: string) {
  const attempts = isDev ? 20 : 1;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await mainWindow?.loadURL(url);
      return;
    } catch (error) {
      if (attempt === attempts || !mainWindow) throw error;
      // In dev, Vite and Electron start at the same time. Retry briefly
      // instead of showing Chromium's connection error page.
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

function appIconPath(): string | undefined {
  // Packaged builds copy the icon to extraResources; in dev it lives in the
  // repo's buildResources directory (see package.json build.directories).
  const file = app.isPackaged
    ? path.join(process.resourcesPath, "icon.png")
    : path.join(__dirname, "../../buildResources/icon.png");
  return existsSync(file) ? file : undefined;
}

async function createWindow(serverPort: number) {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    // electron-builder supplies the packaged app icon; this also covers the
    // dev window and Linux taskbars.
    icon: appIconPath(),
    titleBarStyle: "hiddenInset",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "../preload/index.js"),
    },
  });

  // Store server port in window for renderer to access
  (mainWindow as any).serverPort = serverPort;
  currentServerPort = serverPort;

  // Load the shared web client. In production the local server serves it,
  // which gives the renderer the same origin as the API and avoids file://
  // security exceptions. A pending deep link is appended as a real route.
  const startUrl = pendingDeepLinkPath
    ? `${getAppUrl(serverPort)}${pendingDeepLinkPath}`
    : getAppUrl(serverPort);
  pendingDeepLinkPath = "";
  await loadAppWindow(startUrl);

  // Handle window closed
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// Initialize application
async function initialize() {
  try {
    pendingDeepLinkPath =
      pendingDeepLinkPath || findDeepLinkPath(process.argv) || "";
    if (EXTERNAL_SERVER_URL) {
      console.log(`[Main] Using external server: ${EXTERNAL_SERVER_URL}`);
      await createWindow(0);
      return;
    }

    let serverPort: number;

    if (isDev) {
      // In dev mode, assume server is running separately on port 3001
      console.log(
        "[Main] Dev mode: Assuming server is running on port",
        DEV_SERVER_PORT,
      );
      serverPort = DEV_SERVER_PORT;
    } else {
      // In production, start the embedded server
      serverManager = new ServerManager();
      serverPort = await serverManager.start();
      console.log(
        `[Main] Production mode: Started embedded server on port ${serverPort}`,
      );
    }

    // Provision an auth token for the renderer. Packaged builds pair over
    // loopback automatically; MUGIWARA_AUTH_TOKEN can override this.
    desktopAuthToken = await provisionAuthToken(serverBaseUrl(serverPort));
    if (!desktopAuthToken) {
      console.warn(
        "[Main] No desktop auth token available. The renderer will ask for pairing.",
      );
    }

    // Create the main window
    await createWindow(serverPort);
  } catch (error) {
    console.error("[Main] Failed to initialize:", error);
    app.quit();
  }
}

// IPC handlers
ipcMain.handle("get-server-port", () => {
  if (EXTERNAL_SERVER_URL) {
    try {
      return Number(new URL(EXTERNAL_SERVER_URL).port) || 80;
    } catch {
      return 0;
    }
  }
  if (isDev) {
    return DEV_SERVER_PORT;
  }
  return serverManager?.getPort() || DEV_SERVER_PORT;
});

ipcMain.handle("get-api-url", (event, apiPath: string) => {
  return getApiBase(apiPath);
});

ipcMain.handle("get-auth-token", () => {
  return desktopAuthToken;
});

ipcMain.handle("get-app-version", () => {
  return app.getVersion();
});

ipcMain.handle("open-folder", async (event, folderPath: string) => {
  const resolvedPath = path.isAbsolute(folderPath)
    ? folderPath
    : path.resolve(path.join(process.cwd(), "../server"), folderPath);
  console.log(`[Main] Opening folder: ${resolvedPath}`);
  return shell.openPath(resolvedPath);
});

ipcMain.handle("select-folder", async () => {
  if (!mainWindow) return null;

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
    title: "Select Manga Folder",
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

// App event handlers
registerDeepLinkProtocol();

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const deepLinkPath = findDeepLinkPath(argv);
    if (deepLinkPath) {
      openDeepLink(deepLinkPath);
      return;
    }
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.whenReady().then(initialize);
}

// macOS delivers custom-scheme links through open-url instead of argv.
app.on("open-url", (event, url) => {
  event.preventDefault();
  const deepLinkPath = parseDeepLink(url);
  if (deepLinkPath) openDeepLink(deepLinkPath);
});

app.on("window-all-closed", async () => {
  // Stop the server before quitting (only in production)
  if (!isDev && serverManager) {
    await serverManager.stop();
  }

  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", async (event) => {
  // Stop server before exit (only in production)
  if (!isDev && serverManager) {
    event.preventDefault();
    await serverManager.stop();
    app.exit(0);
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    const port = EXTERNAL_SERVER_URL
      ? 0
      : isDev
        ? DEV_SERVER_PORT
        : serverManager?.getPort() || DEV_SERVER_PORT;
    createWindow(port);
  }
});
