import { randomUUID } from "node:crypto";
import type { AttendanceEvent, AttendanceState } from "../../../shared/contracts.js";
import type { LocalDatabase } from "../database/local-database.js";
import type { StructuredLogger } from "../logging/structured-logger.js";
import { ValidationError } from "./agent-errors.js";

export type AttendanceAction = AttendanceEvent["kind"];

export class AttendanceStateMachine {
  transition(current: AttendanceState, action: AttendanceAction): AttendanceState {
    const transitions: Record<AttendanceState, Partial<Record<AttendanceAction, AttendanceState>>> = {
      "not-working": { "clock-in": "working" },
      working: { "clock-out": "not-working", "break-start": "on-break" },
      "on-break": { "break-end": "working", "clock-out": "not-working" },
    };
    const next = transitions[current][action];
    if (!next) throw new ValidationError("That attendance action is not available in the current state.");
    return next;
  }
}

export class AttendanceService {
  readonly #stateMachine = new AttendanceStateMachine();

  constructor(
    private readonly database: LocalDatabase,
    private readonly logger: StructuredLogger,
  ) {}

  getState(): AttendanceState {
    return this.database.getAttendanceState();
  }

  apply(action: AttendanceAction): AttendanceState {
    if (!this.database.canQueueEvent()) {
      this.logger.warn("QUEUE_LIMIT_REACHED");
      throw new ValidationError("There is not enough local space to record this attendance update.");
    }

    const current = this.getState();
    let next: AttendanceState;
    try {
      next = this.#stateMachine.transition(current, action);
    } catch (error) {
      this.logger.warn("ATTENDANCE_INVALID_TRANSITION");
      throw error;
    }

    const event: AttendanceEvent = {
      clientEventId: randomUUID(),
      occurredAt: new Date().toISOString(),
      kind: action,
    };
    this.database.addAttendanceEvent(event);
    this.database.setAttendanceState(next);
    return next;
  }
}