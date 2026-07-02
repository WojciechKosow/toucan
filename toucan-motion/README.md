# toucan-motion (v0.1)

> **Throwaway / beta.** A standalone CLI that turns a topic into an explainer MP4
> via the HTML path. This is a separate codebase from the SceneSpec/Remotion
> engine and will be retired when v0.2 lands. Optimized for "works and looks
> rendered," not for architecture.

```
topic/script  →  LLM generates one self-contained HTML  →  headless Chromium
              →  frame-perfect capture (we own the clock)  →  ffmpeg → MP4
```

Two capture engines, both deterministic because the recorder owns the clock:

- **`seek`** (default) — the HTML drives all animation from a single
  `render(ms)` function and exposes
  `window.__TOUCAN__ = { ready, durationMs, fps, seek }`; capture calls
  `seek(ms)` + screenshot per frame. CSS `transition`/`@keyframes` are
  forbidden (they run on the wall clock and would break seeking). See
  `prompts/system.md` and `fixtures/reference.html`.
- **`vt`** (virtual time, experimental) — the HTML animates *naturally* (CSS
  `@keyframes`, `transition`, rAF, `setTimeout` choreography) but stays dormant
  until the recorder calls `window.__TOUCAN_START__()`. Capture pauses
  Chromium's virtual clock (CDP BeginFrameControl), starts the timeline, then
  advances the clock exactly one frame at a time. Timers, rAF timestamps,
  `performance.now()`, and the CSS animation clock all follow virtual time.
  Higher motion quality (the browser's own easing/compositing), same
  reproducibility. See `prompts/system-vt.md` and `fixtures/css-anim.html`.

## Setup

```bash
npm install
npx playwright install chromium   # one-time: download the browser (includes the headless shell vt needs)
cp .env.example .env              # add OPENAI_API_KEY and/or ANTHROPIC_API_KEY (only for --topic)
npm run build                     # compile TS -> dist/ (or use `npm run dev` to run from source)
```

Requires Node 20+. ffmpeg ships via `ffmpeg-static` — no system ffmpeg needed.

## Usage

```
toucan-motion render --topic "<topic>" --out <file.mp4> [options]
toucan-motion render --html <file.html> --out <file.mp4> [options]
toucan-motion check  --html <file.html> [--engine seek|vt]

  --topic <text>     Topic to explain (required unless --html).
  --out <file.mp4>   Output MP4 path (required).
  --script <file>    Beat-by-beat brief appended to the topic.
  --html <file>      Capture an existing HTML file; skip generation (no API key needed).
  --mock             Use the engine's reference fixture instead of the API (no key, no spend).
  --engine <name>    seek (default) | vt (natural CSS animation on a virtual clock).
  --provider <name>  openai | anthropic (default: openai, or whichever key is set).
  --model <id>       Model id (default: gpt-4.1 for openai, claude-sonnet-5 for anthropic).
  --fps <n>          Override the HTML's declared fps.
  --keep-frames      Keep the PNG frames after encoding.
  --keep-html        Keep generated HTML after encoding.
```

### Examples

Generate from a topic (needs an API key for the chosen provider):

```bash
toucan-motion render --topic "how a shopping site works" --out out/shop.mp4
toucan-motion render --topic "how a shopping site works" --out out/shop.mp4 --provider anthropic
toucan-motion render --topic "how a shopping site works" --out out/shop.mp4 --engine vt
```

Run the whole topic→MP4 path with no API key (mock = the engine's reference fixture):

```bash
toucan-motion render --topic "how a shopping site works" --mock --out out/mock.mp4
toucan-motion render --topic "how a shopping site works" --mock --out out/mock-vt.mp4 --engine vt
```

Capture an existing HTML file (no API key — the fast dev loop):

```bash
toucan-motion render --html fixtures/reference.html --out out/ref.mp4
toucan-motion render --html fixtures/css-anim.html --out out/css.mp4 --engine vt
```

Gate any HTML against its engine's contract (static + determinism):

```bash
toucan-motion check --html fixtures/reference.html                 # PASS (seek)
toucan-motion check --html fixtures/css-anim.html --engine vt      # PASS (vt)
```

Run without a global install via the built binary or from source:

```bash
node dist/cli.js render --html fixtures/reference.html --out out/ref.mp4
npm run dev -- render --html fixtures/reference.html --out out/ref.mp4
```

## How it works

1. **generate** (`src/generate.ts`) — `generateHtml({topic, …, engine, mock})`.
   With `--mock` it returns the engine's reference fixture verbatim (no API
   key); otherwise it sends the engine's prompt (`prompts/system.md` for seek,
   `prompts/system-vt.md` for vt) + your topic to OpenAI or Anthropic
   (`--provider`), strips any markdown fence, and writes `out/<slug>/index.html`.
2. **validate** (`src/validate.ts`) — the contract gate, engine-aware.
   `validateHtml()` is a static check: required members for the engine
   (`seek` for seek; `__TOUCAN_START__` + a `__TOUCAN_RECORDER__` autoplay guard
   for vt) plus the common contract, and — seek only — forbidden CSS
   (`@keyframes`, `transition:`, `animation:` inside `<style>`/`style=`).
   `render` runs it right after generation and **refuses to encode** if it
   fails (the HTML is kept for inspection). `validateRender()` captures the
   file twice and proves the runs match (see Determinism below).
3. **capture** (`src/capture.ts`) — headless Chromium at 1920×1080.
   *seek*: waits for `__TOUCAN__.ready` + fonts, neutralizes the autoplay
   loop, `seek(ms)` + screenshot per frame.
   *vt*: launches the headless shell under BeginFrameControl with a
   deterministic-raster flag set, runs page load on a fixed virtual-time
   budget, measures the frozen-clock epoch with a rAF probe, calls
   `__TOUCAN_START__()`, then per frame: advance virtual time, snap animation
   start times to the 0.1ms clock grid, issue compositor frames until the main
   frame provably ran, and keep the screenshot from a final fixed-offset frame.
   On a generated-HTML failure, `render` does **one auto-repair pass** (broken
   file + error back to the model) then re-validates and re-captures.
4. **encode** (`src/encode.ts`) — `ffmpeg-static` muxes the PNGs into a 1080p
   H.264 MP4 (`yuv420p`, CRF 18, `+faststart`), bit-exact, metadata stripped.

### `check` — the gate you live in during prompt tuning

```bash
toucan-motion check --html <file> [--engine vt]   # static contract + determinism; prints PASS/FAIL, exits non-zero on FAIL
```

`fixtures/bad-transition.html` is the seek reference with one illegal
`transition:` added — `check` on it FAILs (naming the violation), proving the
gate bites.

## Determinism

Same input → identical output.

- **seek** renders are byte-exact: the gate captures twice and hash-compares
  sampled frames. The HTML must compute every animated value inside
  `render(ms)` (no CSS `transition`/`@keyframes`, no `Date.now()`).
- **vt** renders are pixel-deterministic up to sub-quantum clock phase:
  Blink quantizes document times to a 0.1ms grid whose phase varies per run,
  which can toggle a handful of anti-aliased edge/glyph pixels (~0.05%
  observed, invisible). The gate decodes and compares **every** frame and
  fails if any frame differs on more than 0.3% of pixels — a real determinism
  bug (wall-clock read, randomness, motion before `__TOUCAN_START__`)
  displaces whole regions and blows far past that bound.

If a frame looks time-dependent, that's an HTML-contract bug in the generated
file, not a capture bug.

## Notes / escape hatches

- **Chromium**: capture uses Playwright's managed Chromium; if a pre-provisioned
  browser exists under `PLAYWRIGHT_BROWSERS_PATH` (CI/sandbox), it's used instead.
  The vt engine specifically needs the **headless shell** build (BeginFrameControl);
  `npx playwright install chromium` provides it.
- **ffmpeg**: `ffmpeg-static` is the default. If that binary can't run in your
  environment, set `FFMPEG_PATH=/path/to/ffmpeg` to use another build.
- **Provider/model**: `--provider openai` (default, model `gpt-4.1`) or
  `--provider anthropic` (model `claude-sonnet-5`, streamed — large outputs
  need streaming). Override the model with `--model`. If you switch to a model
  with a smaller output cap, lower the `MAX_OUTPUT_TOKENS_*` constants in
  `src/generate.ts`. One-shot auto-repair runs through the same provider.

## Out of scope (v0.1)

Audio/voiceover, multi-sample motion blur, web UI / job queue / storage / DB,
provider bake-off, multiple resolutions, and anything in the
SceneSpec/Remotion engine (that's a different codebase).
