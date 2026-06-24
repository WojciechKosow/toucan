# Toucan — Build Plan to v0.1

> Status: **planning — awaiting review.** No feature code is written yet. This
> plan reconciles the existing Spring Boot app (see `architecture.md` §1) with
> the element + edge + timeline engine and drives to **10 polished explainer
> MP4s**. There was no pre-existing `docs/build-plan.md`; this is the first.

## Operating principles (carry through every section)

- **One engine, no named scenes.** The AI composes from a fixed kit
  (`elements` + `edges` + a `timeline` of verbs). It emits a graph + timeline,
  **never coordinates**. A deterministic auto-layout pass computes positions.
- **Validate before render.** Every `SceneSpec` passes referential-integrity +
  envelope validation in Spring *before* it reaches the renderer.
- **Renderers own all polish**, driven by `theme.ts`. The user influences
  look via a few theme params; the logic never changes.
- **The fixtures gate is the definition of done.** A topic is done only when its
  fixture renders clean AND every earlier fixture still passes. Grow by adding
  fixtures; extend the kit only when a fixture truly needs a new kind/verb, then
  re-verify all fixtures.
- **No big-bang rewrite.** The legacy vanilla-JS path keeps working until the
  Remotion path renders fixtures clean; then it's retired.

Each section below has a single **STOP-GATE**: an objectively verifiable
condition. Do not start a section until the previous gate is green.

---

## Section 0 — Scaffold the polyglot monorepo

**Goal:** stand up the Node side and shared packages without touching the
running Java app.

- Add `renderer/` (Node + Remotion + TypeScript), `packages/spec/` (shared
  schema), and an empty `fixtures/` dir per the layout in `architecture.md` §5.
- Pin Node/Remotion versions; add `renderer` scripts: `build`, `lint`,
  `render` (Remotion CLI), `test`.
- One **hand-written throwaway composition** (a single moving box) to prove the
  toolchain renders an MP4 locally.
- Wire CI to build both the Maven app and the Node workspace.

**STOP-GATE:** `mvn -q -DskipTests package` still succeeds **and** in `renderer/`,
`npm run build` compiles and `npm run render` produces a playable `.mp4` from the
throwaway composition. CI is green on both.

---

## Section 1 — The `SceneSpec` contract + validation

**Goal:** define the one IR and its gatekeeper. This is the most important
section — everything keys off this contract.

- In `packages/spec`: author the **zod schema + TS types** for `SceneSpec`
  (`meta`, `elements[]`, `edges[]`, `timeline[]`) with **closed vocabularies**
  for element `kind` and timeline `verb`. Export a JSON Schema artifact.
- Vocabulary v0.1 (start minimal — the core graph kit only):
  - kinds: `node`, `group`, `label`, `edge-label` (+ `browser` if a fixture needs
    it). `form`, `code`, `cursor`, funnel/counter are added **only when a fixture
    demands them** (Sections 6/9/10).
  - verbs: `camera.focus`, `packet.travel`, `node.state`, `highlight`,
    `edge.draw`, `label.show`.
- In Spring: introduce `SceneSpec` Java model + a `SceneSpecValidator` that
  enforces **referential integrity** (every `edge.from/to` and `timeline.target`
  resolves) and **envelope clamps** (counts/durations), reusing the
  `validateAndRepair` discipline from the legacy specs. Keep the existing
  `LlmClient` repair-reprompt loop.
- Write the **first fixture** `fixtures/01-auth-flow.json` by hand (no LLM yet).

**STOP-GATE:** A Java test loads `01-auth-flow.json` and it **passes** validation;
a copy with a deliberately dangling `timeline.target` **fails** with a clear
error. A Node test `zod.parse`s the same fixture successfully. Java and zod agree
on valid/invalid for a shared set of cases.

---

## Section 2 — Deterministic auto-layout

**Goal:** turn a graph into stable positions, in the renderer.

- Implement `renderer/src/layout/` over the chosen engine (`@dagrejs/dagre`
  recommended — see Decisions). Input: `elements` + `edges`. Output: positions +
  edge routes for the 1280×720 stage.
- **Determinism is mandatory:** same spec → byte-identical layout. No randomness,
  no time, fixed iteration order.
- Map `meta` direction hints (e.g. left-to-right flow) onto layout params.

**STOP-GATE:** A Node snapshot test lays out `01-auth-flow.json` and the position
output matches a committed snapshot exactly; running it 100× yields identical
output. Layout of a 3-node and a 6-node graph both fit the stage with no overlap.

---

## Section 3 — Core graph kit compositions + theme (the visual bar)

**Goal:** render the kit beautifully. This is where "polished, not cheap" is won.

- `renderer/src/theme.ts`: design tokens (port the existing `Theme` defaults as a
  starting palette) + a `themeParams → tokens` mapping for user-chosen
  palette/font/accent.
- Remotion compositions for the core kit: `node`, `group`, `label`, `edge`
  (with routed path), and verb animators: `camera.focus`, `packet.travel`,
  `node.state`, `highlight`, `edge.draw`. Easing/blur/spacing all from theme.
- A top-level `Scene` composition that consumes `SceneSpec` + layout output and
  sequences the `timeline`.

**STOP-GATE:** `renderer` renders `01-auth-flow.json` to a clean MP4 at target
resolution/fps; a human visual review of the hero frames passes the quality bar
(no overlaps, smooth motion, legible labels, professional palette). Frame N is a
pure function of N (re-render is identical).

---

## Section 4 — Orchestration spine (async job lifecycle)

**Goal:** wire the two services end-to-end with proper async jobs and storage.
First, fix the persistence foundation.

- **Adopt Flyway**: turn off blind `ddl-auto=update` for new tables; add
  `src/main/resources/db/migration/V1__baseline.sql` capturing the current schema,
  then `V2__render_jobs.sql`.
- Schema changes:
  - `Animation`: add `mp4Url`, `durationMs`, `posterUrl`; keep `specJson`.
    (Decide `type` per Decisions — likely dropped.)
  - New `render_jobs` table: `id`, `animationId`, `status`
    (`QUEUED|GENERATING|READY|FAILED`), `attempts`, `error`, timestamps.
- Make `POST /api/animations` **async**: persist `PENDING`, return immediately;
  an async worker runs LLM → validate → persist spec → create job → dispatch to
  renderer.
- Renderer dispatch (HTTP `POST /render`) + **signed callback**
  `POST /api/internal/render-callback` (service-to-service auth in
  `SecurityConfig`, not the user JWT). Back storage with the existing
  `PublishingService` seam (local FS now; MP4 + poster).
- Apply the dormant **`User.lastGeneration`** rate-limit hook here.

**STOP-GATE:** End-to-end on a dev box: `POST /api/animations` with the auth-flow
prompt returns `PENDING` instantly; polling `GET /api/animations/{id}` reaches
`READY` with a working `mp4Url` whose video matches the Section-3 render. A forced
renderer error drives the row to `FAILED` with a populated `errorMessage`.

---

## Section 5 — The AI director (prompt → SceneSpec)

**Goal:** the LLM emits a valid SceneSpec for a topic, no manual edits.

- Replace the three per-type system prompts with **one director prompt** that
  teaches the kit (available kinds, verbs, the "graph + timeline, never x/y"
  rule) and demands a single JSON object. Reuse `SpecAnimationGenerator`'s
  parse → validate → one-repair-reprompt machinery, retargeted to `SceneSpec`.
- Keep the keyless `StubLlmClient` path working by returning a known-good
  SceneSpec (e.g. the auth-flow fixture) so the full pipeline runs offline.

**STOP-GATE:** Given the topic-1 prompt through a live provider, the model returns
a SceneSpec that **passes validation and renders clean without hand-editing**.
With no API key, the stub path produces a valid, rendering SceneSpec.

---

## Section 6 — Grow to the 10 explainers (the fixtures climb)

**Goal:** reach 10 polished topics, one fixture at a time, no regressions.

Process per topic:
1. Generate (or hand-author) its `fixtures/NN-topic.json`.
2. It must validate, auto-layout, and **render clean**.
3. **Every earlier fixture must still render clean** (CI runs all of them).
4. Extend the kit **only if** the topic genuinely needs a new kind/verb; then
   re-verify *all* fixtures.

Topic order (8 need only the core graph kit; 2 extend it):
1. Authentication flow (login / JWT / OAuth) — *core kit (already the hero)*
2. API request lifecycle / microservices — *core kit*
3. Online checkout & payment processing — *core kit*
4. Order fulfillment & shipping pipeline — *core kit*
5. Dropshipping business model — *core kit*
6. Subscription / recurring billing cycle — *core kit*
7. Blockchain transaction — *core kit*
8. Data pipeline / event streaming — *core kit*
9. Code walkthrough (function executing) — **adds the `code` element + reveal/
   highlight verbs** (port concepts from the legacy `code.js`/`CodeSpec`).
10. Marketing / sales funnel with conversion stats — **adds a funnel shape +
    animated counter verb.**

**STOP-GATE:** All 10 fixtures validate and render clean in CI, and adding #N
never regressed #1…#N-1. The kit grew only where a fixture required it.

---

## Section 7 — Live preview frontend (optional for v0.1)

**Goal:** in-browser preview that matches the MP4.

- `frontend/` React app embedding `@remotion/player`, importing the **same**
  `compositions/`, `layout/`, and `theme.ts` used by the headless renderer.
- Hit the existing auth + animations API; show status → player on `READY`.

**STOP-GATE:** The player renders a fixture frame **pixel-equivalent** to the
headless render at the same time index (shared composition code proven by a
side-by-side).

---

## Section 8 — Productionization

**Goal:** make it real beyond the dev box.

- Storage → R2/S3 behind `PublishingService`; signed URLs for MP4 delivery.
- Queue hardening if adopted (retries, idempotent callbacks, back-pressure).
- Observability: per-job timing/logging, failure alerting, render-time budget.
- Tighten rate limits, secrets handling, and the internal callback auth.

**STOP-GATE:** A clean deploy renders a fresh topic end-to-end against object
storage with retries and metrics, no manual steps.

---

## Decisions needed before building (confirm these)

1. **Layout engine** — recommend **`@dagrejs/dagre`** for v0.1 (light, ideal for
   the layered/linear flows that cover 8/10 topics). `elkjs` only if we need
   ports / orthogonal routing / nested groups early.
2. **Drop `AnimationType` from `create`?** The engine composes from the kit
   regardless of topic, so `create` should likely take only `prompt` + theme
   params. Confirm removal (with migration) vs. keeping it as an optional hint.
3. **Hosting / queue** — recommend **single-box v0.1**: Spring + Node same host,
   **HTTP + DB job table** (no broker), local-FS storage; introduce
   Redis/BullMQ or SQS + R2 in Section 8. Confirm.
4. **LLM provider/model** — current default OpenAI `gpt-4.1`; Anthropic
   `claude-opus-4-8` is wired. Confirm which drives spec generation for v0.1.
5. **The exact 10 topics** — confirm the Section 6 list (it matches the brief),
   or swap any entries.

**→ Awaiting your review of this plan and `architecture.md` before any code.**
</content>
