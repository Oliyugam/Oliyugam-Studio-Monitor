import { contextBridge, ipcRenderer } from "electron";
import type { AttendanceAction, FoundationSnapshot, MonitoringStatusListener, SelectedApplication } from "../../shared/contracts.js";

const bridge = Object.freeze({
  getFoundationSnapshot: (): Promise<FoundationSnapshot> =>
    ipcRenderer.invoke("agent:get-snapshot") as Promise<FoundationSnapshot>,
  completeSetup: (displayName: string): Promise<FoundationSnapshot> =>
    ipcRenderer.invoke("setup:complete", { displayName }) as Promise<FoundationSnapshot>,
  applyAttendanceAction: (action: AttendanceAction): Promise<FoundationSnapshot> =>
    ipcRenderer.invoke("attendance:apply", action) as Promise<FoundationSnapshot>,
  setMonitoringEnabled: (enabled: boolean): Promise<FoundationSnapshot> =>
    ipcRenderer.invoke("monitoring:set-enabled", enabled) as Promise<FoundationSnapshot>,
  setAutoStartEnabled: (enabled: boolean): Promise<FoundationSnapshot> =>
    ipcRenderer.invoke("settings:set-auto-start", enabled) as Promise<FoundationSnapshot>,
  setSelectedApplications: (applications: readonly SelectedApplication[]): Promise<FoundationSnapshot> =>
    ipcRenderer.invoke("settings:set-selected-applications", applications) as Promise<FoundationSnapshot>,
  signOut: (): Promise<FoundationSnapshot> =>
    ipcRenderer.invoke("agent:sign-out") as Promise<FoundationSnapshot>,
  onStatusChanged: (listener: MonitoringStatusListener): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, snapshot: FoundationSnapshot) => listener(snapshot);
    ipcRenderer.on("agent:status-changed", handler);
    return () => ipcRenderer.removeListener("agent:status-changed", handler);
  },
});

contextBridge.exposeInMainWorld("studioMonitor", bridge);
