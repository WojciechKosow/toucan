# toucan-motion (v0.1)

> **Throwaway / beta.** A standalone CLI that turns a topic into an explainer MP4
> via the HTML path. This is a separate codebase from the SceneSpec/Remotion
> engine and will be retired when v0.2 lands. Optimized for "works and looks
> rendered," not for architecture.

```
topic/script  →  LLM generates one self-contained HTML  →  headless Chromium
              →  frame-perfect capture (seek + screenshot per frame)  →  ffmpeg → MP4
```

The generated HTML drives all animation from a single `render(ms)` function and
exposes a tiny contract (`window.__TOUCAN__ = { ready, durationMs, fps, seek }`),
so capture controls the clock and every frame is reproducible. See
`prompts/system.md` for the full generation contract and `fixtures/reference.html`
for a minimal reference implementation.

## Setup

```bash
npm install
npx playwright install chromium   # one-time: download the browser
cp .env.example .env              # add OPENAI_API_KEY and/or ANTHROPIC_API_KEY (only for --topic)
npm run build                     # compile TS -> dist/ (or use `npm run dev` to run from source)
```

Requires Node 20+. ffmpeg ships via `ffmpeg-static` — no system ffmpeg needed.

## Usage

```
toucan-motion render --topic "<topic>" --out <file.mp4> [options]
toucan-motion render --html <file.html> --out <file.mp4> [options]
toucan-motion check  --html <file.html>

  --topic <text>     Topic to explain (required unless --html).
  --out <file.mp4>   Output MP4 path (required).
  --script <file>    Beat-by-beat brief appended to the topic.
  --html <file>      Capture an existing HTML file; skip generation (no API key needed).
  --mock             Use fixtures/reference.html instead of the API (no key, no spend).
  --provider <name>  openai | anthropic (default: openai, or whichever key is set).
  --model <id>       Model id (default: gpt-4.1 for openai, claude-opus-4-8 for anthropic).
  --fps <n>          Override the HTML's declared fps.
  --keep-frames      Keep the PNG frames after encoding.
  --keep-html        Keep generated HTML after encoding.
```

### Examples

Generate from a topic (needs an API key for the chosen provider):

```bash
toucan-motion render --topic "how a shopping site works" --out out/shop.mp4
toucan-motion render --topic "how a shopping site works" --out out/shop.mp4 --provider anthropic
```

Run the whole topic→MP4 path with no API key (mock = the reference stub):

```bash
toucan-motion render --topic "how a shopping site works" --mock --out out/mock.mp4
```

Capture the reference HTML (no API key — the fast dev loop):

```bash
toucan-motion render --html fixtures/reference.html --out out/ref.mp4
```

Gate any HTML against the contract (static + determinism):

```bash
toucan-motion check --html fixtures/reference.html   # PASS
```

Run without a global install via the built binary or from source:

```bash
node dist/cli.js render --html fixtures/reference.html --out out/ref.mp4
npm run dev -- render --html fixtures/reference.html --out out/ref.mp4
```

## How it works

1. **generate** (`src/generate.ts`) — `generateHtml({topic, …, mock})`. With
   `--mock` it returns `fixtures/reference.html` verbatim (no API key); otherwise
   it sends `prompts/system.md` + your topic to OpenAI or Anthropic (`--provider`),
   strips any markdown fence, and writes `out/<slug>/index.html`.
2. **validate** (`src/validate.ts`) — the contract gate. `validateHtml()` is a
   static check: required members (`window.__TOUCAN__`, `seek`, `ready`,
   `durationMs`, `fps`, `__TOUCAN_DONE__`) and forbidden CSS (`@keyframes`,
   `transition:`, `animation:` inside `<style>`/`style=`) that would break
   seeking. `render` runs it right after generation and **refuses to encode** if
   it fails (the HTML is kept for inspection). `validateRender()` captures the
   file twice and proves frames at 25/50/75% are byte-identical (determinism).
3. **capture** (`src/capture.ts`) — headless Chromium at 1920×1080; waits for
   `__TOUCAN__.ready` + fonts, neutralizes the autoplay loop, `seek(ms)` +
   screenshot per frame. Owns the clock, so output is frame-perfect. On a
   generated-HTML failure, `render` does **one auto-repair pass** (broken file +
   error back to the model) then re-validates and re-captures.
4. **encode** (`src/encode.ts`) — `ffmpeg-static` muxes the PNGs into a 1080p
   H.264 MP4 (`yuv420p`, CRF 18, `+faststart`), bit-exact, metadata stripped.

### `check` — the gate you live in during prompt tuning

```bash
toucan-motion check --html <file>   # static contract + determinism; prints PASS/FAIL, exits non-zero on FAIL
```

`fixtures/bad-transition.html` is the reference with one illegal `transition:`
added — `check` on it FAILs (naming the violation), proving the gate bites.

## Determinism

Same input → identical output. The HTML must compute every animated value inside
`render(ms)` (no CSS `transition`/`@keyframes`, no `Date.now()`); capture waits
for fonts and disables the autoplay rAF loop so frames never race the wall clock.
If a frame looks time-dependent, that's an HTML-contract bug in the generated
file, not a capture bug.

## Notes / escape hatches

- **Chromium**: capture uses Playwright's managed Chromium; if a pre-provisioned
  browser exists under `PLAYWRIGHT_BROWSERS_PATH` (CI/sandbox), it's used instead.
- **ffmpeg**: `ffmpeg-static` is the default. If that binary can't run in your
  environment, set `FFMPEG_PATH=/path/to/ffmpeg` to use another build.
- **Provider/model**: `--provider openai` (default, model `gpt-4.1`) or
  `--provider anthropic` (model `claude-opus-4-8`). Override the model with
  `--model`. If you switch to a model with a smaller output cap, lower
  `MAX_OUTPUT_TOKENS` in `src/generate.ts`. One-shot auto-repair runs through the
  same provider.

## Out of scope (v0.1)

Audio/voiceover, multi-sample motion blur, web UI / job queue / storage / DB,
provider bake-off, prompt auto-repair, multiple resolutions, and anything in the
SceneSpec/Remotion engine (that's a different codebase).
