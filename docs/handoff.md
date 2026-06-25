# Toucan — Session Handoff

> Read this top to bottom, then skim the four sources of truth it points to. It
> reflects the **actual** state of the repo as of the last commit on branch
> `claude/busy-fermat-fxt5wa` (`1f44112`, Section 3). The planned build order
> slipped — this document states what is *really* built, not the plan's order.

---

## 1. What the project is

Toucan turns a **text prompt** into a short **explainer MP4**. The pipeline:
prompt → an LLM "director" emits a **`SceneSpec`** (a closed-vocabulary IR of
`elements` + `edges` + a `timeline` of verbs — **never any x/y coordinates**) →
a **Spring Boot** app validates it (referential integrity + envelope clamps) and
orchestrates an async render job → a **Node/Remotion** renderer runs a
**deterministic auto-layout** to compute positions and then renders the scene to
MP4. There is **one engine and no named scene templates**: every video is the
same kit (a graph + a timeline) composed differently. Variety comes from the
graph, the layout, and a few `themeParams` — never from bespoke per-topic code.

**Sources of truth (read these):**
- `docs/architecture.md` — system shape, services, data model, repo layout.
- `docs/build-plan.md` — the section-by-section plan, **STOP-GATES**, and the 5
  locked decisions. The fixed build order and operating principles live here.
- `docs/visual-style.md` — the **art-direction contract** (tokens, shape
  language, and the frame-by-frame definition of every verb). Section 3 builds to
  this. **Do not improvise the visual language — it must come from this file.**
- `CLAUDE.md` — repo conventions and guardrails.

Also useful: `docs/bakeoff.md` (provider bake-off record), `docs/API.md`.

---

## 2. Standing rules (carry through every section)

- **Build the visuals to `docs/visual-style.md`.** No invented colors, sizes,
  timings, or motion. If the spec doesn't answer a visual question, ask — don't
  guess.
- **One section at a time, gated.** Do only the current section. Run its
  STOP-GATE and report pass/fail with evidence before moving on. No self-declared
  "done."
- **Coordinates come only from auto-layout.** The spec/AI never carry x/y.
- **The closed vocabulary grows only when a fixture truly needs a new kind/verb**
  — and only after **STOP-and-ask**, then re-verify *all* fixtures. Dispatch on
  kind/verb is always through a **registry, never an inline `switch`**.
- **No work on the legacy vanilla-JS path** (`FlowSpec` / `flow.js` / `code.js`
  and the per-type generators). It stays until the Remotion path renders fixtures
  clean, then it's retired. Don't touch it, don't extend it.
- **Branch:** all work continues on `claude/busy-fermat-fxt5wa`. Commit + push
  there. Don't open a PR unless asked.

---

## 3. True section status

Actual chronological build order was: 0 → 1 → F → **4 → 5** → V → **2 → 3**.
Sections 4 and 5 were built *before* layout (2) and the real kit (3) existed,
which is why the renderer wiring is still a placeholder (see debt #1).

| Section | What | Status | Gate result |
|---|---|---|---|
| 0 | Scaffold monorepo (renderer, packages/spec, CI, throwaway MovingBox) | **DONE** | mvn package + `npm run build` + throwaway MP4 + CI green |
| 1 | `SceneSpec` contract + validation (zod + Java validator + fixture 01) | **DONE** | zod parse + Java valid/invalid agree; dangling target fails |
| F | Flyway baseline (`V1__baseline.sql`, `ddl-auto=validate`) | **DONE** | app boots clean against migrated schema |
| 2 | Deterministic auto-layout + aesthetic normalization (dagre, 1920×1080) | **DONE** | snapshot test stable ×100 (6 node tests pass); 3- & 6-node fit |
| V | `docs/visual-style.md` authored (by maintainer) | **DONE** | exists, complete; drove Section 3 |
| 3 | Core kit compositions + theme + `Scene` | **PARTIAL** | code-complete: tsc + prettier + node tests + `remotion bundle` all green. **Visual/MP4 gate NOT yet verified** — see §4 |
| 4 | Orchestration spine (async jobs, `render_jobs`, signed callback, rate-limit hook) | **DONE (against placeholder renderer)** | end-to-end reaches READY, but the MP4 is a **placeholder**, not a real render — see debt #1 |
| 5 | AI director + provider bake-off | **PARTIAL** | one director prompt + `SceneDirector` + `StubLlmClient` work; **bake-off NOT run, provider provisional** — debt #6 |
| 6 | Climb to 10 fixtures | **NOT STARTED** — and **blocked**, see §7 |
| 7 | Live preview frontend | **NOT STARTED** (optional for v0.1) |
| 8 | Productionization | **NOT STARTED** |

---

## 4. Exactly where we are right now

- **Last completed:** Section 3 — the deterministic Remotion kit. Committed and
  pushed (`1f44112`) on `claude/busy-fermat-fxt5wa`. In-sandbox gates green:
  `tsc`, prettier, node tests (6), and `remotion bundle` (the whole composition
  graph compiles through webpack). Frame N is a pure function of N by
  construction (no `Date.now`, no random).
- **In flight:** the **Section 3 visual gate**. The cloud environment has **no
  headless Chrome**, so no MP4 could be rendered/reviewed here. The maintainer is
  rendering locally:
  ```
  npm install                 # @remotion/google-fonts was added; lockfile changed
  cd renderer && npm run render:scene   # → renderer/out/scene.mp4 (renders fixture 01)
  # or: npm run studio        # scrub frame-by-frame in Remotion Studio
  ```
  No visual feedback has come back yet. **The kit is unverified against the spec
  visually** — expect to iterate on it once the maintainer reports what's off
  (entrance pacing, node states, packet/edge look, camera moves, color, type).
- **Immediate next step:** wait for that visual review and fix the kit to match
  `visual-style.md`. After Section 3's visual gate is genuinely green, the
  highest-value next work is **debt #1 — swap the placeholder renderer for the
  real Scene** so Section 4's end-to-end produces real MP4s. **Section 6 is NOT
  next** (see §7).

---

## 5. Known open items / debt

1. **Placeholder renderer not yet swapped (top priority).**
   `renderer/src/render-service.mjs` — the HTTP `POST /render` service the Spring
   orchestrator dispatches to — **still returns a placeholder MP4** and does not
   render the real `Scene`. Section 3 added the `Scene` composition + the
   `render:scene` CLI script, but not the service wiring. The swap: have the
   service bundle the project, `selectComposition("Scene")`, and `renderMedia`
   with the validated spec passed via `inputProps` (`{ spec, themeParams }`), then
   return the real artifact. Until then, end-to-end "works" but the video is fake.
2. **Section 3 visual gate unverified.** No MP4 was rendered/reviewed in-session
   (no Chrome in cloud). Pending the maintainer's local render + review.
3. **Edge endpoints.** Dagre's routed polylines may not land exactly on node
   borders; `Edge.tsx` currently draws them as-is (flagged "acceptable for v0.1",
   no endpoint clamping). Revisit if the review shows gaps/overshoot.
4. **Edge `kind` is not visually differentiated.** The vocab has 6 edge kinds
   (see §6) but the renderer draws every edge with the same connector. Fine for
   v0.1; note it if a fixture/spec needs distinct edge styling.
5. **`themeParams` source is slightly ambiguous.** `Scene` reads
   `props.themeParams ?? spec.meta.themeParams ?? {}`. Per `visual-style.md` §9,
   `themeParams` are a **render-time input**; the director must NOT emit them. The
   hero fixture embeds `meta.themeParams` with `palette:"indigo"` — not a valid
   palette name (valid: `midnight` / `slate` / `ink-indigo`), so it gracefully
   falls back to `midnight` + its `#FFB35C` accent. Decide whether to strip
   `themeParams` from specs and pass them only at render time.
6. **Provider decision is PROVISIONAL.** The bake-off was **not run**; no winner
   recorded. Runtime defaults to `gpt-4.1`. Keyless `StubLlmClient` returns the
   auth-flow fixture so the pipeline runs offline. Decide empirically later (it
   needs the full set of fixture prompts — naturally pairs with Section 6).
7. **Rate-limit is OFF by default.** `app.ratelimit.generation-cooldown-seconds`
   defaults to `0` (disabled). The `User.lastGeneration` hook is implemented and
   wired; enable it in productionization.
8. **Geist font dropped.** The `font` themeParam supports `inter` (bundled via
   `@remotion/google-fonts`) and `system` (system stack) for real; `geist` falls
   back to a system stack — Geist is **not** bundled. Bundle it only if needed.
9. **Throwaway `MovingBox` still registered.** `Root.tsx` registers both
   `MovingBox` (Section 0) and `Scene`. Retire `MovingBox` once `Scene` is the
   proven path.
10. **Intentional, not debt (don't "fix"):** `/error` and `/preview/**` are
    `permitAll()` on purpose — `/error` so controller-thrown 400/404/500 surface
    as themselves instead of being masked as 401; `/preview/**` so hosted preview
    links are shareable. Internal renderer callbacks (`/api/internal/**`) are
    protected by `ROLE_INTERNAL` (shared token), not the user JWT.

---

## 6. The closed vocabulary, as actually built

Defined in `packages/spec/src/vocab.ts` (zod), mirrored by the Java validator and
consumed by the renderer registries. These are the **only** things the engine
understands.

- **Element kinds (5):** `node`, `browser`, `group`, `label`, `edge-label`.
  Renderer components: `node`/`browser` → `NodeBox`, `label`/`edge-label` →
  `LabelEl`, `group` → `GroupBox` (`renderer/src/compositions/elements/registry.ts`).
- **Edge kinds (6):** `data` (default), `control`, `request`, `response`,
  `query`, `reference`. (Currently rendered uniformly — see debt #4.)
- **Timeline verbs (6):** `camera.focus`, `packet.travel`, `node.state`,
  `highlight`, `edge.draw`, `label.show`. All six are implemented in
  `renderer/src/compositions/runtime.ts` via element-verb / edge-verb registries
  plus a camera resolver (no switch).
- **`node.state` states (5):** `idle`, `active`, `processing`, `success`,
  `error`.
- **Layout directions:** `LR`, `RL`, `TB`, `BT`.
- **Implicit `appear`** is the element entrance (not a timeline verb); nodes/
  browsers/groups stagger in during the intro, `label`/`edge-label` reveal on
  their `label.show` beat.

**Deliberately STOP-and-ask (described in `visual-style.md` §6 but NOT in the
closed vocab, so NOT built):** `camera.reset`, `dim`, `camera.zoom`. These are
future kit extensions. Do not add them without STOP-and-ask + re-verifying all
fixtures.

---

## 7. What is NOT next, and why

**Do not start Section 6 (the climb to 10 fixtures / the tutorial kit).** Several
of the planned topics (e.g. the code walkthrough and any browser/form/cursor
interactions) require **kit elements that do not exist yet** — `form`, `code`,
`cursor`, funnel/counter — and, crucially, **`docs/visual-style.md` has not been
extended with the browser/form/cursor component specs**. Building those
components now would mean improvising the visual language, which the standing
rules forbid.

**Gate before any of that work:** `visual-style.md` must first be extended (by the
maintainer) with the frame-by-frame specs for the new components. Until that spec
exists, do not build `form`/`code`/`cursor` components and do not start Section 6.

The correct near-term sequence is: (a) finish Section 3's visual review and fix
the kit; (b) swap the placeholder renderer for the real `Scene` (debt #1) so the
existing orchestration renders real MP4s end-to-end; (c) only then revisit the
director/bake-off and the fixtures climb — with the visual spec extended first.

---

## 8. Quick orientation commands

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

Key paths: `renderer/src/compositions/` (Scene, runtime, schedule, elements),
`renderer/src/{theme,timing,fonts}.ts`, `renderer/src/layout/`,
`packages/spec/src/` (vocab + schema), `src/main/java/.../generation/scene/`
(director), `src/main/java/.../service/` (orchestration), `fixtures/`.

Pasting **"read docs/handoff.md and continue"** into a fresh session is enough to
resume safely.
