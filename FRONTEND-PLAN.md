# Toucan — build brief: web frontend (the chat UI)

> Status: **PLAN, not built.** The next session's job: a browser chat UI over the
> conversation API — "ChatGPT for animations." Send a message → see an animation;
> send another → see it change. Read this whole brief first.
>
> The backend is done and pushed (engine wiring + iterative-editing conversation
> layer). This step is a **thin client over `/api/conversations`** — no backend
> logic is duplicated here.

## Stack (recommended, locked unless the maintainer changes it)
- **Node 22** (repo `.nvmrc`). **Vite + React + TypeScript.**
- **React Router** (`react-router-dom`) — routes: login, conversation list, conversation view.
- **TanStack Query** (`@tanstack/react-query`) — the app is POST-then-poll; Query's
  `refetchInterval` handles "poll until READY" cleanly, plus caching/refetch.
- **Native `fetch`** for HTTP (no axios needed).
- **Styling:** Tailwind CSS recommended for speed (or CSS Modules — maintainer's call).
- Lives in **`frontend/`** (monorepo, next to the Spring backend + `toucan-motion/`).

## The backend is ready for this
- **CORS is already configured** for `http://localhost:5173` (Vite), all methods,
  `allowCredentials`. The app can call `http://localhost:8080/api/…` directly — a
  Vite dev proxy is optional, not required.
- **Run it keyless:** boot the Spring app with `--app.engine.mock=true` + a local
  Postgres. Every turn returns a fixture animation, so the entire UI is exercised
  with no API key (real edits arrive when the key is set — no frontend change).

## API contract (JSON; `Authorization: Bearer <token>` on everything except `/api/auth/**` and `/preview/**`)
- `POST /api/auth/register` `{email, name, password}` → 200 (then verify — for dev, the
  maintainer enables the user directly in the DB; see the session notes).
- `POST /api/auth/login` `{email, password, rememberMe:false}` → `{token, user}`.
- `POST /api/conversations` `{message}` → `ConversationDTO` (starts a conversation; v1 PENDING).
- `POST /api/conversations/{id}/messages` `{message}` → `ConversationDTO` (edits current;
  **409** if the previous turn is still running).
- `GET /api/conversations` → `ConversationDTO[]` (summary — no `versions`).
- `GET /api/conversations/{id}` → `ConversationDTO` (full — with `versions`).
- `GET /api/conversations/{id}/versions/{n}/download` → the version's HTML (`text/html`).

```ts
type AnimationStatus = "PENDING" | "GENERATING" | "READY" | "FAILED";
interface VersionDTO { versionNumber: number; message: string; status: AnimationStatus;
                       errorMessage: string | null; createdAt: string; }
interface ConversationDTO { id: string; title: string | null; status: AnimationStatus;
                            currentVersion: number | null; previewUrl: string | null;
                            versions?: VersionDTO[]; createdAt: string; }
```
`status` is the latest version's state. A turn is "in progress" while **PENDING** (the
conversation path uses PENDING → READY/FAILED; GENERATING is a single-shot-path state).

## Two integration notes (important — get these right first)
1. **Rendering the preview — use `srcDoc`, do NOT iframe the hosted URL.** Spring sets
   `X-Frame-Options: DENY`, which blocks framing `/preview/{id}`. Instead: fetch the
   current version's HTML (`GET /versions/{currentVersion}/download` with the JWT) and
   render it as `<iframe srcDoc={html} sandbox="allow-scripts" title="preview" />`.
   `srcDoc` is not a cross-origin navigation, so no frame-options / CORS issue, and the
   self-contained animation (inline CSS/JS; only Google Fonts is external and falls back)
   runs fine. Re-fetch + swap `srcDoc` after each turn reaches READY.
2. **Polling.** After a POST (create or follow-up) the new version is PENDING. Poll
   `GET /api/conversations/{id}` on an interval (React Query `refetchInterval`, ~1500ms)
   while `status === "PENDING"`; stop on READY/FAILED; then refresh the preview.

## Build order (each a checkpoint; validate in the browser against the mock backend)
1. **Shell + auth.** Login/register forms → store JWT (localStorage) → an API client that
   attaches the token and, on 401, clears it and routes to login.
2. **Conversation list + new conversation.** List (`GET /api/conversations`); a composer
   that POSTs the first message and navigates to the new conversation.
3. **Conversation view (the core).** A chat log (each version = the user's message + that
   version's status), a message input (POST follow-up; disable while a turn is PENDING —
   or surface the 409), and the **live preview pane** (`iframe srcDoc` of the current
   version), with polling. This is the "ChatGPT for animations" screen.
4. **Version affordances.** Show version numbers; click a past version to preview/download
   it (`/versions/{n}/download`). (Revert is a future backend feature — out of scope.)
5. **Polish.** Loading/error/empty states; FAILED shows `errorMessage` + a retry; basic
   responsive desktop-first layout.

## Definition of done
End-to-end in the browser against the local backend in **mock mode**: register/login →
start a conversation → the animation appears in the preview → send a follow-up → the
preview changes → the version thread grows. No console errors. Real, semantic edits arrive
automatically when the maintainer sets `ANTHROPIC_API_KEY` (no frontend change).

## Non-goals now
Payments/billing UI, real-time collaboration, SSR, mobile-first. Desktop-first is fine.

## Small backend follow-ups the frontend may want (later, note only)
- A `GET /api/conversations/{id}/current.html` convenience (current version HTML in one
  call) if `srcDoc`-by-version-number feels clunky.
- Production CORS origins; JWT refresh; a real email-verification flow for signup.

## Guardrails
Thin client over the API — don't reimplement backend logic. Validate in the browser
against the mock backend. Small, reviewable commits.
