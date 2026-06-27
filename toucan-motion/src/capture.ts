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

const READY_TIMEOUT_MS = 15000;

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
    await page.goto(pathToFileURL(absHtml).href);

    await page.waitForFunction(
      () =>
        (window as unknown as { __TOUCAN__?: { ready?: boolean } }).__TOUCAN__
          ?.ready === true,
      undefined,
      { timeout: READY_TIMEOUT_MS },
    );

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
      await page.evaluate(
        (ms) =>
          (
            window as unknown as { __TOUCAN__: { seek: (ms: number) => void } }
          ).__TOUCAN__.seek(ms),
        t,
      );
      await page.screenshot({
        path: join(framesDir, `frame-${String(i).padStart(5, "0")}.png`),
      });
    }

    return { framesDir, fps, frameCount, durationMs };
  } finally {
    if (browser) await browser.close();
  }
}
