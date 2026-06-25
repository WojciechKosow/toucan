// Deterministic auto-layout + aesthetic-normalization (Section 2).
//
// Raw dagre output looks machine-placed — the single biggest "auto-generated"
// tell (visual-style.md §7). So after a raw dagre pass we run a deterministic
// normalization pass: center the graph in the live area, snap node centers to the
// 8 px grid, and flag density / overflow. Minimum gaps are enforced through
// dagre's rank/node separation (§7's 120 px horizontal / 80 px vertical).
//
// Determinism is mandatory: same SceneSpec → byte-identical positions. We sort
// every input by id before insertion, and use no randomness and no wall-clock.

import dagre from "@dagrejs/dagre";
import type { Element, LayoutDirection, SceneSpec } from "@toucan/spec";
import {
  DEFAULT_NODE_SIZE,
  DENSITY_CAP,
  GRID,
  LIVE_AREA,
  MIN_GAP,
  NODE_SIZE,
  PRIMARY_KINDS,
  SAFE_MARGIN,
  STAGE,
} from "./constants.js";
import type { EdgeRoute, LayoutResult, NodeBox, Point } from "./types.js";

const byId = (a: { id: string }, b: { id: string }) =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

function sizeFor(kind: string): { width: number; height: number } {
  // Fresh object per node: dagre mutates the node label in place (writes x/y), so
  // a shared reference would collapse every node of the same kind onto one point.
  return { ...(NODE_SIZE[kind] ?? DEFAULT_NODE_SIZE) };
}

/**
 * §7: a horizontal flow (LR/RL) separates ranks horizontally (120) and stacks
 * within a rank vertically (80); a vertical flow (TB/BT) is the transpose.
 */
function separations(dir: LayoutDirection): {
  ranksep: number;
  nodesep: number;
} {
  const horizontalFlow = dir === "LR" || dir === "RL";
  return horizontalFlow
    ? { ranksep: MIN_GAP.horizontal, nodesep: MIN_GAP.vertical }
    : { ranksep: MIN_GAP.vertical, nodesep: MIN_GAP.horizontal };
}

function members(el: Element): string[] {
  const props = el.props as { members?: string[] } | undefined;
  return Array.isArray(props?.members) ? props.members : [];
}

export function layoutScene(spec: SceneSpec): LayoutResult {
  const direction = (spec.meta?.direction ?? "LR") as LayoutDirection;
  const { ranksep, nodesep } = separations(direction);

  const g = new dagre.graphlib.Graph({ compound: true, directed: true });
  g.setGraph({ rankdir: direction, ranksep, nodesep, marginx: 0, marginy: 0 });
  g.setDefaultEdgeLabel(() => ({}));

  const elements = [...spec.elements].sort(byId);
  const edges = [...(spec.edges ?? [])].sort(byId);

  // Non-group boxes first, then groups as compound parents of their members.
  for (const el of elements) {
    if (el.kind === "group") continue;
    g.setNode(el.id, sizeFor(el.kind));
  }
  for (const el of elements) {
    if (el.kind !== "group") continue;
    g.setNode(el.id, {});
    for (const m of [...members(el)].sort()) {
      if (g.hasNode(m)) g.setParent(m, el.id);
    }
  }
  for (const e of edges) {
    if (g.hasNode(e.from) && g.hasNode(e.to)) g.setEdge(e.from, e.to);
  }

  dagre.layout(g);

  // ── raw boxes (dagre x,y = center) ──
  const raw: NodeBox[] = [];
  for (const el of elements) {
    if (!g.hasNode(el.id)) continue;
    const n = g.node(el.id);
    if (n == null || typeof n.x !== "number" || typeof n.y !== "number")
      continue;
    raw.push({
      id: el.id,
      kind: el.kind,
      x: n.x,
      y: n.y,
      width: n.width,
      height: n.height,
    });
  }

  // ── normalization: center the graph's bounding box in the live area ──
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of raw) {
    minX = Math.min(minX, b.x - b.width / 2);
    minY = Math.min(minY, b.y - b.height / 2);
    maxX = Math.max(maxX, b.x + b.width / 2);
    maxY = Math.max(maxY, b.y + b.height / 2);
  }
  const dx = STAGE.width / 2 - (minX + maxX) / 2;
  const dy = STAGE.height / 2 - (minY + maxY) / 2;
  const snap = (v: number) => Math.round(v / GRID) * GRID;

  const nodes: Record<string, NodeBox> = {};
  for (const b of raw) {
    nodes[b.id] = { ...b, x: snap(b.x + dx), y: snap(b.y + dy) };
  }

  const edgesOut: Record<string, EdgeRoute> = {};
  for (const e of edges) {
    if (!(g.hasNode(e.from) && g.hasNode(e.to))) continue;
    const ge = g.edge(e.from, e.to);
    const points: Point[] = (ge?.points ?? []).map((p) => ({
      x: p.x + dx,
      y: p.y + dy,
    }));
    edgesOut[e.id] = { id: e.id, from: e.from, to: e.to, points };
  }

  // ── §7 flags (non-fatal) ──
  const warnings: string[] = [];
  const primaryCount = elements.filter((e) => PRIMARY_KINDS.has(e.kind)).length;
  if (primaryCount > DENSITY_CAP) {
    warnings.push(
      `density: ${primaryCount} primary nodes exceed the cap of ${DENSITY_CAP}; the director should split this into scenes`,
    );
  }
  const overflow = Object.values(nodes).some(
    (b) =>
      b.x - b.width / 2 < SAFE_MARGIN ||
      b.x + b.width / 2 > STAGE.width - SAFE_MARGIN ||
      b.y - b.height / 2 < SAFE_MARGIN ||
      b.y + b.height / 2 > STAGE.height - SAFE_MARGIN,
  );
  if (overflow) {
    warnings.push(
      `overflow: the graph exceeds the ${LIVE_AREA.width}×${LIVE_AREA.height} live area; reduce nodes or split scenes`,
    );
  }

  return {
    stage: { width: STAGE.width, height: STAGE.height },
    nodes,
    edges: edgesOut,
    warnings,
  };
}
