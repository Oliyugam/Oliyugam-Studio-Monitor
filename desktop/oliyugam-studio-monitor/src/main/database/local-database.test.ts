import assert from "node:assert/strict";
import test from "node:test";
import type { AttendanceEvent, Device } from "../../../shared/contracts.js";
import { LocalDatabase } from "./local-database.js";

const timestamp = "2026-09-27T09:00:00.000Z";

function createDevice(): Device {
  return {
    id: "test-device",
    displayName: "Test workstation",
    platform: "win32",
    operatingSystem: "Windows 11",
    agentVersion: "0.1.0",
    enrollmentState: "mock-enrolled",
    createdAt: timestamp,
    lastSuccessfulSync: null,
    lastHeartbeat: null,
  };
}

function createEvent(id = "test-event"): AttendanceEvent {
  return { clientEventId: id, occurredAt: timestamp, kind: "clock-in" };
}

test("SQLite persists queued event identity and acknowledges only matching IDs", () => {
  const database = new LocalDatabase("", { inMemory: true });
  try {
    database.saveDevice(createDevice());
    database.addAttendanceEvent(createEvent());

    const queued = database.listPendingEvents(10, timestamp);
    assert.equal(queued.length, 1);
    assert.equal(queued[0]?.clientEventId, "test-event");
    assert.equal(queued[0]?.eventType, "attendance");

    database.acknowledgeEvents(["not-a-real-event"], timestamp);
    assert.equal(database.getPendingCount(), 1);
    assert.equal(database.getLastSuccessfulSync(), null);
    database.acknowledgeEvents(["test-event"], timestamp);
    assert.equal(database.getPendingCount(), 0);
    assert.equal(database.getLastSuccessfulSync(), timestamp);
    assert.throws(() => database.addAttendanceEvent(createEvent()), /UNIQUE constraint/u);
  } finally {
    database.close();
  }
});

test("offline queue limit includes terminal failures and preserves their count", () => {
  const database = new LocalDatabase("", { inMemory: true });
  try {
    database.setOfflineQueueLimit(1);
    database.addAttendanceEvent(createEvent());
    database.markPermanentlyFailed(["test-event"], "VALIDATION_ERROR");

    assert.equal(database.getPendingCount(), 0);
    assert.equal(database.getFailedCount(), 1);
    assert.equal(database.canQueueEvent(), false);
    assert.throws(() => database.addAttendanceEvent(createEvent("second-event")), /queue is full/u);
  } finally {
    database.close();
  }
});

test("attendance state is reset when its saved date is not today", () => {
  const database = new LocalDatabase("", { inMemory: true });
  try {
    database.setAttendanceState("working", new Date("2000-01-01T12:00:00"));
    assert.equal(database.getAttendanceState(new Date("2000-01-02T12:00:00")), "not-working");
  } finally {
    database.close();
  }
});

test("selected applications persist locally and reject malformed saved values", () => {
  const database = new LocalDatabase("", { inMemory: true });
  try {
    database.saveSelectedApplications([{
      id: "blender",
      displayName: "Blender",
      executableName: "blender.exe",
      enabled: true,
      supportLevel: "basic",
      connectorId: null,
    }]);
    assert.deepEqual(database.getSelectedApplications(), [{
      id: "blender",
      displayName: "Blender",
      executableName: "blender.exe",
      enabled: true,
      supportLevel: "basic",
      connectorId: null,
    }]);
  } finally {
    database.close();
  }
});
