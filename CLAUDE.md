# CLAUDE.md — Toucan working agreement

> Auto-read every session. These are the **standing rules** for working in this
> repo. They are not optional and they outlive any single task. If a request
> conflicts with them, STOP and ask before proceeding.
>
> **Start every session by reading `docs/handoff.md`** — it states the *actual*
> (not planned) build status and points to the four sources of truth.

## Sources of truth

- `docs/handoff.md` — the real current state; read first, top to bottom.
- `docs/architecture.md` — system shape, services, data model, repo layout.
- `docs/build-plan.md` — section-by-section plan, STOP-GATES, locked decisions.
- `docs/visual-style.md` — the art-direction contract (tokens, shape language,
  frame-by-frame verb definitions). Section 3 builds **to** this file.

## What the project is

Toucan turns a **text prompt** into a short **explainer MP4**:
prompt → an LLM "director" emits a **`SceneSpec`** (a closed-vocabulary IR of
`elements` + `edges` + a `timeline` of verbs — **never any x/y coordinates**) →
a **Spring Boot** orchestrator validates it (referential integrity + envelope
clamps) and dispatches an async render job → a **Node/Remotion** renderer runs a
**deterministic auto-layout** to compute positions, then renders to MP4.

**One engine, no named scenes.** Every video is the same kit (a graph + a
timeline) composed differently. Variety comes from the graph, the layout, and a
few `themeParams` — **never** from bespoke per-topic code.

## Standing rules (carry through every section)

1. **Build the visuals to `docs/visual-style.md`.** No invented colors, sizes,
   timings, or motion. If the spec doesn't answer a visual question, **ask —
   don't guess.** Improvising the visual language is forbidden.
2. **One section at a time, gated.** Do only the current section. Run its
   STOP-GATE and report pass/fail **with evidence** before moving on. No
   self-declared "done." Don't build ahead.
3. **Coordinates come only from auto-layout.** The spec/AI never carry x/y.
4. **The closed vocabulary grows only when a fixture truly needs a new
   kind/verb** — and only after **STOP-and-ask**, then **re-verify all
   fixtures.** Dispatch on kind/verb is always through a **registry, never an
   inline `switch`** (renderer and validator alike).
5. **The fixtures gate is the definition of done.** A topic is done only when its
   fixture renders clean AND every earlier fixture still passes (no regressions).
6. **No work on the legacy vanilla-JS path** (`FlowSpec` / `flow.js` / `code.js`
   and the per-type generators). It stays until the Remotion path renders
   fixtures clean, then it's retired. Don't touch it, don't extend it.
7. **Don't "fix" intentional items.** Some things look like bugs but are
   deliberate (see `docs/handoff.md` §5 #10): `/error` and `/preview/**` are
   `permitAll()` on purpose; internal renderer callbacks use `ROLE_INTERNAL`
   (shared token), not the user JWT. If you think one is wrong, **STOP and ask**
   — don't change it.
8. **Keep diffs small and reviewable.** Summarize what changed and why.

## Branch & git

- **Branch:** all work continues on `claude/friendly-knuth-434bju`. Commit +
  push there. **Don't open a PR unless explicitly asked.**
- Commit with clear, descriptive messages. Push with
  `git push -u origin claude/friendly-knuth-434bju`.

## Orientation commands

```
# JS side (renderer + spec):
npm run build      # tsc --noEmit across workspaces
npm run lint       # prettier --check
npm test           # node --test (layout + spec)
cd renderer && npx remotion bundle src/index.ts --out-dir=/tmp/bundle   # webpack gate (no Chrome)
cd renderer && npm run render:scene   # real MP4 (needs Chrome; local only)

# Java side (orchestrator) at repo root:
mvn -q -DskipTests package
```

Note: the cloud sandbox has **no headless Chrome**, so MP4 render/visual gates
must be run locally by the maintainer.
