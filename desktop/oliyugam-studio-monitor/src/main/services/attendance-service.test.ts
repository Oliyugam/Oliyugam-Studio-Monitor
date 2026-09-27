import assert from "node:assert/strict";
import test from "node:test";
import { AttendanceStateMachine } from "./attendance-service.js";

test("attendance accepts a clock-in, break, resume, and clock-out sequence", () => {
  const machine = new AttendanceStateMachine();
  let state = machine.transition("not-working", "clock-in");
  assert.equal(state, "working");
  state = machine.transition(state, "break-start");
  assert.equal(state, "on-break");
  state = machine.transition(state, "break-end");
  assert.equal(state, "working");
  state = machine.transition(state, "clock-out");
  assert.equal(state, "not-working");
});

test("attendance rejects impossible transitions", () => {
  const machine = new AttendanceStateMachine();
  assert.throws(() => machine.transition("not-working", "clock-out"), {
    code: "VALIDATION_ERROR",
  });
  assert.throws(() => machine.transition("working", "break-end"), {
    code: "VALIDATION_ERROR",
  });
});