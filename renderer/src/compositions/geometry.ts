// Pure polyline helpers for edge routing (length, point-at-fraction, end angle,
// SVG path string). No state, no randomness.
import type { Point } from "../layout/index.js";

export function pathD(points: Point[]): string {
  if (points.length === 0) return "";
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
}

export function polylineLength(points: Point[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += Math.hypot(
      points[i].x - points[i - 1].x,
      points[i].y - points[i - 1].y,
    );
  }
  return len;
}

/** The point at fraction {@link t} (0..1) of the total polyline length. */
export function pointAtT(points: Point[], t: number): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];
  const target = polylineLength(points) * Math.max(0, Math.min(1, t));
  let acc = 0;
  for (let i = 1; i < points.length; i++) {
    const seg = Math.hypot(
      points[i].x - points[i - 1].x,
      points[i].y - points[i - 1].y,
    );
    if (acc + seg >= target) {
      const f = seg === 0 ? 0 : (target - acc) / seg;
      return {
        x: points[i - 1].x + (points[i].x - points[i - 1].x) * f,
        y: points[i - 1].y + (points[i].y - points[i - 1].y) * f,
      };
    }
    acc += seg;
  }
  return points[points.length - 1];
}

/** Angle (deg) of the final segment, for orienting the arrowhead. */
export function endAngleDeg(points: Point[]): number {
  if (points.length < 2) return 0;
  const a = points[points.length - 2];
  const b = points[points.length - 1];
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}
