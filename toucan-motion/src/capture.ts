// Step 3 — capture: an HTML file on disk -> a directory of PNG frames.
//
// Two engines, both frame-perfect because WE own the clock:
//
// - "seek" (v0.1): the page exposes seek(ms) — a pure function of time — and we
//   call it per frame + screenshot. CSS transitions/@keyframes are forbidden
//   (they run on the wall clock and would break seeking).
//
// - "vt" (virtual time): the page animates NATURALLY (CSS @keyframes,
//   transitions, rAF, setTimeout choreography) but stays dormant until we call
//   window.__TOUCAN_START__(). We pause Chromium's virtual clock via CDP, start
//   the timeline, then advance the clock exactly one frame at a time and
//   screenshot. Timers, rAF timestamps, performance.now, and the CSS animation
//   clock all follow virtual time (threaded animation is disabled), so natural
//   web animation becomes deterministic.

import { existsSync, readdirSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, type Browser, type CDPSession, type Page } from "playwright";

export type CaptureEngine = "seek" | "vt";
export const ENGINES: CaptureEngine[] = ["seek", "vt"];

export interface CaptureOptions {
  fps?: number;
  engine?: CaptureEngine;
}

export interface CaptureResult {
  framesDir: string;
  fps: number;
  frameCount: number;
  durationMs: number;
  /** __TOUCAN_DONE__ after the timeline completed (final seek / final advance). */
  done: boolean;
}

const READY_TIMEOUT_MS = 30000;
const VT_FRAME_TIMEOUT_MS = 15000;

/**
 * Resolve a Chromium executable. Prefers Playwright's own managed browser (normal
 * dev machine after `npx playwright install chromium`); falls back to a browser
 * pre-provisioned under PLAYWRIGHT_BROWSERS_PATH (CI / sandbox), since the bundled
 * Playwright revision may not match what's installed there.
 */
export function resolveChromiumPath(): string | undefined {
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

function frameName(i: number): string {
  return `frame-${String(i).padStart(5, "0")}.png`;
}

/**
 * The vt engine needs Chromium's BeginFrameControl, which lives in the
 * headless-shell build. Prefer Playwright's managed resolution (it uses its own
 * headless shell for headless launches); in pre-provisioned environments search
 * PLAYWRIGHT_BROWSERS_PATH for the headless_shell binary explicitly.
 */
function resolveVtChromiumPath(): string | undefined {
  try {
    const managed = chromium.executablePath();
    if (managed && existsSync(managed)) return undefined; // let Playwright pick its headless shell
  } catch {
    /* fall through */
  }
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (base && existsSync(base)) {
    const dirs = readdirSync(base)
      .filter((d) => d.startsWith("chromium_headless_shell-"))
      .sort()
      .reverse();
    for (const d of dirs) {
      for (const sub of [
        "chrome-linux/headless_shell",
        "chrome-linux64/headless_shell",
      ]) {
        const cand = join(base, d, sub);
        if (existsSync(cand)) return cand;
      }
    }
  }
  return resolveChromiumPath(); // last resort: full chromium (may lack BeginFrameControl)
}

/** Wait for __TOUCAN__.ready with a rich diagnostic on timeout. */
async function waitReady(
  page: Page,
  absHtml: string,
  pageErrors: string[],
  consoleErrors: string[],
  pollingMs?: number,
): Promise<void> {
  try {
    await page.waitForFunction(
      () =>
        (window as unknown as { __TOUCAN__?: { ready?: boolean } }).__TOUCAN__
          ?.ready === true,
      undefined,
      // Under BeginFrameControl no frames are produced until we ask for them, so
      // rAF-based polling (the default) would hang — vt polls on a timer.
      pollingMs != null
        ? { timeout: READY_TIMEOUT_MS, polling: pollingMs }
        : { timeout: READY_TIMEOUT_MS },
    );
  } catch {
    const diag = await page
      .evaluate(() => {
        const t = (
          window as unknown as { __TOUCAN__?: Record<string, unknown> }
        ).__TOUCAN__;
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
          ? `  __TOUCAN__ is present but ready=${JSON.stringify(diag.ready)} (seek=${diag.seek}, durationMs=${diag.durationMs}, fps=${diag.fps}). It defined the API but never flipped ready — usually a JS error before ready, or the fonts gate has no 500ms fallback.`
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
}

async function readMeta(
  page: Page,
  fpsOverride: number | undefined,
): Promise<{ durationMs: number; fps: number; frameCount: number }> {
  const meta = await page.evaluate(() => {
    const t = (
      window as unknown as { __TOUCAN__: { durationMs: number; fps: number } }
    ).__TOUCAN__;
    return { durationMs: t.durationMs, fps: t.fps };
  });
  const durationMs = meta.durationMs;
  const fps = fpsOverride ?? meta.fps;
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw new Error(`invalid durationMs from HTML: ${durationMs}`);
  }
  if (!Number.isFinite(fps) || fps <= 0) {
    throw new Error(`invalid fps: ${fps}`);
  }
  // frames in [0, durationMs) at 1/fps steps -> exact length of frameCount/fps.
  const frameCount = Math.ceil((durationMs / 1000) * fps);
  return { durationMs, fps, frameCount };
}

export async function capture(
  htmlPath: string,
  framesDir: string,
  opts: CaptureOptions = {},
): Promise<CaptureResult> {
  const absHtml = resolve(htmlPath);
  if (!existsSync(absHtml)) {
    throw new Error(`HTML file not found: ${absHtml}`);
  }

  // Fresh frames directory so we never mix in stale PNGs from a previous run.
  await rm(framesDir, { recursive: true, force: true });
  await mkdir(framesDir, { recursive: true });

  return opts.engine === "vt"
    ? captureVt(absHtml, framesDir, opts)
    : captureSeek(absHtml, framesDir, opts);
}

// ── engine: seek (v0.1) ──────────────────────────────────────────────────────

async function captureSeek(
  absHtml: string,
  framesDir: string,
  opts: CaptureOptions,
): Promise<CaptureResult> {
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
    await waitReady(page, absHtml, pageErrors, consoleErrors);

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

    const { durationMs, fps, frameCount } = await readMeta(page, opts.fps);

    for (let i = 0; i < frameCount; i++) {
      const t = (i * 1000) / fps;
      // await the seek before the screenshot, or we'd capture the prior frame.
      try {
        await page.evaluate(
          (ms) =>
            (
              window as unknown as {
                __TOUCAN__: { seek: (ms: number) => void };
              }
            ).__TOUCAN__.seek(ms),
          t,
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(
          `render(ms) threw while seeking ms=${Math.round(t)} (frame ${i}/${frameCount}): ${msg}\n  render() must be total — it must not throw for any ms in [0, durationMs]. Guard every lookup it depends on. This is a contract bug in the HTML.`,
        );
      }
      await page.screenshot({ path: join(framesDir, frameName(i)) });
    }

    // Final seek to the end so the page can flip __TOUCAN_DONE__ (the contract's
    // end-of-render signal). Doesn't affect the captured frames above.
    const done = await page.evaluate((ms) => {
      const t = (
        window as unknown as {
          __TOUCAN__: { seek: (ms: number) => void };
          __TOUCAN_DONE__?: boolean;
        }
      ).__TOUCAN__;
      t.seek(ms);
      return (
        (window as unknown as { __TOUCAN_DONE__?: boolean }).__TOUCAN_DONE__ ===
        true
      );
    }, durationMs);

    return { framesDir, fps, frameCount, durationMs, done };
  } finally {
    if (browser) await browser.close();
  }
}

// ── engine: vt (virtual time) ────────────────────────────────────────────────

/** Grant `budget` ms of virtual time and wait until the page has consumed it. */
function advanceVirtualTime(cdp: CDPSession, budget: number): Promise<void> {
  return new Promise<void>((resolvePromise, reject) => {
    const timer = setTimeout(() => {
      cdp.off("Emulation.virtualTimeBudgetExpired", onExpired);
      reject(
        new Error(
          `virtual time did not advance ${budget}ms within ${VT_FRAME_TIMEOUT_MS}ms — the page is likely starving the clock (a tight 0ms timer loop?)`,
        ),
      );
    }, VT_FRAME_TIMEOUT_MS);
    const onExpired = () => {
      clearTimeout(timer);
      resolvePromise();
    };
    cdp.once("Emulation.virtualTimeBudgetExpired", onExpired);
    cdp
      .send("Emulation.setVirtualTimePolicy", {
        policy: "advance",
        budget,
        maxVirtualTimeTaskStarvationCount: 100000,
      })
      .catch((e) => {
        clearTimeout(timer);
        cdp.off("Emulation.virtualTimeBudgetExpired", onExpired);
        reject(e);
      });
  });
}

/** beginFrame with a hard timeout — a stalled compositor pipeline must fail
 *  loudly, not hang the capture forever. */
async function beginFrame(
  cdp: CDPSession,
  params: {
    frameTimeTicks: number;
    interval: number;
    screenshot?: { format: "png" };
  },
): Promise<{ screenshotData?: string }> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(
            `HeadlessExperimental.beginFrame did not complete within ${VT_FRAME_TIMEOUT_MS}ms (frameTimeTicks=${params.frameTimeTicks})`,
          ),
        ),
      VT_FRAME_TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([
      cdp.send("HeadlessExperimental.beginFrame", params),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function captureVt(
  absHtml: string,
  framesDir: string,
  opts: CaptureOptions,
): Promise<CaptureResult> {
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: resolveVtChromiumPath(),
      args: [
        "--hide-scrollbars",
        "--force-color-profile=srgb",
        // Deterministic rendering: WE issue every compositor frame with an
        // explicit frame time (BeginFrameControl), animations run on the main
        // thread so they follow those frame times, and the compositor finishes
        // every stage before drawing.
        "--deterministic-mode", // umbrella: begin-frame-control + no threaded anim/scroll + full compositor stages
        "--enable-begin-frame-control",
        "--disable-threaded-animation",
        "--disable-threaded-scrolling",
        "--disable-checker-imaging",
        "--run-all-compositor-stages-before-draw",
        "--disable-new-content-rendering-timeout",
        // Deterministic rasterization: single-threaded software raster with no
        // partial updates, so identical display lists produce identical pixels.
        "--disable-gpu",
        "--disable-gpu-compositing", // pure software compositor (SwiftShader's threaded raster is not deterministic)
        "--disable-composited-antialiasing", // compositor edge AA is the residual per-run raster noise
        "--num-raster-threads=1",
        "--disable-partial-raster",
        "--disable-skia-runtime-opts",
        "--disable-image-animation-resync",
        // Glyph rendering under subpixel transforms (text inside animated
        // elements) is the classic residual raster nondeterminism — pin it down.
        "--font-render-hinting=none",
        "--disable-lcd-text",
        "--disable-font-subpixel-positioning",
      ],
    });
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(e.message ?? String(e)));
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });

    // Announce the recorder BEFORE any page script runs: the contract says a page
    // must NOT autoplay when __TOUCAN_RECORDER__ is set — it waits for
    // __TOUCAN_START__() so the timeline begins on OUR clock, not the wall clock.
    await page.addInitScript(() => {
      (
        window as unknown as { __TOUCAN_RECORDER__: boolean }
      ).__TOUCAN_RECORDER__ = true;
    });

    // Run the page's load on a fixed virtual-time budget: once navigation
    // commits, grant exactly LOAD_BUDGET_MS of virtual time (network fetches
    // pause the clock, so real latency doesn't leak in). The clock then freezes
    // at EXACTLY base + LOAD_BUDGET in every run, so the page's own
    // performance.now() readings — which generated JS uses as its t0 — sit at
    // the same virtual instant as our frame epoch, and JS-measured elapsed time
    // is reproducible. (Pausing after load instead leaves a per-run freeze lag
    // between the page's frozen clock and the returned ticks base.)
    const LOAD_BUDGET_MS = 3000;
    const cdp = await context.newCDPSession(page);
    await page.goto(pathToFileURL(absHtml).href, { waitUntil: "commit" });
    const loadBudgetExpired = new Promise<void>((resolvePromise, reject) => {
      const timer = setTimeout(
        () =>
          reject(
            new Error(
              `page did not consume the ${LOAD_BUDGET_MS}ms virtual load budget within ${READY_TIMEOUT_MS}ms of real time`,
            ),
          ),
        READY_TIMEOUT_MS,
      );
      cdp.once("Emulation.virtualTimeBudgetExpired", () => {
        clearTimeout(timer);
        resolvePromise();
      });
    });
    const { virtualTimeTicksBase: rawBase } = await cdp.send(
      "Emulation.setVirtualTimePolicy",
      {
        policy: "pauseIfNetworkFetchesPending",
        budget: LOAD_BUDGET_MS,
        maxVirtualTimeTaskStarvationCount: 1000000,
      },
    );
    await loadBudgetExpired;
    await waitReady(page, absHtml, pageErrors, consoleErrors, 100);
    await page.evaluate(() => document.fonts.ready);

    const hasStart = await page.evaluate(
      () =>
        typeof (window as unknown as { __TOUCAN_START__?: unknown })
          .__TOUCAN_START__ === "function",
    );
    if (!hasStart) {
      throw new Error(
        `window.__TOUCAN_START__ is missing or not a function. The vt engine requires the page to stay dormant until the recorder calls __TOUCAN_START__(). This is a contract bug in the HTML (${absHtml}).`,
      );
    }

    const { durationMs, fps, frameCount } = await readMeta(page, opts.fps);
    const frameIntervalMs = 1000 / fps;

    // The budget expiry overshoots rawBase+LOAD_BUDGET by a variable sub-ms
    // amount, so the true frozen tick can't be computed — measure it. A probe
    // frame at a known tick T_p reports its rAF timestamp R (document time);
    // against the frozen performance.now() F, the overshoot is PAD - (R - F).
    // Then advance PAD past the probe so the timeline starts monotonically, and
    // anchor the frame epoch on the measured frozen tick. This is what makes
    // page-side clocks (t0 = performance.now() in start()) agree with our frame
    // times to sub-quantum precision, in every run.
    const PAD = 10;
    const F = await page.evaluate(() => performance.now());
    const rafProbe = page.evaluate(
      () => new Promise<number>((r) => requestAnimationFrame((ts) => r(ts))),
    );
    await beginFrame(cdp, {
      frameTimeTicks: rawBase + LOAD_BUDGET_MS + PAD,
      interval: frameIntervalMs,
    });
    const R = await rafProbe;
    const overshoot = PAD - (R - F);
    if (!(R > F) || overshoot < -0.5 || overshoot >= PAD) {
      throw new Error(
        `virtual-time alignment probe failed (F=${F}, R=${R}, overshoot=${overshoot}) — cannot anchor the frame clock`,
      );
    }
    await advanceVirtualTime(cdp, PAD);
    // tickOf(the page's now-frozen clock): measured, not assumed.
    const virtualTimeTicksBase = rawBase + LOAD_BUDGET_MS + overshoot + PAD;

    // Start the timeline at exactly t0 (the clock is frozen, so nothing races).
    await page.evaluate(() =>
      (
        window as unknown as { __TOUCAN_START__: () => void }
      ).__TOUCAN_START__(),
    );

    // Per-run anchor for animation start-time snapping. Blink quantizes document
    // times to a 0.1ms grid whose phase varies per run; expressing every
    // animation's startTime RELATIVE to one quantized anchor and snapping that
    // relative value back to the 0.1 grid cancels the phase entirely, so CSS
    // animation/transition progress is bit-identical across runs.
    await page.evaluate(() => {
      (
        window as unknown as { __TOUCAN_VT_ANCHOR__: number }
      ).__TOUCAN_VT_ANCHOR__ = performance.now();
    });

    // Frame i sits at t=i*1000/fps. Advance the virtual clock by integer deltas
    // (33,33,34,…) with no drift, then produce the compositor frame for that
    // instant and screenshot it.
    //
    // All offsets are OFF the integer-ms grid (page JS that floors elapsed
    // time — counters, typewriters — would flicker ±1 on the boundary) while
    // staying ON the 0.1ms clock-quantization grid, so quantization phase
    // cancels out of animation sampling. TICK frames flush the pipeline; the
    // KEEP frame is the screenshot, always at the same fixed offset so the
    // number of ticks a run needed can never shift its sampling time.
    const TICK_OFFSET = 0.2;
    const TICK_STEP = 0.1;
    const MAX_TICKS = 6;
    const KEEP_OFFSET = TICK_OFFSET + (MAX_TICKS + 1) * TICK_STEP; // 0.9, fixed
    let advanced = 0;
    let lastShot: Buffer | undefined;
    for (let i = 0; i < frameCount; i++) {
      const target = Math.round((i * 1000) / fps);
      const budget = target - advanced;
      if (budget > 0) {
        await advanceVirtualTime(cdp, budget);
        advanced = target;
      }
      // Snap animation start times before producing the frame: pending
      // animations (just created by the page's schedule) start at THIS frame's
      // time; running ones get their anchor-relative start snapped to the 0.1ms
      // grid. Both kill the per-run quantization phase.
      await page.evaluate((rel) => {
        const A = (window as unknown as { __TOUCAN_VT_ANCHOR__: number })
          .__TOUCAN_VT_ANCHOR__;
        for (const a of document.getAnimations()) {
          try {
            const st = a.startTime;
            if (st === null || st === undefined) {
              a.startTime = A + rel;
            } else if (typeof st === "number") {
              const r = st - A;
              const snapped = Math.round(r * 10) / 10;
              if (snapped !== r) a.startTime = A + snapped;
            }
          } catch {
            /* a finished/detached animation — ignore */
          }
        }
      }, target + KEEP_OFFSET);
      // Produce the frame in two phases. TICK frames (screenshots discarded)
      // run until the page confirms a requestAnimationFrame fired — proof the
      // main-thread animation tick, style/layout, and commit ran for this
      // instant. One BeginFrame is NOT always enough: while the previous
      // frame's commit is still in flight the compositor draws without a main
      // frame, so a lone screenshot occasionally captures the PREVIOUS frame's
      // state (off-by-one race) — and unconditionally awaiting a rAF promise
      // deadlocks on exactly that path. Polling a flag keeps it bounded: not
      // serviced yet -> just issue another tick. The KEEP frame then re-draws
      // the committed state at the fixed offset; that screenshot is kept.
      await page.evaluate(() => {
        const w = window as unknown as { __TOUCAN_TICKED__: boolean };
        w.__TOUCAN_TICKED__ = false;
        requestAnimationFrame(() => {
          w.__TOUCAN_TICKED__ = true;
        });
      });
      let ticked = false;
      for (let k = 0; k < MAX_TICKS && !ticked; k++) {
        await beginFrame(cdp, {
          frameTimeTicks:
            virtualTimeTicksBase + target + TICK_OFFSET + k * TICK_STEP,
          interval: frameIntervalMs,
          screenshot: { format: "png" }, // discarded — forces the full pipeline
        });
        ticked = await page.evaluate(
          () =>
            (window as unknown as { __TOUCAN_TICKED__: boolean })
              .__TOUCAN_TICKED__,
        );
      }
      if (!ticked) {
        throw new Error(
          `vt capture: the main frame never ran within ${MAX_TICKS} BeginFrames at t=${target}ms — begin-frame pipeline stalled`,
        );
      }
      const frame = await beginFrame(cdp, {
        frameTimeTicks: virtualTimeTicksBase + target + KEEP_OFFSET,
        interval: frameIntervalMs,
        screenshot: { format: "png" },
      });
      if (frame.screenshotData) {
        lastShot = Buffer.from(frame.screenshotData, "base64");
      } else if (!lastShot) {
        throw new Error(
          `beginFrame produced no screenshot for frame 0 — BeginFrameControl unavailable? The vt engine needs Chromium's headless shell (npx playwright install chromium).`,
        );
      }
      // No screenshotData means the frame had no damage — identical to the
      // previous frame by definition, so reuse it.
      await writeFile(join(framesDir, frameName(i)), lastShot);
    }

    // Run the clock past the end of the timeline (+2ms so timers scheduled AT
    // durationMs fire), then one last frame so their effects settle.
    await advanceVirtualTime(cdp, durationMs - advanced + 2);
    await beginFrame(cdp, {
      frameTimeTicks: virtualTimeTicksBase + durationMs + 2 + KEEP_OFFSET,
      interval: frameIntervalMs,
    });
    const done = await page.evaluate(
      () =>
        (window as unknown as { __TOUCAN_DONE__?: boolean }).__TOUCAN_DONE__ ===
        true,
    );

    return { framesDir, fps, frameCount, durationMs, done };
  } finally {
    if (browser) await browser.close();
  }
}
