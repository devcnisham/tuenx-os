/**
 * Thin fetch wrapper around the Tuenx OS API.
 *
 * Vite proxies /api to the Node process, so every call here is same-origin.
 * Server errors arrive as `{ error: string }`; this surfaces that message
 * rather than a bare status code, so the UI can show something a person can
 * act on (TRD §6: visible error state, not silent data loss).
 */

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

export const api = {
  get: <T,>(path: string, params?: Record<string, string | undefined>) =>
    request<T>(path + (params ? query(params) : '')),

  post: <T,>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),

  patch: <T,>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),

  del: (path: string) => request<void>(path, { method: 'DELETE' }),
}
