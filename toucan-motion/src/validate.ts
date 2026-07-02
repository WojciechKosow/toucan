// Step 2 — the contract gate. Static checks on the HTML text, plus a runtime
// determinism check that captures the file twice and compares frames.
//
// Why it exists: the whole pipeline relies on render(ms) being a pure function of
// ms. CSS @keyframes / transition / animation run on the wall clock and silently
// break frame-perfect seeking. The static gate catches them instantly; the
// runtime gate proves frame N is reproducible.

import { createHash } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { capture } from "./capture.js";

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

// Contract members the HTML must expose (checked as substrings of the whole file).
const REQUIRED = [
  "window.__TOUCAN__",
  "window.__TOUCAN_DONE__",
  "seek",
  "ready",
  "durationMs",
  "fps",
];

// CSS that breaks deterministic seeking — only meaningful inside style contexts.
const FORBIDDEN: { label: string; re: RegExp }[] = [
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

export function validateHtml(html: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const token of REQUIRED) {
    if (!html.includes(token)) {
      errors.push(`missing required contract member: ${token}`);
    }
  }

  const css = extractStyleText(html);
  for (const { label, re } of FORBIDDEN) {
    const m = css.match(re);
    if (m && m.index != null) {
      errors.push(
        `forbidden CSS "${label}" breaks frame-perfect seeking — found: "${snippet(css, m.index)}"`,
      );
    }
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
): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  const dirA = await mkdtemp(join(tmpdir(), "toucan-val-a-"));
  const dirB = await mkdtemp(join(tmpdir(), "toucan-val-b-"));
  try {
    let a, b;
    try {
      a = await capture(htmlPath, dirA);
      b = await capture(htmlPath, dirB);
    } catch (e) {
      errors.push(
        `capture failed (ready/seek): ${e instanceof Error ? e.message : String(e)}`,
      );
      return { ok: false, errors, warnings };
    }

    if (a.durationMs <= 0) errors.push(`durationMs is not > 0 (${a.durationMs})`);
    if (!a.done) errors.push("__TOUCAN_DONE__ never became true after final seek");
    if (a.frameCount !== b.frameCount) {
      errors.push(
        `frame count differs between runs (${a.frameCount} vs ${b.frameCount})`,
      );
    }

    const n = Math.min(a.frameCount, b.frameCount);
    for (const p of [0.25, 0.5, 0.75]) {
      const i = Math.min(n - 1, Math.floor(p * n));
      if (i < 0) break;
      const ha = hashFile(join(dirA, frameName(i)));
      const hb = hashFile(join(dirB, frameName(i)));
      if (ha !== hb) {
        errors.push(
          `non-deterministic frame at ${Math.round(p * 100)}% (frame ${i}) — two runs differ; render() likely reads the wall clock`,
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
export async function validateFile(htmlPath: string): Promise<{
  static: ValidationResult;
  runtime: ValidationResult;
}> {
  const html = await readFile(htmlPath, "utf8");
  const staticResult = validateHtml(html);
  const runtime = await validateRender(htmlPath);
  return { static: staticResult, runtime };
}
