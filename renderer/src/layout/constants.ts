// Stage, spacing, and sizing constants — straight from docs/visual-style.md
// (§1 stage & safe area, §4 shape language, §7 layout normalization). The layout
// pass is authored for the 1920×1080 stage the visual spec defines.

export const STAGE = { width: 1920, height: 1080 } as const;

/** §1 content keep-out: 96 px all sides → live area 1728 × 888. */
export const SAFE_MARGIN = 96;
export const LIVE_AREA = {
  width: STAGE.width - SAFE_MARGIN * 2,
  height: STAGE.height - SAFE_MARGIN * 2,
} as const;

/** §1 grid base unit. Node centers snap to this. */
export const GRID = 8;

/** §7 minimum gap between node bounding boxes. */
export const MIN_GAP = { horizontal: 120, vertical: 80 } as const;

/**
 * Perpendicular separation for anti-parallel edges (A→B and B→A). Drawn as two
 * parallel lanes this far off the center line, in opposite directions, so a
 * request/response pair reads as two clean connectors instead of one doubled-up
 * line with overlapping arrowheads (§7 clearance). On the 8 px grid.
 */
export const EDGE_LANE_OFFSET = 16;

/** §4 default element box sizes (node default 240×120). */
export const NODE_SIZE: Record<string, { width: number; height: number }> = {
  node: { width: 240, height: 120 },
  browser: { width: 240, height: 120 },
  label: { width: 200, height: 64 },
  "edge-label": { width: 200, height: 64 },
};
export const DEFAULT_NODE_SIZE = { width: 240, height: 120 } as const;

/** §7 density cap: at most ~6 primary (node/browser) elements on screen. */
export const DENSITY_CAP = 6;
export const PRIMARY_KINDS = new Set(["node", "browser"]);
