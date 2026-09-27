import assert from "node:assert/strict";
import test from "node:test";
import type {
  ApiResult,
  Device,
  Heartbeat,
  SyncQueueItem,
} from "../../../shared/contracts.js";
import { MockStudioMonitorApi } from "./mock-studio-monitor-api.js";
import { RealStudioOSApiClient } from "./real-studio-os-api-client.js";

const device: Device = {
  id: "device-id",
  displayName: "Studio Monitor",
  platform: "win32",
  operatingSystem: "Windows",
  agentVersion: "0.1.0",
  enrollmentState: "not-enrolled",
  createdAt: "2026-01-01T00:00:00.000Z",
  lastSuccessfulSync: null,
  lastHeartbeat: null,
};

const heartbeat: Heartbeat = {
  deviceId: device.id,
  agentVersion: device.agentVersion,
  occurredAt: "2026-01-01T00:00:00.000Z",
  connectionState: "online",
};

const syncItem: SyncQueueItem = {
  id: 1,
  clientEventId: "event-id",
  eventType: "attendance",
  timestamp: "2026-01-01T00:00:00.000Z",
  payload: {},
  syncStatus: "pending",
  retryCount: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  lastAttemptAt: null,
};

const expectedError = {
  ok: false,
  error: {
    code: "STUDIO_OS_API_NOT_CONFIGURED",
    message: "The Studio OS connection is not enabled.",
  },
} as const;

test("production adapter fails closed for every operation until the HTTP integration is enabled", async () => {
  const client = new RealStudioOSApiClient();
  const operations: readonly [string, () => Promise<ApiResult<unknown>>][] = [
    ["employee sign-in", () => client.authenticate("Employee")],
    ["device enrollment", () => client.enrollDevice(device)],
    ["device sign-out", () => client.signOutDevice()],
    ["device revocation", () => client.revokeDevice(device.id)],
    ["heartbeat", () => client.heartbeat(heartbeat)],
    ["sync acknowledgement", () => client.syncEvents([syncItem])],
    ["remote configuration", () => client.getConfiguration()],
  ];

  for (const [operation, request] of operations) {
    const result = await request();
    assert.deepEqual(
      result,
      expectedError,
      `${operation} must not report production success`,
    );
  }
});

test("the local demo adapter and production adapter remain distinguishable", async () => {
  const demo = new MockStudioMonitorApi();
  const production = new RealStudioOSApiClient();
  const demoAuthentication = await demo.authenticate("Employee");
  assert.deepEqual(demoAuthentication, {
    ok: true,
    data: { id: "local-demo-employee", displayName: "Employee" },
  });
  assert.deepEqual(await production.authenticate("Employee"), expectedError);

  const demoEnrollment = await demo.enrollDevice(device);
  assert.equal(demoEnrollment.ok, true);
  if (demoEnrollment.ok)
    assert.equal(demoEnrollment.data.enrollmentState, "mock-enrolled");
  assert.deepEqual(await production.enrollDevice(device), expectedError);
});
