import assert from "node:assert/strict";
import test from "node:test";
import type { AgentConfiguration, Device } from "../../../shared/contracts.js";
import { MockStudioMonitorApi } from "../api/mock-studio-monitor-api.js";
import type { StudioMonitorApi } from "../api/studio-monitor-api.js";
import { LocalDatabase } from "../database/local-database.js";
import type { StructuredLogger } from "../logging/structured-logger.js";
import type { NetworkManager } from "../system/network-manager.js";
import { SyncManager } from "./sync-manager.js";

const configuration: AgentConfiguration = {
  heartbeatIntervalMs: 30_000,
  activitySampleIntervalMs: 15_000,
  activityAggregationIntervalMs: 900_000,
  idleThresholdMs: 300_000,
  systemMetricIntervalMs: 60_000,
  syncIntervalMs: 30_000,
  offlineQueueLimit: 100,
  syncBatchSize: 50,
};

const device: Device = {
  id: "sync-test-device",
  displayName: "Test workstation",
  platform: "win32",
  operatingSystem: "Windows 11",
  agentVersion: "0.1.0",
  enrollmentState: "mock-enrolled",
  createdAt: new Date().toISOString(),
  lastSuccessfulSync: null,
  lastHeartbeat: null,
};

const logger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as unknown as StructuredLogger;

function createManager(api: StudioMonitorApi, networkAvailable: boolean) {
  const database = new LocalDatabase("", { inMemory: true });
  database.saveDevice(device);
  const network = { isNetworkAvailable: () => networkAvailable } as unknown as NetworkManager;
  const manager = new SyncManager({
    database,
    api,
    network,
    logger,
    configuration,
    getDevice: () => database.getDevice(),
  });
  return { database, manager };
}

test("demo sync acknowledges local queue items and advances successful-sync time", async () => {
  const api = new MockStudioMonitorApi();
  const { database, manager } = createManager(api, true);
  try {
    database.addAttendanceEvent({
      clientEventId: "demo-sync-event",
      occurredAt: new Date().toISOString(),
      kind: "clock-in",
    });
    await manager.flushPending();
    assert.equal(database.getPendingCount(), 0);
    assert.ok(database.getLastSuccessfulSync());
  } finally {
    database.close();
  }
});

test("offline sync leaves queued events intact", async () => {
  const api = new MockStudioMonitorApi();
  const { database, manager } = createManager(api, false);
  try {
    database.addAttendanceEvent({
      clientEventId: "offline-sync-event",
      occurredAt: new Date().toISOString(),
      kind: "clock-in",
    });
    await manager.flushPending();
    assert.equal(database.getPendingCount(), 1);
    assert.equal(database.getFailedCount(), 0);
  } finally {
    database.close();
  }
});

test("rate-limited sync schedules a retry rather than losing the event", async () => {
  const mockApi = new MockStudioMonitorApi();
  const api: StudioMonitorApi = {
    authenticate: (name) => mockApi.authenticate(name),
    enrollDevice: (value) => mockApi.enrollDevice(value),
    heartbeat: (value) => mockApi.heartbeat(value),
    syncEvents: async () => ({
      ok: false,
      error: { code: "HTTP_429", message: "Rate limited" },
    }),
    getConfiguration: () => mockApi.getConfiguration(),
    signOutDevice: () => mockApi.signOutDevice(),
    revokeDevice: (id) => mockApi.revokeDevice(id),
  };
  const { database, manager } = createManager(api, true);
  try {
    database.addAttendanceEvent({
      clientEventId: "rate-limited-event",
      occurredAt: new Date().toISOString(),
      kind: "clock-in",
    });
    await manager.flushPending();
    const tooSoon = database.listPendingEvents(10, new Date(Date.now() + 10_000).toISOString());
    const retryable = database.listPendingEvents(10, new Date(Date.now() + 120_000).toISOString());
    assert.equal(tooSoon.length, 0);
    assert.equal(retryable[0]?.retryCount, 1);
    assert.equal(database.getPendingCount(), 1);
  } finally {
    database.close();
  }
});