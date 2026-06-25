// The output contract of the auto-layout pass. Everything downstream (the Scene
// composition in Section 3) reads positions from here — never from the SceneSpec,
// which carries no coordinates by design.

export interface Point {
  x: number;
  y: number;
}

/** A positioned element box. {@link x}/{@link y} are the box CENTER (stage px). */
export interface NodeBox {
  id: string;
  kind: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A routed edge: the polyline dagre produced, transformed into stage space. */
export interface EdgeRoute {
  id: string;
  from: string;
  to: string;
  points: Point[];
}

export interface LayoutResult {
  stage: { width: number; height: number };
  nodes: Record<string, NodeBox>;
  edges: Record<string, EdgeRoute>;
  /** Non-fatal composition flags (e.g. density-cap / live-area overflow) per §7. */
  warnings: string[];
}
