# toucan-motion (v0.1)

> **Throwaway / beta.** A standalone CLI that turns a topic into an explainer
> animation via the HTML path. This is a separate codebase from the
> SceneSpec/Remotion engine and will be retired when v0.2 lands. Optimized for
> "works and looks rendered," not for architecture.

Two products today:

```
generate: topic/script  →  LLM generates one self-contained HTML animation  →  the HTML file
                           (freeform engine — natural CSS/JS, autoplay, NO capture contract;
                            open it in a browser. MP4 capture for this path comes later.)

render:   topic/script  →  LLM generates one self-contained HTML  →  headless Chromium
                        →  frame-perfect capture (we own the clock)  →  ffmpeg → MP4
```

**`generate` is the current quality path** — it writes to
`prompts/system-freeform.md`, which keeps the full art direction (the
guided-tour spine, focal discipline, theme, cursor, rhythm) but drops the
determinism contract so the model can animate with the browser's own easing and
compositor. The output is gated by a self-containment check plus a
headless-Chromium **smoke test** (zero uncaught errors, a real DOM, visible
motion), with one auto-repair pass on failure.

`render` keeps the two capture engines, both deterministic because the recorder
owns the clock:

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
toucan-motion generate --plan  --topic "<topic>" [options]          # script only
toucan-motion generate --topic "<topic>" [--out <file.html>] [options]
toucan-motion render --topic "<topic>" --out <file.mp4> [options]
toucan-motion render --html <file.html> --out <file.mp4> [options]
toucan-motion check  --html <file.html> [--engine seek|vt|freeform]

  --topic <text>     Topic to explain (required unless --html).
  --plan             generate: run ONLY the screenwriter — draft a beat-by-beat
                     script from the topic, print it, and stop (no HTML).
  --out <file>       generate: output HTML path (default out/<topic-slug>.html);
                     with --plan, also saves the script to this file.
                     render: output MP4 path (required).
  --script <file>    Beat-by-beat brief appended to the topic.
  --html <file>      Capture an existing HTML file; skip generation (no API key needed).
  --mock             Use the engine's reference fixture instead of the API (no key,
                     no spend); with generate --plan, returns the example script.
  --engine <name>    render: seek (default) | vt (natural CSS animation on a virtual clock).
                     check: also freeform (self-containment + headless smoke test).
  --provider <name>  openai | anthropic (default: openai, or whichever key is set).
  --model <id>       Model id (default: gpt-4.1 for openai, claude-sonnet-5 for anthropic).
  --fps <n>          Override the HTML's declared fps.
  --keep-frames      Keep the PNG frames after encoding.
  --keep-html        Keep generated HTML after encoding.
```

### Examples

Recommended two-step flow — write the script first, approve it, then animate.
Locking the plan lets the model spend its whole budget on craft, and gives you a
checkpoint to fix the story before any pixels are drawn:

```bash
# 1) Screenwriter drafts a beat-by-beat script from the topic (script only, no HTML):
toucan-motion generate --plan --topic "how a login works" --provider anthropic > beats.txt
# 2) Read/tweak beats.txt to taste, then hand it to the animator:
toucan-motion generate --topic "how a login works" --script beats.txt --provider anthropic
```

`--plan` runs only the "screenwriter" prompt (`prompts/system-script.md`), prints
the script to **stdout** (all status goes to stderr, so `> beats.txt` is clean),
and exits. It's principles-based: a tight ~20–30s, 4–6-beat script in the same
bracketed-beat format the animator already understands, describing what each beat
_shows_ — never HTML or colors. `--plan --mock` prints the example script with no
API key.

Generate the animation HTML in one shot (skips the checkpoint — open the file in
a browser to watch it; needs an API key unless `--mock`):

```bash
toucan-motion generate --topic "how a shopping site works" --provider anthropic
toucan-motion generate --topic "how a shopping site works" --script beats.txt --out out/shop.html
toucan-motion generate --topic "how a shopping site works" --mock   # no key, no spend
toucan-motion check    --html out/shop.html --engine freeform       # re-run the gate
```

Render an MP4 via the capture engines (needs an API key for the chosen provider):

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

0. **plan / screenwriter** (`src/generate.ts`) — `generateScript({topic, …})`,
   reached via `generate --plan`. Sends `prompts/system-script.md` + your topic to
   the model and returns a beat-by-beat script (plain text). This is step (a) of
   the two-step flow: a locked, human-approved plan the animator then realizes.
   `--plan` prints it to stdout and exits — it does **not** touch the animator.
1. **generate** (`src/generate.ts`) — `generateHtml({topic, …, engine, mock})`.
   With `--mock` it returns the engine's reference fixture verbatim (no API
   key); otherwise it sends the engine's prompt (`prompts/system.md` for seek,
   `prompts/system-vt.md` for vt, `prompts/system-freeform.md` for freeform)
   + your topic to OpenAI or Anthropic (`--provider`), strips any markdown
   fence, and writes the HTML. For the freeform path the gate is
   `src/freeform.ts`: a static self-containment check (inline JS only, a
   Google Fonts `<link>` allowed) plus a headless-Chromium smoke test — zero
   uncaught page errors, a real DOM (≥12 elements), and visible motion between
   screenshots at 0.6s/2s/4s. One auto-repair pass on failure; the HTML is
   always kept (it IS the deliverable).
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
