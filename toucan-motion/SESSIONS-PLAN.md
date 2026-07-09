# Toucan — build brief: sessions / chat (iterative editing)

> Status: **PLAN, not built.** This is the design for the next step — "ChatGPT for
> animations": send a message → get an animation; send another → get the *same*
> animation edited, not regenerated. Read this whole brief before building.
>
> Depends on the engine wiring already merged (`app.engine=html`, `AnimationEngine`
> + `CliAnimationEngine`, `PublishingService`, usage/cost telemetry). This step is
> **additive** on top of that.

## The one-line goal
Turn a single-shot generation into a **conversation**: turn 1 generates from
scratch; every later turn **edits the current HTML** per the new message, keeping
everything else identical. Each turn is an immutable **version**; the hosted
preview always shows the current one.

## Locked decisions (from the maintainer)
1. **Data model:** a new `Conversation` parent that owns ordered `Version`s. The
   existing `Animation` becomes the per-version leaf — the code already merged
   stays intact.
2. **Hosting:** **current version only** is served at a stable
   `/preview/{conversationId}`. Prior versions' HTML is kept in the DB (for future
   revert/compare) but not hosted.
3. **Scope:** **backend + API only.** A chat UI consumes these endpoints later
   (that's the separate "frontend" step). Everything here is testable via
   curl + Playwright screenshots.

## ⚠️ Hidden prerequisite: the editor does not exist yet
The kickoff brief claimed the engine "has a `--edit` editor." It does **not** —
the engine has `generate` and a `repair` (which only fixes runtime errors, not
"change only what I asked"). So this step is **two builds**: (A) an engine-side
*editor*, then (B) the Spring conversation layer. Build A first — it's standalone.

The editor is where the product's value lives: NEXT-SESSION's own note is that the
maintainer's best result was hand-*iterated*. **The editor prompt quality is the
make-or-break, and it can only be tuned against the real API (needs the key).**

---

## Data model (additive)

```
Conversation (new table `conversations`)
  id (uuid, pk)
  user_id (uuid, not null)         # author — billing-prep, already the pattern
  title (text, null)               # derive from the first message (cheap); LLM title later
  current_version (int, null)      # points at the latest READY version
  preview_url (varchar)            # stable: /preview/{id}/index.html (current version)
  created_at, updated_at
      │ 1
      │
      │ N   (ordered by version_number)
Version  = a row in the EXISTING `animations` table
  + conversation_id (uuid, fk -> conversations.id)   # NEW column
  + version_number (int)                             # NEW column, 1-based
  prompt          = the user message for THIS turn   # reuse existing column
  generated_code  = the HTML this turn produced      # reuse
  engine_usage_json = per-turn usage/cost            # reuse (already added)
  status          = PENDING|GENERATING|READY|FAILED  # reuse
  error_message   = per-turn failure                 # reuse
  created_at                                          # reuse
  (preview_url on the version row goes unused for html engine — hosting is per-conversation)
```

Notes:
- The JPA entity can stay named `Animation` or be renamed `AnimationVersion`
  (`@Table(name = "animations")`) — cosmetic. Keeping `animations` as the version
  table means **zero data migration**, just two added columns + the new parent table.
- Flyway **V4**: `CREATE TABLE conversations (...)` + `ALTER TABLE animations ADD
  COLUMN conversation_id uuid`, `ADD COLUMN version_number int`, FK + index. Take the
  DDL verbatim from what `ddl-auto=update` generates, as V1–V3 did, so `validate` passes.
- Conversation status is **derived** (latest version's status) — no status column needed.

## Turn lifecycle

```
Turn 1 (generate):
  POST /api/conversations {message}
    → create Conversation(author) + Version#1 (PENDING), commit
    → async: engine.generate(message)
             → PublishingService.publish(conversationId, html)   # /preview/{cid}
             → Version#1 READY; Conversation.current_version=1, preview_url set

Turn N>1 (edit):
  POST /api/conversations/{id}/messages {message}
    → reject if the latest version is still PENDING/GENERATING (serialize turns)
    → create Version#N (PENDING), commit
    → async: engine.edit(currentHtml, thread, message)
             → freeform gate + one auto-repair (same as generate)
             → publish(conversationId, html)   # OVERWRITE the current preview
             → Version#N READY; Conversation.current_version=N
```

This reuses the existing `AnimationProcessor` shape verbatim: async,
non-transactional, per-row status, one short save at the end. Add an
`edit`-vs-`generate` branch keyed on `version_number == 1`.

## Engine editor (build A)

- **New prompt** `prompts/system-editor.md` — principles-based, **NO template cage**
  (same rule as the animation prompt). Essence: *"You are editing an existing
  self-contained animation. Given the current file, the conversation so far, and a
  new request, return the COMPLETE corrected HTML — change ONLY what the request
  asks and keep everything else identical (structure, palette, timing, layout)
  unless the request is about them. Same contract: one self-contained autoplaying
  file, 1920×1080, zero uncaught errors."*
- **New engine path**: `editHtml({ currentHtml, message, thread, provider, model })`
  in `generate.ts`, mirroring `generateHtml` but with the editor prompt and the
  current HTML + thread as the user turn. Then the **existing** freeform gate + one
  auto-repair. Emit a `usage[edit] {json}` line (reuse `usage.ts`).
- **CLI**: `node dist/cli.js edit --html <current> --message "<req>" [--thread <file>] --out <tmp>`
  (or fold into `generate --edit`). Keep the deliverable = the HTML file, always kept.
- **Thread context to feed the model:** the current HTML + the **running list of
  user messages** (not prior HTML blobs — too many tokens). Decide during build A.

## Spring wiring (build B)

- Extend `AnimationEngine` with `edit(conversationId, currentHtml, thread, message)`
  → `EngineResult` (reuse `EngineResult`/`EngineUsage`). `CliAnimationEngine` gains
  an `edit` shell-out mirroring `generate`.
- `PublishingService.publish(conversationId, html)` already fits — just key the path
  on the conversation id (overwrite `index.html` each turn).
- New `ConversationController` / `ConversationService` (mirror `AnimationServiceImpl`:
  reserve a row, hand off to the async processor, map to DTO). Rate-limit hook
  (`User.lastGeneration`) — decide whether it applies per-turn.

## API surface (what a chat UI will consume)

| Method | Path | Body / returns |
|---|---|---|
| POST | `/api/conversations` | `{message}` → `ConversationDTO` (id, title, currentVersion, previewUrl, versions[], status=derived) |
| POST | `/api/conversations/{id}/messages` | `{message}` → new `VersionDTO` (versionNumber, status=PENDING) |
| GET | `/api/conversations/{id}` | thread: versions[] (versionNumber, message, status, usage, createdAt) + currentVersion + previewUrl |
| GET | `/api/conversations` | list for the authed user |
| GET | `/api/conversations/{id}/versions/{n}/download` | the HTML of a specific version |

`/api/animations` (single-shot) can stay untouched (SceneSpec path / back-compat)
or be folded in later — minor, decide during build B.

## What's already built and reused (≈70%)
- Async orchestration pattern (`AnimationProcessor`), the publish seam
  (`PublishingService` / `/preview/**` static + `permitAll`), the CLI shell-out +
  freeform gate + one-shot auto-repair, usage/cost telemetry (`usage.ts` +
  `engine_usage_json`), auth + author-on-every-row, the per-user rate-limit hook.

## Build order (each gated on its own; fixtures are the definition of done)
1. **Engine editor** — prompt + `editHtml` + CLI. Gate (needs key): generate a base,
   then edit "make it denser" / "drop the phone" / "slow the packet" → screenshot
   before/after at irregular offsets → the change is localized, the rest identical,
   the gate passes.
2. **Data model + Flyway V4** — Gate: fresh-DB migrate + Hibernate `validate` passes.
3. **Turn orchestration** — generate v1, edit vN, serialize in-flight turns. Gate:
   local Postgres, mock mode: start → follow-up → poll → current preview updates,
   versions[] grows.
4. **API + DTOs** — Gate: full curl flow; a chat UI could drive it.
5. **Fixtures / definition of done** — a scripted **3-turn conversation** (e.g.
   "explain DNS" → "make the packet slower" → "add a closing caption") renders clean
   at every turn, AND the single-shot path from the prior step still works (no regression).

## Risks & open items
- **Editor prompt quality is the core risk** — needs real-API iteration (the key).
  This is the "premium gap" closer; budget time here, not on plumbing.
- **Cost per turn**: each edit re-sends the full current HTML as input (large). Usage
  telemetry already captures this per version — watch it.
- **Concurrency**: reject a new message while the latest version is still processing.
- **Rate limit**: decide if the per-user cooldown applies per turn or per conversation.
- **Title**: derive from the first message now; a tiny LLM title call is a later nicety.
- **Revert / branch**: out of scope (current-only hosting). Prior HTML is kept in the
  DB, so revert is a clean future additive feature.

## Guardrails (unchanged)
- Both prompts stay principles-based — **no template cage** in the editor prompt
  either. Validate with real API + screenshots. Small, reviewable diffs. Do **not**
  touch the SceneSpec/Remotion path. Never commit `.env`.
