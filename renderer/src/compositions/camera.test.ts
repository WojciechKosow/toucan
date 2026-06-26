// camera.focus framing (visual-style.md §6): the focused target and its
// immediate neighbors must stay within the safe area, and the whole graph stays
// in when it fits — so a focus never pushes a node off the frame. Plus the
// determinism contract (§10): same frame → identical camera transform.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import type { SceneSpec } from "@toucan/spec";
import { layoutScene } from "../layout/layout.js";
import { SAFE_MARGIN, STAGE } from "../layout/constants.js";
import { buildTheme } from "../theme.js";
import { interFontFamily } from "../fonts.js";
import { buildSchedule } from "./schedule.js";
import { deriveRenderState } from "./runtime.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const heroSpec: SceneSpec = JSON.parse(
  readFileSync(resolve(repoRoot, "fixtures/01-auth-flow.json"), "utf8"),
);

const FPS = 30;
const theme = buildTheme({}, interFontFamily);

function cameraAt(frame: number) {
  const layout = layoutScene(heroSpec);
  const schedule = buildSchedule(heroSpec, layout, FPS);
  const rs = deriveRenderState(heroSpec, layout, schedule, frame, FPS, theme);
  return { layout, schedule, camera: rs.camera };
}

test("camera.focus keeps every node inside the safe area (§6)", () => {
  const { layout, schedule } = cameraAt(0);
  const focus = schedule.steps.find((s) => s.verb === "camera.focus");
  assert.ok(focus, "fixture should have a camera.focus");
  // a frame fully into the eased focus (camera move is 600ms = 18f)
  const { camera } = cameraAt(focus.startFrame + 24);
  assert.ok(camera.scale > 1, "focus should zoom in");

  for (const b of Object.values(layout.nodes)) {
    const left = (b.x - b.width / 2) * camera.scale + camera.x;
    const right = (b.x + b.width / 2) * camera.scale + camera.x;
    const top = (b.y - b.height / 2) * camera.scale + camera.y;
    const bottom = (b.y + b.height / 2) * camera.scale + camera.y;
    assert.ok(left >= SAFE_MARGIN - 0.5, `${b.id} clips left (${left})`);
    assert.ok(
      right <= STAGE.width - SAFE_MARGIN + 0.5,
      `${b.id} clips right (${right})`,
    );
    assert.ok(top >= SAFE_MARGIN - 0.5, `${b.id} clips top (${top})`);
    assert.ok(
      bottom <= STAGE.height - SAFE_MARGIN + 0.5,
      `${b.id} clips bottom (${bottom})`,
    );
  }
});

test("camera transform is deterministic for a given frame (§10)", () => {
  const focus = cameraAt(0).schedule.steps.find(
    (s) => s.verb === "camera.focus",
  );
  const frame = (focus?.startFrame ?? 0) + 10;
  const first = JSON.stringify(cameraAt(frame).camera);
  for (let i = 0; i < 50; i++) {
    assert.equal(JSON.stringify(cameraAt(frame).camera), first);
  }
});
