// Turns a SceneSpec timeline into a concrete, deterministic schedule of start
// frames — the single source of "when does each beat happen." Pure: depends only
// on the spec + fps, never on wall-clock. Drives both the Scene rendering and the
// composition's computed duration.

import type { SceneSpec, Verb } from "@toucan/spec";
import type { LayoutResult } from "../layout/index.js";
import { msToFrames } from "../timing.js";

export interface ScheduledStep {
  verb: Verb;
  target: string;
  startFrame: number;
  durationMs: number;
  args: Record<string, unknown>;
}

export interface Schedule {
  fps: number;
  beatMs: number;
  appearStart: Record<string, number>;
  appearDurMs: number;
  edgeDrawStartFrame: number;
  edgeDrawDurMs: number;
  introEndFrame: number;
  steps: ScheduledStep[];
  durationInFrames: number;
}

const APPEAR_MS = 320;
const APPEAR_STAGGER_MS = 80;
const EDGE_DRAW_MS = 400;
const TAIL_BEATS = 1; // breathing room after the last beat

/** Primary animation/advance duration per verb (ms). packet.travel uses the beat. */
function verbMs(
  verb: Verb,
  beatMs: number,
  args: Record<string, unknown>,
): number {
  switch (verb) {
    case "packet.travel": {
      const speed =
        typeof args.speed === "number" && args.speed > 0 ? args.speed : 1;
      return beatMs / speed;
    }
    case "camera.focus":
      return 600;
    case "edge.draw":
      return EDGE_DRAW_MS;
    case "highlight":
      return typeof args.duration === "number" ? args.duration : 1000;
    case "node.state":
    case "label.show":
      return 320;
    default:
      return beatMs;
  }
}

export function buildSchedule(
  spec: SceneSpec,
  layout: LayoutResult,
  fps: number,
): Schedule {
  const beatMs = spec.meta?.beatDurationMs ?? 900;
  const beatFrames = msToFrames(beatMs, fps);

  // Reading order for the entrance stagger: left-to-right, then top-to-bottom.
  const ordered = [...spec.elements].sort((a, b) => {
    const A = layout.nodes[a.id];
    const B = layout.nodes[b.id];
    if (!A || !B) return a.id < b.id ? -1 : 1;
    return A.x - B.x || A.y - B.y || (a.id < b.id ? -1 : 1);
  });

  const appearStart: Record<string, number> = {};
  ordered.forEach((el, i) => {
    appearStart[el.id] = msToFrames(i * APPEAR_STAGGER_MS, fps);
  });
  const lastAppearEnd = msToFrames(
    Math.max(0, ordered.length - 1) * APPEAR_STAGGER_MS + APPEAR_MS,
    fps,
  );

  const edgeDrawStartFrame = lastAppearEnd;
  const introEndFrame = edgeDrawStartFrame + msToFrames(EDGE_DRAW_MS, fps);

  // Sequence the timeline from the end of the intro.
  const steps: ScheduledStep[] = [];
  const endByTarget: Record<string, number> = {};
  let cursor = introEndFrame;
  for (const raw of spec.timeline) {
    const args = (raw.args ?? {}) as Record<string, unknown>;
    const durationMs = verbMs(raw.verb, beatMs, args);
    let start: number;
    if (typeof raw.at === "number") {
      start = introEndFrame + raw.at * beatFrames;
    } else if (raw.after && endByTarget[raw.after] != null) {
      start = Math.max(cursor, endByTarget[raw.after]);
    } else {
      start = cursor;
    }
    const end = start + msToFrames(durationMs, fps);
    steps.push({
      verb: raw.verb,
      target: raw.target,
      startFrame: start,
      durationMs,
      args,
    });
    endByTarget[raw.target] = end;
    cursor = Math.max(cursor, end);
  }

  const lastEnd = steps.reduce(
    (m, s) => Math.max(m, s.startFrame + msToFrames(s.durationMs, fps)),
    introEndFrame,
  );
  const durationInFrames = Math.ceil(lastEnd + TAIL_BEATS * beatFrames);

  return {
    fps,
    beatMs,
    appearStart,
    appearDurMs: APPEAR_MS,
    edgeDrawStartFrame,
    edgeDrawDurMs: EDGE_DRAW_MS,
    introEndFrame,
    steps,
    durationInFrames,
  };
}

/** Composition duration for a spec at a given fps (used by Root's calculateMetadata). */
export function sceneDurationInFrames(durationInFrames: number): number {
  return Math.max(1, durationInFrames);
}
