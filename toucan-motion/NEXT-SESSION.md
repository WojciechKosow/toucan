# Toucan — kickoff brief for a fresh session

You are continuing work on **Toucan**, a SaaS that turns a text prompt into a
premium, self-contained HTML/CSS/JS explainer animation via the Anthropic API
(Sonnet). Read this whole brief before doing anything.

## Where the work is
- Repo: `/home/user/toucan`. Work in the **`toucan-motion/`** subproject (a
  standalone CLI: topic → LLM writes ONE self-contained autoplay HTML file).
- Branch: `claude/toucan-animation-improvements-som6vf` (commit + push there).
- The generation prompt is **`toucan-motion/prompts/system-freeform.md`**.

## The #1 rule: NO TEMPLATE CAGE
The prompt is deliberately **lean and principles-based (~55 lines)**. It was
rewritten down from a 230-line template after we learned that fixed palettes,
named CSS classes, a required scene structure, and forbidden-element rules
*cap* quality and make the model second-guess good design choices. **Do not
re-introduce templates, kits, fixed colors/fonts, or "don't use a phone/browser"
rules.** The model chooses medium, palette, type, structure. Improve by
sharpening *principles and failure-contrasts*, never by prescribing HTML.

## Current state (validated on real API runs)
- Generations play correctly. We fixed a "two-clocks" desync (CSS
  `animation-delay` firing at page load while scenes reveal later on a JS timer,
  so motion played invisibly) — the prompt now requires a scene's motion to
  begin when the scene becomes visible. Camera moves with motion blur that
  ramps to 0 at rest. taxes/bill/photosynthesis all pass the gate and play.
- The prompt honors the user's script (e.g. it will draw a phone if the script
  says "salary notification on their phone" — the old anti-phone rule is gone).

## How to generate + verify (the API key is ready)
- Anthropic key is in `toucan-motion/.env` (gitignored). Model: `claude-sonnet-5`.
  Anthropic is reachable here (bypasses the proxy). Google Fonts is blocked
  (`ERR_CONNECTION_RESET`) — harmless, fonts fall back.
- Build once if you change `src/`: `cd toucan-motion && npm run build`
  (deps were installed with `npm install --ignore-scripts` because the
  `ffmpeg-static` postinstall download is blocked here — irrelevant to `generate`).
- Generate:
  `node dist/cli.js generate --topic "..." [--script file.txt] --provider anthropic --out out/x.html`
  It auto-runs the gate (self-containment + a headless-Chromium smoke test:
  no JS errors, real DOM, visible motion) and does ONE auto-repair pass on failure.
- SEE it: screenshot with Playwright (Chromium at `/opt/pw-browsers`). The
  ffmpeg here can't decode mp4, so use screenshots, not video. **Sample at
  irregular time offsets** — the scenes cycle ~every 3.4s and blur during
  transitions, so evenly-spaced samples alias onto blurry transition frames.
  A `shoot.mjs` exists in the session scratchpad; write your own if needed.
- Runtime is wall-clock (setTimeout/rAF), so timing shifts slightly per run.

## Do this first — diagnose the premium gap
The best output so far is a hand-built shopping demo (`shopv2.html`) that the
maintainer finds more premium than one-shot API generations. Two suspected
causes: (1) that demo was **agent-iterated with screenshots** (bugs fixed,
zooms tuned) — a one-shot can't match that; (2) it had a **locked detailed
plan**, whereas a bare topic makes the model invent narrative AND craft at once.

**Run a clean A/B** to see how much the plan matters:
- Pick one topic. Generate (a) from just `--topic`, and (b) from a hand-written
  detailed beat-by-beat `--script`. Screenshot both, compare premium-ness
  (motion-blur consistency, "process vs slideshow" feel, zoom strength, no text
  overlap). Report with frames, not claims.
- If the scripted one is clearly better → that justifies building the
  script-writing stage (below). If not → the lever is iteration, so prioritize
  session management.

## Known concrete nit to fix as a PRINCIPLE (not a template)
Text sometimes overlaps text (a subtitle sitting on a title). Add a principle to
`system-freeform.md`: captions/titles/labels reserve their own space and never
overlap another text block; one clears before the next appears.

## Roadmap (in order)
1. Diagnose the gap (the A/B above) + the text-overlap principle fix.
2. **Script-writing stage** (premium feature): the model takes the user's prompt,
   writes a beat-by-beat script, and returns it for the user to accept / tweak;
   only then does it generate the animation from the approved script. (Giving the
   model a plan is cage-free — it still chooses all the craft.)
3. **Session / chat management** (closes the iteration gap): persist an animation
   + its conversation; a follow-up prompt ("make it denser", "drop the phone")
   EDITS the existing HTML instead of regenerating — send the thread + current
   HTML back to the model with an "edit only what's needed" instruction. The
   Spring `Animation` entity (id, prompt, generatedCode, status…) is a natural
   home for this.

## Guardrails
- Validate with real API + screenshots, not assertions. Keep diffs small and
  reviewable. Commit to the branch above.
- Revoke/rotate the `.env` key when the maintainer says you're done (it passed
  through a chat transcript). Never commit `.env`.
