// The freeform gate — for HTML generated with NO capture contract
// (prompts/system-freeform.md). The output of the freeform engine is the HTML
// file itself, played in a real browser; there is no seek()/virtual-time
// contract to enforce and no determinism to prove (that returns when the
// capture story lands). What CAN and must be checked is much simpler:
//
// - static:  one self-contained file — inline JS only (a Google Fonts <link>
//            is the one allowed external resource), and there IS a script to
//            drive the choreography.
// - smoke:   the page actually RUNS in headless Chromium — zero uncaught
//            errors, a real DOM gets built, and something visibly MOVES.
//            A static page is a broken animation, not a quiet success.
//
// Wall-clock waits are fine here — this is a liveness check, not the
// deterministic capture path.

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, type Browser } from "playwright";
import { resolveChromiumPath } from "./capture.js";
import type { ValidationResult } from "./validate.js";

// Sample instants (ms after load) for the motion check. The guided-tour
// opening builds the overview node-by-node across the first seconds, so a
// correct file is in near-continuous motion here. All samples pairwise
// identical = a static page.
const MOTION_SAMPLES_MS = [600, 2000, 4000];
// Keep listening for late uncaught errors a bit past the last sample (scene
// transitions around 3–5s are where guarded-lookup bugs surface).
const SETTLE_MS = 2000;
// A built scene has hundreds of elements; this only catches blank/dead pages.
const MIN_DOM_ELEMENTS = 12;

/** Static checks on the HTML text. Far lighter than the seek/vt contract. */
export function validateFreeformHtml(html: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!html.trim()) {
    return { ok: false, errors: ["file is empty"], warnings };
  }
  if (!/<script[\s>]/i.test(html)) {
    errors.push(
      "no <script> found — the animation choreography (camera, cursor, scheduling) requires inline JS",
    );
  }
  // Self-contained: no external scripts. (Google Fonts arrives via <link>,
  // which is allowed; everything else must be inlined.)
  for (const m of html.matchAll(/<script[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) {
    errors.push(
      `external script forbidden — the file must be self-contained: <script src="${m[1]}">`,
    );
  }
  if (html.includes("Math.random(")) {
    warnings.push(
      "Math.random( found — a repeatable look is easier to iterate on (and required once capture lands); prefer constants",
    );
  }
  if (!/#world|id\s*=\s*["']world["']/i.test(html)) {
    warnings.push(
      'no "#world" wrapper found — the virtual camera (a single transformed #world) is the core of the motion language',
    );
  }
  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Load the file in headless Chromium and prove it runs as an animation:
 * zero uncaught page errors, a real DOM, and visible motion between samples.
 */
export async function smokeTest(htmlPath: string): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const absHtml = resolve(htmlPath);
  if (!existsSync(absHtml)) {
    return { ok: false, errors: [`HTML file not found: ${absHtml}`], warnings };
  }

  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: resolveChromiumPath(),
      args: ["--hide-scrollbars", "--force-color-profile=srgb"],
    });
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    // Dedupe page errors — a throw inside a rAF loop would repeat per frame.
    const pageErrors = new Set<string>();
    const consoleErrors = new Set<string>();
    page.on("pageerror", (e) => pageErrors.add(e.message ?? String(e)));
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.add(m.text());
    });

    await page.goto(pathToFileURL(absHtml).href);

    // Screenshot at each sample instant; motion = any pair of shots differs.
    const shots: Buffer[] = [];
    let elapsed = 0;
    for (const t of MOTION_SAMPLES_MS) {
      await page.waitForTimeout(t - elapsed);
      elapsed = t;
      shots.push(await page.screenshot());
    }
    await page.waitForTimeout(SETTLE_MS);

    const domCount = await page
      .evaluate(() => document.querySelectorAll("*").length)
      .catch(() => 0);

    if (pageErrors.size > 0) {
      const list = [...pageErrors].slice(0, 5);
      errors.push(
        `uncaught page error${pageErrors.size > 1 ? "s" : ""} (${pageErrors.size} distinct):\n    - ${list.join("\n    - ")}`,
      );
    }
    if (domCount < MIN_DOM_ELEMENTS) {
      errors.push(
        `page built almost no DOM (${domCount} elements) — nothing to animate; the scene never rendered`,
      );
    }
    const anyMotion = shots.some((s, i) => i > 0 && !s.equals(shots[0]));
    if (!anyMotion && shots.length > 1) {
      errors.push(
        `no visible motion between ${MOTION_SAMPLES_MS[0]}ms and ${MOTION_SAMPLES_MS[MOTION_SAMPLES_MS.length - 1]}ms — the page appears static (autoplay never started, or the timeline is dead)`,
      );
    }
    if (consoleErrors.size > 0) {
      warnings.push(
        `console error${consoleErrors.size > 1 ? "s" : ""}: ${[...consoleErrors].slice(0, 3).join(" | ")}`,
      );
    }

    return { ok: errors.length === 0, errors, warnings };
  } finally {
    if (browser) await browser.close();
  }
}
