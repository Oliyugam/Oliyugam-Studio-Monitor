import { app } from "electron";
import { agentConfiguration, APP_NAME } from "../../../config/app-config.js";
import type {
  ApiState,
  AttendanceState,
  FoundationSnapshot,
  MonitoringState,
  SelectedApplication,
} from "../../../shared/contracts.js";
import { MockStudioMonitorApi } from "../api/mock-studio-monitor-api.js";
import { RealStudioOSApiClient } from "../api/real-studio-os-api-client.js";
import { LocalDatabase } from "../database/local-database.js";
import { StructuredLogger } from "../logging/structured-logger.js";
import { MonitoringManager, createDeviceIdentity } from "../monitoring/monitoring-manager.js";
import { AgentServiceHost } from "./agent-service-host.js";
import { AttendanceService, type AttendanceAction } from "../services/attendance-service.js";
import { ValidationError } from "../services/agent-errors.js";
import { DeviceSetupService } from "../services/device-setup-service.js";
import { NetworkManager } from "../system/network-manager.js";
import { SyncManager } from "../sync/sync-manager.js";

export class AppRuntime {
  readonly #database: LocalDatabase;
  readonly #logger: StructuredLogger;
  readonly #api: MockStudioMonitorApi | RealStudioOSApiClient;
  readonly #setupService: DeviceSetupService;
  readonly #attendanceService: AttendanceService;
  readonly #monitoring: MonitoringManager;
  readonly #serviceHost: AgentServiceHost;
  readonly #apiState: ApiState;
  readonly #onStatusChanged: () => void;

  constructor(onStatusChanged: () => void) {
    this.#onStatusChanged = onStatusChanged;
    const userDataDirectory = app.getPath("userData");
    this.#database = new LocalDatabase(userDataDirectory);
    this.#database.setOfflineQueueLimit(agentConfiguration.OFFLINE_QUEUE_LIMIT);
    if (process.platform === "win32") {
      this.#database.setAutoStartEnabled(app.getLoginItemSettings().openAtLogin);
    }
    this.#logger = new StructuredLogger(app.getPath("logs"), this.#database);
    this.#api = agentConfiguration.STUDIO_MONITOR_API_MODE === "demo"
      ? new MockStudioMonitorApi()
      : new RealStudioOSApiClient();
    this.#apiState = agentConfiguration.STUDIO_MONITOR_API_MODE === "demo" ? "demo" : "not-configured";

    const device = createDeviceIdentity(this.#database.getDevice(), app.getVersion());
    this.#database.saveDevice(device);
    this.#database.saveAgentConfiguration({
      heartbeatIntervalMs: agentConfiguration.HEARTBEAT_INTERVAL_MS,
      activitySampleIntervalMs: agentConfiguration.ACTIVITY_SAMPLE_INTERVAL_MS,
      activityAggregationIntervalMs: agentConfiguration.ACTIVITY_AGGREGATION_INTERVAL_MS,
      idleThresholdMs: agentConfiguration.IDLE_THRESHOLD_MS,
      systemMetricIntervalMs: agentConfiguration.SYSTEM_METRIC_INTERVAL_MS,
      syncIntervalMs: agentConfiguration.SYNC_INTERVAL_MS,
      offlineQueueLimit: agentConfiguration.OFFLINE_QUEUE_LIMIT,
      syncBatchSize: agentConfiguration.SYNC_BATCH_SIZE,
    });

    const network = new NetworkManager();
    const syncManager = new SyncManager({
      database: this.#database,
      api: this.#api,
      network,
      logger: this.#logger,
      configuration: {
        heartbeatIntervalMs: agentConfiguration.HEARTBEAT_INTERVAL_MS,
        activitySampleIntervalMs: agentConfiguration.ACTIVITY_SAMPLE_INTERVAL_MS,
        activityAggregationIntervalMs: agentConfiguration.ACTIVITY_AGGREGATION_INTERVAL_MS,
        idleThresholdMs: agentConfiguration.IDLE_THRESHOLD_MS,
        systemMetricIntervalMs: agentConfiguration.SYSTEM_METRIC_INTERVAL_MS,
        syncIntervalMs: agentConfiguration.SYNC_INTERVAL_MS,
        offlineQueueLimit: agentConfiguration.OFFLINE_QUEUE_LIMIT,
        syncBatchSize: agentConfiguration.SYNC_BATCH_SIZE,
      },
      getDevice: () => this.#database.getDevice(),
    });
    this.#monitoring = new MonitoringManager({
      database: this.#database,
      logger: this.#logger,
      configuration: {
        heartbeatIntervalMs: agentConfiguration.HEARTBEAT_INTERVAL_MS,
        activitySampleIntervalMs: agentConfiguration.ACTIVITY_SAMPLE_INTERVAL_MS,
        activityAggregationIntervalMs: agentConfiguration.ACTIVITY_AGGREGATION_INTERVAL_MS,
        idleThresholdMs: agentConfiguration.IDLE_THRESHOLD_MS,
        systemMetricIntervalMs: agentConfiguration.SYSTEM_METRIC_INTERVAL_MS,
        syncIntervalMs: agentConfiguration.SYNC_INTERVAL_MS,
        offlineQueueLimit: agentConfiguration.OFFLINE_QUEUE_LIMIT,
        syncBatchSize: agentConfiguration.SYNC_BATCH_SIZE,
      },
      syncManager,
      getDevice: () => this.#database.getDevice(),
      isMonitoringEnabled: () =>
        this.#database.getMonitoringEnabled()
        && this.#database.getEmployee() !== null
        && this.#attendanceService.getState() === "working",
      onStatusChanged,
    });
    this.#serviceHost = new AgentServiceHost([this.#monitoring]);
    this.#setupService = new DeviceSetupService(this.#database, this.#api, this.#logger, app.getVersion());
    this.#attendanceService = new AttendanceService(this.#database, this.#logger);
  }

  async start(): Promise<void> {
    await this.#serviceHost.start();
    this.#logger.info("APP_STARTED");
  }

  async stop(): Promise<void> {
    await this.#serviceHost.stop();
    this.#logger.info("APP_STOPPED");
    await this.#logger.flush();
    this.#database.close();
  }

  getSnapshot(): FoundationSnapshot {
    const device = this.#database.getDevice() ?? createDeviceIdentity(null, app.getVersion());
    const monitoringState: MonitoringState = this.#monitoring.state;
    const attendanceState: AttendanceState = this.#attendanceService.getState();
    return {
      appName: APP_NAME,
      version: app.getVersion(),
      employee: this.#database.getEmployee(),
      device,
      apiState: this.#apiState,
      monitoringState,
      attendanceState,
      currentApplication: this.#database.getCurrentApplication(),
      selectedApplications: this.#database.getSelectedApplications(),
      metrics: this.#database.getLatestSystemMetrics(),
      pendingSyncCount: this.#database.getPendingCount(),
      failedSyncCount: this.#database.getFailedCount(),
      lastSuccessfulSync: this.#database.getLastSuccessfulSync(),
      autoStartEnabled: this.#database.getAutoStartEnabled(),
    };
  }

  async completeSetup(displayName: string): Promise<FoundationSnapshot> {
    await this.#setupService.completeSetup(displayName);
    this.#onStatusChanged();
    return this.getSnapshot();
  }

  applyAttendanceAction(action: AttendanceAction): FoundationSnapshot {
    const attendanceState = this.#attendanceService.apply(action);
    if (attendanceState === "working" && this.#database.getMonitoringEnabled()) {
      this.#monitoring.startCollection();
    } else {
      this.#monitoring.stopCollection();
    }
    this.#onStatusChanged();
    return this.getSnapshot();
  }

  async signOut(): Promise<FoundationSnapshot> {
    this.#database.setMonitoringEnabled(false);
    this.#monitoring.stopCollection();
    await this.#setupService.signOut();
    this.#onStatusChanged();
    return this.getSnapshot();
  }

  setMonitoringEnabled(enabled: boolean): FoundationSnapshot {
    const device = this.#database.getDevice();
    if (enabled && (
      !this.#database.getEmployee()
      || (device?.enrollmentState !== "enrolled" && device?.enrollmentState !== "mock-enrolled")
    )) {
      throw new ValidationError("Set up this device before enabling monitoring.");
    }
    this.#database.setMonitoringEnabled(enabled);
    if (enabled) this.#monitoring.startCollection();
    else this.#monitoring.stopCollection();
    this.#onStatusChanged();
    return this.getSnapshot();
  }

  setAutoStartEnabled(enabled: boolean): FoundationSnapshot {
    if (process.platform !== "win32") throw new Error("Windows startup settings are only available on Windows.");
    app.setLoginItemSettings({ openAtLogin: enabled });
    this.#database.setAutoStartEnabled(enabled);
    this.#onStatusChanged();
    return this.getSnapshot();
  }

  setSelectedApplications(applications: readonly SelectedApplication[]): FoundationSnapshot {
    this.#database.saveSelectedApplications(applications);
    this.#onStatusChanged();
    return this.getSnapshot();
  }

  async handleResume(): Promise<void> {
    await this.#monitoring.handleResume();
  }

  handleSuspend(): void {
    this.#monitoring.handleSuspend();
    this.#onStatusChanged();
  }

  refreshStatus(): void {
    this.#onStatusChanged();
  }

  logUnhandledError(): void {
    this.#logger.error("UNHANDLED_ERROR");
  }
}
