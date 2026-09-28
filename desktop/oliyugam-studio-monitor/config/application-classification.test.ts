import assert from "node:assert/strict";
import test from "node:test";
import { classifyApplication } from "./application-classification.js";

test("application classification uses process names and falls back safely", () => {
  assert.equal(classifyApplication("Photoshop"), "CREATIVE");
  assert.equal(classifyApplication("photoshop.exe"), "CREATIVE");
  assert.equal(classifyApplication("teams"), "COMMUNICATION");
  assert.equal(classifyApplication("unknown-tool"), "OTHER");
  assert.equal(classifyApplication("__proto__"), "OTHER");
  assert.equal(classifyApplication("toString"), "OTHER");
});
