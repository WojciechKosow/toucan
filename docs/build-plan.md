# Toucan — Build Plan to v0.1

> Status: **approved — building.** Reviewed and greenlit. The five decisions are
> locked (see end), and the build order is fixed below. This plan reconciles the
> existing Spring Boot app (`architecture.md` §1) with the element + edge +
> timeline engine and drives to **10 polished explainer MP4s**.

## Operating principles (carry through every section)

- **One engine, no named scenes.** The AI composes from a fixed kit
  (`elements` + `edges` + a `timeline` of verbs). It emits a graph + timeline,
  **never coordinates**. A deterministic auto-layout pass computes positions.
- **Validate before render.** Every `SceneSpec` passes referential-integrity +
  envelope validation in Spring *before* it reaches the renderer.
- **Renderers own all polish**, driven by `theme.ts` and `docs/visual-style.md`.
  The user influences look via a few theme params; the logic never changes.
- **The fixtures gate is the definition of done.** A topic is done only when its
  fixture renders clean AND every earlier fixture still passes. Grow by adding
  fixtures; extend the kit only when a fixture truly needs a new kind/verb, then
  re-verify all fixtures.
- **No big-bang rewrite.** The legacy vanilla-JS path keeps working until the
  Remotion path renders fixtures clean; then it's retired.

### How to operate (every section)
- **Do only the current section.** Don't build ahead.
- **Run the section's STOP-GATE and report pass/fail with evidence** before
  moving on. No self-declared "done."
- **Coordinates come only from auto-layout** — never let the AI/spec carry x/y.
- **No `switch` on element `kind`/`verb` outside the renderer/validator
  registry.** If a section needs a new kind/verb, **STOP and ask** before
  extending the kit, then re-verify all fixtures.
- Keep diffs small and reviewable; summarize what changed and why.

### Fixed build order
```
0  scaffold polyglot monorepo
1  SceneSpec contract + validation
F  Flyway baseline               ← split out of Section 4, own gate
2  deterministic auto-layout + aesthetic-normalization pass
V  author docs/visual-style.md   ← gate before Section 3 (provided by maintainer)
3  core kit compositions + theme (build to the visual style spec)
4  orchestration spine (async jobs, storage)
5  AI director + provider bake-off
6  climb to 10 fixtures
7  live preview frontend (optional for v0.1)
8  productionization
```

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
    demands them** (Sections 6/9/10), and only after STOP-and-ask.
  - verbs: `camera.focus`, `packet.travel`, `node.state`, `highlight`,
    `edge.draw`, `label.show`.
- In Spring: introduce `SceneSpec` Java model + a `SceneSpecValidator` that
  enforces **referential integrity** (every `edge.from/to` and `timeline.target`
  resolves) and **envelope clamps** (counts/durations), reusing the
  `validateAndRepair` discipline from the legacy specs. Keep the existing
  `LlmClient` repair-reprompt loop. Validator dispatches kind/verb through a
  **registry**, never an inline `switch`.
- Write the **first fixture** `fixtures/01-auth-flow.json` by hand (no LLM yet).

**STOP-GATE:** A Java test loads `01-auth-flow.json` and it **passes** validation;
a copy with a deliberately dangling `timeline.target` **fails** with a clear
error. A Node test `zod.parse`s the same fixture successfully. Java and zod agree
on valid/invalid for a shared set of cases.

---

## Section F — Flyway baseline (split out; runs before Section 4)

**Goal:** make migrations the source of truth for schema **before** any new
table is added. Baselining a DB currently run by `ddl-auto=update` is destructive
if `V1__baseline.sql` is wrong, so it gets its own gate.

- Add `src/main/resources/db/migration/V1__baseline.sql` capturing the **current**
  schema exactly (users, user_tokens, animations, and their columns/constraints
  as Hibernate currently generates them).
- Switch `spring.jpa.hibernate.ddl-auto` from `update` to `validate` (or `none`).
- Configure Flyway baseline-on-migrate for the existing DB so the baseline adopts
  the live schema without recreating it.
- No new tables/columns in this section — baseline only.

**STOP-GATE:** `V1__baseline.sql` captures the current schema exactly; `ddl-auto`
is `validate` (or `none`); the app **boots clean** against the migrated schema
with existing data intact. (Hibernate `validate` passing is the proof the
baseline matches the entities.)

---

## Section 2 — Deterministic auto-layout + aesthetic-normalization

**Goal:** turn a graph into stable **and well-composed** positions, in the
renderer. Correctness alone is not enough — raw `dagre` output looks
machine-placed, the exact tell of "auto-generated."

- Implement `renderer/src/layout/` over **`@dagrejs/dagre`** (locked). Input:
  `elements` + `edges`. Output: positions + edge routes for the 1280×720 stage.
- **Determinism is mandatory:** same spec → byte-identical layout. No randomness,
  no time, fixed iteration order.
- Map `meta` direction hints (e.g. left-to-right flow) onto layout params.
- **Aesthetic-normalization pass** (deterministic) after raw layout: center the
  graph on the stage, equalize spacing, add margins/breathing room, snap to a
  grid. Determinism is preserved through this pass.

**STOP-GATE:** A Node snapshot test lays out `01-auth-flow.json` and the position
output matches a committed snapshot exactly; running it 100× yields identical
output. A 3-node and a 6-node graph both fit the stage with no overlap. Plus a
**visual-balance snapshot review** of the normalized layout (centered, even
spacing, generous margins — not machine-placed).

> **At this gate, STOP and flag that `docs/visual-style.md` is required before
> Section 3.** The maintainer provides it. Section 3 builds to that spec — do not
> improvise the visual language.

---

## Section V — Author `docs/visual-style.md` (gate before Section 3)

**Goal:** lock the visual language as a written artifact so Section 3 builds to a
spec, not a vibe. **Provided by the maintainer.**

`docs/visual-style.md` must define:
- Concrete tokens: palette, type scale, spacing, corner radii, easing curves,
  motion durations.
- A **frame-by-frame definition of each verb**: what `packet.travel` actually
  does, how `node.state` transitions, the feel of `camera.focus`, `highlight`,
  `edge.draw`.

**STOP-GATE:** `docs/visual-style.md` exists and is complete enough that Section 3
has no open visual questions. Do not start Section 3 without it.

---

## Section 3 — Core kit compositions + theme (build to the visual style spec)

**Goal:** render the kit beautifully, **to `docs/visual-style.md`** — not toward a
subjective "looks good" bar.

- `renderer/src/theme.ts`: design tokens from the visual-style spec + a
  `themeParams → tokens` mapping for user-chosen palette/font/accent.
- Remotion compositions for the core kit: `node`, `group`, `label`, `edge`
  (with routed path), and verb animators: `camera.focus`, `packet.travel`,
  `node.state`, `highlight`, `edge.draw` — each matching its frame-by-frame
  definition in the spec. Easing/blur/spacing all from theme.
- A top-level `Scene` composition that consumes `SceneSpec` + layout output and
  sequences the `timeline`. Kind/verb dispatch via a **registry**, never a
  `switch`.

**STOP-GATE:** `renderer` renders `01-auth-flow.json` to a clean MP4 at target
resolution/fps; review confirms it **matches `docs/visual-style.md`** (token
values, verb motion, timing). Frame N is a pure function of N (re-render is
identical).

---

## Section 4 — Orchestration spine (async job lifecycle)

**Goal:** wire the two services end-to-end with proper async jobs and storage.
(Flyway baseline is already green from Section F.)

- `V2__render_jobs.sql` migration:
  - `Animation`: add `mp4Url`, `durationMs`, `posterUrl`; keep `specJson`.
    **Remove the user-facing `type`** (locked decision 2) — drop the column and
    the `create` field; retain topic classification only as an optional internal
    director hint.
  - New `render_jobs` table: `id`, `animationId`, `status`
    (`QUEUED|GENERATING|READY|FAILED`), `attempts`, `error`, timestamps.
- Make `POST /api/animations` **async**: persist `PENDING`, return immediately;
  an async worker runs LLM → validate → persist spec → create job → dispatch to
  renderer.
- Renderer dispatch (HTTP `POST /render`) + **signed callback**
  `POST /api/internal/render-callback` (service-to-service auth in
  `SecurityConfig`, not the user JWT). Back storage with the existing
  `PublishingService` seam (local FS now; MP4 + poster). **No broker** — the
  `render_jobs` table is the source of truth (locked decision 3).
- Apply the dormant **`User.lastGeneration`** rate-limit hook here.

**STOP-GATE:** End-to-end on a dev box: `POST /api/animations` with the auth-flow
prompt returns `PENDING` instantly; polling `GET /api/animations/{id}` reaches
`READY` with a working `mp4Url` whose video matches the Section-3 render. A forced
renderer error drives the row to `FAILED` with a populated `errorMessage`.

---

## Section 5 — AI director + provider bake-off

**Goal:** the LLM emits a valid SceneSpec for a topic, no manual edits — and we
pick the provider **empirically here** (locked decision 4).

- Replace the three per-type system prompts with **one director prompt** that
  teaches the kit (available kinds, verbs, the "graph + timeline, never x/y"
  rule) and demands a single JSON object. Reuse `SpecAnimationGenerator`'s
  parse → validate → one-repair-reprompt machinery, retargeted to `SceneSpec`.
  The optional internal topic hint may select a layout direction / few-shot.
- Keep the keyless `StubLlmClient` path working by returning a known-good
  SceneSpec (e.g. the auth-flow fixture) so the full pipeline runs offline.
- **Provider bake-off:** run both `gpt-4.1` and `claude-opus-4-8` against all 10
  fixture prompts; record valid-spec rate and **repair-reprompt count** per
  provider. Pick the one with fewer reprompts at equal validity.

**STOP-GATE:** Given the topic-1 prompt through a live provider, the model returns
a SceneSpec that **passes validation and renders clean without hand-editing**.
With no API key, the stub path produces a valid, rendering SceneSpec. The bake-off
results are recorded and a provider is selected with evidence.

---

## Section 6 — Grow to the 10 explainers (the fixtures climb)

**Goal:** reach 10 polished topics, one fixture at a time, no regressions.

Process per topic:
1. Generate (or hand-author) its `fixtures/NN-topic.json`.
2. It must validate, auto-layout, and **render clean**.
3. **Every earlier fixture must still render clean** (CI runs all of them).
4. Extend the kit **only if** the topic genuinely needs a new kind/verb — and
   only after **STOP-and-ask**; then re-verify *all* fixtures.

Topic order (confirmed — 8 need only the core graph kit; 2 extend it):
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
- Introduce a queue (Redis/BullMQ or SQS) **if** concurrency needs it — the
  `render_jobs` table + callback contract stay identical; only transport changes.
- Observability: per-job timing/logging, failure alerting, render-time budget.
- Tighten rate limits, secrets handling, and the internal callback auth.

**STOP-GATE:** A clean deploy renders a fresh topic end-to-end against object
storage with retries and metrics, no manual steps.

---

## Locked decisions (settled — do not re-litigate)

1. **Layout engine: `@dagrejs/dagre`** for v0.1. `elkjs` deferred — revisit only
   if a fixture genuinely needs ports / orthogonal routing / nested groups.
2. **`AnimationType` removed from the user-facing `create` API** (with a
   migration). `create` takes `prompt` + theme params only. Topic classification
   is retained **only** as an optional internal director hint (layout direction /
   few-shot) — never a user-facing choice.
3. **Hosting/queue: single-box for v0.1** — Spring + Node same host, HTTP
   dispatch + `render_jobs` DB table as source of truth, local-FS storage behind
   `PublishingService`. No broker. Upgrade path preserved (job-table + callback
   contract unchanged when a queue is later introduced).
4. **LLM provider: decided empirically in Section 5** via bake-off of `gpt-4.1`
   vs `claude-opus-4-8` over all 10 fixture prompts (fewer repair reprompts at
   equal validity wins). Keyless `StubLlmClient` path stays working throughout.
5. **The 10 topics: confirmed exactly** as listed in §6.
