# Toucan — web frontend

A thin React client over the Toucan `/api/conversations` backend: register / log in,
type a prompt, and watch the generated explainer animation render in a live preview.

Stack: **Vite + React + TypeScript**, **react-router-dom**, **@tanstack/react-query**,
native `fetch`.

## What's in this session

- **App shell + routing** — `/login`, `/register`, and the home/generate page (`/`),
  guarded so an unauthenticated visitor is bounced to `/login`.
- **API client** (`src/lib/api.ts`) — reads the base URL from `VITE_API_BASE_URL`
  (default `http://localhost:8080`), attaches `Authorization: Bearer <token>`, and on a
  `401` clears the token and routes back to `/login`.
- **Auth** — register, login (stores `{token, user}` in `localStorage`), logout. There's
  no `/me` endpoint: "has a stored token" means logged-in, and any `401` invalidates it.
- **Generate** — POST a prompt → poll the conversation (React Query `refetchInterval`,
  ~1.5s) until it's `READY` → download the version's HTML and render it via
  `<iframe srcDoc=… sandbox="allow-scripts">`. `FAILED` shows the backend error message.

Not in this session (later): the follow-up edit/chat loop, conversation history/list,
design polish, payments.

## Run it against the mock backend (keyless)

The backend returns a fixture animation for every turn in mock mode, so the whole UI is
exercised without an API key.

1. **Postgres** — have a local Postgres running with the DB/role the backend expects
   (`toucan_motion` / `toucan_motion`, database `toucan_motion`; see
   `src/main/resources/application.properties`).

2. **Backend** (from the repo root) in mock mode:

   ```bash
   mvn spring-boot:run -Dspring-boot.run.arguments="--app.engine.mock=true"
   ```

   It listens on `http://localhost:8080` with CORS pre-configured for the Vite dev server.

3. **Frontend**:

   ```bash
   cd frontend
   npm install
   npm run dev            # Vite on http://localhost:5173
   ```

   Optionally copy `.env.example` to `.env` to point at a non-default backend URL.

4. In the browser: **register → enable the user in the DB (below) → log in → type a
   prompt → watch the animation render** in the preview.

## Dev gotcha — email verification

Registration creates a **disabled** user and the backend blocks login until the account
is verified. Local dev has no working mail server, so a freshly-registered user can't log
in yet. Enable the account directly in the database:

```sql
UPDATE users SET enabled=true WHERE email='you@example.com';
```

The login screen surfaces the backend's "please verify your email" error so this state is
obvious. (A real verification UI is a later task.)

> Note on error messages: the current backend returns a bare `500` for a failed login
> (Spring hides the exception message by default, and the `server.error.include-message`
> flag has no effect under Spring Boot 4.1). So the client can't always tell "unverified"
> from "wrong password". It shows the backend's specific message when one is present, and
> otherwise a friendly fallback — and the login screen always shows a standing hint about
> verifying your email, which is the case that matters in local dev.

## Preview gotcha — use `srcDoc`, not the hosted URL

Don't iframe the hosted `/preview/{id}` URL: Spring sends `X-Frame-Options: DENY`, which
blocks framing it. Instead we fetch the current version's HTML with the JWT
(`GET /api/conversations/{id}/versions/{n}/download`) and render it via `srcDoc`, which
isn't a cross-origin navigation.

## Scripts

```bash
npm run dev       # start the dev server
npm run build     # type-check (tsc -b) + production build
npm run lint      # eslint
npm run preview   # preview the production build
```
