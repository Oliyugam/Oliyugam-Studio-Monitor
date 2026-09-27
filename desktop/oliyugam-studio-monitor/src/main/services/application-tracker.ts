import { randomUUID } from "node:crypto";
import type { ActivityEvent, AppUsageEvent } from "../../../shared/contracts.js";
import { classifyApplication } from "../../../config/application-classification.js";
import type { LocalDatabase } from "../database/local-database.js";
import type { StructuredLogger } from "../logging/structured-logger.js";

export class ApplicationTracker {
  readonly #database: LocalDatabase;
  readonly #logger: StructuredLogger;
  #lastActivityState: ActivityEvent["state"] | null = null;
  #lastActivityAt: number | null = null;
  #currentApplication: string | null = null;
  #applicationStartedAt: number | null = null;

  constructor(database: LocalDatabase, logger: StructuredLogger) {
    this.#database = database;
    this.#logger = logger;
  }

  observe(
    state: ActivityEvent["state"],
    processName: string | null,
    sampledAt = Date.now(),
  ): void {
    if (this.#lastActivityState !== state) {
      this.#flushActivity(sampledAt);
      this.#lastActivityState = state;
      this.#lastActivityAt = sampledAt;
    }

    const nextApplication = state === "active" ? normalizeProcessName(processName) : null;
    if (nextApplication === this.#currentApplication) return;

    this.#flushCurrentApplication(sampledAt);
    this.#currentApplication = nextApplication;
    this.#applicationStartedAt = nextApplication ? sampledAt : null;
    this.#database.setCurrentApplication(nextApplication);
  }

  flush(at = Date.now()): void {
    this.#flushActivity(at);
    if (this.#currentApplication && this.#applicationStartedAt !== null) {
      this.#flushCurrentApplication(at, true);
      this.#database.setCurrentApplication(this.#currentApplication);
    }
  }

  stop(at = Date.now()): void {
    this.#flushActivity(at);
    this.#flushCurrentApplication(at);
    this.#lastActivityState = null;
    this.#lastActivityAt = null;
  }

  #flushCurrentApplication(endedAt: number, keepOpen = false): void {
    if (!this.#currentApplication || this.#applicationStartedAt === null) return;
    const durationSeconds = Math.max(0, Math.floor((endedAt - this.#applicationStartedAt) / 1_000));
    if (durationSeconds > 0) {
      const event: AppUsageEvent = {
        clientEventId: randomUUID(),
        applicationId: this.#currentApplication,
        category: classifyApplication(this.#currentApplication),
        startedAt: new Date(this.#applicationStartedAt).toISOString(),
        endedAt: new Date(endedAt).toISOString(),
        durationSeconds,
      };
      this.#database.addAppUsageEvent(event);
    }
    if (keepOpen) {
      this.#applicationStartedAt = endedAt;
    } else {
      this.#currentApplication = null;
      this.#applicationStartedAt = null;
    }
  }

  #flushActivity(at: number): void {
    if (this.#lastActivityState === null || this.#lastActivityAt === null) return;
    const durationSeconds = Math.max(0, Math.floor((at - this.#lastActivityAt) / 1_000));
    if (durationSeconds > 0) {
      this.#database.addActivityEvent({
        clientEventId: randomUUID(),
        occurredAt: new Date(at).toISOString(),
        state: this.#lastActivityState,
        durationSeconds,
      });
    }
    this.#lastActivityAt = at;
  }
}

function normalizeProcessName(value: string | null): string | null {
  if (!value || !/^[\w.-]{1,128}$/u.test(value)) return null;
  return value.toLowerCase();
}