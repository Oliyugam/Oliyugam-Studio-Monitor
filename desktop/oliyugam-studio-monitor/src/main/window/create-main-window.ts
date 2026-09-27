import { app, BrowserWindow } from "electron";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { APP_NAME } from "../../../config/app-config.js";

const developmentUrl = process.env.VITE_DEV_SERVER_URL;

export async function createMainWindow(): Promise<BrowserWindow> {
  const window = new BrowserWindow({
    width: 1000,
    height: 720,
    minWidth: 760,
    minHeight: 560,
    show: false,
    title: APP_NAME,
    backgroundColor: "#101923",
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: !app.isPackaged,
    },
  });

  const packagedRendererPath = join(__dirname, "renderer", "index.html");
  const packagedRendererUrl = pathToFileURL(packagedRendererPath).href;

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, targetUrl) => {
    const allowedTarget = developmentUrl
      ? new URL(targetUrl).origin === new URL(developmentUrl).origin
      : targetUrl === packagedRendererUrl;

    if (!allowedTarget) event.preventDefault();
  });
  window.webContents.on("will-attach-webview", (event) => event.preventDefault());
  window.once("ready-to-show", () => window.show());

  if (!app.isPackaged && developmentUrl) {
    await window.loadURL(developmentUrl);
  } else {
    await window.loadFile(packagedRendererPath);
  }

  return window;
}