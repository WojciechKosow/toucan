// Section 2 STOP-GATE: deterministic auto-layout + §7 normalization.
// - same graph → byte-identical positions (run 100×);
// - the hero fixture, a 3-node and a 6-node graph all fit the live area with no
//   node overlap;
// - node centers are snapped to the 8 px grid;
// - exceeding the density cap raises a (non-fatal) warning.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import type { SceneSpec } from "@toucan/spec";
import { GRID, SAFE_MARGIN, STAGE } from "./constants.js";
import { layoutScene } from "./layout.js";
import type { NodeBox, Point } from "./types.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const heroSpec: SceneSpec = JSON.parse(
  readFileSync(resolve(repoRoot, "fixtures/01-auth-flow.json"), "utf8"),
);

function node(id: string) {
  return { id, kind: "node" as const, props: { label: id } };
}
function edge(id: string, from: string, to: string) {
  return { id, from, to, kind: "data" as const };
}
function spec(elements: unknown[], edges: unknown[]): SceneSpec {
  return {
    meta: { title: "t", direction: "LR" },
    elements,
    edges,
    timeline: [
      { verb: "node.state", target: (elements[0] as { id: string }).id },
    ],
  } as SceneSpec;
}

/** A simple N-node linear chain: n0 -> n1 -> ... -> n(N-1). */
function linearFlow(n: number): SceneSpec {
  const elements = Array.from({ length: n }, (_, i) => node(`n${i}`));
  const edges = Array.from({ length: n - 1 }, (_, i) =>
    edge(`e${i}`, `n${i}`, `n${i + 1}`),
  );
  return spec(elements, edges);
}

/** A realistic branching 6-node graph (a diamond), the shape a director actually emits. */
function branching6(): SceneSpec {
  const elements = Array.from({ length: 6 }, (_, i) => node(`n${i}`));
  const edges = [
    edge("a", "n0", "n1"),
    edge("b", "n0", "n2"),
    edge("c", "n1", "n3"),
    edge("d", "n2", "n4"),
    edge("e", "n3", "n5"),
    edge("f", "n4", "n5"),
  ];
  return spec(elements, edges);
}

function overlaps(a: NodeBox, b: NodeBox): boolean {
  return (
    Math.abs(a.x - b.x) * 2 < a.width + b.width &&
    Math.abs(a.y - b.y) * 2 < a.height + b.height
  );
}

function assertFitsAndDisjoint(spec: SceneSpec) {
  const { nodes, warnings } = layoutScene(spec);
  const boxes = Object.values(nodes);
  assert.ok(boxes.length > 0, "expected positioned nodes");
  assert.deepEqual(
    warnings,
    [],
    `expected no warnings, got: ${warnings.join("; ")}`,
  );

  for (const b of boxes) {
    assert.ok(
      b.x - b.width / 2 >= SAFE_MARGIN,
      `${b.id} crosses left safe margin`,
    );
    assert.ok(
      b.y - b.height / 2 >= SAFE_MARGIN,
      `${b.id} crosses top safe margin`,
    );
    assert.ok(
      b.x + b.width / 2 <= STAGE.width - SAFE_MARGIN,
      `${b.id} crosses right safe margin`,
    );
    assert.ok(
      b.y + b.height / 2 <= STAGE.height - SAFE_MARGIN,
      `${b.id} crosses bottom safe margin`,
    );
    assert.equal(b.x % GRID, 0, `${b.id}.x not snapped to ${GRID}px grid`);
    assert.equal(b.y % GRID, 0, `${b.id}.y not snapped to ${GRID}px grid`);
  }
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      assert.ok(
        !overlaps(boxes[i], boxes[j]),
        `${boxes[i].id} overlaps ${boxes[j].id}`,
      );
    }
  }
}

test("layout is deterministic: same spec → identical output, 100×", () => {
  const first = JSON.stringify(layoutScene(heroSpec));
  for (let i = 0; i < 100; i++) {
    assert.equal(JSON.stringify(layoutScene(heroSpec)), first);
  }
});

test("hero fixture fits the live area with no overlap", () => {
  assertFitsAndDisjoint(heroSpec);
});

test("a 3-node and a (branching) 6-node graph both fit with no overlap", () => {
  assertFitsAndDisjoint(linearFlow(3));
  assertFitsAndDisjoint(branching6());
});

test("a pathological wide chain (won't fit a single row) raises the overflow flag", () => {
  // Six 240px nodes + 120px gaps span 2040px > the 1728px live area — §7 flags it
  // (non-fatal) so the director can split into scenes rather than rendering cramped.
  const { warnings } = layoutScene(linearFlow(6));
  assert.ok(
    warnings.some((w) => w.startsWith("overflow:")),
    `expected an overflow warning, got: ${warnings.join("; ")}`,
  );
});

test("node centers are snapped to the 8px grid and graph is centered", () => {
  const { nodes } = layoutScene(heroSpec);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of Object.values(nodes)) {
    assert.equal(b.x % GRID, 0);
    assert.equal(b.y % GRID, 0);
    minX = Math.min(minX, b.x - b.width / 2);
    minY = Math.min(minY, b.y - b.height / 2);
    maxX = Math.max(maxX, b.x + b.width / 2);
    maxY = Math.max(maxY, b.y + b.height / 2);
  }
  // §7: the whole graph's bounding box is centered in the live area. Allow one
  // grid step of slack since centers are independently snapped to the 8px grid.
  assert.ok(
    Math.abs((minX + maxX) / 2 - STAGE.width / 2) <= GRID,
    `graph not horizontally centered: bbox cx=${(minX + maxX) / 2}`,
  );
  assert.ok(
    Math.abs((minY + maxY) / 2 - STAGE.height / 2) <= GRID,
    `graph not vertically centered: bbox cy=${(minY + maxY) / 2}`,
  );
});

/** A point sits on a box border if it's on one of the four edges (within eps). */
function onBorder(p: { x: number; y: number }, b: NodeBox, eps = 0.5): boolean {
  const l = b.x - b.width / 2;
  const r = b.x + b.width / 2;
  const t = b.y - b.height / 2;
  const bot = b.y + b.height / 2;
  const onV =
    (Math.abs(p.x - l) <= eps || Math.abs(p.x - r) <= eps) &&
    p.y >= t - eps &&
    p.y <= bot + eps;
  const onH =
    (Math.abs(p.y - t) <= eps || Math.abs(p.y - bot) <= eps) &&
    p.x >= l - eps &&
    p.x <= r + eps;
  return onV || onH;
}

function segmentsOverlap(a: Point[], b: Point[]): boolean {
  // Cheap coincidence check for the lane-separation guarantee: do the two
  // 2-point routes share both endpoints (i.e. land on the same line)?
  const same = (p: Point, q: Point) =>
    Math.abs(p.x - q.x) < 1 && Math.abs(p.y - q.y) < 1;
  return (
    (same(a[0], b[0]) && same(a[1], b[1])) ||
    (same(a[0], b[1]) && same(a[1], b[0]))
  );
}

test("edge endpoints land on the source/target node borders (debt #3)", () => {
  const { nodes, edges } = layoutScene(heroSpec);
  for (const e of Object.values(edges)) {
    const start = e.points[0];
    const end = e.points[e.points.length - 1];
    assert.ok(
      onBorder(start, nodes[e.from]),
      `${e.id} start not on ${e.from} border: ${JSON.stringify(start)}`,
    );
    assert.ok(
      onBorder(end, nodes[e.to]),
      `${e.id} end not on ${e.to} border: ${JSON.stringify(end)}`,
    );
  }
});

test("anti-parallel edges route on separate lanes (no doubled connectors)", () => {
  // The hero fixture has two request/response pairs: e1/e4 (client↔api) and
  // e2/e3 (api↔db). Each pair must occupy distinct, non-coincident lanes.
  const { edges } = layoutScene(heroSpec);
  for (const [x, y] of [
    ["e1", "e4"],
    ["e2", "e3"],
  ]) {
    assert.ok(
      !segmentsOverlap(edges[x].points, edges[y].points),
      `${x} and ${y} share a line — anti-parallel lanes not separated`,
    );
  }
});

test("exceeding the density cap raises a non-fatal warning", () => {
  const { warnings } = layoutScene(linearFlow(7));
  assert.ok(
    warnings.some((w) => w.startsWith("density:")),
    `expected a density warning, got: ${warnings.join("; ")}`,
  );
});
