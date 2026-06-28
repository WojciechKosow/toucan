// Step 3 — capture: an HTML file on disk -> a directory of PNG frames.
//
// We drive the page's deterministic clock ourselves: wait for __TOUCAN__.ready,
// then for each frame call seek(ms) and screenshot. No real-time waiting — the
// page never advances on its own during capture, so the output is frame-perfect
// and identical run to run.

import { existsSync, readdirSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, type Browser } from "playwright";

export interface CaptureResult {
  framesDir: string;
  fps: number;
  frameCount: number;
  durationMs: number;
}

const READY_TIMEOUT_MS = 30000;

/**
 * Resolve a Chromium executable. Prefers Playwright's own managed browser (normal
 * dev machine after `npx playwright install chromium`); falls back to a browser
 * pre-provisioned under PLAYWRIGHT_BROWSERS_PATH (CI / sandbox), since the bundled
 * Playwright revision may not match what's installed there.
 */
function resolveChromiumPath(): string | undefined {
  try {
    const managed = chromium.executablePath();
    if (managed && existsSync(managed)) return managed;
  } catch {
    /* no managed browser — fall through */
  }
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (base && existsSync(base)) {
    const dirs = readdirSync(base)
      .filter((d) => d.startsWith("chromium-")) // full chromium, not headless_shell
      .sort()
      .reverse(); // highest revision first
    const subs = [
      "chrome-linux/chrome",
      "chrome-linux64/chrome",
      "chrome-mac/Chromium.app/Contents/MacOS/Chromium",
      "chrome-win/chrome.exe",
    ];
    for (const d of dirs) {
      for (const sub of subs) {
        const cand = join(base, d, sub);
        if (existsSync(cand)) return cand;
      }
    }
  }
  return undefined; // let Playwright try its default (and throw a helpful error)
}

export async function capture(
  htmlPath: string,
  framesDir: string,
  opts: { fps?: number } = {},
): Promise<CaptureResult> {
  const absHtml = resolve(htmlPath);
  if (!existsSync(absHtml)) {
    throw new Error(`HTML file not found: ${absHtml}`);
  }

  // Fresh frames directory so we never mix in stale PNGs from a previous run.
  await rm(framesDir, { recursive: true, force: true });
  await mkdir(framesDir, { recursive: true });

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

    // Collect failures from the page so a timeout reports *why* (the generated
    // HTML usually threw before it could set __TOUCAN__.ready).
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(e.message ?? String(e)));
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });

    await page.goto(pathToFileURL(absHtml).href);

    try {
      await page.waitForFunction(
        () =>
          (window as unknown as { __TOUCAN__?: { ready?: boolean } }).__TOUCAN__
            ?.ready === true,
        undefined,
        { timeout: READY_TIMEOUT_MS },
      );
    } catch {
      const diag = await page
        .evaluate(() => {
          const t = (window as unknown as { __TOUCAN__?: Record<string, unknown> })
            .__TOUCAN__;
          return t
            ? {
                present: true,
                ready: t.ready,
                seek: typeof t.seek,
                durationMs: t.durationMs,
                fps: t.fps,
              }
            : { present: false };
        })
        .catch(() => null);
      const lines = [
        `Timed out after ${READY_TIMEOUT_MS}ms waiting for window.__TOUCAN__.ready === true.`,
        diag
          ? diag.present
            ? `  __TOUCAN__ is present but ready=${JSON.stringify(diag.ready)} (seek=${diag.seek}, durationMs=${diag.durationMs}, fps=${diag.fps}). It defined the API but never flipped ready — usually a JS error in render(0), or the fonts gate has no 500ms fallback.`
            : `  window.__TOUCAN__ is MISSING — the page script didn't run (syntax error) or never created it.`
          : `  (could not read window.__TOUCAN__)`,
        pageErrors.length
          ? `  Uncaught page errors:\n    - ${pageErrors.join("\n    - ")}`
          : `  (no uncaught page errors captured)`,
        consoleErrors.length
          ? `  Console errors:\n    - ${consoleErrors.slice(0, 5).join("\n    - ")}`
          : ``,
        `  This is a contract bug in the HTML (${absHtml}), not a capture bug. Open it in a browser with DevTools, or re-generate.`,
      ].filter(Boolean);
      throw new Error(lines.join("\n"));
    }

    // The HTML caps its own font wait at 500ms so the clock isn't blocked, which
    // can leave fonts still loading when `ready` flips. For capture we wait for
    // fonts to fully settle first, so every frame (and every run) is identical
    // rather than racing a mid-capture FOUT swap.
    await page.evaluate(() => document.fonts.ready);

    // Kill the page's autoplay loop. The HTML drives a requestAnimationFrame loop
    // (render(performance.now()...)) for human preview; left running, it would
    // overwrite our seeked frame between seek() and screenshot with a wall-clock
    // frame — the capture path must own the clock. Neutralize rAF, then let any
    // in-flight tick drain before we start stepping frames.
    await page.evaluate(() => {
      window.requestAnimationFrame = () => 0;
      window.cancelAnimationFrame = () => {};
    });
    await page.waitForTimeout(50);

    const meta = await page.evaluate(() => {
      const t = (
        window as unknown as { __TOUCAN__: { durationMs: number; fps: number } }
      ).__TOUCAN__;
      return { durationMs: t.durationMs, fps: t.fps };
    });

    const durationMs = meta.durationMs;
    const fps = opts.fps ?? meta.fps;
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      throw new Error(`invalid durationMs from HTML: ${durationMs}`);
    }
    if (!Number.isFinite(fps) || fps <= 0) {
      throw new Error(`invalid fps: ${fps}`);
    }

    // frames in [0, durationMs) at 1/fps steps -> exact length of frameCount/fps.
    const frameCount = Math.ceil((durationMs / 1000) * fps);
    for (let i = 0; i < frameCount; i++) {
      const t = (i * 1000) / fps;
      // await the seek before the screenshot, or we'd capture the prior frame.
      try {
        await page.evaluate(
          (ms) =>
            (
              window as unknown as { __TOUCAN__: { seek: (ms: number) => void } }
            ).__TOUCAN__.seek(ms),
          t,
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(
          `render(ms) threw while seeking ms=${Math.round(t)} (frame ${i}/${frameCount}): ${msg}\n  render() must be total — it must not throw for any ms in [0, durationMs]. Guard every lookup it depends on. This is a contract bug in the HTML.`,
        );
      }
      await page.screenshot({
        path: join(framesDir, `frame-${String(i).padStart(5, "0")}.png`),
      });
    }

    return { framesDir, fps, frameCount, durationMs };
  } finally {
    if (browser) await browser.close();
  }
}
