'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useApiClient } from './useApiClient'

const STORAGE_KEY = 'jobcopilot_viewed_jobs_v1'
const EVENT_NAME = 'jobcopilot:viewed_jobs_updated'

function getLocalViewedIds(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return new Set(parsed)
    }
  } catch (e) {
    console.error('Failed to read viewed jobs from localStorage', e)
  }
  return new Set()
}

function saveLocalViewedIds(ids: Set<string>) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(ids)))
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: Array.from(ids) }))
  } catch (e) {
    console.error('Failed to save viewed jobs to localStorage', e)
  }
}

export function useViewedJobs() {
  const { fetch: apiFetch, isLoaded, isSignedIn } = useApiClient()
  const [viewedIds, setViewedIds] = useState<Set<string>>(() => getLocalViewedIds())

  // Synchronize across tabs and components
  useEffect(() => {
    const handleUpdate = () => {
      setViewedIds(getLocalViewedIds())
    }

    window.addEventListener(EVENT_NAME, handleUpdate)
    window.addEventListener('storage', handleUpdate)

    return () => {
      window.removeEventListener(EVENT_NAME, handleUpdate)
      window.removeEventListener('storage', handleUpdate)
    }
  }, [])

  // Sync with backend on mount
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    let isCancelled = false

    const syncWithBackend = async () => {
      try {
        const res = await apiFetch('/api/jobs/viewed')
        if (res.ok && !isCancelled) {
          const data = await res.json()
          if (Array.isArray(data.viewed_job_ids)) {
            const current = getLocalViewedIds()
            let hasNew = false
            data.viewed_job_ids.forEach((id: string) => {
              if (!current.has(id)) {
                current.add(id)
                hasNew = true
              }
            })
            if (hasNew) {
              saveLocalViewedIds(current)
              setViewedIds(new Set(current))
            }
          }
        }
      } catch (err) {
        // Fallback to localStorage silently
      }
    }

    syncWithBackend()

    return () => {
      isCancelled = true
    }
  }, [apiFetch, isLoaded, isSignedIn])

  const isViewed = useCallback(
    (jobId?: string | null): boolean => {
      if (!jobId) return false
      return viewedIds.has(jobId)
    },
    [viewedIds]
  )

  const markAsViewed = useCallback(
    (jobId?: string | null) => {
      if (!jobId) return
      setViewedIds((prev) => {
        if (prev.has(jobId)) return prev
        const next = new Set(prev)
        next.add(jobId)
        saveLocalViewedIds(next)
        return next
      })

      // Background persist to backend
      if (isLoaded && isSignedIn) {
        apiFetch(`/api/jobs/${jobId}/view`, { method: 'POST' }).catch(() => {})
      }
    },
    [apiFetch, isLoaded, isSignedIn]
  )

  const markAsUnviewed = useCallback(
    (jobId?: string | null) => {
      if (!jobId) return
      setViewedIds((prev) => {
        if (!prev.has(jobId)) return prev
        const next = new Set(prev)
        next.delete(jobId)
        saveLocalViewedIds(next)
        return next
      })

      // Background persist to backend
      if (isLoaded && isSignedIn) {
        apiFetch(`/api/jobs/${jobId}/view`, { method: 'DELETE' }).catch(() => {})
      }
    },
    [apiFetch, isLoaded, isSignedIn]
  )

  const markAllAsViewed = useCallback(
    (jobIds: string[]) => {
      if (!jobIds || jobIds.length === 0) return
      setViewedIds((prev) => {
        const next = new Set(prev)
        jobIds.forEach((id) => next.add(id))
        saveLocalViewedIds(next)
        return next
      })

      // Background batch persist to backend
      if (isLoaded && isSignedIn) {
        apiFetch('/api/jobs/viewed/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ job_ids: jobIds }),
        }).catch(() => {})
      }
    },
    [apiFetch, isLoaded, isSignedIn]
  )

  return useMemo(
    () => ({
      viewedIds,
      viewedCount: viewedIds.size,
      isViewed,
      markAsViewed,
      markAsUnviewed,
      markAllAsViewed,
    }),
    [viewedIds, isViewed, markAsViewed, markAsUnviewed, markAllAsViewed]
  )
}
