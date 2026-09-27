import { randomUUID } from "node:crypto";
import { hostname, release } from "node:os";
import type { AgentConfiguration, Device } from "../../../shared/contracts.js";
import type { BackgroundService } from "../runtime/agent-service-host.js";
import type { LocalDatabase } from "../database/local-database.js";
import type { StructuredLogger } from "../logging/structured-logger.js";
import { ApplicationTracker } from "../services/application-tracker.js";
import { SystemHealthMonitor } from "../system/system-health-monitor.js";
import { WindowsSessionInspector } from "../system/windows-session-inspector.js";
import type { SyncManager } from "../sync/sync-manager.js";

export class MonitoringManager implements BackgroundService {
  readonly #database: LocalDatabase;
  readonly #logger: StructuredLogger;
  readonly #configuration: AgentConfiguration;
  readonly #syncManager: SyncManager;
  readonly #sessionInspector = new WindowsSessionInspector();
  readonly #healthMonitor = new SystemHealthMonitor();
  readonly #applicationTracker: ApplicationTracker;
  readonly #getDevice: () => Device | null;
  readonly #isMonitoringEnabled: () => boolean;
  readonly #onStatusChanged: () => void;
  readonly #timers: NodeJS.Timeout[] = [];
  #started = false;
  #collecting = false;
  #sessionSampleInFlight = false;
  #metricsSampleInFlight = false;
  #syncInFlight = false;
  #requested = false;
  #hasStartedCollection = false;

  constructor(options: {
    database: LocalDatabase;
    logger: StructuredLogger;
    configuration: AgentConfiguration;
    syncManager: SyncManager;
    getDevice: () => Device | null;
    isMonitoringEnabled: () => boolean;
    onStatusChanged: () => void;
  }) {
    this.#database = options.database;
    this.#logger = options.logger;
    this.#configuration = options.configuration;
    this.#syncManager = options.syncManager;
    this.#getDevice = options.getDevice;
    this.#isMonitoringEnabled = options.isMonitoringEnabled;
    this.#onStatusChanged = options.onStatusChanged;
    this.#applicationTracker = new ApplicationTracker(options.database, options.logger);
  }

  get state(): "active" | "paused" | "not-started" | "unsupported" {
    if (process.platform !== "win32") return "unsupported";
    if (this.#collecting) return "active";
    return this.#hasStartedCollection ? "paused" : "not-started";
  }

  async start(): Promise<void> {
    this.#started = true;
    if (process.platform === "win32" && this.#isEnrolled() && this.#isMonitoringEnabled()) {
      this.startCollection();
    }
  }

  async stop(): Promise<void> {
    this.stopCollection();
    this.#started = false;
  }

  startCollection(): void {
    this.#requested = true;
    if (!this.#started || process.platform !== "win32" || !this.#isEnrolled() || this.#collecting) {
      return;
    }
    this.#collecting = true;
    this.#hasStartedCollection = true;
    this.#logger.info("MONITORING_STARTED");

    void this.#sampleSession();
    void this.#sampleSystemHealth();
    void this.#runSync();

    this.#timers.push(setInterval(() => void this.#sampleSession(), this.#configuration.activitySampleIntervalMs));
    this.#timers.push(setInterval(() => void this.#sampleSystemHealth(), this.#configuration.systemMetricIntervalMs));
    this.#timers.push(setInterval(() => void this.#runHeartbeat(), this.#configuration.heartbeatIntervalMs));
    this.#timers.push(setInterval(() => void this.#runSync(), this.#configuration.syncIntervalMs));
    this.#timers.push(setInterval(() => this.#flushAggregation(), this.#configuration.activityAggregationIntervalMs));
    this.#onStatusChanged();
  }

  stopCollection(): void {
    this.#requested = false;
    this.#clearCollection();
    this.#logger.info("MONITORING_STOPPED");
    this.#onStatusChanged();
  }

  handleSuspend(): void {
    if (!this.#collecting) return;
    this.#clearCollection();
    this.#onStatusChanged();
  }

  async handleResume(): Promise<void> {
    if (!this.#requested || !this.#started || !this.#isEnrolled()) return;
    this.startCollection();
    await Promise.all([this.#sampleSession(), this.#sampleSystemHealth(), this.#runHeartbeat(), this.#runSync()]);
  }

  async refreshStatus(): Promise<void> {
    this.#onStatusChanged();
  }

  #isEnrolled(): boolean {
    const device = this.#getDevice();
    return device?.enrollmentState === "enrolled" || device?.enrollmentState === "mock-enrolled";
  }

  async #sampleSession(): Promise<void> {
    if (!this.#collecting || this.#sessionSampleInFlight) return;
    this.#sessionSampleInFlight = true;
    try {
      const sample = await this.#sessionInspector.sample();
      const state = sample.idleMilliseconds >= this.#configuration.idleThresholdMs ? "idle" : "active";
      this.#applicationTracker.observe(state, sample.processName);
      this.#onStatusChanged();
    } catch {
      this.#logger.error("MONITORING_SAMPLE_FAILED");
    } finally {
      this.#sessionSampleInFlight = false;
    }
  }

  async #sampleSystemHealth(): Promise<void> {
    if (!this.#collecting || this.#metricsSampleInFlight) return;
    this.#metricsSampleInFlight = true;
    try {
      const metrics = await this.#healthMonitor.sample();
      if (!this.#database.canQueueEvent()) {
        this.#logger.warn("QUEUE_LIMIT_REACHED");
      } else {
        const { sampledAt, ...payload } = metrics;
        this.#database.addSystemMetrics({
          ...payload,
          sampledAt,
        });
      }
      this.#onStatusChanged();
    } catch {
      this.#logger.error("MONITORING_SAMPLE_FAILED");
    } finally {
      this.#metricsSampleInFlight = false;
    }
  }

  async #runSync(): Promise<void> {
    if (!this.#collecting || this.#syncInFlight) return;
    this.#syncInFlight = true;
    try {
      await this.#syncManager.runOnce();
      this.#onStatusChanged();
    } finally {
      this.#syncInFlight = false;
    }
  }

  async #runHeartbeat(): Promise<void> {
    if (!this.#collecting) return;
    try {
      await this.#syncManager.sendHeartbeat();
      this.#onStatusChanged();
    } catch {
      this.#logger.error("SYNC_FAILED");
    }
  }

  #flushAggregation(): void {
    if (!this.#collecting) return;
    try {
      this.#applicationTracker.flush();
      this.#onStatusChanged();
    } catch {
      this.#logger.error("MONITORING_SAMPLE_FAILED");
    }
  }

  #clearCollection(): void {
    if (!this.#collecting) return;
    for (const timer of this.#timers.splice(0)) clearInterval(timer);
    try {
      this.#applicationTracker.stop();
    } catch {
      this.#logger.error("MONITORING_SAMPLE_FAILED");
    } finally {
      this.#collecting = false;
      this.#database.setCurrentApplication(null);
    }
  }
}

export function createDeviceIdentity(existing: Device | null, version: string): Device {
  if (existing) return { ...existing, agentVersion: version };
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    displayName: hostname(),
    platform: process.platform,
    operatingSystem: release(),
    agentVersion: version,
    enrollmentState: "not-enrolled",
    createdAt: now,
    lastSuccessfulSync: null,
    lastHeartbeat: null,
  };
}