# NEXT SESSION — wire the animation engine into Spring Boot

> Read this top to bottom before touching code. It is the handoff for the
> **engine → Spring** step of the Toucan SaaS. Your job this session is **one
> thing only**: make the Spring app generate animations by calling the
> `toucan-motion` HTML engine, and persist the result on the `Animation` entity.
> Sessions/chat, frontend, and payments are **later** — see §7 (do not build them
> now).

---

## 0. First action — confirm the branch (STOP-and-ask)

There are two working agreements in this repo and they diverge:

- The Spring code at the repo root is the **SceneSpec → Remotion → MP4** engine.
  Its `CLAUDE.md` / `docs/handoff.md` say work continues on
  `claude/friendly-knuth-434bju`, one-section-at-a-time, "don't extend the legacy
  path."
- The **product direction** (owner's decision) is the `toucan-motion` **HTML
  engine** — a text prompt → one self-contained, autoplaying HTML animation. That
  is what you are wiring in. It **supersedes** the SceneSpec generation path for
  v0.1.

**Before editing, confirm with the maintainer which branch to use** (the
SceneSpec plan's branch is almost certainly *not* it). Do the wiring **additively
and behind a flag** — do **not** delete the SceneSpec/Remotion path. That keeps
the change small, reversible, and non-destructive to the other track.

---

## 1. What the engine is (already built, this repo, `toucan-motion/`)

A standalone Node CLI. `generate` turns a prompt into ONE self-contained HTML
file (inline CSS/JS, autoplays, 16:9 @ 1920×1080, ~20–30s), gated by a
self-containment check + a headless-Chromium smoke test (zero uncaught errors,
real DOM, visible motion) with one auto-repair pass. The HTML **is** the
deliverable.

Three commands you'll use (run from `toucan-motion/`):

```bash
npm ci && npm run build                 # compile TS -> dist/
# keyless smoke (no spend) — returns the reference animation:
node dist/cli.js generate --topic "how a login works" --mock --out out/x.html
# real generation (needs ANTHROPIC_API_KEY in toucan-motion/.env or the env):
node dist/cli.js generate --topic "how a login works" --provider anthropic --out out/x.html
```

- Prompts are principles-based (no template cage): `prompts/system-freeform.md`
  (animator), `prompts/system-script.md` (screenwriter, `generate --plan`),
  `prompts/system-edit.md` (editor, `generate --edit` — that's the sessions/chat
  step, §7).
- Every real call logs token usage + a rough $ estimate to **stderr**, tagged
  `usage[generate|plan|edit|repair]`. Capture stderr when you shell out — it's
  your cost telemetry and it feeds billing later.
- Requirements on the host: **Node 20+**, and **Playwright Chromium** for the
  smoke gate (`npx playwright install chromium`, or a pre-provisioned browser
  under `PLAYWRIGHT_BROWSERS_PATH`). `--mock` still needs Chromium for the gate.

---

## 2. What the Spring app already gives you (repo root, `src/main/java/...`)

The seam for this is already there — you are filling it, not building it.

| Piece | Where | Note |
|---|---|---|
| `Animation` entity | `entity/Animation.java` | Has `userId` (**author**), `prompt`, **`generatedCode`** (self-contained HTML), **`previewUrl`**, `status` (`PENDING/GENERATING/READY/FAILED`). |
| Create + list + get + download | `controller/AnimationController.java`, `service/AnimationServiceImpl.java` | `POST /api/animations {prompt}` reserves a `PENDING` row (auth + per-user cooldown) then hands off async. `GET /api/animations/{id}/download` **already** returns `generatedCode` as `text/html`. |
| **Async worker (the seam)** | `service/AnimationProcessor.java` | Today: `SceneDirector → SceneSpec → RenderJob → RendererClient.dispatch → MP4 callback`. **This is the method you rewire.** |
| **Publishing (the other seam)** | `publishing/PublishingService.java` → `LocalPublishingService` | **`publish(animationId, html)`** writes `published/{id}/index.html` and returns `http://…/preview/{id}/index.html`. Served static at `/preview/**`, `permitAll` in `SecurityConfig`. Swap to R2 later, no caller change. |
| Auth | JWT; `@AuthenticationPrincipal CustomUserDetails` | Generation is already account-scoped. |
| LLM key config | `application.properties` | `anthropic.api.key=${ANTHROPIC_API_KEY:}`, `anthropic.model=claude-opus-4-8`. Publishing: `app.publish.dir`, `app.publish.base-url`. |

So: author linkage, auth, HTML storage, hosting, and status are **done**. You are
only replacing "how the HTML gets made" and marking the animation READY.

---

## 3. The task — wire the engine in (additive, flagged)

### 3.1 New seam: `AnimationEngine`

Create an interface so the generation source is swappable (and so sessions/chat
can add `edit` later without touching callers):

```java
// generation/AnimationEngine.java  (illustrative)
public interface AnimationEngine {
    /** prompt -> one self-contained HTML animation. Throws on failure. */
    String generate(String prompt);
    // edit(...) comes in the sessions/chat step (§7) — do NOT add it now.
}
```

### 3.2 Implementation: shell out to the CLI (recommended for v0.1)

Recommended because it **reuses the engine's prompt + gate + auto-repair + usage
logging** verbatim — no duplication, no re-implementing the Chromium gate in
Java.

```java
// generation/CliAnimationEngine.java  (illustrative shape)
// ProcessBuilder: node <engineDir>/dist/cli.js generate
//   --topic <prompt> --provider <provider> [--mock] --out <tmp>/index.html
// - pass ANTHROPIC_API_KEY into the subprocess environment
// - read the written HTML file on exit code 0
// - on non-zero exit: throw with the tail of stderr (the gate's error)
// - enforce a timeout (generation can take ~1–2 min); kill + FAIL on timeout
// - log/persist the captured stderr usage line for cost telemetry
```

Config keys to add (`application.properties`):

```
app.engine=html                 # html | scenespec  (default html; scenespec keeps the old path)
app.engine.dir=toucan-motion    # where dist/cli.js lives, relative to the app CWD
app.engine.node-bin=node        # absolute path in prod if node isn't on PATH
app.engine.provider=anthropic
app.engine.mock=false           # true = keyless reference animation (dev/smoke, no spend)
app.engine.timeout-seconds=180
```

**Alternative considered — reimplement in Java** (`AnthropicLlmClient` +
`system-freeform.md`): rejected for v0.1 because it loses the headless-Chromium
gate and the auto-repair loop, which are what make the output reliably runnable.
Revisit only if the Node dependency on the host becomes a real problem.

### 3.3 Rewire `AnimationProcessor.process()`

Branch on `app.engine`. **Keep the SceneSpec branch intact.** For the HTML path:

```
prompt
  -> animation.setStatus(GENERATING); save
  -> html = animationEngine.generate(prompt)         // subprocess
  -> url  = publishingService.publish(id, html)      // existing seam
  -> animation.setGeneratedCode(html)
     animation.setPreviewUrl(url)
     animation.setStatus(READY); animation.setErrorMessage(null); save
  catch -> status FAILED + errorMessage (same as today)
```

The HTML path needs **no** `RenderJob`, `RendererClient`, renderer callback, or
MP4 (MP4 capture for the HTML engine is a later concern). Leave those classes
untouched — they still serve the `scenespec` branch.

### 3.4 Expose the preview URL

`AnimationDTO` currently carries `mp4Url`/`posterUrl`/`embedSnippet` but **not**
`previewUrl`. Add `previewUrl` to `AnimationDTO` and set it in
`AnimationServiceImpl.mapToDTO(...)` so the client can open the running
animation. (`/download` already works the moment `generatedCode` is populated.)

### 3.5 Test (hermetic)

Add an `AnimationProcessor` test that injects a **stub `AnimationEngine`** bean
returning fixed HTML and asserts: status → `READY`, `generatedCode` set,
`previewUrl` set, no `RenderJob` created. Do **not** shell out in tests. Follow
the existing patterns (`RenderLifecycleTest`, `LocalPublishingServiceTest`).

---

## 4. Verification (the gate for this step — show evidence)

1. `mvn -q -DskipTests package` compiles; `mvn -q test` green (SceneSpec path
   untouched behind the flag).
2. Build the engine once: `cd toucan-motion && npm ci && npm run build`.
3. **Keyless smoke** (`app.engine.mock=true`): boot the app, register/login,
   `POST /api/animations {"prompt":"how a login works"}`, poll
   `GET /api/animations/{id}` until `READY`, open `previewUrl` in a browser →
   the reference animation plays. Screenshot it.
4. **Real** (`ANTHROPIC_API_KEY` set, `app.engine.mock=false`): same flow → a
   real generated animation at `previewUrl`. Screenshot at **irregular** time
   offsets (even spacing aliases onto blurry transitions). Confirm the
   `usage[generate]` line shows up in the app/subprocess logs.
5. Failure path: a prompt that makes the gate fail after repair → animation
   `FAILED` with the gate's error in `errorMessage` (not a 500).

---

## 5. "Prepare for billing" — keep these clean now, don't build them

The owner will add Stripe + credits later. You don't build it, but don't break
the hooks:

- **Author**: `Animation.userId` already links every animation to an account —
  keep it populated (it is).
- **Metering**: the engine already emits per-call token counts + $ estimate on
  stderr. **Persist or log that** (e.g. capture the `usage[...]` line) so a future
  credits system can meter real cost per generation/edit.
- **Gate**: generation stays auth-gated; the per-user cooldown hook
  (`app.ratelimit.generation-cooldown-seconds`, `User.lastGeneration`) is the
  natural place a credit check will slot in later.

---

## 6. Ops / hygiene notes

- The engine is a Node subdir; `mvn package` does **not** build it. For deploy,
  build `toucan-motion` (`npm ci && npm run build`) and provision Node 20+ +
  Playwright Chromium on the host. Wiring a Maven `exec`/frontend build step is a
  productionization follow-up, not part of this step.
- **Secrets**: `src/main/resources/application.properties` currently has real
  secrets committed (JWT, SMTP, etc.). Out of scope to fix here, but flag it —
  move them to environment variables before any public deploy.
- `.env` (engine) and API keys are gitignored — never commit them.

---

## 7. SIGNPOSTS — what comes AFTER this step (do NOT build now)

In order. Each is its own session. This step (engine wiring) unblocks all of them.

1. **✅ (this step) Engine wired in** — generation produces HTML on the
   `Animation` entity, hosted at `previewUrl`, account-scoped.
2. **→ NEXT: Sessions / chat (the big one — design first).** A "ChatGPT for
   animations": send a message → get an animation → send a follow-up → get the
   **edited** one, not a fresh generation. The engine already supports this:
   `editHtml(currentHtml, thread, request)` / `generate --edit --html <cur>
   --topic <request> --thread <file>` returns the full file with only the
   requested change. Spring work will be: a conversation/thread model (extend
   `Animation`, or a new `Conversation`/`Message` entity), an
   `AnimationEngine.edit(...)` method, and an edit endpoint
   (e.g. `POST /api/animations/{id}/messages`). **The owner wants to design the
   shape of this before building** — produce a short design doc first.
3. **Frontend.** Prepare the Spring project to serve a frontend UI (SPA build +
   static hosting + CORS/auth), and build the chat UI against the API above.
4. **Payments (Stripe) + credits.** Subscription + usage/credits, metered off the
   token-usage telemetry from §5.

**STOP after step 1 (engine wiring).** Do not start sessions/chat, frontend, or
payments in the same session.
