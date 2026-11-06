import { useAuth } from '@clerk/nextjs'
import { useCallback, useMemo } from 'react'

/**
 * Returns an apiClient bound to the current Clerk session token.
 * Use this hook in client components instead of importing apiClient directly.
 * Also exposes `isLoaded` and `isSignedIn` so queries can be gated.
 * Memoized to prevent infinite re-render loops in consumers.
 */
export function useApiClient() {
  const { getToken, isLoaded, isSignedIn } = useAuth()

  const devMode = process.env.NODE_ENV === 'development'
  const effectiveSignedIn = Boolean(isSignedIn || devMode)
  const effectiveLoaded = Boolean(isLoaded || devMode)

  const fetchWithAuth = useCallback(
    async (url: string, options: RequestInit = {}) => {
      let token = await getToken()
      if (!token && devMode) {
        token = 'dev-token'
      }
      const headers = new Headers(options.headers || {})
      if (token) {
        headers.set('Authorization', `Bearer ${token}`)
      }
      return fetch(url, { ...options, headers })
    },
    [getToken, devMode]
  )

  return useMemo(
    () => ({
      isLoaded: effectiveLoaded,
      isSignedIn: effectiveSignedIn,
      fetch: fetchWithAuth,
    }),
    [effectiveLoaded, effectiveSignedIn, fetchWithAuth]
  )
}

