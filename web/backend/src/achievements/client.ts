/**
 * The HTTP half of talking to the achievements server: one POST /events.
 *
 * `fetch` is Node's own (20+) and injectable, so the flusher's suite runs
 * against a local http server and a broken network alike. A body that is
 * not JSON on a 200 - the single-page app's index.html when the server's
 * surface is off - is reported as a 502, because to an outbox it IS a
 * server fault: nothing was accepted, and retrying later is right.
 */
import type { AchievementsSettings } from './config';
import type { EventIn, EventsResponse } from './contract';

export const REQUEST_TIMEOUT_MS = 10_000;

export interface PostResult {
  status: number;
  body: EventsResponse | { error?: string; detail?: string } | null;
  /** Seconds, from a 429's Retry-After. */
  retryAfter?: number;
  /** A transport failure: no status at all. */
  error?: string;
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export async function postEvents(settings: AchievementsSettings, events: EventIn[], fetchImpl: FetchLike = fetch): Promise<PostResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetchImpl(`${settings.serverUrl}/achievements/v1/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Board ${settings.boardKey}`,
        Accept: 'application/json',
      },
      body: JSON.stringify({ events }),
      signal: controller.signal,
    });
    const text = await res.text();
    let body: PostResult['body'] = null;
    try {
      body = text ? (JSON.parse(text) as PostResult['body']) : null;
    } catch {
      body = null;
    }
    if (res.status === 200 && (body === null || typeof (body as EventsResponse).accepted !== 'number')) {
      return { status: 502, body: null, error: 'a 200 that is not the events response (the surface is off?)' };
    }
    const ra = res.headers.get('retry-after');
    return { status: res.status, body, ...(ra && /^\d+$/.test(ra) ? { retryAfter: Number(ra) } : {}) };
  } catch (err) {
    return { status: 0, body: null, error: (err as Error).name === 'AbortError' ? 'timeout' : (err as Error).message };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// The rest of the API, for the ACHIEVE door (SP3). The door never holds the
// board key: BBSApi.achievements() calls these on its behalf.
// ---------------------------------------------------------------------------

export interface ApiResult<T = unknown> {
  status: number;
  body: T | null;
  /** The server's error code on a refusal, or a transport description. */
  error?: string;
  detail?: string;
}

export async function apiRequest<T = unknown>(
  settings: AchievementsSettings,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT',
  path: string,
  body?: unknown,
  fetchImpl: FetchLike = fetch
): Promise<ApiResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetchImpl(`${settings.serverUrl}/achievements/v1${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Board ${settings.boardKey}`,
        Accept: 'application/json',
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    });
    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    if (res.status === 200 && parsed === null && text.length > 0) {
      return { status: 502, body: null, error: 'not_json', detail: 'the server answered something that is not the API (is its achievements surface on?)' };
    }
    if (res.status >= 400) {
      const e = (parsed ?? {}) as { error?: string; detail?: string };
      return { status: res.status, body: null, error: e.error ?? String(res.status), detail: e.detail };
    }
    return { status: res.status, body: parsed as T };
  } catch (err) {
    return { status: 0, body: null, error: (err as Error).name === 'AbortError' ? 'timeout' : 'unreachable', detail: (err as Error).message };
  } finally {
    clearTimeout(timer);
  }
}
