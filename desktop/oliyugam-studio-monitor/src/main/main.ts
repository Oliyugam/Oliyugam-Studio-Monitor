import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  powerMonitor,
  Tray,
} from "electron";
import { z } from "zod";
import { APP_NAME } from "../../config/app-config.js";
import { AppRuntime } from "./runtime/app-runtime.js";
import { createMainWindow } from "./window/create-main-window.js";

const gotSingleInstanceLock = app.requestSingleInstanceLock();
const setupInputSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
});
const attendanceInputSchema = z.enum(["clock-in", "clock-out", "break-start", "break-end"]);
const booleanInputSchema = z.boolean();
const selectedApplicationSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9.-]{0,127}$/),
  displayName: z.string().trim().min(1).max(128),
  executableName: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9 ._-]{0,127}\.exe$/i),
  enabled: z.boolean(),
  supportLevel: z.enum(["basic", "enhanced"]),
  connectorId: z.string().trim().min(1).max(128).nullable(),
});

let runtime: AppRuntime | null = null;
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isShuttingDown = false;

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow?.isMinimized()) mainWindow.restore();
    mainWindow?.show();
    mainWindow?.focus();
  });

  ipcMain.handle("agent:get-snapshot", () => requireRuntime().getSnapshot());
  ipcMain.handle("setup:complete", async (_event, input: unknown) => {
    const parsed = setupInputSchema.safeParse(input);
    if (!parsed.success) throw new Error("Enter a name to continue.");
    return requireRuntime().completeSetup(parsed.data.displayName);
  });
  ipcMain.handle("attendance:apply", (_event, input: unknown) => {
    const parsed = attendanceInputSchema.safeParse(input);
    if (!parsed.success) throw new Error("That work-session action is not available.");
    return requireRuntime().applyAttendanceAction(parsed.data);
  });
  ipcMain.handle("monitoring:set-enabled", (_event, input: unknown) => {
    const parsed = booleanInputSchema.safeParse(input);
    if (!parsed.success) throw new Error("Monitoring setting is invalid.");
    return requireRuntime().setMonitoringEnabled(parsed.data);
  });
  ipcMain.handle("settings:set-auto-start", (_event, input: unknown) => {
    const parsed = booleanInputSchema.safeParse(input);
    if (!parsed.success) throw new Error("Startup setting is invalid.");
    return requireRuntime().setAutoStartEnabled(parsed.data);
  });
  ipcMain.handle("settings:set-selected-applications", (_event, input: unknown) => {
    const parsed = z.array(selectedApplicationSchema).max(100).safeParse(input);
    if (!parsed.success) throw new Error("The selected applications setting is invalid.");
    if (new Set(parsed.data.map((application) => application.id)).size !== parsed.data.length) {
      throw new Error("Each selected application must be unique.");
    }
    if (parsed.data.some((application) => application.supportLevel !== "basic" || application.connectorId !== null)) {
      throw new Error("No verified software-specific connectors are installed in this build.");
    }
    return requireRuntime().setSelectedApplications(parsed.data);
  });
  ipcMain.handle("agent:sign-out", () => requireRuntime().signOut());

  void app.whenReady().then(async () => {
    try {
      runtime = new AppRuntime(publishStatus);
      await runtime.start();
      await openMainWindow();
      createTray();
      powerMonitor.on("suspend", () => runtime?.handleSuspend());
      powerMonitor.on("resume", () => void runtime?.handleResume());
      process.on("uncaughtException", () => {
        runtime?.logUnhandledError();
        process.exitCode = 1;
        app.quit();
      });
      process.on("unhandledRejection", () => {
        runtime?.logUnhandledError();
      });
    } catch {
      dialog.showErrorBox(
        APP_NAME,
        "Studio Monitor couldn't start on this device. Restart the application or contact your administrator.",
      );
      process.exitCode = 1;
      app.quit();
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void openMainWindow();
  });

  app.on("window-all-closed", () => {
    // Keep the monitoring owner process alive. Reopen from the tray.
  });

  app.on("before-quit", (event) => {
    if (isShuttingDown) return;
    event.preventDefault();
    isShuttingDown = true;
    tray?.destroy();
    if (!runtime) {
      app.exit();
      return;
    }
    void runtime.stop().finally(() => app.quit());
  });
}

async function openMainWindow(): Promise<void> {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    return;
  }
  mainWindow = await createMainWindow();
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  mainWindow.webContents.on("render-process-gone", () => {
    const crashedWindow = mainWindow;
    mainWindow = null;
    if (crashedWindow && !crashedWindow.isDestroyed()) crashedWindow.destroy();
    setTimeout(() => void openMainWindow(), 1_000);
  });
}

function createTray(): void {
  const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect x="2" y="2" width="28" height="28" rx="8" fill="#17232e"/><path d="M9 23V9h4l3 5 3-5h4v14h-4v-8l-3 5-3-5v8z" fill="#79dfbd"/></svg>`;
  const icon = nativeImage.createFromDataURL(
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(iconSvg)}`,
  );
  tray = new Tray(icon);
  tray.setToolTip(APP_NAME);
  refreshTrayMenu();
  tray.on("double-click", () => void openMainWindow());
}

function publishStatus(): void {
  if (!runtime) return;
  refreshTrayMenu();
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("agent:status-changed", runtime.getSnapshot());
}

function refreshTrayMenu(): void {
  if (!tray) return;
  const snapshot = runtime?.getSnapshot();
  const monitoringLabel = snapshot?.monitoringState === "active"
    ? "Monitoring: Active"
    : snapshot?.monitoringState === "paused"
      ? "Monitoring: Paused"
    : snapshot?.monitoringState === "unsupported"
      ? "Monitoring: Windows required"
      : "Monitoring: Not started";
  const connectionLabel = snapshot?.apiState === "demo"
    ? "Connection: Local demo only"
    : "Connection: Not configured";
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Open Oliyugam Studio Monitor", click: () => void openMainWindow() },
    { type: "separator" },
    { label: monitoringLabel, enabled: false },
    { label: connectionLabel, enabled: false },
    { label: `Events waiting to sync: ${snapshot?.pendingSyncCount ?? 0}`, enabled: false },
    { type: "separator" },
    { label: "About", click: () => void openMainWindow() },
    { label: "Sign out", click: () => void runtime?.signOut() },
    { label: "Exit", click: () => app.quit() },
  ]));
}

function requireRuntime(): AppRuntime {
  if (!runtime) throw new Error("The local agent is not ready.");
  return runtime;
}
