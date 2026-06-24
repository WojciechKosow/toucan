# Toucan — Architecture (v0.1 target)

> Status: **planning**. This document reconciles the current codebase with the
> Visual Explanation Engine vision and proposes the concrete polyglot split for
> v0.1. Nothing here is built yet beyond what "Ground truth" describes.

Toucan turns a text description of a process ("Explain how JWT auth works") into
a **polished, professional animated explainer video (MP4)**. The engine does not
generate named scenes; it composes every topic from one fixed kit
(**elements + edges + a timeline of action verbs**), lays it out deterministically,
and renders it with Remotion. The user influences the *look* (color/font/style)
through theme parameters, never the logic.

---

## 1. Ground truth — what exists today

Read from the repo, not assumed.

### Build & stack
- **Maven**, Spring Boot **4.1.0**, **Java 21** (`pom.xml`).
- Postgres (`spring.datasource` → `toucan_motion` DB), JPA with
  `spring.jpa.hibernate.ddl-auto=update`.
- **Flyway is on the classpath but unused** — there are no
  `src/main/resources/db/migration` files. Schema is currently created by
  Hibernate `ddl-auto=update`. (This must change before we add tables; see
  build-plan §4.)
- Dependencies already present: `anthropic-java` (2.34.0), `okhttp`, JJWT,
  Spring Security, **`spring-boot-starter-oauth2-client`** (dependency only —
  not wired), mail, validation, Jackson.

### Auth (done)
- Email/password **register → email-verify → login → JWT bearer**.
  `UserServiceImpl` + `MailServiceImpl`, token table `UserToken`
  (EMAIL_VERIFICATION / PASSWORD_RESET, hashed, 30-min expiry).
- `JwtProvider` / `JwtAuthFilter`, **stateless** sessions, BCrypt.
- `SecurityConfig`: `/api/auth/**` and `/preview/**` public; `/api/admin/**`
  = ADMIN; everything else authenticated. CORS configured for localhost dev
  frontends (5173/3000/4200).
- OAuth2: dependency present, `User.providerId` field present, **no
  registration/flow wired**. Treated as out of scope for v0.1.

### Domain & API (done)
- Entities: `User`, `UserToken`, `Animation`.
- `Animation` columns: `id`, `userId`, `type` (`AnimationType`), `prompt`,
  `generatedCode` (TEXT), `specJson` (TEXT), `previewUrl`, `status`
  (`PENDING|GENERATING|READY|FAILED`), `errorMessage`, timestamps.
- `AnimationController` (`/api/animations`): `POST` create, `GET` list,
  `GET /{id}`, `GET /{id}/download`. JWT-guarded.
- `User.lastGeneration` field exists (intended rate-limit hook, **unused**).

### Generation / render scaffolding (the part to evolve)
This is the spec/render pipeline that exists today, and it is the **named-type
shape the vision supersedes**:

- `AnimationType` enum = **three named types**: `FLOW`, `CODE_BLOCK`,
  `DATA_STRUCTURE`. The user picks one on create.
- Three **per-type specs** (`FlowSpec`, `CodeSpec`, `DataStructureSpec`), each
  with its own `validateAndRepair()` (clamps node counts, line ranges, op caps).
- Three **per-type generators** extending `SpecAnimationGenerator<S>`: each owns
  a constrained system prompt; the LLM returns **content JSON, never code**;
  invalid specs trigger **one repair re-prompt**.
- `LlmClient` abstraction with `OpenAiLlmClient`, `AnthropicLlmClient`,
  `StubLlmClient` (keyless deterministic fallback), selected by `LlmConfig`
  (`llm.provider = openai|anthropic|stub|auto`).
- **Renderers are hand-written vanilla-JS canvas** files in
  `src/main/resources/renderer/` (`flow.js` 771 LOC, `code.js`, `datastructure.js`,
  shared `runtime.js`, `template.html`). `HtmlBundler` inlines
  renderer + spec + theme into **one self-contained HTML document**.
- `Theme` record = single dark default; the only thing style-memory would swap.
- Determinism contract: every bundle exposes `window.__duration` (ms) and
  `window.__seek(ms)` — a pure function of time — so a headless worker *could*
  capture frames. **No MP4 path is implemented.**
- `PublishingService` / `LocalPublishingService`: writes `index.html` to a local
  dir served at `/preview/**`; interface designed for a later R2 swap.
- Generation runs **synchronously inline** in `AnimationServiceImpl.create`
  (deliberately not `@Transactional` to avoid holding a DB connection across the
  LLM call). No queue, no async job, no worker.

### What's missing vs. the vision
No Remotion, no Node service, no MP4 export, no queue/async jobs, no object
storage, **no unified element+edge+timeline contract**, **no graph auto-layout**.
The current "kit" is three hard-coded topologies, not a generic graph.

---

## 2. Reuse map — keep, evolve, retire

| Concern | Today | v0.1 decision |
|---|---|---|
| Auth / users / tokens / mail | Complete | **Keep as-is.** |
| Persistence (Postgres/JPA) | `ddl-auto=update`, no Flyway files | **Keep DB; adopt Flyway migrations** before adding tables. |
| `Animation` entity & API | Sync create, `type` discriminator, `generatedCode` HTML | **Evolve**: async lifecycle, add `mp4Url`/`durationMs`, drop the user-chosen `type` (engine composes regardless of topic — open decision §6). |
| `LlmClient` + repair loop | OpenAI/Anthropic/stub, one re-prompt | **Keep & reuse**; point it at the new unified-spec prompt. |
| Spec/render *philosophy* | LLM→content JSON→validate→render; spec persisted | **Keep**; this principle is correct and survives intact. |
| Per-type specs + generators | `FlowSpec`/`CodeSpec`/`DataStructureSpec` | **Retire** in favour of one unified `SceneSpec` (elements+edges+timeline). |
| Vanilla-JS canvas renderers | `renderer/*.js` inlined HTML | **Retire** once the Remotion path renders fixtures clean. Kept running as the v0.0 path during migration — no big-bang rewrite. |
| `Theme` | Java record, single default | **Re-home** as `theme.ts` in the render package; expose a small set of user-facing theme params. |
| `PublishingService` seam | Local FS → `/preview/**` | **Keep the seam**; back it with object storage for MP4s (local FS in dev, R2/S3 later). |
| Determinism (`__seek`/`__duration`) | Implemented in vanilla runtime | **Superseded** by Remotion's frame-based determinism (frame N is a pure function). Same guarantee, native to Remotion. |

---

## 3. The polyglot architecture

Spring Boot (JVM) cannot host Remotion (React/Node). So Toucan is two services
plus shared packages and an object store.

```
            ┌─────────────────────────────────────────────────────────┐
   user ───►│  Spring Boot orchestrator  (existing app, JVM)           │
  prompt    │                                                          │
            │  • auth / users / projects / Postgres                    │
            │  • accept prompt + theme params                          │
            │  • LLM call  → SceneSpec JSON   (LlmClient, reused)       │
            │  • VALIDATE spec (referential integrity + envelope)      │
            │  • persist spec, create RenderJob                        │
            │  • enqueue render  ──────────────┐                       │
            │  • serve MP4 / status to client  │                       │
            └──────────────▲───────────────────┼───────────────────────┘
                           │ callback          │ job (HTTP or queue)
                  status + │ (signed)          ▼
                  mp4 url  │        ┌──────────────────────────────────┐
                           └────────┤  Node + Remotion render service  │
                                    │                                  │
                                    │  • receive validated SceneSpec   │
                                    │  • re-validate (zod, shared)     │
                                    │  • DETERMINISTIC AUTO-LAYOUT     │
                                    │    (dagre/elk) → positions       │
                                    │  • Remotion compositions (kit)   │
                                    │  • render frames → MP4           │
                                    │  • upload MP4 ──► object storage │
                                    └──────────────────────────────────┘
                                                       │
                                              ┌────────▼─────────┐
                                              │  object storage  │
                                              │  (local FS → R2) │
                                              └──────────────────┘
```

### The contract between them: `SceneSpec` (the one IR)

This replaces the three typed specs. **The AI emits a graph + timeline, never
x/y.** Shape (illustrative — finalized in build-plan §1):

```jsonc
{
  "meta": {
    "title": "How JWT authentication works",
    "themeParams": { "palette": "indigo", "font": "geist", "accent": "#FFB35C" }
  },
  "elements": [
    { "id": "client",  "kind": "browser", "props": { "label": "Browser" } },
    { "id": "api",     "kind": "node",    "props": { "label": "Auth API", "icon": "server" } },
    { "id": "db",      "kind": "node",    "props": { "label": "User DB",  "icon": "database" } },
    { "id": "token",   "kind": "label",   "props": { "text": "JWT" } }
  ],
  "edges": [
    { "id": "e1", "from": "client", "to": "api", "kind": "request" },
    { "id": "e2", "from": "api",    "to": "db",  "kind": "query"   }
  ],
  "timeline": [
    { "at": 0,    "verb": "camera.focus",  "target": "client" },
    { "after": "e1", "verb": "packet.travel", "target": "e1", "args": { "label": "credentials" } },
    { "verb": "node.state",   "target": "api", "args": { "state": "active" } },
    { "verb": "packet.travel","target": "e2" },
    { "verb": "highlight",    "target": "token" }
  ]
}
```

Rules (enforced by validation):
- **No coordinates anywhere.** Positions are computed by auto-layout.
- **Referential integrity**: every `edge.from/to` and every `timeline.target`
  must resolve to a declared `element`/`edge` id. A dangling id fails validation
  *before* the renderer is ever called.
- `kind` (elements) and `verb` (timeline) come from **closed vocabularies** (the
  kit). Unknown kinds/verbs are a validation error, not a render guess.
- Envelope clamps (element counts, timeline length, durations) keep specs inside
  the "renders clean" envelope, mirroring today's `validateAndRepair` discipline.

### Where each concern lives — and why

| Concern | Lives in | Rationale |
|---|---|---|
| LLM call (prompt → SceneSpec) | **Spring Boot** (`LlmClient`, reused) | Already built, provider-agnostic, owns auth/secrets/rate-limit. |
| Spec **validation** (referential integrity + envelope) | **Spring Boot** (canonical), **re-checked in Node** (zod) | Java is the gatekeeper: nothing reaches the queue invalid. Node re-validates with the *shared* schema as belt-and-suspenders. |
| **Auto-layout** (graph → positions) | **Node renderer** | `@dagrejs/dagre` / `elkjs` are JS libraries; layout output feeds Remotion directly. Keeps Java free of a JS layout dep and keeps "positions" a pure render concern. Deterministic: same graph → same positions. |
| **Render** (compositions → MP4) | **Node + Remotion** | Only place Remotion can run. Owns all polish (colors/fonts/easing/blur) via `theme.ts`. |
| **Theme** | **Node** (`theme.ts`), params chosen in Spring | User picks a few theme params on create; renderer maps them to the full token set. |
| **Storage** | **Object store** behind `PublishingService` | Local FS in dev; R2/S3 in prod. MP4 + (optional) poster frame. |
| Live preview | **Frontend** (`@remotion/player`) | Same compositions as the renderer (shared package) → preview matches the final MP4 exactly. |

### How they talk

- **v0.1 default (recommended): HTTP request + signed callback, DB job table as
  source of truth.** Spring `POST`s the validated spec to the renderer's
  `/render`; the renderer renders, uploads the MP4, then `POST`s a **signed**
  callback to Spring (`/api/internal/render-callback`) with `{ jobId, status,
  mp4Url, durationMs, error? }`. The `render_jobs` row is the authority on state;
  the client polls `GET /api/animations/{id}`. No external broker needed for a
  single-box deploy.
- **Upgrade path:** swap the direct HTTP dispatch for a real queue
  (Redis + BullMQ on the Node side, or SQS) when concurrency/retries/back-pressure
  matter. The job table and callback contract stay identical — only the transport
  changes. (Queue choice is an open decision, §6.)
- Internal endpoints are **service-to-service only**: shared secret / HMAC
  signature, locked down in `SecurityConfig` (not behind the user JWT).

### Render-job lifecycle

1. `POST /api/animations` → create `Animation` (status `PENDING`), return
   **immediately** (async; no more inline blocking).
2. Orchestrator (async worker): LLM → `SceneSpec` → **validate/repair** → persist
   `specJson` → create `RenderJob` (`QUEUED`) → dispatch to renderer
   (status `GENERATING`).
3. Renderer: receive spec → zod re-validate → **auto-layout** → Remotion render →
   MP4 → upload to storage → signed callback.
4. Orchestrator on callback: `READY` (+ `mp4Url`, `durationMs`, `previewUrl`) or
   `FAILED` (+ `errorMessage`). Retry policy on transient render failures.
5. Client: poll `GET /api/animations/{id}` (or SSE later) until `READY`/`FAILED`.

### Storage layout (object store)
```
animations/{animationId}/video.mp4
animations/{animationId}/poster.png      # optional first-frame thumbnail
animations/{animationId}/spec.json       # also persisted in Postgres
```

---

## 4. The fixtures gate (quality mechanism)

v0.1 = **10 polished explainers**, enforced by a frozen `fixtures/` set: one
SceneSpec per supported topic, checked into the repo. A topic is "done" only when
its fixture **renders clean AND every earlier fixture still passes** (no
regressions). The kit grows *only* when a fixture genuinely needs a new
kind/verb — then all fixtures are re-verified. Fixtures are consumed by both
sides:
- **Java** tests: each fixture must pass referential-integrity + envelope
  validation.
- **Node** tests: each fixture must auto-layout deterministically and render a
  sample of frames without error (visual snapshot review for the hero frames).

CI renders all fixtures; a regression in any earlier fixture blocks the topic.

---

## 5. Final folder layout (monorepo)

Spring Boot stays where it is. Node renderer + frontend are siblings.

```
toucan/
├── pom.xml, mvnw, src/…           # Spring Boot orchestrator (UNCHANGED location)
│   └── src/main/java/.../          #   auth, animations, LlmClient, validation,
│                                    #   job dispatch + callback
│   └── src/main/resources/
│       ├── db/migration/           #   NEW: Flyway migrations
│       └── renderer/               #   LEGACY vanilla-JS path (retired post-migration)
│
├── renderer/                       # NEW — Node + Remotion render service
│   ├── package.json
│   ├── remotion.config.ts
│   └── src/
│       ├── server.ts               #   HTTP worker (/render) + callback poster
│       ├── render.ts               #   programmatic @remotion/renderer entry
│       ├── layout/                 #   deterministic auto-layout (dagre/elk)
│       ├── compositions/           #   the kit: node, edge, browser, form, code,
│       │                            #     cursor, label, group + verb animators
│       └── theme.ts                #   design tokens; maps user themeParams → tokens
│
├── packages/
│   └── spec/                       # NEW — shared SceneSpec schema + TS types
│       └── src/                    #   zod schema; the renderer & frontend import it
│
├── frontend/                       # NEW (when needed) — React + @remotion/player
│   └── src/                        #   live preview using the SAME compositions
│
├── fixtures/                       # NEW — one frozen SceneSpec per topic (the gate)
│   ├── 01-auth-flow.json
│   ├── …
│   └── 10-sales-funnel.json
│
└── docs/
    ├── architecture.md             # this file
    ├── build-plan.md
    └── API.md
```

Notes:
- **`compositions/`, `layout/`, and `theme.ts` are shared between the headless
  renderer and the `@remotion/player` frontend** (via the renderer package or a
  workspace import). This is what guarantees the live preview matches the
  exported MP4 — one source of truth for visuals.
- `packages/spec` is the single definition of the wire contract; Java mirrors it
  (hand-kept or generated from the JSON Schema).

---

## 6. Open decisions (need confirmation — see build-plan §Decisions)

1. **Layout engine**: `@dagrejs/dagre` (recommended for v0.1: light, great for
   layered/linear flows = 8/10 topics) vs `elkjs` (ports, orthogonal routing,
   nesting — heavier).
2. **Drop the user-chosen `AnimationType`?** The vision says the engine composes
   from the kit regardless of topic, implying `create` no longer takes a `type`.
   Confirm we remove it (with a migration) vs. keep it as an optional hint.
3. **Hosting / queue**: v0.1 single-box (Spring + Node same host, HTTP +
   DB job table, local-FS storage) vs. introduce a broker (Redis/BullMQ, SQS) and
   R2 now.
4. **LLM provider/model** for spec generation: current default is
   OpenAI `gpt-4.1`; Anthropic `claude-opus-4-8` is wired and available.
5. **The exact 10 topics** (see build-plan).
</content>
</invoke>
