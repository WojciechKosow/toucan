// The render state for a single frame — everything the Scene needs to draw,
// derived as a pure function of the frame index from the schedule. Verb dispatch
// goes through the registries below (element-verbs / edge-verbs maps + a camera
// resolver) — never an inline switch on verb (build-plan rule).

import type { Edge, SceneSpec, Verb } from "@toucan/spec";
import {
  LIVE_AREA,
  SAFE_MARGIN,
  type LayoutResult,
  type NodeBox,
} from "../layout/index.js";
import type { Theme } from "../theme.js";
import { msToFrames, progress } from "../timing.js";
import type { Schedule, ScheduledStep } from "./schedule.js";

export type ElementState =
  | "idle"
  | "active"
  | "processing"
  | "success"
  | "error";

export interface ElementRuntime {
  appear: number; // 0..1 entrance progress
  state: ElementState;
  stateSinceFrame: number;
  highlight: number; // 0..1 focus-ring intensity (0 = none)
}

export interface PacketRender {
  t: number; // 0..1 along the route
  labelText?: string;
  labelOpacity: number;
}

export interface EdgeRuntime {
  draw: number; // 0..1 stroke-in progress
  lit: number; // 0..1 warm trail
  arrival: number; // 0..1 arrival-pulse progress (0 = none)
  packets: PacketRender[];
}

export interface CameraTransform {
  x: number;
  y: number;
  scale: number;
}

export interface RenderState {
  camera: CameraTransform;
  elements: Record<string, ElementRuntime>;
  edges: Record<string, EdgeRuntime>;
}

const LABEL_KINDS = new Set(["label", "edge-label"]);

interface Ctx {
  step: ScheduledStep;
  frame: number;
  fps: number;
  theme: Theme;
  state: RenderState;
}

// ── element-targeting verbs ──
const ELEMENT_VERBS: Partial<Record<Verb, (c: Ctx) => void>> = {
  "node.state": ({ step, frame, state }) => {
    if (frame < step.startFrame) return;
    const el = state.elements[step.target];
    if (!el) return;
    const next = String(step.args.state ?? "active") as ElementState;
    el.state = next; // later steps win (timeline iterated in order)
    el.stateSinceFrame = step.startFrame;
  },
  "label.show": ({ step, frame, fps, theme, state }) => {
    const el = state.elements[step.target];
    if (!el) return;
    el.appear = Math.max(
      el.appear,
      progress(
        frame,
        step.startFrame,
        theme.motion.ms.base,
        fps,
        theme.motion.easing.outSoft,
      ),
    );
  },
  highlight: ({ step, frame, fps, theme, state }) =>
    applyHighlight(step, frame, fps, theme, state),
};

// ── edge-targeting verbs ──
const EDGE_VERBS: Partial<Record<Verb, (c: Ctx) => void>> = {
  "edge.draw": ({ step, frame, fps, theme, state }) => {
    const e = state.edges[step.target];
    if (!e) return;
    e.draw = Math.max(
      e.draw,
      progress(
        frame,
        step.startFrame,
        theme.motion.ms.base + 80,
        fps,
        theme.motion.easing.outSoft,
      ),
    );
  },
  "packet.travel": ({ step, frame, fps, theme, state }) => {
    const e = state.edges[step.target];
    if (!e) return;
    const durFrames = msToFrames(step.durationMs, fps);
    const baseFrames = msToFrames(theme.motion.ms.base, fps);
    e.draw = 1; // a packet implies the edge is present
    if (frame >= step.startFrame && frame <= step.startFrame + durFrames) {
      const t = progress(
        frame,
        step.startFrame,
        step.durationMs,
        fps,
        theme.motion.easing.inOut,
      );
      const label =
        typeof step.args.label === "string" ? step.args.label : undefined;
      const labelOpacity = label
        ? Math.min(
            progress(
              frame,
              step.startFrame,
              theme.motion.ms.fast,
              fps,
              theme.motion.easing.outSoft,
            ),
            1 -
              progress(
                frame,
                step.startFrame + durFrames - baseFrames,
                theme.motion.ms.fast,
                fps,
                theme.motion.easing.outSoft,
              ),
          )
        : 0;
      e.packets.push({ t, labelText: label, labelOpacity });
      e.lit = Math.max(e.lit, t);
    } else if (frame > step.startFrame + durFrames) {
      // trail fades back to connector over base (default: fades), arrival pulse fires
      const fade = progress(
        frame,
        step.startFrame + durFrames,
        theme.motion.ms.base,
        fps,
        theme.motion.easing.outSoft,
      );
      const stayLit = step.args.stayLit === true;
      e.lit = Math.max(e.lit, stayLit ? 1 : 1 - fade);
      e.arrival = Math.max(
        e.arrival,
        1 -
          progress(
            frame,
            step.startFrame + durFrames,
            theme.motion.ms.base,
            fps,
            theme.motion.easing.emphasis,
          ),
      );
    }
  },
  highlight: ({ step, frame, fps, theme, state }) =>
    applyHighlight(step, frame, fps, theme, state),
};

function applyHighlight(
  step: ScheduledStep,
  frame: number,
  fps: number,
  theme: Theme,
  state: RenderState,
): void {
  const durFrames = msToFrames(step.durationMs, fps);
  if (frame < step.startFrame || frame > step.startFrame + durFrames) return;
  const inAmt = progress(
    frame,
    step.startFrame,
    theme.motion.ms.fast,
    fps,
    theme.motion.easing.outSoft,
  );
  const target = state.elements[step.target] ?? null;
  if (target) target.highlight = Math.max(target.highlight, inAmt);
  const edge = state.edges[step.target];
  if (edge) edge.arrival = Math.max(edge.arrival, inAmt);
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  w: number;
  h: number;
}

function boundsOf(boxes: NodeBox[]): Bounds | null {
  if (boxes.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of boxes) {
    minX = Math.min(minX, b.x - b.width / 2);
    minY = Math.min(minY, b.y - b.height / 2);
    maxX = Math.max(maxX, b.x + b.width / 2);
    maxY = Math.max(maxY, b.y + b.height / 2);
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

/** Clamp a pan into [lo, hi]; if the content is wider than the window, center it. */
function clampPan(v: number, lo: number, hi: number): number {
  return lo > hi ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, v));
}

function cameraTransform(
  spec: SceneSpec,
  steps: ScheduledStep[],
  frame: number,
  fps: number,
  theme: Theme,
  layout: LayoutResult,
): CameraTransform {
  const identity: CameraTransform = { x: 0, y: 0, scale: 1 };
  const focusSteps = steps.filter((s) => s.verb === "camera.focus");
  if (focusSteps.length === 0) return identity;

  // Immediate neighbors (edge-adjacent) of each element, for the §6 focus framing.
  const neighbors = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (!neighbors.has(a)) neighbors.set(a, new Set());
    neighbors.get(a)!.add(b);
  };
  for (const e of spec.edges ?? []) {
    link(e.from, e.to);
    link(e.to, e.from);
  }
  const graph = boundsOf(Object.values(layout.nodes));
  const W = layout.stage.width;
  const H = layout.stage.height;

  const targetFor = (id: string): CameraTransform => {
    const box = layout.nodes[id];
    if (!box || !graph) return identity;

    // §6: the target + its immediate neighbors must stay within the safe area.
    const nbIds = new Set<string>([id, ...(neighbors.get(id) ?? [])]);
    const nb =
      boundsOf(
        [...nbIds].map((i) => layout.nodes[i]).filter(Boolean) as NodeBox[],
      ) ?? graph;

    // Zoom to 1.35, eased down only if the neighborhood wouldn't otherwise fit.
    const scale = Math.min(
      1.35,
      LIVE_AREA.width / Math.max(1, nb.w),
      LIVE_AREA.height / Math.max(1, nb.h),
    );

    // Center the target, then clamp the pan so content stays inside the safe area
    // — against the whole graph when it fits at this scale (so nothing clips at
    // all), otherwise against the neighborhood (target + neighbors guaranteed in).
    const fits =
      graph.w * scale <= LIVE_AREA.width && graph.h * scale <= LIVE_AREA.height;
    const b = fits ? graph : nb;
    const x = clampPan(
      W / 2 - box.x * scale,
      SAFE_MARGIN - b.minX * scale,
      W - SAFE_MARGIN - b.maxX * scale,
    );
    const y = clampPan(
      H / 2 - box.y * scale,
      SAFE_MARGIN - b.minY * scale,
      H - SAFE_MARGIN - b.maxY * scale,
    );
    return { scale, x, y };
  };

  let from = identity;
  let result = identity;
  for (let i = 0; i < focusSteps.length; i++) {
    const s = focusSteps[i];
    if (frame < s.startFrame) break;
    const to = targetFor(s.target);
    const p = progress(
      frame,
      s.startFrame,
      theme.motion.ms.camera,
      fps,
      theme.motion.easing.inOut,
    );
    result = {
      x: from.x + (to.x - from.x) * p,
      y: from.y + (to.y - from.y) * p,
      scale: from.scale + (to.scale - from.scale) * p,
    };
    from = to;
  }
  return result;
}

export function deriveRenderState(
  spec: SceneSpec,
  layout: LayoutResult,
  schedule: Schedule,
  frame: number,
  fps: number,
  theme: Theme,
): RenderState {
  const state: RenderState = {
    camera: { x: 0, y: 0, scale: 1 },
    elements: {},
    edges: {},
  };

  // base element runtimes (+ intro appear for non-label kinds)
  for (const el of spec.elements) {
    const appear = LABEL_KINDS.has(el.kind)
      ? 0 // labels appear via label.show
      : progress(
          frame,
          schedule.appearStart[el.id] ?? 0,
          schedule.appearDurMs,
          fps,
          theme.motion.easing.outSoft,
        );
    state.elements[el.id] = {
      appear,
      state: "idle",
      stateSinceFrame: 0,
      highlight: 0,
    };
  }

  // base edge runtimes (+ intro draw)
  for (const e of spec.edges ?? []) {
    const draw = progress(
      frame,
      schedule.edgeDrawStartFrame,
      schedule.edgeDrawDurMs,
      fps,
      theme.motion.easing.outSoft,
    );
    state.edges[e.id] = { draw, lit: 0, arrival: 0, packets: [] };
  }

  const edgeById = new Map(
    (spec.edges ?? []).map((e) => [e.id, e] as [string, Edge]),
  );

  for (const step of schedule.steps) {
    const ctx: Ctx = { step, frame, fps, theme, state };
    const isEdge = edgeById.has(step.target);
    const handler = (isEdge ? EDGE_VERBS : ELEMENT_VERBS)[step.verb];
    if (handler) handler(ctx);
  }

  state.camera = cameraTransform(
    spec,
    schedule.steps,
    frame,
    fps,
    theme,
    layout,
  );
  return state;
}
