// Thin fetch wrapper around the Toucan backend.
//
//  * Base URL comes from VITE_API_BASE_URL (default http://localhost:8080).
//  * Attaches `Authorization: Bearer <token>` when a token is stored.
//  * On 401 for an authenticated call it clears the token and lets the app
//    redirect to /login (via a handler the AuthProvider registers).

export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'
).replace(/\/$/, '');

export const TOKEN_KEY = 'toucan.token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

/** Error carrying the HTTP status and a best-effort human message. */
export class ApiError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, message: string, body = '') {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

// The app registers a handler here so a stale token anywhere triggers a
// single, centralised "clear + go to login" — no per-call plumbing.
let unauthorizedHandler: (() => void) | null = null;
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Attach the bearer token (default true). Auth endpoints pass false. */
  auth?: boolean;
}

/**
 * Pull a useful message out of a backend error body. Spring's custom 401/403
 * handlers send `{error}`; its default error page sends `{message}` (which is
 * only populated when `server.error.include-message` is on). We ignore the
 * generic "Internal Server Error" placeholder so callers can fall back.
 */
function extractMessage(bodyText: string, fallback: string): string {
  try {
    const parsed = JSON.parse(bodyText) as { message?: unknown; error?: unknown };
    const candidate =
      typeof parsed.message === 'string' && parsed.message.trim()
        ? parsed.message
        : typeof parsed.error === 'string'
          ? parsed.error
          : '';
    if (candidate && candidate !== 'Internal Server Error') {
      return candidate;
    }
  } catch {
    if (bodyText.trim()) return bodyText.trim();
  }
  return fallback;
}

async function request(path: string, options: RequestOptions = {}): Promise<Response> {
  const { method = 'GET', body, auth = true } = options;

  const headers = new Headers();
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  const token = getToken();
  if (auth && token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    // A 401 while we were holding a token means the token is stale/expired.
    if (auth && token) unauthorizedHandler?.();
    const text = await res.text().catch(() => '');
    throw new ApiError(
      401,
      extractMessage(text, 'Your session has expired. Please log in again.'),
      text,
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ApiError(res.status, extractMessage(text, `Request failed (${res.status}).`), text);
  }

  return res;
}

export async function apiJson<T>(path: string, options?: RequestOptions): Promise<T> {
  const res = await request(path, options);
  return (await res.json()) as T;
}

export async function apiText(path: string, options?: RequestOptions): Promise<string> {
  const res = await request(path, options);
  return res.text();
}
