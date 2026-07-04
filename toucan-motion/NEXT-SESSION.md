# Toucan — kickoff brief for a fresh session

You are continuing work on **Toucan**, a SaaS that turns a text prompt into a
premium, self-contained HTML/CSS/JS explainer animation via the Anthropic API
(Sonnet). Read this whole brief before doing anything.

**The engine is nearly done.** Two builds remain, in this order — after them the
product engine is complete:
1. **Script-writing stage** (this session's main task).
2. **Session / chat management** (next).

## Where the work is
- Repo: `/home/user/toucan`. Work in the **`toucan-motion/`** subproject (a
  standalone CLI: topic → LLM writes ONE self-contained autoplay HTML file).
- Branch: `claude/toucan-animation-improvements-som6vf` (commit + push there).
- The animation generation prompt is **`toucan-motion/prompts/system-freeform.md`**.

## The #1 rule: NO TEMPLATE CAGE
The animation prompt is deliberately **lean and principles-based (~55 lines)** —
rewritten down from a 230-line template after we learned that fixed palettes,
named CSS classes, a required scene structure, and forbidden-element rules *cap*
quality and make the model second-guess good design choices. **Do not
re-introduce templates, kits, fixed colors/fonts, or "don't use a phone/browser"
rules — in the animation prompt OR the new script prompt.** The model chooses
medium, palette, type, and structure. Improve only by sharpening principles.

## Current state (validated on real API runs)
- Generations play correctly. We fixed a "two-clocks" desync (CSS
  `animation-delay` firing at page load while scenes reveal later on a JS timer,
  so motion played invisibly) — the prompt now requires a scene's motion to
  begin when the scene becomes visible. Camera moves with motion blur that
  ramps to 0 at rest. taxes / bill / photosynthesis all pass the gate and play.
- The animation prompt already honors a provided script: "if there's a script,
  that is the plan — realize each beat in order." **This is why the script-writing
  stage slots in cleanly — the animator already consumes scripts.**

## How to generate + verify (the API key is ready)
- Anthropic key is in `toucan-motion/.env` (gitignored). Model: `claude-sonnet-5`.
  Anthropic is reachable here (bypasses the proxy). Google Fonts is blocked
  (`ERR_CONNECTION_RESET`) — harmless, fonts fall back.
- Build if you change `src/`: `cd toucan-motion && npm run build` (deps were
  installed with `npm install --ignore-scripts` — the `ffmpeg-static` postinstall
  download is blocked here and is irrelevant to `generate`).
- Generate:
  `node dist/cli.js generate --topic "..." [--script file.txt] --provider anthropic --out out/x.html`
  Auto-gates (self-containment + a headless-Chromium smoke test) and does ONE
  auto-repair pass on failure. Generation code: `src/generate.ts`; gate:
  `src/freeform.ts`; CLI: `src/cli.ts`.
- SEE it: screenshot with Playwright (Chromium at `/opt/pw-browsers`). ffmpeg
  here can't decode mp4 — use screenshots. **Sample at irregular time offsets**:
  scenes cycle ~every 3.4s and blur during transitions, so evenly-spaced samples
  alias onto blurry transition frames.
- Always validate with real API + frames, not claims.

## TASK 1 — Script-writing stage (build this session)
**Why:** a bare topic makes the model invent the *narrative* and execute the
*craft* in one shot. A locked plan lets its whole budget go to craft — and it
gives the user a cheap approval checkpoint before spending on a full animation.
Giving the model a plan is NOT a template; it's the good kind of structure.

**Shape (two-step, human in the middle):**
1. **Director step:** a NEW system prompt (e.g. `prompts/system-script.md`) —
   a principles-based *screenwriter*, not a visual template. Given a topic (+ any
   user notes), it outputs a tight **beat-by-beat script**: ~20–30s, ~4–6 scenes,
   in the bracketed-beat style the animator already understands (see the sample
   in `taxes.txt` if present, or the format `[fast zoom to X]`, `[coins split
   off]`, a final overview, a closing line). It describes **what each beat shows
   and the through-line** — NOT exact HTML, colors, or class names. It should pick
   the medium that fits the topic and keep it tight.
2. **User approval:** return the script to the user; they accept or tweak it.
3. **Animator step:** feed topic + approved script into the existing
   `generate` path (already supports `--script`).

**Wiring:** add a way to run just the director and stop (e.g. a `script`
subcommand or `generate --plan` that prints the script and exits), then reuse the
existing `--script` generate. In the eventual product this is two API calls with
an approval gate between; store the approved script. Verify end to end: draft a
script for a topic, read it, generate the animation from it, screenshot.

## TASK 2 — Session / chat management (next)
Persist an animation as a conversation and make follow-up prompts **edit the
existing HTML instead of regenerating** (Figma / Claude-Code style) — this is
what closes the last of the "premium gap" (the maintainer's best result was
hand-*iterated*; letting the user iterate reproduces that).

- Model roughly: `Animation { id, title, messages[], currentHtml, versions[] }`;
  each turn stores the user prompt + the HTML it produced.
- **Edit flow:** a NEW "editor" system prompt — given the current HTML + the
  thread + the new request, return the FULL corrected file, **changing only what
  the request asks and keeping everything else identical**. Gate it, save as a
  new version. So "drop the phone" / "make it denser" patches, not regenerates.
- Home: the Spring `Animation` entity (id, prompt, generatedCode, status, …)
  already exists — extend it for versions/thread. This is the larger, product-side
  build.

## Optional quick polish (nice-to-have, not blocking)
Text occasionally overlaps text (a subtitle sitting on a title). If you touch the
animation prompt, add one principle: captions/titles/labels reserve their own
space and never overlap another text block; one clears before the next appears.

## Guardrails
- Keep both prompts principles-based (no template cage). Validate with real API +
  screenshots. Small, reviewable diffs. Commit to the branch above.
- Never commit `.env`. Revoke/rotate the key when the maintainer says you're done
  (it passed through a chat transcript).
