import type {
  AgentConfiguration,
  Device,
  Heartbeat,
} from "../../../shared/contracts.js";
import type { StudioMonitorApi } from "../api/studio-monitor-api.js";
import type { LocalDatabase } from "../database/local-database.js";
import type { StructuredLogger } from "../logging/structured-logger.js";
import type { NetworkManager } from "../system/network-manager.js";
import { retryDelayMs, shouldPermanentlyFail } from "./retry-policy.js";

const RETENTION_DAYS = 30;
const PERMANENT_FAILURE_CODES = new Set([
  "VALIDATION_ERROR",
  "AUTHENTICATION_REQUIRED",
  "DEVICE_FORBIDDEN",
  "ENDPOINT_NOT_FOUND",
  "HTTP_400",
  "HTTP_401",
  "HTTP_403",
  "HTTP_404",
]);

export class SyncManager {
  readonly #database: LocalDatabase;
  readonly #api: StudioMonitorApi;
  readonly #network: NetworkManager;
  readonly #logger: StructuredLogger;
  readonly #configuration: AgentConfiguration;
  readonly #getDevice: () => Device | null;
  #heartbeatInFlight = false;
  #syncInFlight = false;

  constructor(options: {
    database: LocalDatabase;
    api: StudioMonitorApi;
    network: NetworkManager;
    logger: StructuredLogger;
    configuration: AgentConfiguration;
    getDevice: () => Device | null;
  }) {
    this.#database = options.database;
    this.#api = options.api;
    this.#network = options.network;
    this.#logger = options.logger;
    this.#configuration = options.configuration;
    this.#getDevice = options.getDevice;
  }

  async runOnce(): Promise<void> {
    await Promise.all([this.sendHeartbeat(), this.flushPending()]);
  }

  async sendHeartbeat(): Promise<void> {
    if (this.#heartbeatInFlight) return;
    this.#heartbeatInFlight = true;
    try {
      const device = this.#getDevice();
      if (!device || device.enrollmentState === "not-enrolled" || device.enrollmentState === "revoked") return;

      const now = new Date();
      const isOnline = this.#network.isNetworkAvailable();
      const heartbeat: Heartbeat = {
        deviceId: device.id,
        agentVersion: device.agentVersion,
        occurredAt: now.toISOString(),
        connectionState: isOnline ? "online" : "offline",
      };
      this.#database.saveHeartbeat(heartbeat);

      if (!isOnline) return;

      const heartbeatResult = await this.#api.heartbeat(heartbeat);
      if (!heartbeatResult.ok) {
        this.#logger.warn("SYNC_FAILED");
      }
    } catch {
      this.#logger.error("SYNC_FAILED");
    } finally {
      this.#heartbeatInFlight = false;
    }
  }

  async flushPending(): Promise<void> {
    if (this.#syncInFlight) return;
    this.#syncInFlight = true;
    try {
      const device = this.#getDevice();
      if (!device || device.enrollmentState === "not-enrolled" || device.enrollmentState === "revoked") return;
      const now = new Date();
      const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1_000).toISOString();
      this.#database.pruneSyncedEvents(cutoff);
      if (!this.#network.isNetworkAvailable()) return;

      const batch = this.#database.listPendingEvents(
        this.#configuration.syncBatchSize,
        now.toISOString(),
      );
      if (batch.length === 0) return;

      const clientEventIds = batch.map((item) => item.clientEventId);
      this.#database.markAttempted(clientEventIds, now.toISOString());
      const result = await this.#api.syncEvents(batch);

      if (!result.ok) {
        this.#handleFailure(clientEventIds, result.error.code, now);
        return;
      }

      const batchIds = new Set(clientEventIds);
      const acknowledged = [...new Set(result.data)].filter((id) => batchIds.has(id));
      const unacknowledged = clientEventIds.filter((id) => !acknowledged.includes(id));

      if (acknowledged.length > 0) {
        this.#database.acknowledgeEvents(acknowledged, new Date().toISOString());
        this.#logger.info("SYNC_COMPLETED");
      }
      if (unacknowledged.length > 0) {
        this.#handleFailure(unacknowledged, "ACKNOWLEDGEMENT_MISSING", now);
      }
    } catch {
      this.#logger.error("SYNC_FAILED");
    } finally {
      this.#syncInFlight = false;
    }
  }

  #handleFailure(eventIds: readonly string[], errorCode: string, now: Date): void {
    const retryCount = this.#database.listPendingEvents(
      this.#configuration.syncBatchSize,
      now.toISOString(),
    ).reduce((max, item) => Math.max(max, eventIds.includes(item.clientEventId) ? item.retryCount : 0), 0);

    if (shouldPermanentlyFail(retryCount, errorCode) || PERMANENT_FAILURE_CODES.has(errorCode)) {
      this.#database.markPermanentlyFailed(eventIds, errorCode);
      this.#logger.error("SYNC_FAILED");
      return;
    }

    const retryDelay = errorCode === "HTTP_429" || errorCode === "RATE_LIMITED"
      ? Math.max(30_000, retryDelayMs(retryCount))
      : retryDelayMs(retryCount);
    this.#database.scheduleRetry(
      eventIds,
      new Date(now.getTime() + retryDelay).toISOString(),
      errorCode,
    );
    this.#logger.warn("SYNC_FAILED");
  }
}