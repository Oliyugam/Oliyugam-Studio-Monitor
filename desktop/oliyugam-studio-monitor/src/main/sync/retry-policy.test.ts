import assert from "node:assert/strict";
import test from "node:test";
import { retryDelayMs, shouldPermanentlyFail } from "./retry-policy.js";

test("retry delay is bounded and jitter stays within the documented range", () => {
  assert.equal(retryDelayMs(0, 0), 750);
  assert.equal(retryDelayMs(0, 1), 1_250);
  assert.equal(retryDelayMs(20, 1), 15 * 60 * 1_000);
  assert.equal(retryDelayMs(20, 0.5), 15 * 60 * 1_000);
});

test("invalid payloads and exhausted retries become terminal failures", () => {
  assert.equal(shouldPermanentlyFail(0, "VALIDATION_ERROR"), true);
  assert.equal(shouldPermanentlyFail(12, "SERVER_ERROR"), true);
  assert.equal(shouldPermanentlyFail(4, "SERVER_ERROR"), false);
});