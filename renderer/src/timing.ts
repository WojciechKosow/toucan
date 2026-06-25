// Motion helpers: ms → frames (the spec is authored in ms, fps-independent) and
// eased tweens built on Remotion's interpolate + cubic-bezier easing (§5). Every
// value here is a pure function of the frame — no Date.now, no random (§10).

import { Easing, interpolate } from "remotion";

export type Cubic = [number, number, number, number];

export const msToFrames = (ms: number, fps: number): number =>
  (ms / 1000) * fps;

export const bezier = (c: Cubic) => Easing.bezier(c[0], c[1], c[2], c[3]);

/**
 * Eased 0→1 progress of an animation that starts at {@link startFrame} and lasts
 * {@link durationMs}, clamped outside its window.
 */
export function progress(
  frame: number,
  startFrame: number,
  durationMs: number,
  fps: number,
  easing: Cubic,
): number {
  const dur = Math.max(1, msToFrames(durationMs, fps));
  return interpolate(frame, [startFrame, startFrame + dur], [0, 1], {
    easing: bezier(easing),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

/** Eased interpolation from {@link from}→{@link to} over a ms window. */
export function tween(
  frame: number,
  startFrame: number,
  durationMs: number,
  fps: number,
  from: number,
  to: number,
  easing: Cubic,
): number {
  return (
    from + (to - from) * progress(frame, startFrame, durationMs, fps, easing)
  );
}

/** A continuous 0→1 sawtooth for looping motion (the one allowed linear ramp, §5). */
export function loopPhase(
  frame: number,
  periodMs: number,
  fps: number,
): number {
  const period = Math.max(1, msToFrames(periodMs, fps));
  return (frame % period) / period;
}
