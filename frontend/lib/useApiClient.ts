import { useAuth } from '@clerk/nextjs'

/**
 * Returns an apiClient bound to the current Clerk session token.
 * Use this hook in client components instead of importing apiClient directly.
 * Also exposes `isLoaded` and `isSignedIn` so queries can be gated.
 */
export function useApiClient() {
  const { getToken, isLoaded, isSignedIn } = useAuth()

  return {
    isLoaded,
    isSignedIn,
    fetch: async (url: string, options: RequestInit = {}) => {
      const token = await getToken()
      if (!token) {
        console.error("useApiClient: getToken() returned null! User is not authenticated or session expired.")
      }
      const headers = new Headers(options.headers || {})
      if (token) {
        headers.set('Authorization', `Bearer ${token}`)
      }
      return fetch(url, { ...options, headers })
    }
  }
}
