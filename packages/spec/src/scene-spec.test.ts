// Node-side half of the Section 1 gate: the frozen fixture validates, and a
// handful of referential-integrity violations are rejected. The Java
// SceneSpecValidationTest exercises the SAME fixture and the same cases, so the
// two validators are proven to agree.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { validateSceneSpec } from "./validate.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const authFlow = JSON.parse(
  readFileSync(resolve(repoRoot, "fixtures/01-auth-flow.json"), "utf8"),
);

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

test("01-auth-flow fixture passes validation", () => {
  const result = validateSceneSpec(authFlow);
  assert.ok(
    result.success,
    result.success
      ? ""
      : `expected valid, got issues:\n${JSON.stringify(result.error.issues, null, 2)}`,
  );
});

test("dangling timeline.target is rejected", () => {
  const bad = clone(authFlow);
  bad.timeline[0].target = "does_not_exist";
  const result = validateSceneSpec(bad);
  assert.equal(result.success, false);
});

test("dangling edge.from is rejected", () => {
  const bad = clone(authFlow);
  bad.edges[0].from = "ghost";
  const result = validateSceneSpec(bad);
  assert.equal(result.success, false);
});

test("unknown element kind is rejected", () => {
  const bad = clone(authFlow);
  bad.elements.push({ id: "x", kind: "wormhole", props: {} });
  const result = validateSceneSpec(bad);
  assert.equal(result.success, false);
});

test("unknown timeline verb is rejected", () => {
  const bad = clone(authFlow);
  bad.timeline[0].verb = "teleport";
  const result = validateSceneSpec(bad);
  assert.equal(result.success, false);
});

test("wrong target type for verb is rejected (packet.travel onto an element)", () => {
  const bad = clone(authFlow);
  // packet.travel must target an edge; point it at an element id instead.
  const travel = bad.timeline.find(
    (s: { verb: string }) => s.verb === "packet.travel",
  );
  travel.target = "client";
  const result = validateSceneSpec(bad);
  assert.equal(result.success, false);
});

test("duplicate element id is rejected", () => {
  const bad = clone(authFlow);
  bad.elements.push({ id: "api", kind: "label", props: { text: "dup" } });
  const result = validateSceneSpec(bad);
  assert.equal(result.success, false);
});
