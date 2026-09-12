export const apiClient = {
  fetch: async (url: string, options: RequestInit = {}) => {
    let token = null;
    
    // Check if we are in the browser and Clerk is available
    if (typeof window !== 'undefined' && (window as any).Clerk?.session) {
      token = await (window as any).Clerk.session.getToken();
    }
    
    const headers = new Headers(options.headers || {})
    if (token) {
      headers.set('Authorization', `Bearer ${token}`)
    }
    
    // For local dev where backend is separate, the Next.js proxy in next.config.ts will forward to backend
    return fetch(url, {
      ...options,
      headers
    })
  }
}
