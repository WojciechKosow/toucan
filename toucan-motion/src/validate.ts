// Step 2 — the contract gate. Static checks on the HTML text, plus a runtime
// determinism check that captures the file twice and compares frames.
//
// Engine-aware:
// - "seek": render(ms)/seek() drives all motion, so CSS @keyframes / transition /
//   animation are forbidden (they run on the wall clock and break seeking).
// - "vt": the recorder drives a virtual clock + issues every compositor frame,
//   so natural CSS animation is ALLOWED — the page must instead stay dormant
//   until __TOUCAN_START__() and expose that hook.
//
// The runtime gate is the same for both: capture twice, frames must be
// byte-identical.

import { createHash } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { capture, type CaptureEngine } from "./capture.js";
import { comparePng } from "./png.js";

// vt tolerance. Blink quantizes its clocks to 0.1ms with a per-run phase, so
// between two runs animation sampling can differ by <0.1ms. That never MOVES
// anything (every frame samples the same virtual instant — verified: frame i of
// one run always matches frame i of another better than frame i±1), but it does
// perturb pixels two invisible ways: the anti-aliased edges of a moving element
// shift sub-pixel, and a continuously COLOR-animated region picks up a ±few-LSB
// hue difference across its whole body. So the gate ignores per-channel deltas
// at or below VT_PIXEL_TOLERANCE (sub-visual), then bounds the AREA of pixels
// that differ by more than that. A real bug (wall clock, randomness, motion
// before __TOUCAN_START__) displaces whole regions by far more than the
// tolerance over far more than the area bound.
//
// Measured on fixtures/css-anim.html (a large box that both slides fast AND
// hue-shifts): at tolerance 0 the worst frame reads 2.31% (the whole tinted
// box); at tolerance 8 it collapses to ~0.07% (just hard edges) — a ~4× margin
// under the 0.3% bound.
const VT_PIXEL_TOLERANCE = 8; // per-channel LSB, below perceptual threshold
const VT_MAX_DIFF_FRACTION = 0.003; // 0.3% of pixels per frame (after tolerance)

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

// Contract members the HTML must expose (checked as substrings of the whole file).
const REQUIRED_COMMON = [
  "window.__TOUCAN__",
  "window.__TOUCAN_DONE__",
  "ready",
  "durationMs",
  "fps",
];
const REQUIRED_BY_ENGINE: Record<CaptureEngine, string[]> = {
  seek: ["seek"],
  vt: ["window.__TOUCAN_START__", "__TOUCAN_RECORDER__"],
};

// CSS that breaks deterministic seeking — only meaningful inside style contexts,
// and only for the seek engine (the vt engine virtualizes the animation clock).
const FORBIDDEN_SEEK_CSS: { label: string; re: RegExp }[] = [
  { label: "@keyframes", re: /@keyframes/i },
  { label: "transition:", re: /transition(?:-[a-z-]+)?\s*:/i },
  { label: "animation:", re: /animation(?:-[a-z-]+)?\s*:/i },
];

/** Concatenate all <style>…</style> bodies + style="…" attribute values, with CSS
 *  comments stripped (so a comment mentioning a forbidden token isn't flagged). */
function extractStyleText(html: string): string {
  let css = "";
  for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
    css += "\n" + m[1];
  }
  for (const m of html.matchAll(/style\s*=\s*"([^"]*)"/gi)) css += "\n" + m[1];
  for (const m of html.matchAll(/style\s*=\s*'([^']*)'/gi)) css += "\n" + m[1];
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function snippet(text: string, index: number): string {
  const start = Math.max(0, index - 24);
  return text
    .slice(start, index + 40)
    .replace(/\s+/g, " ")
    .trim();
}

/** Best-effort durationMs parse for the 20–40s warning. */
function parseDurationMs(html: string): number | null {
  const direct = html.match(/durationMs\s*[:=]\s*(\d{3,})/);
  if (direct) return Number(direct[1]);
  const viaVar = html.match(/\bDUR\w*\s*=\s*(\d{3,})/);
  if (viaVar) return Number(viaVar[1]);
  return null;
}

export function validateHtml(
  html: string,
  engine: CaptureEngine = "seek",
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const token of [...REQUIRED_COMMON, ...REQUIRED_BY_ENGINE[engine]]) {
    if (!html.includes(token)) {
      errors.push(`missing required contract member: ${token}`);
    }
  }

  if (engine === "seek") {
    const css = extractStyleText(html);
    for (const { label, re } of FORBIDDEN_SEEK_CSS) {
      const m = css.match(re);
      if (m && m.index != null) {
        errors.push(
          `forbidden CSS "${label}" breaks frame-perfect seeking — found: "${snippet(css, m.index)}"`,
        );
      }
    }
  }

  if (html.includes("Math.random(")) {
    warnings.push(
      "Math.random( found — random visual state breaks determinism; remove it or seed it constant",
    );
  }

  const dur = parseDurationMs(html);
  if (dur != null && (dur < 20000 || dur > 40000)) {
    warnings.push(
      `durationMs ~${dur}ms is outside the target 20000–40000ms range`,
    );
  }

  return { ok: errors.length === 0, errors, warnings };
}

function hashFile(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function frameName(i: number): string {
  return `frame-${String(i).padStart(5, "0")}.png`;
}

/** Capture the file twice and prove it's deterministic + signals completion. */
export async function validateRender(
  htmlPath: string,
  engine: CaptureEngine = "seek",
): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  const dirA = await mkdtemp(join(tmpdir(), "toucan-val-a-"));
  const dirB = await mkdtemp(join(tmpdir(), "toucan-val-b-"));
  try {
    let a, b;
    try {
      a = await capture(htmlPath, dirA, { engine });
      b = await capture(htmlPath, dirB, { engine });
    } catch (e) {
      errors.push(
        `capture failed (ready/seek): ${e instanceof Error ? e.message : String(e)}`,
      );
      return { ok: false, errors, warnings };
    }

    if (a.durationMs <= 0) errors.push(`durationMs is not > 0 (${a.durationMs})`);
    if (!a.done) errors.push("__TOUCAN_DONE__ never became true after the timeline completed");
    if (a.frameCount !== b.frameCount) {
      errors.push(
        `frame count differs between runs (${a.frameCount} vs ${b.frameCount})`,
      );
    }

    const n = Math.min(a.frameCount, b.frameCount);
    if (engine === "seek") {
      // seek renders are byte-exact — hash-compare sampled frames.
      for (const p of [0.25, 0.5, 0.75]) {
        const i = Math.min(n - 1, Math.floor(p * n));
        if (i < 0) break;
        const ha = hashFile(join(dirA, frameName(i)));
        const hb = hashFile(join(dirB, frameName(i)));
        if (ha !== hb) {
          errors.push(
            `non-deterministic frame at ${Math.round(p * 100)}% (frame ${i}) — two runs differ; something reads the wall clock or uses randomness`,
          );
        }
      }
    } else {
      // vt renders are pixel-deterministic up to sub-quantum clock phase —
      // decode and compare EVERY frame; the failure metric is the AREA of
      // pixels that moved by more than the sub-visual tolerance, which
      // separates invisible edge/hue noise from real bugs.
      let worstFraction = 0;
      let worstFrame = -1;
      let noisyFrames = 0;
      for (let i = 0; i < n; i++) {
        const fa = join(dirA, frameName(i));
        const fb = join(dirB, frameName(i));
        if (hashFile(fa) === hashFile(fb)) continue;
        const cmp = comparePng(fa, fb, VT_PIXEL_TOLERANCE);
        if (cmp.diffFraction > 0) noisyFrames++;
        if (cmp.diffFraction > worstFraction) {
          worstFraction = cmp.diffFraction;
          worstFrame = i;
        }
      }
      if (worstFraction > VT_MAX_DIFF_FRACTION) {
        errors.push(
          `non-deterministic render: frame ${worstFrame} differs visibly (>${VT_PIXEL_TOLERANCE}/255 per channel) on ${(worstFraction * 100).toFixed(3)}% of pixels between two runs (allowed ≤${VT_MAX_DIFF_FRACTION * 100}%) — something reads the wall clock, uses randomness, or animates before __TOUCAN_START__`,
        );
      } else if (noisyFrames > 0) {
        warnings.push(
          `${noisyFrames}/${n} frames carry sub-visual edge noise (worst ${(worstFraction * 100).toFixed(4)}% of pixels) — within vt tolerance (sub-0.1ms clock quantization phase)`,
        );
      }
    }

    return { ok: errors.length === 0, errors, warnings };
  } finally {
    await rm(dirA, { recursive: true, force: true }).catch(() => {});
    await rm(dirB, { recursive: true, force: true }).catch(() => {});
  }
}

/** Convenience for the `check` command: static + runtime, merged. */
export async function validateFile(
  htmlPath: string,
  engine: CaptureEngine = "seek",
): Promise<{
  static: ValidationResult;
  runtime: ValidationResult;
}> {
  const html = await readFile(htmlPath, "utf8");
  const staticResult = validateHtml(html, engine);
  const runtime = await validateRender(htmlPath, engine);
  return { static: staticResult, runtime };
}
