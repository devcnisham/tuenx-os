import { useCallback, useEffect, useState } from 'react'
import { api } from './api.ts'
import type { Viewer } from '../types.ts'

/**
 * Who is signed in, resolved once on load from the session cookie.
 *
 * The cookie is httpOnly, so the client cannot read it — asking the server is
 * the only way to know, and that is the right shape anyway: the server's answer
 * is the one that decides what the API will actually return.
 */
export function useSession() {
  const [viewer, setViewer] = useState<Viewer | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const result = await api.get<{ viewer: Viewer | null }>('/auth/me')
      setViewer(result.viewer)
    } catch {
      // Treat any failure as signed out. Guessing otherwise would show a
      // dashboard whose every request then 401s.
      setViewer(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const signOut = useCallback(async () => {
    await api.post('/auth/logout', {}).catch(() => {})
    setViewer(null)
  }, [])

  return { viewer, loading, refresh, signOut, setViewer }
}
