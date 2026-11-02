'use client'

import {
  Search,
  MapPin,
  Building2,
  Clock,
  CheckCircle2,
  XCircle,
  ArrowUpRight,
  Plus,
  Bookmark,
  Briefcase,
  ListTodo,
  RefreshCcw,
  Activity,
  Trash2,
  Calendar,
  Sparkles,
  Zap,
  Loader2,
  GraduationCap,
  LayoutDashboard,
  BrainCircuit,
  Flame,
  PanelLeftClose,
  PanelLeft,
  X,
  Copy,
  Check,
  FileText,
  ExternalLink,
  SlidersHorizontal,
  Send
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery, useMutation } from '@tanstack/react-query'
import Link from 'next/link'
import { Suspense, useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { useApiClient } from '@/lib/useApiClient'
import { PageHeader } from '@/components/ui/PageHeader'
import AutoFillModal from '@/components/AutoFillModal'
import { SignInButton, SignUpButton } from '@clerk/nextjs'

function formatJobDate(dateStr?: string) {
  if (!dateStr) return null
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return null
  const now = Date.now()
  const diffMs = now - date.getTime()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  const isNew = diffHours <= 48 && diffHours >= 0

  let label = ''
  if (diffHours < 1) label = 'Just now'
  else if (diffHours < 24) label = `${diffHours}h ago`
  else if (diffDays === 1) label = 'Yesterday'
  else if (diffDays < 7) label = `${diffDays}d ago`
  else label = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

  return { label, isNew }
}

function cleanTitle(title?: string): string {
  if (!title) return 'Job Opportunity'
  return title
    .replace(/[\uFFFD]/g, '—')
    .replace(/\s+/g, ' ')
    .trim()
}

function isJobInternship(job: any): boolean {
  if (!job) return false
  if (job.is_internship === true) return true
  const title = (job.role_title || '').toLowerCase()
  if (/\b(intern|internship|trainee|apprentice|co-op|summer analyst|summer associate|winter intern)\b/i.test(title)) {
    return true
  }
  if (
    /\b(new grad|graduate engineer|full-time|full time|permanent|developer|engineer|analyst|associate|manager|lead)\b/i.test(
      title
    ) &&
    !/\b(intern|internship|trainee)\b/i.test(title)
  ) {
    return false
  }
  const seniority = (job.seniority_required || '').toLowerCase()
  if (seniority === 'intern') return true

  const rawJd = (job.raw_jd || '').toLowerCase()
  if (
    /\b(this internship|internship position|internship role|duration of the internship|summer internship program|winter internship program|internship stipend)\b/i.test(
      rawJd
    )
  ) {
    return true
  }
  return false
}

function getJobCgpaCutoff(job: any): number | null {
  if (!job) return null
  if (typeof job.min_cgpa === 'number') return job.min_cgpa
  const text = (job.raw_jd || '') + ' ' + (job.role_title || '')
  const m =
    text.match(/\b(?:cgpa|gpa|pointer)\s*(?:of|>=|:|is|cutoff|minimum)?\s*([6-9](?:\.\d{1,2})?)\b/i) ||
    text.match(/\b([6-9](?:\.\d{1,2})?)\s*(?:\+|and above)?\s*(?:cgpa|gpa|pointer)\b/i)
  if (m) {
    const val = parseFloat(m[1])
    if (val >= 5.0 && val <= 10.0) return val
  }
  const pct = text.match(/\b(6\d|7\d|8\d)%\s*(?:marks|aggregate|criteria)?\b/i)
  if (pct) {
    return parseFloat((parseInt(pct[1]) / 10).toFixed(1))
  }
  return null
}

const STORAGE_KEY_DASHBOARD = 'apply_tool_dashboard_filters'

function DashboardContent() {
  const searchParams = useSearchParams()

  const initialTab = (searchParams.get('tab') as any) || 'all'
  const initialVerdict = searchParams.get('verdict') || 'all'
  const initialRoleType = (searchParams.get('type') as any) || 'all'
  const initialCgpa = searchParams.get('cgpa') || 'all'
  const initialQ = searchParams.get('q') || ''
  const initialLoc = searchParams.get('loc') || 'all'
  const initialSort = (searchParams.get('sort') as any) || 'score'
  const initialDate = (searchParams.get('date') as any) || 'all'

  const [filter, setFilter] = useState<'all' | 'bookmarks' | 'deadlines' | 'internships'>(
    ['all', 'bookmarks', 'deadlines', 'internships'].includes(initialTab) ? initialTab : 'all'
  )
  const [roleTypeFilter, setRoleTypeFilter] = useState<'all' | 'internship' | 'fulltime'>(
    ['all', 'internship', 'fulltime'].includes(initialRoleType) ? initialRoleType : 'all'
  )
  const [cgpaFilter, setCgpaFilter] = useState<string>(initialCgpa)
  const [searchQuery, setSearchQuery] = useState(initialQ)
  const [locationFilter, setLocationFilter] = useState(initialLoc)
  const [verdictFilter, setVerdictFilter] = useState(initialVerdict)
  const [dateFilter, setDateFilter] = useState<'all' | '24h' | '3d' | '7d' | '14d' | '30d'>(
    ['all', '24h', '3d', '7d', '14d', '30d'].includes(initialDate) ? initialDate : 'all'
  )
  const [sortBy, setSortBy] = useState<'score' | 'newest' | 'oldest' | 'deadline' | 'salary'>(
    ['score', 'newest', 'oldest', 'deadline', 'salary'].includes(initialSort) ? initialSort : 'score'
  )
  const [sourceChannelFilter, setSourceChannelFilter] = useState<'all' | 'ats' | 'leads'>('all')
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const [autoFillModalData, setAutoFillModalData] = useState<any | null>(null)
  const [isSyncingResume, setIsSyncingResume] = useState(false)

  // Split-View & Collapsible Feed State when viewing a job
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [isFeedCollapsed, setIsFeedCollapsed] = useState(false)
  const [inspectorTab, setInspectorTab] = useState<'overview' | 'autofill' | 'tailor' | 'coach'>('overview')
  const [inspectorAutoFill, setInspectorAutoFill] = useState<any | null>(null)
  const [loadingInspectorAutoFill, setLoadingInspectorAutoFill] = useState(false)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [tailoringInline, setTailoringInline] = useState(false)
  const [tailorResult, setTailorResult] = useState<any | null>(null)
  const [coachQuestion, setCoachQuestion] = useState('')
  const [coachAnswer, setCoachAnswer] = useState<string | null>(null)
  const [coachLoading, setCoachLoading] = useState(false)

  const isHydratedRef = useRef(false)
  const { fetch: apiFetch, isLoaded, isSignedIn } = useApiClient()

  useEffect(() => {
    const hydrate = () => {
      if (typeof window === 'undefined') return
      const sp = new URLSearchParams(window.location.search)
      const hasUrlParams = window.location.search && window.location.search.length > 1

      let saved: any = null
      try {
        const raw = sessionStorage.getItem(STORAGE_KEY_DASHBOARD)
        if (raw) saved = JSON.parse(raw)
      } catch {}

      const targetTab = hasUrlParams ? ((sp.get('tab') as any) || 'all') : saved?.filter || (sp.get('tab') as any) || 'all'
      const targetType = hasUrlParams
        ? ((sp.get('type') as any) || 'all')
        : saved?.roleTypeFilter || (sp.get('type') as any) || 'all'
      const targetCgpa = hasUrlParams ? sp.get('cgpa') || 'all' : saved?.cgpaFilter || sp.get('cgpa') || 'all'
      const targetVerdict = hasUrlParams
        ? sp.get('verdict') || 'all'
        : saved?.verdictFilter || sp.get('verdict') || 'all'
      const targetQ = hasUrlParams ? sp.get('q') || '' : saved?.searchQuery || sp.get('q') || ''
      const targetLoc = hasUrlParams ? sp.get('loc') || 'all' : saved?.locationFilter || sp.get('loc') || 'all'
      const targetDate = hasUrlParams
        ? ((sp.get('date') as any) || 'all')
        : saved?.dateFilter || (sp.get('date') as any) || 'all'
      const targetSort = hasUrlParams
        ? ((sp.get('sort') as any) || 'score')
        : saved?.sortBy || (sp.get('sort') as any) || 'score'

      if (['all', 'bookmarks', 'deadlines', 'internships'].includes(targetTab)) setFilter(targetTab)
      if (['all', 'internship', 'fulltime'].includes(targetType)) setRoleTypeFilter(targetType)
      setCgpaFilter(targetCgpa)
      setVerdictFilter(targetVerdict)
      setSearchQuery(targetQ)
      setLocationFilter(targetLoc)
      if (['all', '24h', '3d', '7d', '14d', '30d'].includes(targetDate)) setDateFilter(targetDate)
      if (['score', 'newest', 'oldest', 'deadline', 'salary'].includes(targetSort)) setSortBy(targetSort)

      isHydratedRef.current = true
    }

    hydrate()

    const handlePopState = () => {
      hydrate()
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    if (!isHydratedRef.current || typeof window === 'undefined') return

    const params = new URLSearchParams()
    if (filter !== 'all') params.set('tab', filter)
    if (roleTypeFilter !== 'all') params.set('type', roleTypeFilter)
    if (cgpaFilter !== 'all') params.set('cgpa', cgpaFilter)
    if (verdictFilter !== 'all') params.set('verdict', verdictFilter)
    if (searchQuery.trim()) params.set('q', searchQuery.trim())
    if (locationFilter !== 'all') params.set('loc', locationFilter)
    if (dateFilter !== 'all') params.set('date', dateFilter)
    if (sortBy !== 'score') params.set('sort', sortBy)

    const queryStr = params.toString()
    const newUrl = queryStr ? `/?${queryStr}` : '/'
    window.history.replaceState(null, '', newUrl)

    try {
      sessionStorage.setItem(
        STORAGE_KEY_DASHBOARD,
        JSON.stringify({
          filter,
          roleTypeFilter,
          cgpaFilter,
          verdictFilter,
          searchQuery,
          locationFilter,
          dateFilter,
          sortBy,
        })
      )
    } catch {}
  }, [filter, roleTypeFilter, cgpaFilter, verdictFilter, searchQuery, locationFilter, dateFilter, sortBy])

  const { data: jobs, isLoading, refetch: refetchJobs } = useQuery({
    queryKey: ['jobs'],
    enabled: isLoaded && !!isSignedIn,
    queryFn: async () => {
      const res = await apiFetch('/api/jobs')
      if (!res.ok) throw new Error('Failed to fetch jobs')
      return res.json()
    },
  })

  const { data: resumes } = useQuery({
    queryKey: ['resumes'],
    enabled: isLoaded && !!isSignedIn,
    queryFn: async () => {
      const res = await apiFetch('/api/resumes')
      if (!res.ok) return []
      return res.json()
    },
  })

  const syncJobsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch('/api/jobs/sync', { method: 'POST' })
      if (!res.ok) throw new Error('Failed to sync live openings')
      return res.json()
    },
    onSuccess: (data: any) => {
      refetchJobs()
      const msg = data?.message || `Synced ${data?.new_jobs_count || 0} live openings!`
      setSyncMessage(msg)
      setTimeout(() => setSyncMessage(null), 5000)
    },
    onError: (err: any) => {
      setSyncMessage(`Sync failed: ${err.message || 'Please try again'}`)
      setTimeout(() => setSyncMessage(null), 4000)
    },
  })

  const copilotOptimizeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch('/api/jobs/copilot-optimize', { method: 'POST' })
      if (!res.ok) throw new Error('Failed to optimize feed')
      return res.json()
    },
    onSuccess: (data: any) => {
      refetchJobs()
      const msg = data?.message || 'Copilot optimized your feed!'
      setSyncMessage(msg)
      setTimeout(() => setSyncMessage(null), 6500)
    },
    onError: (err: any) => {
      setSyncMessage(`Copilot optimization failed: ${err.message || 'Please try again'}`)
      setTimeout(() => setSyncMessage(null), 4500)
    },
  })

  const deleteJobMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const res = await apiFetch(`/api/jobs/${jobId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete job')
      return res.json()
    },
    onSuccess: (_, deletedId) => {
      if (activeJobId === deletedId) setActiveJobId(null)
      refetchJobs()
    },
  })

  const { data: applications, refetch: refetchApplications } = useQuery({
    queryKey: ['applications'],
    enabled: isLoaded && !!isSignedIn,
    queryFn: async () => {
      const res = await apiFetch('/api/applications')
      if (!res.ok) return []
      return res.json()
    },
  })

  const trackedJobIdMap = useMemo(() => {
    const map: Record<string, string> = {}
    if (applications) {
      applications.forEach((app: any) => {
        if (app.job_id) {
          map[app.job_id] = app.status
        }
      })
    }
    return map
  }, [applications])

  const trackMutation = useMutation({
    mutationFn: async ({ job, status }: { job: any; status: string }) => {
      const res = await apiFetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: job.id,
          company: job.company,
          role_title: job.role_title,
          location: job.location,
          url: job.official_apply_url || job.url,
          status: status,
          notes: `Added from Dashboard (${job.source || 'manual'})`,
        }),
      })
      if (!res.ok) throw new Error('Failed to track job')
      return res.json()
    },
    onSuccess: () => {
      refetchApplications()
    },
  })

  const autoApplyMutation = useMutation({
    mutationFn: async ({ url, jobId }: { url: string; jobId: string }) => {
      const res = await apiFetch('/api/applications/auto-apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url, job_id: jobId }),
      })
      if (!res.ok) throw new Error('Failed to trigger auto apply')
      return res.json()
    },
    onSuccess: (data: any) => {
      refetchApplications()
      setAutoFillModalData(data)
    },
  })

  const handleSyncIdentityFromResume = async () => {
    setIsSyncingResume(true)
    try {
      const res = await apiFetch('/api/profile/sync-from-resume', { method: 'POST' })
      if (res.ok) {
        if (autoFillModalData) {
          const currentJobId = autoFillModalData?.autofill?.job_id
          const currentUrl = autoFillModalData?.autofill?.apply_url || ''
          const refreshed = await apiFetch(
            `/api/auto-apply/data?url=${encodeURIComponent(currentUrl)}${currentJobId ? `&job_id=${currentJobId}` : ''}`
          )
          if (refreshed.ok) {
            const newPacket = await refreshed.json()
            setAutoFillModalData({ ...autoFillModalData, autofill: newPacket })
          }
        }
        if (activeJob) {
          fetchInspectorAutoFill(activeJob)
        }
      }
    } finally {
      setIsSyncingResume(false)
    }
  }

  const availableLocations = useMemo(() => {
    const set = new Set<string>()
    if (jobs) {
      jobs.forEach((j: any) => {
        if (j.location && j.location !== 'Location Unclear' && j.location.trim().length > 1) {
          set.add(j.location.trim())
        }
      })
    }
    return Array.from(set).sort()
  }, [jobs])

  const filteredJobs = useMemo(() => {
    if (!jobs) return []
    let list = [...jobs]

    const INVALID_TITLES = new Set(['not specified', 'unspecified role', 'unknown role', 'park', 'find a park', ''])
    list = list.filter((job: any) => {
      const title = (job.role_title || '').trim().toLowerCase()
      if (!title || INVALID_TITLES.has(title)) return false
      const url = (job.url || '').toLowerCase()
      if (
        url.includes('wikipedia.org') ||
        url.includes('netflix.com') ||
        url.includes('sohu.com') ||
        url.includes('zhihu.com') ||
        url.includes('baidu.com') ||
        url.includes('nps.gov')
      )
        return false
      return true
    })

    if (filter === 'bookmarks') {
      list = list.filter((job: any) => job.is_bookmarked)
    } else if (filter === 'deadlines') {
      list = list.filter((job: any) => job.deadline)
    } else if (filter === 'internships') {
      list = list.filter(isJobInternship)
    }

    if (sourceChannelFilter === 'ats') {
      list = list.filter((job: any) => job.source !== 'inbox')
    } else if (sourceChannelFilter === 'leads') {
      list = list.filter((job: any) => job.source === 'inbox')
    }

    if (roleTypeFilter === 'internship') {
      list = list.filter(isJobInternship)
    } else if (roleTypeFilter === 'fulltime') {
      list = list.filter((j: any) => !isJobInternship(j))
    }

    if (cgpaFilter === 'nocutoff') {
      list = list.filter((j: any) => getJobCgpaCutoff(j) === null)
    } else if (cgpaFilter === '7.0') {
      list = list.filter((j: any) => {
        const c = getJobCgpaCutoff(j)
        return c === null || c <= 7.0
      })
    } else if (cgpaFilter === '7.5') {
      list = list.filter((j: any) => {
        const c = getJobCgpaCutoff(j)
        return c === null || c <= 7.5
      })
    } else if (cgpaFilter === '8.0') {
      list = list.filter((j: any) => {
        const c = getJobCgpaCutoff(j)
        return c === null || c <= 8.0
      })
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      list = list.filter((job: any) => {
        const title = (job.role_title || '').toLowerCase()
        const company = (job.company || '').toLowerCase()
        const loc = (job.location || '').toLowerCase()
        const skills = (job.required_skills || []).join(' ').toLowerCase()
        return title.includes(q) || company.includes(q) || loc.includes(q) || skills.includes(q)
      })
    }

    if (locationFilter !== 'all') {
      const targetLoc = locationFilter.toLowerCase().trim()
      list = list.filter((job: any) => {
        const jobLoc = (job.location || '').toLowerCase()
        return jobLoc.includes(targetLoc)
      })
    }

    if (dateFilter !== 'all') {
      const now = Date.now()
      const msMap: Record<string, number> = {
        '24h': 24 * 60 * 60 * 1000,
        '3d': 3 * 24 * 60 * 60 * 1000,
        '7d': 7 * 24 * 60 * 60 * 1000,
        '14d': 14 * 24 * 60 * 60 * 1000,
        '30d': 30 * 24 * 60 * 60 * 1000,
      }
      const maxAge = msMap[dateFilter]
      if (maxAge) {
        list = list.filter((job: any) => {
          const d = job.posting_date || job.first_seen_at || job.fetched_at
          if (!d) return false
          const time = new Date(d).getTime()
          return now - time <= maxAge
        })
      }
    }

    if (verdictFilter !== 'all') {
      list = list.filter((job: any) => {
        const analysis = job.job_analyses && job.job_analyses[0]
        return analysis && analysis.verdict === verdictFilter
      })
    }

    list.sort((a: any, b: any) => {
      if (sortBy === 'deadline') {
        const dA = a.deadline ? new Date(a.deadline).getTime() : Infinity
        const dB = b.deadline ? new Date(b.deadline).getTime() : Infinity
        return dA - dB
      }
      if (sortBy === 'newest') {
        const tA = new Date(a.posting_date || a.first_seen_at || a.fetched_at || 0).getTime()
        const tB = new Date(b.posting_date || b.first_seen_at || b.fetched_at || 0).getTime()
        return tB - tA
      }
      if (sortBy === 'oldest') {
        const tA = new Date(a.posting_date || a.first_seen_at || a.fetched_at || 0).getTime()
        const tB = new Date(b.posting_date || b.first_seen_at || b.fetched_at || 0).getTime()
        return tA - tB
      }
      if (sortBy === 'salary') {
        const sA = a.pay_max || a.pay_min || 0
        const sB = b.pay_max || b.pay_min || 0
        return sB - sA
      }
      const scoreA = (a.job_analyses && a.job_analyses[0]?.match_score) || 0
      const scoreB = (b.job_analyses && b.job_analyses[0]?.match_score) || 0
      return scoreB - scoreA
    })

    return list
  }, [jobs, filter, sourceChannelFilter, roleTypeFilter, cgpaFilter, searchQuery, locationFilter, verdictFilter, dateFilter, sortBy])

  const activeJob = useMemo(() => {
    if (!activeJobId || !jobs) return null
    return jobs.find((j: any) => j.id === activeJobId) || null
  }, [activeJobId, jobs])

  const fetchInspectorAutoFill = useCallback(
    async (job: any) => {
      if (!job?.id) return
      setLoadingInspectorAutoFill(true)
      try {
        const targetUrl = job.official_apply_url || job.url || ''
        const res = await apiFetch('/api/applications/auto-apply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: targetUrl, job_id: job.id }),
        })
        if (res.ok) {
          const data = await res.json()
          setInspectorAutoFill(data?.autofill || data)
        }
      } catch (e) {
        console.error(e)
      } finally {
        setLoadingInspectorAutoFill(false)
      }
    },
    [apiFetch]
  )

  useEffect(() => {
    if (activeJob) {
      setTailorResult(null)
      setCoachAnswer(null)
      fetchInspectorAutoFill(activeJob)
    } else {
      setIsFeedCollapsed(false)
    }
  }, [activeJob, fetchInspectorAutoFill])

  const handleRunInlineTailor = async () => {
    if (!activeJob) return
    const primaryResume = (resumes && resumes[0]) || null
    if (!primaryResume) {
      setSyncMessage('Upload a PDF resume in Resume Vault first to tailor bullets.')
      return
    }
    setTailoringInline(true)
    try {
      const res = await apiFetch(`/api/jobs/${activeJob.id}/tailor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume_id: primaryResume.id }),
      })
      if (res.ok) {
        const data = await res.json()
        setTailorResult(data)
      }
    } finally {
      setTailoringInline(false)
    }
  }

  const handleAskInlineCoach = async (promptText?: string) => {
    const q = (promptText || coachQuestion).trim()
    if (!q || !activeJob) return
    setCoachLoading(true)
    setCoachAnswer(null)
    try {
      const analysis = activeJob.job_analyses && activeJob.job_analyses[0]
      const res = await apiFetch('/api/coach/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: activeJob.id,
          question: q,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setCoachAnswer(data.answer || data.response || JSON.stringify(data))
      } else {
        setCoachAnswer(
          `For ${cleanTitle(activeJob.role_title)} at ${activeJob.company}:\n• Highlight production ownership in ${(
            activeJob.required_skills || ['Python', 'Distributed Systems', 'APIs']
          )
            .slice(0, 4)
            .join(', ')}.\n• Match Score: ${analysis?.match_score ?? '--'}% (${(
            analysis?.verdict || 'apply'
          ).toUpperCase()}).\n• ${analysis?.reasoning || 'Emphasize measurable latency and reliability improvements.'}`
        )
      }
    } catch {
      const analysis = activeJob.job_analyses && activeJob.job_analyses[0]
      setCoachAnswer(
        `For ${cleanTitle(activeJob.role_title)} at ${activeJob.company}:\n• Focus on ${(
          activeJob.required_skills || ['Core Engineering']
        )
          .slice(0, 4)
          .join(', ')}.\n• ${analysis?.reasoning || 'Quantify engineering impact in your top 3 resume bullets.'}`
      )
    } finally {
      setCoachLoading(false)
    }
  }

  const copyText = (key: string, val?: string) => {
    if (!val) return
    navigator.clipboard.writeText(val)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  const hasActiveFilters =
    searchQuery !== '' ||
    locationFilter !== 'all' ||
    verdictFilter !== 'all' ||
    filter !== 'all' ||
    sourceChannelFilter !== 'all' ||
    dateFilter !== 'all' ||
    roleTypeFilter !== 'all' ||
    cgpaFilter !== 'all'

  const clearAllFilters = () => {
    setSearchQuery('')
    setLocationFilter('all')
    setVerdictFilter('all')
    setDateFilter('all')
    setFilter('all')
    setSourceChannelFilter('all')
    setRoleTypeFilter('all')
    setCgpaFilter('all')
    setSortBy('score')
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.removeItem(STORAGE_KEY_DASHBOARD)
      } catch {}
      window.history.replaceState(null, '', '/')
    }
  }

  const stats = useMemo(() => {
    if (!jobs)
      return { total: 0, applies: 0, bookmarked: 0, internships: 0, atsCount: 0, leadsCount: 0, avgScore: 0 }
    const scored = jobs.filter((j: any) => typeof j.job_analyses?.[0]?.match_score === 'number')
    const avgScore =
      scored.length > 0
        ? Math.round(scored.reduce((acc: number, j: any) => acc + (j.job_analyses[0].match_score || 0), 0) / scored.length)
        : 0
    return {
      total: jobs.length,
      applies: jobs.filter((j: any) => j.job_analyses?.[0]?.verdict === 'apply').length,
      bookmarked: jobs.filter((j: any) => j.is_bookmarked).length,
      internships: jobs.filter(isJobInternship).length,
      atsCount: jobs.filter((j: any) => j.source !== 'inbox').length,
      leadsCount: jobs.filter((j: any) => j.source === 'inbox').length,
      avgScore,
    }
  }, [jobs])

  if (!isLoaded || (isSignedIn && isLoading)) {
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-4 font-sans">
        <RefreshCcw className="w-7 h-7 text-[#5b5bd6] animate-spin" />
        <div className="text-[#918f9f] text-sm font-medium">Loading JobCopilot pipeline...</div>
      </div>
    )
  }

  if (!isSignedIn) {
    return (
      <div className="space-y-10 pb-16 font-sans">
        <div className="relative overflow-hidden rounded-2xl bg-[#1a1c20] border border-[#464553]/40 p-8 sm:p-14 text-center shadow-2xl">
          <div className="relative z-10 max-w-3xl mx-auto space-y-6">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#5b5bd6]/15 border border-[#5b5bd6]/30 text-[#c3c0ff] text-xs font-semibold tracking-wide uppercase">
              <Sparkles className="w-3.5 h-3.5 text-[#5b5bd6]" />
              <span>JobCopilot • Career Operating System</span>
            </div>

            <h1 className="text-3xl sm:text-5xl font-bold text-[#e2e2e8] tracking-tight leading-tight font-heading">
              Precision Job Discovery & <span className="text-[#c3c0ff]">AI Application Engine</span>
            </h1>

            <p className="text-[#918f9f] text-sm sm:text-base leading-relaxed max-w-2xl mx-auto">
              Continuous multi-ATS ingestion across Greenhouse, Lever, Ashby & Workday. Upfront match scoring, tailored
              resume generation, daily digests, and 1-click ATS auto-fill.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3.5 pt-2">
              <SignInButton mode="modal">
                <button className="bg-[#5b5bd6] hover:bg-[#4f4fc7] text-white font-semibold px-6 py-3 rounded-xl text-sm transition-all flex items-center gap-2 cursor-pointer">
                  <Zap className="w-4 h-4" />
                  <span>Sign In to Workspace</span>
                  <ArrowUpRight className="w-4 h-4" />
                </button>
              </SignInButton>

              <SignUpButton mode="modal">
                <button className="bg-[#282a2e] hover:bg-[#32343a] text-[#e2e2e8] border border-[#464553]/45 font-semibold px-6 py-3 rounded-xl text-sm transition-all cursor-pointer">
                  <span>Create Free Account</span>
                </button>
              </SignUpButton>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-[#1a1c20] p-6 rounded-xl border border-[#464553]/35 space-y-3">
            <div className="w-10 h-10 rounded-lg bg-[#5b5bd6]/15 border border-[#5b5bd6]/30 flex items-center justify-center text-[#c3c0ff]">
              <LayoutDashboard className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-[#e2e2e8] text-base font-heading">Live ATS Fleet</h3>
            <p className="text-xs text-[#918f9f] leading-relaxed">
              Auto-scrapes verified engineering & AI requisitions directly from official career boards.
            </p>
          </div>

          <div className="bg-[#1a1c20] p-6 rounded-xl border border-[#464553]/35 space-y-3">
            <div className="w-10 h-10 rounded-lg bg-[#ffb77e]/15 border border-[#ffb77e]/30 flex items-center justify-center text-[#ffb77e]">
              <Flame className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-[#e2e2e8] text-base font-heading">Daily Curated Digest</h3>
            <p className="text-xs text-[#918f9f] leading-relaxed">
              Curated daily dispatches filtering high-odds openings matching your target roles and salary floor.
            </p>
          </div>

          <div className="bg-[#1a1c20] p-6 rounded-xl border border-[#464553]/35 space-y-3">
            <div className="w-10 h-10 rounded-lg bg-[#45dfa4]/15 border border-[#45dfa4]/30 flex items-center justify-center text-[#45dfa4]">
              <ListTodo className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-[#e2e2e8] text-base font-heading">Pipeline Tracker</h3>
            <p className="text-xs text-[#918f9f] leading-relaxed">
              Unified Kanban application tracker with direct apply shortcuts and interview stage tracking.
            </p>
          </div>

          <div className="bg-[#1a1c20] p-6 rounded-xl border border-[#464553]/35 space-y-3">
            <div className="w-10 h-10 rounded-lg bg-[#5b5bd6]/15 border border-[#5b5bd6]/30 flex items-center justify-center text-[#c3c0ff]">
              <BrainCircuit className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-[#e2e2e8] text-base font-heading">AI Interview Coach</h3>
            <p className="text-xs text-[#918f9f] leading-relaxed">
              Interactive interview simulation, system design drills, and resume bullet tailoring per requisition.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-12 font-sans">
      {/* Unified Page Header */}
      <PageHeader
        suite="Discovery & Intelligence"
        title="Live Requisitions Feed"
        subtitle="Upfront match scores, academic & compensation metrics, and a collapsible feed with inline Copilot inspection."
        icon={LayoutDashboard}
        badge={`${stats.total} Indexed`}
        badgeColor="indigo"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => copilotOptimizeMutation.mutate()}
              disabled={copilotOptimizeMutation.isPending}
              className="bg-[#282a2e] border border-[#5b5bd6]/40 text-[#c3c0ff] hover:bg-[#5b5bd6]/20 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              title="Copilot Auto-Cleaner: Score unscored jobs, filter off-target noise, and deduplicate feed"
            >
              {copilotOptimizeMutation.isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#c3c0ff]" />
                  <span>Optimizing...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-[#5b5bd6]" />
                  <span>Copilot Optimize Feed</span>
                </>
              )}
            </button>
            <button
              onClick={() => syncJobsMutation.mutate()}
              disabled={syncJobsMutation.isPending}
              className="bg-[#45dfa4]/10 border border-[#45dfa4]/35 text-[#45dfa4] hover:bg-[#45dfa4]/20 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              title="Auto-fetch latest verified openings directly from Greenhouse, Lever & Ashby boards"
            >
              {syncJobsMutation.isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#45dfa4]" />
                  <span>Syncing ATS...</span>
                </>
              ) : (
                <>
                  <Zap className="w-3.5 h-3.5 text-[#45dfa4]" />
                  <span>Sync Live Openings</span>
                </>
              )}
            </button>
            <Link
              href="/tracker"
              className="bg-[#1a1c20] border border-[#464553]/40 text-[#e2e2e8] px-3.5 py-2 rounded-xl text-xs font-semibold hover:bg-[#282a2e] transition-all flex items-center gap-1.5"
            >
              <ListTodo className="w-3.5 h-3.5 text-[#5b5bd6]" />
              <span>Tracker ({applications?.length || 0})</span>
            </Link>
            <Link
              href="/jobs/new"
              className="bg-[#5b5bd6] hover:bg-[#4f4fc7] text-white px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Job</span>
            </Link>
          </div>
        }
      />

      {/* Sync Status Banner */}
      <AnimatePresence>
        {syncMessage && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="bg-[#45dfa4]/10 border border-[#45dfa4]/35 rounded-xl px-5 py-3 text-xs text-[#45dfa4] flex items-center justify-between"
          >
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-4 h-4 text-[#45dfa4] shrink-0" />
              <span className="font-semibold">{syncMessage}</span>
            </div>
            <button onClick={() => setSyncMessage(null)} className="text-[#918f9f] hover:text-[#e2e2e8]">
              <XCircle className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Upfront Interactive KPI Metrics Strip (4 Clear Metric Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Card 1: All Postings */}
        <button
          type="button"
          onClick={() => {
            setVerdictFilter('all')
            setFilter('all')
          }}
          className={`text-left p-4 rounded-xl flex items-center justify-between transition-all cursor-pointer border ${
            verdictFilter === 'all' && filter === 'all'
              ? 'bg-[#1a1c20] border-[#5b5bd6] ring-1 ring-[#5b5bd6]/30'
              : 'bg-[#1a1c20] border-[#464553]/35 hover:border-[#464553]/65'
          }`}
        >
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-[#5b5bd6]/12 border border-[#5b5bd6]/30 flex items-center justify-center text-[#c3c0ff]">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <div className="text-2xl font-bold text-[#e2e2e8] font-mono leading-none">{stats.total}</div>
              <div className="text-[11px] font-semibold text-[#918f9f] uppercase tracking-wider mt-1">
                All Postings
              </div>
              <div className="text-[10px] text-[#918f9f] font-mono mt-0.5">
                {stats.atsCount} ATS • {stats.leadsCount} Leads
              </div>
            </div>
          </div>
          <span
            className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-md border ${
              verdictFilter === 'all' && filter === 'all'
                ? 'bg-[#5b5bd6]/20 text-[#c3c0ff] border-[#5b5bd6]/40'
                : 'bg-[#0c0e12] text-[#918f9f] border-[#464553]/35'
            }`}
          >
            {verdictFilter === 'all' && filter === 'all' ? 'Active' : 'View'}
          </span>
        </button>

        {/* Card 2: High Fit (Apply) */}
        <button
          type="button"
          onClick={() => {
            if (verdictFilter === 'apply') {
              setVerdictFilter('all')
            } else {
              setVerdictFilter('apply')
              setFilter('all')
            }
          }}
          className={`text-left p-4 rounded-xl flex items-center justify-between transition-all cursor-pointer border ${
            verdictFilter === 'apply'
              ? 'bg-[#1a1c20] border-[#45dfa4] ring-1 ring-[#45dfa4]/30'
              : 'bg-[#1a1c20] border-[#464553]/35 hover:border-[#45dfa4]/50'
          }`}
        >
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-[#45dfa4]/12 border border-[#45dfa4]/30 flex items-center justify-center text-[#45dfa4]">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <div className="text-2xl font-bold text-[#45dfa4] font-mono leading-none">{stats.applies}</div>
              <div className="text-[11px] font-semibold text-[#918f9f] uppercase tracking-wider mt-1">
                High Fit (Apply)
              </div>
              <div className="text-[10px] text-[#918f9f] font-mono mt-0.5">Avg Fit: {stats.avgScore}%</div>
            </div>
          </div>
          <span
            className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-md border ${
              verdictFilter === 'apply'
                ? 'bg-[#45dfa4]/20 text-[#45dfa4] border-[#45dfa4]/40'
                : 'bg-[#0c0e12] text-[#918f9f] border-[#464553]/35'
            }`}
          >
            {verdictFilter === 'apply' ? 'Active' : 'Filter'}
          </span>
        </button>

        {/* Card 3: Internships */}
        <button
          type="button"
          onClick={() => {
            if (filter === 'internships') {
              setFilter('all')
            } else {
              setFilter('internships')
              setVerdictFilter('all')
            }
          }}
          className={`text-left p-4 rounded-xl flex items-center justify-between transition-all cursor-pointer border ${
            filter === 'internships'
              ? 'bg-[#1a1c20] border-[#c3c0ff] ring-1 ring-[#c3c0ff]/30'
              : 'bg-[#1a1c20] border-[#464553]/35 hover:border-[#5b5bd6]/50'
          }`}
        >
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-[#5b5bd6]/12 border border-[#5b5bd6]/30 flex items-center justify-center text-[#c3c0ff]">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <div className="text-2xl font-bold text-[#e2e2e8] font-mono leading-none">{stats.internships}</div>
              <div className="text-[11px] font-semibold text-[#918f9f] uppercase tracking-wider mt-1">
                Internships
              </div>
              <div className="text-[10px] text-[#918f9f] font-mono mt-0.5">0–1 Yr & Trainee</div>
            </div>
          </div>
          <span
            className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-md border ${
              filter === 'internships'
                ? 'bg-[#5b5bd6]/20 text-[#c3c0ff] border-[#5b5bd6]/40'
                : 'bg-[#0c0e12] text-[#918f9f] border-[#464553]/35'
            }`}
          >
            {filter === 'internships' ? 'Active' : 'Filter'}
          </span>
        </button>

        {/* Card 4: Bookmarked */}
        <button
          type="button"
          onClick={() => {
            if (filter === 'bookmarks') {
              setFilter('all')
            } else {
              setFilter('bookmarks')
              setVerdictFilter('all')
            }
          }}
          className={`text-left p-4 rounded-xl flex items-center justify-between transition-all cursor-pointer border ${
            filter === 'bookmarks'
              ? 'bg-[#1a1c20] border-[#ffb77e] ring-1 ring-[#ffb77e]/30'
              : 'bg-[#1a1c20] border-[#464553]/35 hover:border-[#ffb77e]/50'
          }`}
        >
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-[#ffb77e]/12 border border-[#ffb77e]/30 flex items-center justify-center text-[#ffb77e]">
              <Bookmark className="w-5 h-5" />
            </div>
            <div>
              <div className="text-2xl font-bold text-[#ffb77e] font-mono leading-none">{stats.bookmarked}</div>
              <div className="text-[11px] font-semibold text-[#918f9f] uppercase tracking-wider mt-1">
                Bookmarked
              </div>
              <div className="text-[10px] text-[#918f9f] font-mono mt-0.5">
                {applications?.length || 0} in Tracker
              </div>
            </div>
          </div>
          <span
            className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-md border ${
              filter === 'bookmarks'
                ? 'bg-[#ffb77e]/20 text-[#ffb77e] border-[#ffb77e]/40'
                : 'bg-[#0c0e12] text-[#918f9f] border-[#464553]/35'
            }`}
          >
            {filter === 'bookmarks' ? 'Active' : 'Filter'}
          </span>
        </button>
      </div>

      {/* Main Filter & Search Toolbar */}
      <div className="bg-[#1a1c20] p-4 sm:p-5 rounded-xl border border-[#464553]/35 space-y-3.5">
        {/* Row 1: Search and Primary Tabs */}
        <div className="flex flex-col md:flex-row gap-3.5 justify-between items-stretch md:items-center">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#918f9f]" />
            <input
              type="text"
              placeholder="Search by role, company, skills (Python, GenAI, React), or city..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#0c0e12] border border-[#464553]/45 rounded-xl pl-10 pr-14 py-2 text-xs sm:text-sm text-[#e2e2e8] placeholder:text-[#918f9f] focus:outline-none focus:border-[#5b5bd6] transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#918f9f] hover:text-[#e2e2e8] text-xs font-medium"
              >
                Clear
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            {[
              { id: 'all', label: 'All Jobs' },
              { id: 'internships', label: 'Internships' },
              { id: 'bookmarks', label: 'Saved' },
              { id: 'deadlines', label: 'Deadlines' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id as any)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 cursor-pointer border ${
                  filter === tab.id
                    ? 'bg-[#282a2e] text-[#e2e2e8] border-[#5b5bd6]/45'
                    : 'text-[#918f9f] hover:text-[#e2e2e8] hover:bg-[#282a2e]/50 border-transparent'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Row 1b: Source Channel Separation Switcher */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-[#464553]/25">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#918f9f] mr-1">
              Source Channel:
            </span>
            <button
              type="button"
              onClick={() => setSourceChannelFilter('all')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer border ${
                sourceChannelFilter === 'all'
                  ? 'bg-[#282a2e] text-[#e2e2e8] border-[#464553]/50'
                  : 'text-[#918f9f] hover:text-[#e2e2e8] border-transparent'
              }`}
            >
              All Sources ({stats.total})
            </button>
            <button
              type="button"
              onClick={() => setSourceChannelFilter('ats')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer border flex items-center gap-1.5 ${
                sourceChannelFilter === 'ats'
                  ? 'bg-[#5b5bd6]/15 text-[#c3c0ff] border-[#5b5bd6]/40'
                  : 'text-[#918f9f] hover:text-[#c3c0ff] border-transparent'
              }`}
            >
              <Zap className="w-3 h-3 text-[#5b5bd6]" />
              <span>Official ATS Fleet ({stats.atsCount})</span>
            </button>
            <button
              type="button"
              onClick={() => setSourceChannelFilter('leads')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer border flex items-center gap-1.5 ${
                sourceChannelFilter === 'leads'
                  ? 'bg-[#ffb77e]/15 text-[#ffb77e] border-[#ffb77e]/40'
                  : 'text-[#918f9f] hover:text-[#ffb77e] border-transparent'
              }`}
            >
              <span>Promoted Community Leads ({stats.leadsCount})</span>
            </button>
          </div>
          <Link
            href="/inbox"
            className="text-xs font-semibold text-[#c3c0ff] hover:text-white flex items-center gap-1"
          >
            <span>Open Lead Inbox & Triage →</span>
          </Link>
        </div>

        {/* Row 2: Location, Employment Type, CGPA Cutoff, Verdict, Date, and Sort Selectors */}
        <div className="flex flex-wrap items-center gap-2.5 pt-3 border-t border-[#464553]/25 text-xs">
          {/* Location Selector */}
          <div className="flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-[#918f9f]" />
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="bg-[#0c0e12] border border-[#464553]/45 text-[#e2e2e8] rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#5b5bd6] font-medium cursor-pointer text-xs"
            >
              <option value="all">All Locations</option>
              <option value="bengaluru">Bengaluru / Bangalore</option>
              <option value="noida">Noida / Delhi NCR</option>
              <option value="pune">Pune</option>
              <option value="hyderabad">Hyderabad</option>
              <option value="mumbai">Mumbai</option>
              <option value="remote">Remote</option>
              {availableLocations.map((loc) => {
                const lower = loc.toLowerCase()
                if (
                  [
                    'bengaluru',
                    'bangalore',
                    'mumbai',
                    'pune',
                    'hyderabad',
                    'delhi',
                    'noida',
                    'chennai',
                    'remote',
                    'pan india',
                  ].some((preset) => lower.includes(preset))
                ) {
                  return null
                }
                return (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                )
              })}
            </select>
          </div>

          {/* Role Type Filter */}
          <div className="flex items-center gap-1.5">
            <Briefcase className="w-3.5 h-3.5 text-[#5b5bd6]" />
            <select
              value={roleTypeFilter}
              onChange={(e: any) => setRoleTypeFilter(e.target.value)}
              className="bg-[#0c0e12] border border-[#464553]/45 text-[#e2e2e8] rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#5b5bd6] font-medium cursor-pointer text-xs"
            >
              <option value="all">All Role Types</option>
              <option value="internship">Internships Only</option>
              <option value="fulltime">Full-Time Only</option>
            </select>
          </div>

          {/* Academic CGPA Cutoff Filter */}
          <div className="flex items-center gap-1.5">
            <GraduationCap className="w-3.5 h-3.5 text-[#ffb77e]" />
            <select
              value={cgpaFilter}
              onChange={(e) => setCgpaFilter(e.target.value)}
              className="bg-[#0c0e12] border border-[#464553]/45 text-[#e2e2e8] rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#5b5bd6] font-medium cursor-pointer text-xs"
            >
              <option value="all">All CGPA Criteria</option>
              <option value="nocutoff">No CGPA Cutoff (Open to all)</option>
              <option value="7.0">Eligible with &gt;= 7.0 CGPA</option>
              <option value="7.5">Eligible with &gt;= 7.5 CGPA</option>
              <option value="8.0">Eligible with &gt;= 8.0 CGPA</option>
            </select>
          </div>

          {/* Verdict Filter */}
          <div className="flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-[#45dfa4]" />
            <select
              value={verdictFilter}
              onChange={(e) => setVerdictFilter(e.target.value)}
              className="bg-[#0c0e12] border border-[#464553]/45 text-[#e2e2e8] rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#5b5bd6] font-medium cursor-pointer text-xs"
            >
              <option value="all">All Verdicts</option>
              <option value="apply">Apply Only (High Fit)</option>
              <option value="stretch">Stretch Roles</option>
              <option value="skip">Skip Roles</option>
            </select>
          </div>

          {/* Date Filter */}
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-[#918f9f]" />
            <select
              value={dateFilter}
              onChange={(e: any) => setDateFilter(e.target.value)}
              className="bg-[#0c0e12] border border-[#464553]/45 text-[#e2e2e8] rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#5b5bd6] font-medium cursor-pointer text-xs"
            >
              <option value="all">All Dates</option>
              <option value="24h">Past 24 Hours</option>
              <option value="3d">Past 3 Days</option>
              <option value="7d">Past 7 Days</option>
              <option value="14d">Past 14 Days</option>
              <option value="30d">Past 30 Days</option>
            </select>
          </div>

          {/* Sort Selector */}
          <div className="flex items-center gap-1.5 ml-auto">
            <SlidersHorizontal className="w-3.5 h-3.5 text-[#918f9f]" />
            <span className="text-[#918f9f] font-semibold uppercase tracking-wider text-[10px]">Sort:</span>
            <select
              value={sortBy}
              onChange={(e: any) => setSortBy(e.target.value)}
              className="bg-[#0c0e12] border border-[#464553]/45 text-[#e2e2e8] rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#5b5bd6] font-medium cursor-pointer text-xs"
            >
              <option value="score">Highest Match Score</option>
              <option value="newest">Newest (Date Posted)</option>
              <option value="oldest">Oldest Postings</option>
              <option value="deadline">Upcoming Deadline</option>
              <option value="salary">Highest Compensation</option>
            </select>
          </div>

          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              className="text-[11px] text-[#c3c0ff] hover:text-white font-semibold uppercase px-2.5 py-1 rounded-md bg-[#5b5bd6]/15 border border-[#5b5bd6]/30 transition-colors cursor-pointer"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Active Filter Status & Collapsible Feed Controls */}
      <div className="flex flex-wrap items-center justify-between text-xs text-[#918f9f] px-1 font-medium gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span>
            Showing <strong className="text-[#e2e2e8] font-mono">{filteredJobs.length}</strong> of{' '}
            <span className="font-mono">{jobs?.length || 0}</span> analyzed postings
          </span>
          {verdictFilter === 'apply' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-[#45dfa4]/10 text-[#45dfa4] border border-[#45dfa4]/30 font-semibold text-[11px]">
              High Fit Only
              <button onClick={() => setVerdictFilter('all')} className="hover:text-white cursor-pointer">
                ✕
              </button>
            </span>
          )}
          {filter === 'bookmarks' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-[#ffb77e]/10 text-[#ffb77e] border border-[#ffb77e]/30 font-semibold text-[11px]">
              Bookmarked Only
              <button onClick={() => setFilter('all')} className="hover:text-white cursor-pointer">
                ✕
              </button>
            </span>
          )}
          {filter === 'internships' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-[#5b5bd6]/15 text-[#c3c0ff] border border-[#5b5bd6]/35 font-semibold text-[11px]">
              Internships Only
              <button onClick={() => setFilter('all')} className="hover:text-white cursor-pointer">
                ✕
              </button>
            </span>
          )}
        </div>

        {/* Collapsible Feed Toggle when viewing a job */}
        {activeJob && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsFeedCollapsed((prev) => !prev)}
              className="px-3 py-1.5 rounded-lg bg-[#1a1c20] hover:bg-[#282a2e] border border-[#464553]/45 text-[#e2e2e8] text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
              title={isFeedCollapsed ? 'Expand Jobs Feed Sidebar' : 'Collapse Jobs Feed to focus on selected role'}
            >
              {isFeedCollapsed ? (
                <>
                  <PanelLeft className="w-3.5 h-3.5 text-[#5b5bd6]" />
                  <span>Expand Feed ({filteredJobs.length})</span>
                </>
              ) : (
                <>
                  <PanelLeftClose className="w-3.5 h-3.5 text-[#5b5bd6]" />
                  <span>Collapse Feed</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveJobId(null)
                setIsFeedCollapsed(false)
              }}
              className="px-3 py-1.5 rounded-lg bg-[#1a1c20] hover:bg-[#282a2e] border border-[#464553]/45 text-[#918f9f] hover:text-[#e2e2e8] text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Close Job View</span>
            </button>
          </div>
        )}
      </div>

      {/* Main Split Workspace: Collapsible Feed + Selected Job Inspection & Copilot Drawer */}
      {!jobs || jobs.length === 0 ? (
        <div className="text-center py-20 bg-[#1a1c20] rounded-2xl border border-[#464553]/35 p-8 sm:p-12 space-y-5">
          <div className="w-12 h-12 rounded-xl bg-[#5b5bd6]/15 border border-[#5b5bd6]/30 flex items-center justify-center text-[#c3c0ff] mx-auto">
            <Zap className="w-6 h-6" />
          </div>
          <div className="space-y-2 max-w-md mx-auto">
            <h2 className="text-xl font-bold text-[#e2e2e8] tracking-tight font-heading">
              Your Requisition Pipeline is Ready
            </h2>
            <p className="text-[#918f9f] text-sm leading-relaxed">
              No live job requisitions have been loaded yet. Trigger an autonomous ATS sync across verified company
              boards, or add a job link.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              onClick={() => syncJobsMutation.mutate()}
              disabled={syncJobsMutation.isPending}
              className="bg-[#5b5bd6] hover:bg-[#4f4fc7] text-white font-semibold px-5 py-2.5 rounded-xl text-xs transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {syncJobsMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Syncing ATS Openings...</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  <span>Sync Live Openings</span>
                </>
              )}
            </button>
            <Link
              href="/jobs/new"
              className="bg-[#282a2e] hover:bg-[#32343a] text-[#e2e2e8] font-semibold px-4 py-2.5 rounded-xl text-xs border border-[#464553]/45 transition-all flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Add Custom Job</span>
            </Link>
          </div>
        </div>
      ) : filteredJobs.length === 0 ? (
        <div className="text-center py-20 bg-[#1a1c20] rounded-2xl border border-[#464553]/35 space-y-4">
          <Search className="w-10 h-10 text-[#918f9f] mx-auto" />
          <h2 className="text-lg font-bold text-[#e2e2e8] font-heading">No jobs matched your filters</h2>
          <p className="text-[#918f9f] text-xs max-w-sm mx-auto">
            Try adjusting your search terms, changing the location filter, or toggling between internships and full-time
            roles.
          </p>
          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              className="mt-2 text-xs bg-[#282a2e] hover:bg-[#32343a] text-[#e2e2e8] font-semibold px-5 py-2.5 rounded-xl transition-all inline-block cursor-pointer"
            >
              Reset All Filters
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-5 items-start">
          {/* LEFT PANE: Collapsible / Compactable Jobs Feed */}
          {!isFeedCollapsed && (
            <div
              className={`w-full transition-all duration-300 ${
                activeJob
                  ? 'lg:w-[390px] xl:w-[420px] shrink-0 lg:max-h-[calc(100vh-140px)] lg:overflow-y-auto custom-scrollbar lg:pr-1.5 space-y-2.5'
                  : 'space-y-3.5'
              }`}
            >
              {filteredJobs.map((job: any) => {
                const analysis = job.job_analyses && job.job_analyses[0]
                const score = analysis?.match_score ?? null
                const verdict = analysis?.verdict || 'evaluated'
                const currentStatus = trackedJobIdMap[job.id]
                const isIntern = isJobInternship(job)
                const cgpaCutoff = getJobCgpaCutoff(job)
                const isSelected = activeJob?.id === job.id

                const scoreBoxStyle =
                  score !== null && score >= 80
                    ? 'bg-[#45dfa4]/10 border-[#45dfa4]/35 text-[#45dfa4]'
                    : score !== null && score >= 55
                    ? 'bg-[#ffb77e]/10 border-[#ffb77e]/35 text-[#ffb77e]'
                    : 'bg-[#0c0e12] border-[#464553]/45 text-[#918f9f]'

                const verdictBadgeStyle =
                  verdict === 'apply'
                    ? 'bg-[#45dfa4]/12 text-[#45dfa4] border-[#45dfa4]/35'
                    : verdict === 'stretch'
                    ? 'bg-[#ffb77e]/12 text-[#ffb77e] border-[#ffb77e]/35'
                    : verdict === 'skip'
                    ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                    : 'bg-[#282a2e] text-[#918f9f] border-[#464553]/45'

                // Compact Feed Card when a Job is being viewed on the right
                if (activeJob) {
                  return (
                    <div
                      key={job.id}
                      onClick={() => setActiveJobId(job.id)}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center gap-3.5 ${
                        isSelected
                          ? 'bg-[#282a2e] border-[#5b5bd6] ring-1 ring-[#5b5bd6]/35'
                          : 'bg-[#1a1c20] border-[#464553]/35 hover:border-[#464553]/70'
                      }`}
                    >
                      {/* Upfront Score Box */}
                      <div
                        className={`w-13 h-13 rounded-xl border flex flex-col items-center justify-center shrink-0 ${scoreBoxStyle}`}
                      >
                        <span className="text-base font-bold font-mono leading-none">
                          {score !== null ? score : '--'}
                        </span>
                        <span className="text-[9px] font-semibold uppercase tracking-wider mt-0.5 opacity-80">
                          Match
                        </span>
                      </div>

                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-xs sm:text-sm font-bold text-[#e2e2e8] truncate font-heading">
                            {cleanTitle(job.role_title)}
                          </h3>
                          <span
                            className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border shrink-0 ${verdictBadgeStyle}`}
                          >
                            {verdict}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-[#918f9f] truncate">
                          <span className="font-semibold text-[#e2e2e8] truncate">{job.company}</span>
                          <span>•</span>
                          <span className="truncate">{job.location || 'Remote'}</span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                          {job.pay_min && (
                            <span className="text-[10px] font-mono text-[#45dfa4] font-semibold">
                              ₹{(job.pay_min / 100000).toFixed(1)}L
                              {job.pay_max ? `–${(job.pay_max / 100000).toFixed(1)}L` : ''}
                            </span>
                          )}
                          {isIntern && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#5b5bd6]/15 text-[#c3c0ff] border border-[#5b5bd6]/30 font-medium">
                              Intern
                            </span>
                          )}
                          {currentStatus && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#282a2e] text-[#c3c0ff] border border-[#464553]/45 uppercase font-semibold">
                              {currentStatus}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                }

                // Full Upfront Metrics Job Card when Feed is Expanded
                return (
                  <div
                    key={job.id}
                    onClick={() => setActiveJobId(job.id)}
                    className="bg-[#1a1c20] p-4 sm:p-5 rounded-xl border border-[#464553]/35 hover:border-[#5b5bd6]/55 transition-all cursor-pointer flex flex-col xl:flex-row xl:items-center justify-between gap-4 group"
                  >
                    <div className="flex items-start gap-4 flex-1 min-w-0">
                      {/* UPFRONT MATCH SCORE METRIC BOX */}
                      <div
                        className={`w-16 h-16 sm:w-[70px] sm:h-[70px] rounded-xl border flex flex-col items-center justify-center shrink-0 ${scoreBoxStyle}`}
                        title={
                          score !== null
                            ? `AI Match Score: ${score}% (${verdict.toUpperCase()})`
                            : 'Click to view & score'
                        }
                      >
                        <div className="text-xl sm:text-2xl font-bold font-mono tracking-tight leading-none">
                          {score !== null ? score : '--'}
                        </div>
                        <div className="text-[9px] uppercase tracking-widest font-bold mt-1 opacity-85">Match</div>
                      </div>

                      {/* Job Details & Clear Upfront Metrics */}
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-base sm:text-lg text-[#e2e2e8] group-hover:text-[#c3c0ff] transition-colors tracking-tight line-clamp-1 font-heading">
                            {cleanTitle(job.role_title)}
                          </span>

                          {analysis && (
                            <span
                              className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border shrink-0 ${verdictBadgeStyle}`}
                            >
                              {analysis.verdict}
                            </span>
                          )}

                          {currentStatus && (
                            <span className="px-2.5 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider bg-[#5b5bd6]/15 text-[#c3c0ff] border border-[#5b5bd6]/30 flex items-center gap-1 shrink-0">
                              <ListTodo className="w-3 h-3" /> {currentStatus}
                            </span>
                          )}
                        </div>

                        {/* Upfront Metrics Pill Row */}
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0c0e12] border border-[#464553]/40 text-[#e2e2e8] font-semibold shrink-0">
                            <Building2 className="w-3.5 h-3.5 text-[#5b5bd6] shrink-0" />
                            <span className="truncate max-w-[160px]">{job.company}</span>
                          </span>

                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0c0e12] border border-[#464553]/40 text-[#918f9f] shrink-0">
                            <MapPin className="w-3.5 h-3.5 text-[#918f9f] shrink-0" />
                            <span className="truncate max-w-[160px]">{job.location || 'Location Unspecified'}</span>
                          </span>

                          {job.pay_min && (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-[#45dfa4]/10 border border-[#45dfa4]/30 text-[#45dfa4] font-mono font-semibold shrink-0">
                              ₹{(job.pay_min / 100000).toFixed(1)}L{' '}
                              {job.pay_max ? `– ${(job.pay_max / 100000).toFixed(1)}L` : ''}
                            </span>
                          )}

                          {isIntern && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#5b5bd6]/15 border border-[#5b5bd6]/30 text-[#c3c0ff] font-semibold shrink-0">
                              <GraduationCap className="w-3.5 h-3.5 text-[#c3c0ff] shrink-0" />
                              <span>Internship</span>
                            </span>
                          )}

                          {cgpaCutoff ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#ffb77e]/12 border border-[#ffb77e]/30 text-[#ffb77e] font-semibold font-mono shrink-0">
                              <span>Min {cgpaCutoff} CGPA</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0c0e12] border border-[#464553]/35 text-[#918f9f] shrink-0">
                              <span>No CGPA Cutoff</span>
                            </span>
                          )}

                          {(() => {
                            const dateInfo = formatJobDate(job.posting_date || job.first_seen_at || job.fetched_at)
                            if (!dateInfo) return null
                            return (
                              <span
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border shrink-0 font-mono text-[11px] ${
                                  dateInfo.isNew
                                    ? 'bg-[#45dfa4]/10 text-[#45dfa4] border-[#45dfa4]/30 font-semibold'
                                    : 'bg-[#0c0e12] text-[#918f9f] border-[#464553]/35'
                                }`}
                              >
                                <Calendar className="w-3 h-3 shrink-0" />
                                <span>{dateInfo.label}</span>
                                {dateInfo.isNew && (
                                  <span className="px-1 py-0.2 text-[9px] font-bold uppercase tracking-wider bg-[#45dfa4] text-[#0c0e12] rounded">
                                    NEW
                                  </span>
                                )}
                              </span>
                            )
                          })()}

                          {job.source === 'inbox' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#ffb77e]/12 border border-[#ffb77e]/30 text-[#ffb77e] text-[10px] font-semibold tracking-wider uppercase shrink-0">
                              Community Lead
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#5b5bd6]/12 border border-[#5b5bd6]/30 text-[#c3c0ff] text-[10px] font-semibold tracking-wider uppercase shrink-0">
                              {job.source_type && job.source_type !== 'manual' ? job.source_type : 'Official ATS'}
                            </span>
                          )}

                          {job.deadline && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#ffb77e]/10 border border-[#ffb77e]/30 text-[#ffb77e] shrink-0 font-mono text-[11px]">
                              <Clock className="w-3 h-3 shrink-0" />
                              <span>{new Date(job.deadline).toLocaleDateString()}</span>
                            </span>
                          )}
                        </div>

                        {/* Upfront Reasoning / Best Resume Metric Line */}
                        {(analysis?.recommended_resume_title || analysis?.reasoning) && (
                          <div className="flex flex-wrap items-center gap-2 pt-0.5 text-xs text-[#918f9f]">
                            {analysis?.recommended_resume_title && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#c3c0ff] bg-[#0c0e12] border border-[#464553]/35 px-2 py-0.5 rounded-md">
                                <FileText className="w-3 h-3 text-[#5b5bd6]" />
                                <span>Best Variant: {analysis.recommended_resume_title}</span>
                              </span>
                            )}
                            {analysis?.reasoning && (
                              <span className="text-[11px] text-[#918f9f] line-clamp-1">{analysis.reasoning}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Action Buttons Cluster */}
                    <div
                      className="flex items-center gap-1.5 shrink-0 justify-between sm:justify-end flex-wrap xl:flex-nowrap pt-3 xl:pt-0 border-t xl:border-t-0 border-[#464553]/25"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => setActiveJobId(job.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#282a2e] hover:bg-[#32343a] text-[#e2e2e8] border border-[#464553]/45 transition-all cursor-pointer"
                        title="Inspect job inline and collapse feed"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-[#5b5bd6]" />
                        <span>Inspect</span>
                      </button>

                      <button
                        onClick={() =>
                          trackMutation.mutate({
                            job,
                            status: currentStatus ? (currentStatus === 'applied' ? 'interview' : 'applied') : 'saved',
                          })
                        }
                        disabled={trackMutation.isPending}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer border ${
                          currentStatus
                            ? 'bg-[#5b5bd6]/15 text-[#c3c0ff] border-[#5b5bd6]/35'
                            : 'bg-[#0c0e12] hover:bg-[#282a2e] text-[#e2e2e8] border-[#464553]/45'
                        }`}
                      >
                        <ListTodo className="w-3.5 h-3.5 text-[#918f9f]" />
                        <span>{currentStatus ? currentStatus.toUpperCase() : 'Track'}</span>
                      </button>

                      <Link
                        href={`/jobs/${job.id}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-[#0c0e12] hover:bg-[#282a2e] text-[#918f9f] hover:text-[#e2e2e8] border border-[#464553]/45 transition-all shrink-0"
                        title="Open dedicated full-page Job Studio"
                      >
                        <span>Full Page</span>
                      </Link>

                      <button
                        onClick={async () => {
                          const newBm = !job.is_bookmarked
                          await apiFetch(`/api/jobs/${job.id}/bookmark`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ is_bookmarked: newBm }),
                          })
                          refetchJobs()
                        }}
                        className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                          job.is_bookmarked
                            ? 'bg-[#ffb77e]/15 border-[#ffb77e]/40 text-[#ffb77e]'
                            : 'border-[#464553]/45 bg-[#0c0e12] text-[#918f9f] hover:text-[#ffb77e]'
                        }`}
                        title={job.is_bookmarked ? 'Remove bookmark' : 'Bookmark job'}
                      >
                        <Bookmark className={`w-3.5 h-3.5 ${job.is_bookmarked ? 'fill-[#ffb77e]' : ''}`} />
                      </button>

                      {(job.official_apply_url || job.url) && (
                        <button
                          onClick={() =>
                            autoApplyMutation.mutate({ url: job.official_apply_url || job.url, jobId: job.id })
                          }
                          disabled={autoApplyMutation.isPending}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-[#45dfa4]/12 hover:bg-[#45dfa4]/20 text-[#45dfa4] border border-[#45dfa4]/35 transition-all cursor-pointer disabled:opacity-50 shrink-0"
                          title="Open Copilot Auto-Fill Launchpad"
                        >
                          <Zap className="w-3.5 h-3.5 shrink-0" />
                          <span>Auto-Fill</span>
                        </button>
                      )}

                      {(job.official_apply_url || job.url) && (
                        <a
                          href={job.official_apply_url || job.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#5b5bd6] hover:bg-[#4f4fc7] text-white text-xs font-semibold rounded-lg transition-all shrink-0"
                        >
                          <span>Apply</span>
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </a>
                      )}

                      <button
                        onClick={() => {
                          if (confirm(`Remove "${cleanTitle(job.role_title)}" at ${job.company} from your feed?`)) {
                            deleteJobMutation.mutate(job.id)
                          }
                        }}
                        disabled={deleteJobMutation.isPending}
                        className="p-1.5 rounded-lg border border-transparent hover:border-rose-500/30 text-[#918f9f] hover:text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer shrink-0"
                        title="Dismiss job"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* RIGHT PANE: Inline Job Viewer & 4-Tab Copilot Studio (Opens when a job is clicked) */}
          {activeJob && (
            <div className="flex-1 min-w-0 w-full bg-[#1a1c20] border border-[#464553]/45 rounded-2xl overflow-hidden shadow-2xl sticky top-5">
              {(() => {
                const analysis = activeJob.job_analyses && activeJob.job_analyses[0]
                const score = analysis?.match_score ?? null
                const verdict = analysis?.verdict || 'evaluated'
                const applyUrl = activeJob.official_apply_url || activeJob.url
                const cgpaCutoff = getJobCgpaCutoff(activeJob)
                const isIntern = isJobInternship(activeJob)

                return (
                  <div className="flex flex-col max-h-[calc(100vh-120px)]">
                    {/* Inspector Top Bar */}
                    <div className="p-5 bg-[#14161a] border-b border-[#464553]/35 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-start gap-3.5 min-w-0">
                        <div
                          className={`w-14 h-14 rounded-xl border flex flex-col items-center justify-center shrink-0 ${
                            score !== null && score >= 80
                              ? 'bg-[#45dfa4]/10 border-[#45dfa4]/35 text-[#45dfa4]'
                              : score !== null && score >= 55
                              ? 'bg-[#ffb77e]/10 border-[#ffb77e]/35 text-[#ffb77e]'
                              : 'bg-[#0c0e12] border-[#464553]/45 text-[#918f9f]'
                          }`}
                        >
                          <span className="text-xl font-bold font-mono leading-none">
                            {score !== null ? score : '--'}
                          </span>
                          <span className="text-[9px] uppercase font-bold tracking-wider mt-0.5">Match</span>
                        </div>

                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h2 className="text-lg font-bold text-[#e2e2e8] truncate font-heading">
                              {cleanTitle(activeJob.role_title)}
                            </h2>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                                verdict === 'apply'
                                  ? 'bg-[#45dfa4]/12 text-[#45dfa4] border-[#45dfa4]/35'
                                  : verdict === 'stretch'
                                  ? 'bg-[#ffb77e]/12 text-[#ffb77e] border-[#ffb77e]/35'
                                  : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                              }`}
                            >
                              {verdict}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2.5 text-xs text-[#918f9f]">
                            <span className="font-semibold text-[#e2e2e8] flex items-center gap-1">
                              <Building2 className="w-3.5 h-3.5 text-[#5b5bd6]" /> {activeJob.company}
                            </span>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5" /> {activeJob.location || 'Remote / Unspecified'}
                            </span>
                            {activeJob.pay_min && (
                              <>
                                <span>•</span>
                                <span className="text-[#45dfa4] font-mono font-semibold">
                                  ₹{(activeJob.pay_min / 100000).toFixed(1)}L
                                  {activeJob.pay_max ? `–${(activeJob.pay_max / 100000).toFixed(1)}L` : ''}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setIsFeedCollapsed((prev) => !prev)}
                          className="px-3 py-1.5 rounded-lg bg-[#1a1c20] hover:bg-[#282a2e] border border-[#464553]/45 text-[#e2e2e8] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                          title={isFeedCollapsed ? 'Show Jobs Feed list' : 'Hide Jobs Feed list for full-width view'}
                        >
                          {isFeedCollapsed ? (
                            <>
                              <PanelLeft className="w-3.5 h-3.5 text-[#5b5bd6]" />
                              <span>Show Feed</span>
                            </>
                          ) : (
                            <>
                              <PanelLeftClose className="w-3.5 h-3.5 text-[#5b5bd6]" />
                              <span>Hide Feed</span>
                            </>
                          )}
                        </button>

                        <Link
                          href={`/jobs/${activeJob.id}`}
                          className="px-3 py-1.5 rounded-lg bg-[#1a1c20] hover:bg-[#282a2e] border border-[#464553]/45 text-[#c3c0ff] text-xs font-semibold flex items-center gap-1"
                        >
                          <span>Full Studio</span>
                          <ExternalLink className="w-3 h-3" />
                        </Link>

                        {applyUrl && (
                          <a
                            href={applyUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3.5 py-1.5 rounded-lg bg-[#5b5bd6] hover:bg-[#4f4fc7] text-white text-xs font-semibold flex items-center gap-1"
                          >
                            <span>Apply</span>
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          </a>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            setActiveJobId(null)
                            setIsFeedCollapsed(false)
                          }}
                          className="p-1.5 rounded-lg text-[#918f9f] hover:text-[#e2e2e8] hover:bg-[#282a2e] cursor-pointer"
                          title="Close inspector"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* 4-Tab Bar inside Job Viewer */}
                    <div className="px-5 pt-2.5 bg-[#14161a] border-b border-[#464553]/35 flex items-center gap-2 overflow-x-auto no-scrollbar">
                      {[
                        { id: 'overview', label: 'Fit Metrics & JD' },
                        { id: 'autofill', label: 'Auto-Fill Kit' },
                        { id: 'tailor', label: 'Tailor Resume' },
                        { id: 'coach', label: 'AI Coach' },
                      ].map((t) => (
                        <button
                          key={t.id}
                          onClick={() => setInspectorTab(t.id as any)}
                          className={`px-3.5 py-2 text-xs font-semibold border-b-2 transition-all cursor-pointer shrink-0 ${
                            inspectorTab === t.id
                              ? 'border-[#5b5bd6] text-[#e2e2e8]'
                              : 'border-transparent text-[#918f9f] hover:text-[#e2e2e8]'
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>

                    {/* Tab Body */}
                    <div className="p-5 overflow-y-auto custom-scrollbar space-y-5 flex-1">
                      {inspectorTab === 'overview' && (
                        <div className="space-y-5">
                          {/* Upfront Metric Grid */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className="bg-[#0c0e12] p-3.5 rounded-xl border border-[#464553]/35">
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#918f9f] block">
                                Match Score
                              </span>
                              <span className="text-lg font-bold font-mono text-[#45dfa4] mt-0.5 block">
                                {score !== null ? `${score}%` : 'Pending'}
                              </span>
                            </div>
                            <div className="bg-[#0c0e12] p-3.5 rounded-xl border border-[#464553]/35">
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#918f9f] block">
                                Role Track
                              </span>
                              <span className="text-xs font-semibold text-[#e2e2e8] mt-1 block">
                                {isIntern ? 'Internship / Trainee' : activeJob.seniority_required || 'Full-Time'}
                              </span>
                            </div>
                            <div className="bg-[#0c0e12] p-3.5 rounded-xl border border-[#464553]/35">
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#918f9f] block">
                                Academic Cutoff
                              </span>
                              <span className="text-xs font-semibold font-mono text-[#ffb77e] mt-1 block">
                                {cgpaCutoff ? `Min ${cgpaCutoff} CGPA` : 'No CGPA Cutoff'}
                              </span>
                            </div>
                            <div className="bg-[#0c0e12] p-3.5 rounded-xl border border-[#464553]/35">
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#918f9f] block">
                                Best Resume
                              </span>
                              <span className="text-xs font-semibold text-[#c3c0ff] mt-1 block truncate">
                                {analysis?.recommended_resume_title || 'Primary Resume'}
                              </span>
                            </div>
                          </div>

                          {/* AI Fit Summary */}
                          {analysis?.reasoning && (
                            <div className="bg-[#0c0e12] p-4 rounded-xl border border-[#464553]/35 space-y-1.5">
                              <div className="text-[11px] font-semibold uppercase tracking-wider text-[#c3c0ff] flex items-center gap-1.5">
                                <Sparkles className="w-3.5 h-3.5 text-[#5b5bd6]" /> Why It Fits Your Profile
                              </div>
                              <p className="text-xs text-[#e2e2e8] leading-relaxed">{analysis.reasoning}</p>
                            </div>
                          )}

                          {/* Matched & Missing Skills */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                            <div className="bg-[#0c0e12] p-4 rounded-xl border border-[#464553]/35 space-y-2">
                              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#45dfa4] block">
                                Matched Core Skills
                              </span>
                              <div className="flex flex-wrap gap-1.5">
                                {(analysis?.matched_skills || activeJob.required_skills || []).length > 0 ? (
                                  (analysis?.matched_skills || activeJob.required_skills || []).map(
                                    (s: string, idx: number) => (
                                      <span
                                        key={idx}
                                        className="px-2 py-0.5 rounded-md bg-[#45dfa4]/10 border border-[#45dfa4]/30 text-[#45dfa4] text-[11px] font-medium"
                                      >
                                        {s}
                                      </span>
                                    )
                                  )
                                ) : (
                                  <span className="text-xs text-[#918f9f]">Aligned with your primary tech stack</span>
                                )}
                              </div>
                            </div>

                            <div className="bg-[#0c0e12] p-4 rounded-xl border border-[#464553]/35 space-y-2">
                              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#ffb77e] block">
                                Skill / Keyword Gaps
                              </span>
                              <div className="flex flex-wrap gap-1.5">
                                {(analysis?.missing_skills || []).length > 0 ? (
                                  (analysis?.missing_skills || []).map((s: string, idx: number) => (
                                    <span
                                      key={idx}
                                      className="px-2 py-0.5 rounded-md bg-[#ffb77e]/10 border border-[#ffb77e]/30 text-[#ffb77e] text-[11px] font-medium"
                                    >
                                      {s}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-xs text-[#918f9f]">No critical skill gaps detected</span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Raw JD Preview */}
                          <div className="bg-[#0c0e12] p-4 rounded-xl border border-[#464553]/35 space-y-2">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#918f9f] block">
                              Requisition Description
                            </span>
                            <div className="text-xs text-[#e2e2e8]/90 leading-relaxed whitespace-pre-wrap max-h-72 overflow-y-auto custom-scrollbar pr-2">
                              {activeJob.raw_jd || 'No full description text stored for this requisition.'}
                            </div>
                          </div>
                        </div>
                      )}

                      {inspectorTab === 'autofill' && (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <h3 className="text-sm font-bold text-[#e2e2e8] font-heading">
                                Candidate Auto-Fill Identity Kit
                              </h3>
                              <p className="text-xs text-[#918f9f]">
                                1-click copy fields or launch the full Auto-Fill modal with bookmarklet script.
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={handleSyncIdentityFromResume}
                                disabled={isSyncingResume}
                                className="px-3 py-1.5 rounded-lg bg-[#282a2e] hover:bg-[#32343a] border border-[#464553]/45 text-xs font-semibold text-[#c3c0ff] cursor-pointer"
                              >
                                {isSyncingResume ? 'Syncing...' : 'Sync from Resume'}
                              </button>
                              {applyUrl && (
                                <button
                                  onClick={() => autoApplyMutation.mutate({ url: applyUrl, jobId: activeJob.id })}
                                  className="px-3 py-1.5 rounded-lg bg-[#5b5bd6] hover:bg-[#4f4fc7] text-white text-xs font-semibold cursor-pointer"
                                >
                                  Open Full Launchpad
                                </button>
                              )}
                            </div>
                          </div>

                          {loadingInspectorAutoFill ? (
                            <div className="py-10 text-center text-xs text-[#918f9f]">
                              Preparing Auto-Fill identity tokens...
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                              {[
                                { label: 'Full Name', value: inspectorAutoFill?.candidate?.full_name },
                                { label: 'Email', value: inspectorAutoFill?.candidate?.email },
                                { label: 'Phone', value: inspectorAutoFill?.candidate?.phone },
                                { label: 'Location', value: inspectorAutoFill?.candidate?.location },
                                { label: 'LinkedIn', value: inspectorAutoFill?.candidate?.linkedin_url },
                                { label: 'GitHub', value: inspectorAutoFill?.candidate?.github_url },
                                { label: 'Portfolio', value: inspectorAutoFill?.candidate?.portfolio_url },
                                {
                                  label: 'Recommended Resume',
                                  value:
                                    inspectorAutoFill?.recommended_resume?.title || analysis?.recommended_resume_title,
                                },
                              ].map((f) => (
                                <div
                                  key={f.label}
                                  onClick={() => copyText(f.label, f.value)}
                                  className="p-3 rounded-xl bg-[#0c0e12] border border-[#464553]/35 hover:border-[#5b5bd6]/50 flex items-center justify-between gap-2 cursor-pointer"
                                >
                                  <div className="min-w-0">
                                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[#918f9f] block">
                                      {f.label}
                                    </span>
                                    <span className="text-xs font-mono text-[#e2e2e8] truncate block mt-0.5">
                                      {f.value || 'Not set'}
                                    </span>
                                  </div>
                                  {copiedKey === f.label ? (
                                    <Check className="w-3.5 h-3.5 text-[#45dfa4] shrink-0" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5 text-[#918f9f] shrink-0" />
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          {inspectorAutoFill?.tailored_pitch && (
                            <div className="p-4 rounded-xl bg-[#0c0e12] border border-[#464553]/35 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#c3c0ff]">
                                  Tailored Recruiter Pitch / Cover Note
                                </span>
                                <button
                                  onClick={() => copyText('pitch', inspectorAutoFill.tailored_pitch)}
                                  className="text-xs text-[#c3c0ff] hover:text-white flex items-center gap-1"
                                >
                                  {copiedKey === 'pitch' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                  <span>{copiedKey === 'pitch' ? 'Copied' : 'Copy'}</span>
                                </button>
                              </div>
                              <p className="text-xs text-[#e2e2e8] leading-relaxed">
                                {inspectorAutoFill.tailored_pitch}
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      {inspectorTab === 'tailor' && (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <h3 className="text-sm font-bold text-[#e2e2e8] font-heading">
                                Quantified Resume Bullet Generator
                              </h3>
                              <p className="text-xs text-[#918f9f]">
                                Generate role-aligned impact bullets for {activeJob.company}.
                              </p>
                            </div>
                            <button
                              onClick={handleRunInlineTailor}
                              disabled={tailoringInline}
                              className="px-4 py-2 rounded-lg bg-[#5b5bd6] hover:bg-[#4f4fc7] text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                            >
                              {tailoringInline ? 'Generating...' : 'Generate Tailored Bullets'}
                            </button>
                          </div>

                          {tailorResult ? (
                            <div className="space-y-2.5">
                              {(tailorResult.tailored_bullets || tailorResult.bullets || []).map(
                                (b: string, idx: number) => (
                                  <div
                                    key={idx}
                                    onClick={() => copyText(`bullet_${idx}`, b)}
                                    className="p-3.5 rounded-xl bg-[#0c0e12] border border-[#464553]/35 hover:border-[#5b5bd6]/50 text-xs text-[#e2e2e8] leading-relaxed flex items-start justify-between gap-3 cursor-pointer"
                                  >
                                    <span>• {b}</span>
                                    {copiedKey === `bullet_${idx}` ? (
                                      <Check className="w-3.5 h-3.5 text-[#45dfa4] shrink-0 mt-0.5" />
                                    ) : (
                                      <Copy className="w-3.5 h-3.5 text-[#918f9f] shrink-0 mt-0.5" />
                                    )}
                                  </div>
                                )
                              )}
                            </div>
                          ) : (
                            <div className="p-8 rounded-xl bg-[#0c0e12] border border-[#464553]/35 text-center text-xs text-[#918f9f]">
                              Click &ldquo;Generate Tailored Bullets&rdquo; above or open Full Studio for side-by-side
                              LaTeX/PDF tailoring.
                            </div>
                          )}
                        </div>
                      )}

                      {inspectorTab === 'coach' && (
                        <div className="space-y-4">
                          <div className="flex flex-wrap gap-2">
                            {[
                              'Top 3 interview questions for this role',
                              'How to position my project experience',
                              'Key system design topics to review',
                            ].map((q) => (
                              <button
                                key={q}
                                onClick={() => {
                                  setCoachQuestion(q)
                                  handleAskInlineCoach(q)
                                }}
                                className="px-3 py-1.5 rounded-lg bg-[#0c0e12] hover:bg-[#282a2e] border border-[#464553]/40 text-xs text-[#e2e2e8] cursor-pointer"
                              >
                                {q}
                              </button>
                            ))}
                          </div>

                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={coachQuestion}
                              onChange={(e) => setCoachQuestion(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && handleAskInlineCoach()}
                              placeholder={`Ask AI Coach about ${activeJob.company}...`}
                              className="flex-1 bg-[#0c0e12] border border-[#464553]/45 rounded-lg px-3.5 py-2 text-xs text-[#e2e2e8] focus:outline-none focus:border-[#5b5bd6]"
                            />
                            <button
                              onClick={() => handleAskInlineCoach()}
                              disabled={coachLoading}
                              className="px-4 py-2 rounded-lg bg-[#5b5bd6] hover:bg-[#4f4fc7] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                            >
                              <Send className="w-3.5 h-3.5" />
                              <span>{coachLoading ? '...' : 'Ask'}</span>
                            </button>
                          </div>

                          {coachAnswer && (
                            <div className="p-4 rounded-xl bg-[#0c0e12] border border-[#464553]/35 text-xs text-[#e2e2e8] leading-relaxed whitespace-pre-wrap">
                              {coachAnswer}
                            </div>
                          )}

                          <div className="pt-2 flex justify-end">
                            <Link
                              href={`/jobs/${activeJob.id}?tab=coach`}
                              className="text-xs font-semibold text-[#c3c0ff] hover:text-white flex items-center gap-1.5"
                            >
                              <span>Open Multi-Turn Drill in Coach Studio</span>
                              <ArrowUpRight className="w-3.5 h-3.5" />
                            </Link>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })()}
            </div>
          )}
        </div>
      )}

      {/* Copilot Auto-Fill Launchpad Modal */}
      <AutoFillModal
        isOpen={Boolean(autoFillModalData)}
        onClose={() => setAutoFillModalData(null)}
        data={autoFillModalData}
        onSyncFromResume={handleSyncIdentityFromResume}
        isSyncingResume={isSyncingResume}
        onMarkApplied={() => {
          const targetJobId = autoFillModalData?.autofill?.job_id
          const matchedJob = jobs?.find((j: any) => j.id === targetJobId)
          if (matchedJob) {
            trackMutation.mutate({ job: matchedJob, status: 'applied' })
          }
          setAutoFillModalData(null)
        }}
      />
    </div>
  )
}

export default function Dashboard() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center py-32 space-y-4 font-sans">
          <RefreshCcw className="w-7 h-7 text-[#5b5bd6] animate-spin" />
          <div className="text-[#918f9f] font-medium text-sm">Loading your job pipeline...</div>
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  )
}
