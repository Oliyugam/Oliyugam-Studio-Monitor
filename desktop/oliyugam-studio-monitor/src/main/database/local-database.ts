import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type {
  ActivityEvent,
  AgentConfiguration,
  AppUsageEvent,
  AttendanceEvent,
  Device,
  Employee,
  Heartbeat,
  SyncQueueItem,
  SystemMetrics,
} from "../../../shared/contracts.js";
import { DATABASE_SCHEMA } from "./schema.js";

export type LogLevel = "info" | "warn" | "error";

export class LocalDatabase {
  readonly #db: Database.Database;
  #offlineQueueLimit = 10_000;

  constructor(userDataDirectory: string, options: { inMemory?: boolean } = {}) {
    if (!options.inMemory) mkdirSync(userDataDirectory, { recursive: true });
    this.#db = new Database(
      options.inMemory ? ":memory:" : join(userDataDirectory, "studio-monitor.sqlite3"),
    );
    this.#db.pragma("journal_mode = WAL");
    this.#db.pragma("synchronous = NORMAL");
    this.#db.pragma("busy_timeout = 5000");
    const schemaVersion = this.#db.pragma("user_version", { simple: true }) as number;
    if (schemaVersion > 1) throw new Error("The local database version is not supported.");
    this.#db.exec(DATABASE_SCHEMA);
    this.#db.pragma("user_version = 1");
  }

  setOfflineQueueLimit(limit: number): void {
    this.#offlineQueueLimit = limit;
  }

  canQueueEvent(): boolean {
    const row = this.#db.prepare(
      `SELECT COUNT(*) AS count FROM sync_queue WHERE sync_status != 'synced'`,
    ).get() as { count: number };
    return row.count < this.#offlineQueueLimit;
  }

  close(): void {
    this.#db.close();
  }

  getDevice(): Device | null {
    const row = this.#db.prepare(
      `SELECT device_id, device_name, platform, operating_system, agent_version,
              enrollment_state, created_at, last_successful_sync, last_heartbeat
       FROM device_identity WHERE singleton_id = 1`,
    ).get() as DeviceRow | undefined;

    return row ? mapDevice(row) : null;
  }

  saveDevice(device: Device): void {
    this.#db.prepare(
      `INSERT INTO device_identity (
         singleton_id, device_id, device_name, platform, operating_system,
         agent_version, enrollment_state, created_at, last_successful_sync, last_heartbeat
       ) VALUES (1, @id, @displayName, @platform, @operatingSystem, @agentVersion,
                 @enrollmentState, @createdAt, @lastSuccessfulSync, @lastHeartbeat)
       ON CONFLICT(singleton_id) DO UPDATE SET
         device_id = excluded.device_id,
         device_name = excluded.device_name,
         platform = excluded.platform,
         operating_system = excluded.operating_system,
         agent_version = excluded.agent_version,
         enrollment_state = excluded.enrollment_state,
         last_successful_sync = excluded.last_successful_sync,
         last_heartbeat = excluded.last_heartbeat`,
    ).run(device);
  }

  saveEmployee(employee: Employee | null): void {
    this.#setConfig("employee", employee);
  }

  getEmployee(): Employee | null {
    return this.#getConfig<Employee | null>("employee", null);
  }

  saveAgentConfiguration(configuration: AgentConfiguration): void {
    this.#setConfig("agent-configuration", configuration);
  }

  getAgentConfiguration(): AgentConfiguration | null {
    return this.#getConfig<AgentConfiguration | null>("agent-configuration", null);
  }

  setAutoStartEnabled(enabled: boolean): void {
    this.#setConfig("auto-start-enabled", enabled);
  }

  getMonitoringEnabled(): boolean {
    return this.#getConfig("monitoring-enabled", false);
  }

  setMonitoringEnabled(enabled: boolean): void {
    this.#setConfig("monitoring-enabled", enabled);
  }

  saveEncryptedCredential(key: string, ciphertextBase64: string): void {
    this.#db.prepare(
      `INSERT INTO secure_credentials(key, ciphertext_base64, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         ciphertext_base64 = excluded.ciphertext_base64,
         updated_at = excluded.updated_at`,
    ).run(key, ciphertextBase64, new Date().toISOString());
  }

  getEncryptedCredential(key: string): string | null {
    const row = this.#db.prepare(
      `SELECT ciphertext_base64 FROM secure_credentials WHERE key = ?`,
    ).get(key) as { ciphertext_base64: string } | undefined;
    return row?.ciphertext_base64 ?? null;
  }

  removeEncryptedCredential(key: string): void {
    this.#db.prepare(`DELETE FROM secure_credentials WHERE key = ?`).run(key);
  }

  getAutoStartEnabled(): boolean {
    return this.#getConfig("auto-start-enabled", false);
  }

  getAttendanceState(at = new Date()): "not-working" | "working" | "on-break" {
    const state = this.#getConfig<"not-working" | "working" | "on-break">(
      "attendance-state",
      "not-working",
    );
    if (this.#getConfig("attendance-state-date", "") !== localDateKey(at)) {
      this.setAttendanceState("not-working", at);
      return "not-working";
    }
    return state === "working" || state === "on-break" ? state : "not-working";
  }

  setAttendanceState(state: "not-working" | "working" | "on-break", at = new Date()): void {
    this.#setConfig("attendance-state", state);
    this.#setConfig("attendance-state-date", localDateKey(at));
  }

  addAttendanceEvent(event: AttendanceEvent): number {
    return this.#enqueue("attendance", event, event.occurredAt, () =>
      this.#db.prepare(
        `INSERT INTO attendance_events
         (client_event_id, event_type, event_timestamp, payload_json, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(event.clientEventId, event.kind, event.occurredAt, JSON.stringify(event), new Date().toISOString()),
    );
  }

  addActivityEvent(event: ActivityEvent): number {
    return this.#enqueue("activity", event, event.occurredAt, () =>
      this.#db.prepare(
        `INSERT INTO activity_events
         (client_event_id, event_timestamp, payload_json, created_at)
         VALUES (?, ?, ?, ?)`,
      ).run(event.clientEventId, event.occurredAt, JSON.stringify(event), new Date().toISOString()),
    );
  }

  addAppUsageEvent(event: AppUsageEvent): number {
    return this.#enqueue("app-usage", event, event.endedAt, () =>
      this.#db.prepare(
        `INSERT INTO app_usage_events
         (client_event_id, application_id, category, started_at, ended_at, duration_seconds, payload_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        event.clientEventId,
        event.applicationId,
        event.category,
        event.startedAt,
        event.endedAt,
        event.durationSeconds,
        JSON.stringify(event),
        new Date().toISOString(),
      ),
    );
  }

  addSystemMetrics(metrics: SystemMetrics): number {
    this.#assertQueueCapacity();
    const eventId = randomUUID();
    const createdAt = new Date().toISOString();
    return this.#db.transaction(() => {
      this.#db.prepare(
        `INSERT INTO system_metrics
         (client_event_id, sampled_at, cpu_percent, memory_percent, disk_percent,
          network_available, payload_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        eventId,
        metrics.sampledAt,
        metrics.cpuPercent,
        metrics.memoryPercent,
        metrics.diskPercent,
        metrics.networkAvailable ? 1 : 0,
        JSON.stringify(metrics),
        createdAt,
      );
      return this.#insertQueue(eventId, "system-metrics", metrics.sampledAt, metrics, createdAt);
    })();
  }

  listPendingEvents(limit: number, now: string): SyncQueueItem[] {
    const rows = this.#db.prepare(
      `SELECT id, client_event_id, event_type, event_timestamp, payload_json,
              sync_status, retry_count, created_at, last_attempt_at
       FROM sync_queue
       WHERE sync_status = 'pending'
         AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
       ORDER BY id ASC LIMIT ?`,
    ).all(now, limit) as SyncQueueRow[];

    return rows.map((row) => ({
      id: row.id,
      clientEventId: row.client_event_id,
      eventType: row.event_type,
      timestamp: row.event_timestamp,
      payload: JSON.parse(row.payload_json) as unknown,
      syncStatus: row.sync_status,
      retryCount: row.retry_count,
      createdAt: row.created_at,
      lastAttemptAt: row.last_attempt_at,
    }));
  }

  markAttempted(eventIds: readonly string[], attemptedAt: string): void {
    const update = this.#db.prepare(
      `UPDATE sync_queue SET retry_count = retry_count + 1, last_attempt_at = ?
       WHERE client_event_id = ? AND sync_status = 'pending'`,
    );
    this.#db.transaction(() => {
      for (const eventId of eventIds) update.run(attemptedAt, eventId);
    })();
  }

  acknowledgeEvents(eventIds: readonly string[], acknowledgedAt: string): void {
    const updateQueue = this.#db.prepare(
      `UPDATE sync_queue SET sync_status = 'synced', next_attempt_at = NULL, error_code = NULL
       WHERE client_event_id = ? AND sync_status = 'pending'`,
    );
    this.#db.transaction(() => {
      let acknowledgedCount = 0;
      for (const eventId of eventIds) {
        if (updateQueue.run(eventId).changes === 0) continue;
        acknowledgedCount += 1;
        for (const table of ["attendance_events", "activity_events", "app_usage_events", "system_metrics"] as const) {
          this.#db.prepare(
            `UPDATE ${table} SET sync_status = 'synced' WHERE client_event_id = ?`,
          ).run(eventId);
        }
      }
      if (acknowledgedCount === 0) return;
      this.#db.prepare(
        `INSERT INTO sync_state(key, value) VALUES ('last-successful-sync', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      ).run(acknowledgedAt);
      this.#db.prepare(
        `UPDATE device_identity SET last_successful_sync = ? WHERE singleton_id = 1`,
      ).run(acknowledgedAt);
    })();
  }

  scheduleRetry(eventIds: readonly string[], retryAt: string, errorCode: string): void {
    const update = this.#db.prepare(
      `UPDATE sync_queue SET next_attempt_at = ?, error_code = ?, sync_status = 'pending'
       WHERE client_event_id = ?`,
    );
    this.#db.transaction(() => {
      for (const eventId of eventIds) update.run(retryAt, errorCode, eventId);
    })();
  }

  markPermanentlyFailed(eventIds: readonly string[], errorCode: string): void {
    const update = this.#db.prepare(
      `UPDATE sync_queue SET sync_status = 'failed', error_code = ?
       WHERE client_event_id = ?`,
    );
    this.#db.transaction(() => {
      for (const eventId of eventIds) update.run(errorCode, eventId);
    })();
  }

  getPendingCount(): number {
    const row = this.#db.prepare(
      `SELECT COUNT(*) AS count FROM sync_queue WHERE sync_status = 'pending'`,
    ).get() as { count: number };
    return row.count;
  }

  getFailedCount(): number {
    const row = this.#db.prepare(
      `SELECT COUNT(*) AS count FROM sync_queue WHERE sync_status = 'failed'`,
    ).get() as { count: number };
    return row.count;
  }

  getLastSuccessfulSync(): string | null {
    const row = this.#db.prepare(
      `SELECT value FROM sync_state WHERE key = 'last-successful-sync'`,
    ).get() as { value: string } | undefined;
    return row?.value ?? null;
  }

  getCurrentApplication(): string | null {
    return this.#getConfig<string | null>("current-application", null);
  }

  getLatestSystemMetrics(): SystemMetrics | null {
    const row = this.#db.prepare(
      `SELECT sampled_at, cpu_percent, memory_percent, disk_percent, network_available
       FROM system_metrics ORDER BY id DESC LIMIT 1`,
    ).get() as {
      sampled_at: string;
      cpu_percent: number;
      memory_percent: number;
      disk_percent: number;
      network_available: number;
    } | undefined;
    if (!row) return null;
    return {
      sampledAt: row.sampled_at,
      cpuPercent: row.cpu_percent,
      memoryPercent: row.memory_percent,
      diskPercent: row.disk_percent,
      networkAvailable: row.network_available === 1,
    };
  }

  setCurrentApplication(applicationName: string | null): void {
    this.#setConfig("current-application", applicationName);
  }

  saveHeartbeat(heartbeat: Heartbeat): void {
    this.#db.prepare(
      `UPDATE device_identity SET last_heartbeat = ? WHERE singleton_id = 1`,
    ).run(heartbeat.occurredAt);
  }

  addLocalLog(level: LogLevel, code: string, message: string, createdAt: string): void {
    this.#db.prepare(
      `INSERT INTO local_logs (created_at, level, code, message) VALUES (?, ?, ?, ?)`,
    ).run(createdAt, level, code, message);
    this.#db.prepare(
      `DELETE FROM local_logs
       WHERE id NOT IN (SELECT id FROM local_logs ORDER BY id DESC LIMIT 5000)`,
    ).run();
  }

  pruneSyncedEvents(cutoffIso: string): void {
    this.#db.transaction(() => {
      this.#db.prepare(
        `DELETE FROM sync_queue WHERE sync_status = 'synced' AND created_at < ?`,
      ).run(cutoffIso);
      for (const table of ["attendance_events", "activity_events", "app_usage_events", "system_metrics"] as const) {
        this.#db.prepare(
          `DELETE FROM ${table} WHERE sync_status = 'synced' AND created_at < ?`,
        ).run(cutoffIso);
      }
    })();
  }

  #enqueue(
    eventType: string,
    payload: unknown,
    timestamp: string,
    insertDomainEvent: () => Database.RunResult,
  ): number {
    this.#assertQueueCapacity();
    const clientEventId = payload !== null
      && typeof payload === "object"
      && "clientEventId" in payload
      && typeof payload.clientEventId === "string"
      ? payload.clientEventId
      : randomUUID();
    const createdAt = new Date().toISOString();
    return this.#db.transaction(() => {
      insertDomainEvent();
      return this.#insertQueue(clientEventId, eventType, timestamp, payload, createdAt);
    })();
  }

  #assertQueueCapacity(): void {
    if (!this.canQueueEvent()) {
      throw new Error("Offline event queue is full.");
    }
  }

  #insertQueue(
    clientEventId: string,
    eventType: string,
    timestamp: string,
    payload: unknown,
    createdAt: string,
  ): number {
    const result = this.#db.prepare(
      `INSERT INTO sync_queue
       (client_event_id, event_type, event_timestamp, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(clientEventId, eventType, timestamp, JSON.stringify(payload), createdAt);
    return Number(result.lastInsertRowid);
  }

  #setConfig(key: string, value: unknown): void {
    this.#db.prepare(
      `INSERT INTO agent_config(key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ).run(key, JSON.stringify(value));
  }

  #getConfig<T>(key: string, fallback: T): T {
    const row = this.#db.prepare(
      `SELECT value FROM agent_config WHERE key = ?`,
    ).get(key) as { value: string } | undefined;
    if (!row) return fallback;
    try {
      return JSON.parse(row.value) as T;
    } catch {
      return fallback;
    }
  }
}

interface DeviceRow {
  device_id: string;
  device_name: string;
  platform: string;
  operating_system: string;
  agent_version: string;
  enrollment_state: Device["enrollmentState"];
  created_at: string;
  last_successful_sync: string | null;
  last_heartbeat: string | null;
}

interface SyncQueueRow {
  id: number;
  client_event_id: string;
  event_type: string;
  event_timestamp: string;
  payload_json: string;
  sync_status: SyncQueueItem["syncStatus"];
  retry_count: number;
  created_at: string;
  last_attempt_at: string | null;
}

function mapDevice(row: DeviceRow): Device {
  return {
    id: row.device_id,
    displayName: row.device_name,
    platform: row.platform,
    operatingSystem: row.operating_system,
    agentVersion: row.agent_version,
    enrollmentState: row.enrollment_state,
    createdAt: row.created_at,
    lastSuccessfulSync: row.last_successful_sync,
    lastHeartbeat: row.last_heartbeat,
  };
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}