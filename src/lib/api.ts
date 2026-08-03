/**
 * Thin fetch wrapper around the Tuenx OS API.
 *
 * Vite proxies /api to the Node process, so every call here is same-origin.
 * Server errors arrive as `{ error: string }`; this surfaces that message
 * rather than a bare status code, so the UI can show something a person can
 * act on (TRD §6: visible error state, not silent data loss).
 */

import { cacheKey, dedupe, invalidate, isFresh, peek } from './cache.ts'

/** Fired when the server says the session is gone. Listened for by useSession. */
export const SIGNED_OUT = 'tuenx:signed-out'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      headers: init?.body ? { 'content-type': 'application/json' } : undefined,
    })
  } catch {
    // Network-level failure — almost always the API process not running.
    throw new ApiError(0, 'Cannot reach the Tuenx OS API. Is `npm run dev` still running?')
  }

  if (res.status === 204) return undefined as T

  /**
   * A session that has gone away takes the whole app with it.
   *
   * Without this, an expired or wiped session leaves every module showing its
   * own "Sign in to continue" error while the shell still renders stale cached
   * data — the app looks broken rather than signed out. The auth routes are
   * exempt: a wrong password is a 401 about the attempt, not about a session
   * that has expired.
   */
  if (res.status === 401 && !path.startsWith('/auth/')) {
    window.dispatchEvent(new Event(SIGNED_OUT))
  }

  const text = await res.text()
  const payload: unknown = text ? JSON.parse(text) : null

  if (!res.ok) {
    const message =
      typeof payload === 'object' && payload !== null && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : `Request failed (${res.status})`
    throw new ApiError(res.status, message)
  }

  return payload as T
}

const query = (params: Record<string, string | undefined>) => {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, value)
  }
  const s = search.toString()
  return s ? `?${s}` : ''
}

/**
 * Any write invalidates the whole cache.
 *
 * Blunt on purpose. Creating a task changes the task list, the overview
 * totals, the calendar, any epic or sprint rollup, and the right rail;
 * enumerating which of those to drop is how a cache starts lying. Clearing
 * everything costs one refetch of whatever is on screen and can never be wrong.
 */
const afterWrite = <T>(result: T): T => {
  invalidate()
  return result
}

export const api = {
  /**
   * Cached, stale-while-revalidate. Concurrent callers share one request, so
   * two components mounting together fetch once.
   */
  get: <T,>(path: string, params?: Record<string, string | undefined>) => {
    const key = cacheKey(path, params)
    const url = path + (params ? query(params) : '')

    if (isFresh(key)) {
      const hit = peek<T>(key)
      if (hit !== undefined) return Promise.resolve(hit)
    }

    return dedupe<T>(key, () => request<T>(url))
  },

  /** Cached value without a request, for painting a screen before it loads. */
  peek: <T,>(path: string, params?: Record<string, string | undefined>) =>
    peek<T>(cacheKey(path, params)),

  post: <T,>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }).then(afterWrite),

  patch: <T,>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }).then(afterWrite),

  del: (path: string) =>
    request<void>(path, { method: 'DELETE' }).then(afterWrite),
}
