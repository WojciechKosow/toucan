// Deterministic auto-layout + aesthetic-normalization (Section 2).
//
// Raw dagre output looks machine-placed — the single biggest "auto-generated"
// tell (visual-style.md §7). So after a raw dagre pass we run a deterministic
// normalization pass: center the graph in the live area, snap node centers to the
// 8 px grid, and flag density / overflow. Minimum gaps are enforced through
// dagre's rank/node separation (§7's 120 px horizontal / 80 px vertical).
//
// Edge routing is computed here too (not taken from dagre's polylines, which bend
// through awkward midpoints and stack anti-parallel pairs on top of each other).
// Each edge is a clean straight connector clamped to the source/target node
// borders; a request/response pair (A→B + B→A) is split into two parallel lanes
// (§7 clearance). For ranking we collapse such pairs to a single undirected edge
// so dagre lays out a clean left-to-right flow instead of a cycle-broken tangle.
//
// Determinism is mandatory: same SceneSpec → byte-identical positions. We sort
// every input by id before insertion, and use no randomness and no wall-clock.

import dagre from "@dagrejs/dagre";
import type { Element, LayoutDirection, SceneSpec } from "@toucan/spec";
import {
  DEFAULT_NODE_SIZE,
  DENSITY_CAP,
  EDGE_LANE_OFFSET,
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

/**
 * March from an interior point along (dx,dy) to the box's rectangle border, so an
 * edge endpoint lands cleanly on the node edge (debt #3) — no gap, no overshoot.
 */
function rayBoxExit(
  box: NodeBox,
  px: number,
  py: number,
  dx: number,
  dy: number,
): Point {
  const hw = box.width / 2;
  const hh = box.height / 2;
  let t = Infinity;
  if (dx > 0) t = Math.min(t, (box.x + hw - px) / dx);
  else if (dx < 0) t = Math.min(t, (box.x - hw - px) / dx);
  if (dy > 0) t = Math.min(t, (box.y + hh - py) / dy);
  else if (dy < 0) t = Math.min(t, (box.y - hh - py) / dy);
  if (!Number.isFinite(t)) t = 0;
  return { x: px + t * dx, y: py + t * dy };
}

/**
 * A clean straight route from the source border to the target border. If a
 * reverse edge exists between the same pair, both are pushed onto opposite
 * parallel lanes (perpendicular to a *canonical* direction, so the pair always
 * splits to opposite sides) — no overlapping/doubled connectors (§7).
 */
function routeEdge(
  from: string,
  to: string,
  nodes: Record<string, NodeBox>,
  hasReverse: boolean,
): Point[] {
  const s = nodes[from];
  const t = nodes[to];
  const len = Math.hypot(t.x - s.x, t.y - s.y) || 1;
  const ux = (t.x - s.x) / len;
  const uy = (t.y - s.y) / len;

  let ox = 0;
  let oy = 0;
  if (hasReverse) {
    // Canonical direction (lexically smaller id → larger) gives a stable
    // perpendicular; the two anti-parallel edges then take opposite signs.
    const a = from < to ? from : to;
    const b = from < to ? to : from;
    const cl =
      Math.hypot(nodes[b].x - nodes[a].x, nodes[b].y - nodes[a].y) || 1;
    const px = -(nodes[b].y - nodes[a].y) / cl;
    const py = (nodes[b].x - nodes[a].x) / cl;
    const sign = from === a ? 1 : -1;
    ox = px * EDGE_LANE_OFFSET * sign;
    oy = py * EDGE_LANE_OFFSET * sign;
  }

  const start = rayBoxExit(s, s.x + ox, s.y + oy, ux, uy);
  const end = rayBoxExit(t, t.x + ox, t.y + oy, -ux, -uy);
  return [start, end];
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
  // For *ranking*, collapse anti-parallel (and duplicate) pairs to one undirected
  // edge: a 2-cycle like client→api + api→client would otherwise force dagre to
  // break the cycle and produce a cramped, off-axis layout instead of a clean
  // left-to-right flow. All edges are still routed/rendered individually below.
  const rankSeen = new Set<string>();
  for (const e of edges) {
    if (!(g.hasNode(e.from) && g.hasNode(e.to))) continue;
    const key = e.from < e.to ? `${e.from}|${e.to}` : `${e.to}|${e.from}`;
    if (rankSeen.has(key)) continue;
    rankSeen.add(key);
    g.setEdge(e.from, e.to);
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

  // ── edge routing: clean border-to-border connectors (anti-parallel → lanes) ──
  const directed = new Set(edges.map((e) => `${e.from}>${e.to}`));
  const edgesOut: Record<string, EdgeRoute> = {};
  for (const e of edges) {
    if (!(nodes[e.from] && nodes[e.to])) continue;
    const hasReverse = directed.has(`${e.to}>${e.from}`);
    const points = routeEdge(e.from, e.to, nodes, hasReverse);
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
