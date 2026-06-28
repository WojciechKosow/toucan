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
cp .env.example .env              # then add your ANTHROPIC_API_KEY (only needed for --topic)
npm run build                     # compile TS -> dist/ (or use `npm run dev` to run from source)
```

Requires Node 20+. ffmpeg ships via `ffmpeg-static` — no system ffmpeg needed.

## Usage

```
toucan-motion render --topic "<topic>" --out <file.mp4> [options]
toucan-motion render --html <file.html> --out <file.mp4> [options]

  --topic <text>     Topic to explain (required unless --html).
  --out <file.mp4>   Output MP4 path (required).
  --script <file>    Beat-by-beat brief appended to the topic.
  --html <file>      Capture an existing HTML file; skip generation (no API key needed).
  --model <id>       Anthropic model (default: claude-opus-4-8).
  --fps <n>          Override the HTML's declared fps.
  --keep-frames      Keep the PNG frames after encoding.
  --keep-html        Keep generated HTML after encoding.
```

### Examples

Generate from a topic (needs `ANTHROPIC_API_KEY`):

```bash
toucan-motion render --topic "how a shopping site works" --out out/shop.mp4
```

Capture the reference HTML (no API key — the fast dev loop):

```bash
toucan-motion render --html fixtures/reference.html --out out/ref.mp4
```

Run without a global install via the built binary or from source:

```bash
node dist/cli.js render --html fixtures/reference.html --out out/ref.mp4
npm run dev -- render --html fixtures/reference.html --out out/ref.mp4
```

## How it works

1. **generate** (`src/generate.ts`) — sends `prompts/system.md` + your topic to
   Anthropic, strips any markdown fence, sanity-checks the `__TOUCAN__`/`seek`
   contract, and writes `out/<slug>/index.html`. No auto-repair loop in v0.1: on
   a contract miss it fails loudly and saves the raw output to `out/<slug>/raw.txt`.
2. **capture** (`src/capture.ts`) — launches headless Chromium at 1920×1080,
   waits for `__TOUCAN__.ready` and for fonts to settle, neutralizes the page's
   autoplay loop, then for each frame calls `seek(ms)` and screenshots. It owns
   the clock, so output is frame-perfect.
3. **encode** (`src/encode.ts`) — `ffmpeg-static` muxes the PNG frames into a
   1080p H.264 MP4 (`yuv420p`, CRF 18, `+faststart`), bit-exact and with metadata
   stripped so the same frames always produce the same bytes.

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
- **Model default**: `claude-opus-4-8` (latest Opus). Override with `--model`.

## Out of scope (v0.1)

Audio/voiceover, multi-sample motion blur, web UI / job queue / storage / DB,
provider bake-off, prompt auto-repair, multiple resolutions, and anything in the
SceneSpec/Remotion engine (that's a different codebase).
