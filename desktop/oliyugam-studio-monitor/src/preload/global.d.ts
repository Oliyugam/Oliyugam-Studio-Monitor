import type { AttendanceAction, FoundationSnapshot, MonitoringStatusListener } from "../../shared/contracts.js";

declare global {
  interface Window {
    studioMonitor: {
      getFoundationSnapshot(): Promise<FoundationSnapshot>;
      completeSetup(displayName: string): Promise<FoundationSnapshot>;
      applyAttendanceAction(action: AttendanceAction): Promise<FoundationSnapshot>;
      setMonitoringEnabled(enabled: boolean): Promise<FoundationSnapshot>;
      setAutoStartEnabled(enabled: boolean): Promise<FoundationSnapshot>;
      signOut(): Promise<FoundationSnapshot>;
      onStatusChanged(listener: MonitoringStatusListener): () => void;
    };
  }
}

export {};