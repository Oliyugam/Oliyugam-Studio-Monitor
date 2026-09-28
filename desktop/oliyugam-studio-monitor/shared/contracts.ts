export interface Employee {
  id: string;
  displayName: string;
}

export interface Device {
  id: string;
  displayName: string;
  platform: string;
  operatingSystem: string;
  agentVersion: string;
  enrollmentState: "not-enrolled" | "mock-enrolled" | "enrolled" | "revoked";
  createdAt: string;
  lastSuccessfulSync: string | null;
  lastHeartbeat: string | null;
}

export interface AttendanceEvent {
  clientEventId: string;
  occurredAt: string;
  kind: "clock-in" | "clock-out" | "break-start" | "break-end";
}

export interface ActivityEvent {
  clientEventId: string;
  occurredAt: string;
  state: "active" | "idle";
  durationSeconds: number;
}

export type ApplicationCategory =
  | "CREATIVE"
  | "PRODUCTIVITY"
  | "COMMUNICATION"
  | "SYSTEM"
  | "OTHER";

export interface AppUsageEvent {
  clientEventId: string;
  applicationId: string;
  category: ApplicationCategory;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
}

export type SoftwareSupportLevel = "basic" | "enhanced";

/** A locally approved executable. Unlisted processes are never recorded as app usage. */
export interface SelectedApplication {
  id: string;
  displayName: string;
  executableName: string;
  enabled: boolean;
  supportLevel: SoftwareSupportLevel;
  connectorId: string | null;
}

/** State reported by a verified, software-specific connector. */
export interface SoftwareWorkState {
  applicationId: string;
  state: "idle" | "working" | "rendering" | "exporting" | "unavailable";
  observedAt: string;
}

export interface ConnectorEnrollment {
  endpoint: string;
  token: string;
}

export interface SystemMetrics {
  sampledAt: string;
  cpuPercent: number;
  memoryPercent: number;
  diskPercent: number;
  networkAvailable: boolean;
}

export interface Heartbeat {
  deviceId: string;
  agentVersion: string;
  occurredAt: string;
  connectionState: "online" | "offline";
}

export interface SyncQueueItem<TPayload = unknown> {
  id: number;
  clientEventId: string;
  eventType: string;
  timestamp: string;
  payload: TPayload;
  syncStatus: "pending" | "synced" | "failed";
  retryCount: number;
  createdAt: string;
  lastAttemptAt: string | null;
}

export interface AgentConfiguration {
  heartbeatIntervalMs: number;
  activitySampleIntervalMs: number;
  activityAggregationIntervalMs: number;
  idleThresholdMs: number;
  systemMetricIntervalMs: number;
  syncIntervalMs: number;
  offlineQueueLimit: number;
  syncBatchSize: number;
}

export type ApiState = "demo" | "not-configured" | "connected" | "offline";
export type MonitoringState = "active" | "paused" | "not-started" | "unsupported";

export type AttendanceState = "not-working" | "working" | "on-break";
export type AttendanceAction = AttendanceEvent["kind"];
export type UpdateState =
  | "UpdateAvailable"
  | "UpdateDownloading"
  | "UpdateReady"
  | "UpdateFailed";

export interface FoundationSnapshot {
  appName: string;
  version: string;
  employee: Employee | null;
  device: Device;
  apiState: ApiState;
  monitoringState: MonitoringState;
  attendanceState: AttendanceState;
  currentApplication: string | null;
  selectedApplications: readonly SelectedApplication[];
  softwareWorkStates: readonly SoftwareWorkState[];
  connectorEnrollment: ConnectorEnrollment;
  metrics: SystemMetrics | null;
  pendingSyncCount: number;
  failedSyncCount: number;
  lastSuccessfulSync: string | null;
  autoStartEnabled: boolean;
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

export type MonitoringStatusListener = (snapshot: FoundationSnapshot) => void;
