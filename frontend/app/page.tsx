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
  CalendarClock, 
  Briefcase, 
  ChevronDown, 
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
  Flame
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery, useMutation } from '@tanstack/react-query'
import Link from 'next/link'
import { Suspense, useState, useMemo, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useApiClient } from '@/lib/useApiClient'
import { PageHeader } from '@/components/ui/PageHeader'
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
  if (job.is_internship === true) return true
  const title = (job.role_title || '').toLowerCase()
  // Title takes absolute precedence:
  if (/\b(intern|internship|trainee|apprentice|co-op|summer analyst|summer associate|winter intern)\b/i.test(title)) {
    return true
  }
  // If title explicitly specifies full-time entry/grad/fresher/engineer/developer, it is NOT an internship:
  if (/\b(new grad|graduate engineer|full-time|full time|permanent|developer|engineer|analyst|associate|manager|lead)\b/i.test(title) && !/\b(intern|internship|trainee)\b/i.test(title)) {
    return false
  }
  const seniority = (job.seniority_required || '').toLowerCase()
  if (seniority === 'intern') return true
  
  // Only check raw_jd if title did not exclude it AND contains unambiguous internship program markers:
  const rawJd = (job.raw_jd || '').toLowerCase()
  if (/\b(this internship|internship position|internship role|duration of the internship|summer internship program|winter internship program|internship stipend)\b/i.test(rawJd)) {
    return true
  }
  return false
}

function getJobCgpaCutoff(job: any): number | null {
  if (typeof job.min_cgpa === 'number') return job.min_cgpa
  const text = (job.raw_jd || '') + ' ' + (job.role_title || '')
  const m = text.match(/\b(?:cgpa|gpa|pointer)\s*(?:of|>=|:|is|cutoff|minimum)?\s*([6-9](?:\.\d{1,2})?)\b/i) || 
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
  const router = useRouter()

  // Initialize filters from URL query parameters (URL-driven state / Deep Linking)
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
  const [syncMessage, setSyncMessage] = useState<string | null>(null)

  const isHydratedRef = useRef(false)
  const { fetch: apiFetch, isLoaded, isSignedIn } = useApiClient()

  // Hydrate filters from URL query parameters or sessionStorage fallback on mount and browser navigation (Back/Forward)
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

      const targetTab = hasUrlParams ? (sp.get('tab') as any || 'all') : (saved?.filter || sp.get('tab') as any || 'all')
      const targetType = hasUrlParams ? (sp.get('type') as any || 'all') : (saved?.roleTypeFilter || sp.get('type') as any || 'all')
      const targetCgpa = hasUrlParams ? (sp.get('cgpa') || 'all') : (saved?.cgpaFilter || sp.get('cgpa') || 'all')
      const targetVerdict = hasUrlParams ? (sp.get('verdict') || 'all') : (saved?.verdictFilter || sp.get('verdict') || 'all')
      const targetQ = hasUrlParams ? (sp.get('q') || '') : (saved?.searchQuery || sp.get('q') || '')
      const targetLoc = hasUrlParams ? (sp.get('loc') || 'all') : (saved?.locationFilter || sp.get('loc') || 'all')
      const targetDate = hasUrlParams ? (sp.get('date') as any || 'all') : (saved?.dateFilter || sp.get('date') as any || 'all')
      const targetSort = hasUrlParams ? (sp.get('sort') as any || 'score') : (saved?.sortBy || sp.get('sort') as any || 'score')

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

  // Sync state to URL and sessionStorage so the browser's Back button and refresh restore exact filters
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
      sessionStorage.setItem(STORAGE_KEY_DASHBOARD, JSON.stringify({
        filter,
        roleTypeFilter,
        cgpaFilter,
        verdictFilter,
        searchQuery,
        locationFilter,
        dateFilter,
        sortBy
      }))
    } catch {}
  }, [filter, roleTypeFilter, cgpaFilter, verdictFilter, searchQuery, locationFilter, dateFilter, sortBy])

  const { data: jobs, isLoading, refetch: refetchJobs } = useQuery({
    queryKey: ['jobs'],
    enabled: isLoaded && !!isSignedIn,
    queryFn: async () => {
      const res = await apiFetch('/api/jobs')
      if (!res.ok) throw new Error('Failed to fetch jobs')
      return res.json()
    }
  })

  const syncJobsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch('/api/jobs/sync', {
        method: 'POST'
      })
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
    }
  })

  const deleteJobMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const res = await apiFetch(`/api/jobs/${jobId}`, {
        method: 'DELETE'
      })
      if (!res.ok) throw new Error('Failed to delete job')
      return res.json()
    },
    onSuccess: () => {
      refetchJobs()
    }
  })

  // Fetch user's tracked applications to display tracked badge
  const { data: applications, refetch: refetchApplications } = useQuery({
    queryKey: ['applications'],
    enabled: isLoaded && !!isSignedIn,
    queryFn: async () => {
      const res = await apiFetch('/api/applications')
      if (!res.ok) return []
      return res.json()
    }
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
          url: job.url,
          status: status,
          notes: `Added from Dashboard (${job.source || 'manual'})`
        })
      })
      if (!res.ok) throw new Error('Failed to track job')
      return res.json()
    },
    onSuccess: () => {
      refetchApplications()
    }
  })

  const autoApplyMutation = useMutation({
    mutationFn: async ({ url, jobId }: { url: string; jobId: string }) => {
      const res = await apiFetch('/api/applications/auto-apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url, job_id: jobId })
      })
      if (!res.ok) throw new Error('Failed to trigger auto apply')
      return res.json()
    },
    onSuccess: () => {
      refetchApplications()
    }
  })

  // Derive unique locations from analyzed jobs
  const availableLocations = useMemo(() => {
    const set = new Set<string>()
    if (jobs) {
      jobs.forEach((j: any) => {
        if (j.location && j.location !== 'Location Unclear' && j.location.trim().length > 1) {
          const loc = j.location.trim()
          set.add(loc)
        }
      })
    }
    return Array.from(set).sort()
  }, [jobs])

  // Filter and sort jobs
  const filteredJobs = useMemo(() => {
    if (!jobs) return []
    let list = [...jobs]

    // 0. Filter out bogus / placeholder titles and non-job domains
    const INVALID_TITLES = new Set(['not specified', 'unspecified role', 'unknown role', 'park', 'find a park', '']);
    list = list.filter((job: any) => {
      const title = (job.role_title || '').trim().toLowerCase()
      if (!title || INVALID_TITLES.has(title)) return false
      const url = (job.url || '').toLowerCase()
      if (url.includes('wikipedia.org') || url.includes('netflix.com') || url.includes('sohu.com') || url.includes('zhihu.com') || url.includes('baidu.com') || url.includes('nps.gov')) return false
      return true
    })

    // 1. Tab filter
    if (filter === 'bookmarks') {
      list = list.filter((job: any) => job.is_bookmarked)
    } else if (filter === 'deadlines') {
      list = list.filter((job: any) => job.deadline)
    } else if (filter === 'internships') {
      list = list.filter(isJobInternship)
    }

    // 2. Role Type filter (All vs Internships vs Full-time)
    if (roleTypeFilter === 'internship') {
      list = list.filter(isJobInternship)
    } else if (roleTypeFilter === 'fulltime') {
      list = list.filter((j: any) => !isJobInternship(j))
    }

    // 3. CGPA / Academic Cutoff filter
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

    // 4. Search query filter
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

    // 5. Location filter
    if (locationFilter !== 'all') {
      const targetLoc = locationFilter.toLowerCase().trim()
      list = list.filter((job: any) => {
        const jobLoc = (job.location || '').toLowerCase()
        return jobLoc.includes(targetLoc)
      })
    }

    // 6. Date filter
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
          return (now - time) <= maxAge
        })
      }
    }

    // 7. Verdict filter
    if (verdictFilter !== 'all') {
      list = list.filter((job: any) => {
        const analysis = job.job_analyses && job.job_analyses[0]
        return analysis && analysis.verdict === verdictFilter
      })
    }

    // 8. Sorting
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
      // Default: match score descending
      const scoreA = (a.job_analyses && a.job_analyses[0]?.match_score) || 0
      const scoreB = (b.job_analyses && b.job_analyses[0]?.match_score) || 0
      return scoreB - scoreA
    })

    return list
  }, [jobs, filter, roleTypeFilter, cgpaFilter, searchQuery, locationFilter, verdictFilter, dateFilter, sortBy])

  const hasActiveFilters = searchQuery !== '' || 
    locationFilter !== 'all' || 
    verdictFilter !== 'all' || 
    filter !== 'all' || 
    dateFilter !== 'all' || 
    roleTypeFilter !== 'all' || 
    cgpaFilter !== 'all'

  const clearAllFilters = () => {
    setSearchQuery('')
    setLocationFilter('all')
    setVerdictFilter('all')
    setDateFilter('all')
    setFilter('all')
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

  // Filter counts
  const stats = useMemo(() => {
    if (!jobs) return { total: 0, applies: 0, bookmarked: 0, internships: 0 }
    return {
      total: jobs.length,
      applies: jobs.filter((j: any) => j.job_analyses?.[0]?.verdict === 'apply').length,
      bookmarked: jobs.filter((j: any) => j.is_bookmarked).length,
      internships: jobs.filter(isJobInternship).length
    }
  }, [jobs])

  if (!isLoaded || (isSignedIn && isLoading)) {
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-4 font-sans">
        <RefreshCcw className="w-8 h-8 text-indigo-500 animate-spin" />
        <div className="text-zinc-400 text-sm font-medium">Loading JobCopilot OS pipeline...</div>
      </div>
    )
  }

  if (!isSignedIn) {
    return (
      <div className="space-y-12 pb-16 font-sans">
        {/* Flagship OS Hero Banner */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-indigo-950/40 via-zinc-900/70 to-zinc-950 border border-indigo-500/25 p-8 sm:p-14 text-center shadow-[0_15px_50px_rgba(0,0,0,0.5)]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-indigo-500/15 via-transparent to-transparent pointer-events-none" />
          
          <div className="relative z-10 max-w-3xl mx-auto space-y-6">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-bold tracking-wide uppercase">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>JobCopilot OS • Career Operating System</span>
            </div>

            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-tight">
              Precision Job Discovery & <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-purple-300 to-indigo-200">AI Application Engine</span>
            </h1>

            <p className="text-zinc-400 text-sm sm:text-base lg:text-lg leading-relaxed max-w-2xl mx-auto">
              Continuous multi-ATS ingestion across Greenhouse, Lever, Ashby & Workday. Deterministic JD fit scoring, tailored resume generation, placement cell digests, and experimental Playwright auto-apply.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
              <SignInButton mode="modal">
                <button className="bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold px-7 py-3 rounded-2xl text-sm transition-all shadow-[0_0_25px_rgba(99,102,241,0.4)] flex items-center gap-2 cursor-pointer active:scale-95">
                  <Zap className="w-4 h-4 fill-white" />
                  <span>Sign In to Workspace</span>
                  <ArrowUpRight className="w-4 h-4" />
                </button>
              </SignInButton>

              <SignUpButton mode="modal">
                <button className="bg-zinc-900/90 hover:bg-zinc-800 text-zinc-200 border border-zinc-700/80 font-semibold px-6 py-3 rounded-2xl text-sm transition-all cursor-pointer shadow-sm">
                  <span>Create Free Account</span>
                </button>
              </SignUpButton>
            </div>
          </div>
        </div>

        {/* 4 Flagship Modules Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800/80 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <LayoutDashboard className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-white text-base">Live ATS Fleet</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Auto-scrapes verified engineering & AI requisitions directly from verified company career boards with zero dead job links.
            </p>
          </div>

          <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800/80 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Flame className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-white text-base">Daily Intelligence Digest</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Curated daily dispatches filtering high-odds openings matching your target roles, dream companies, and salary thresholds.
            </p>
          </div>

          <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800/80 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <ListTodo className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-white text-base">Pipeline Tracker</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Unified Kanban application tracker with direct apply shortcuts, interview status management, and custom candidate notes.
            </p>
          </div>

          <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800/80 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <BrainCircuit className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-white text-base">AI Interview Coach</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Interactive interview simulation, real-time question generation, and instant resume bullet tailoring tailored per requisition.
            </p>
          </div>
        </div>

        {/* Live Preview Sample Requisitions */}
        <div className="space-y-4 pt-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-400" />
                <span>Featured Tech Openings Sample Preview</span>
              </h2>
              <p className="text-xs text-zinc-400">Sign in to unlock personalized scoring against your active resumes, custom filter presets, and 1-click tracking.</p>
            </div>
            <SignInButton mode="modal">
              <button className="text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1 cursor-pointer shrink-0">
                <span>Sign in for full feed</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </SignInButton>
          </div>

          <div className="grid gap-3.5">
            {[
              {
                id: 'sample-1',
                title: 'Senior Software Engineer - Distributed Systems',
                company: 'Databricks',
                location: 'Bengaluru / Hybrid',
                verdict: 'apply',
                score: 92,
                source: 'Greenhouse',
                pay: '₹40.0L - ₹65.0L',
                isIntern: false,
                cgpa: null,
                skills: ['Go', 'Kubernetes', 'Distributed Systems', 'Python']
              },
              {
                id: 'sample-2',
                title: 'AI / Machine Learning Engineer (Applied GenAI)',
                company: 'Barclays',
                location: 'Pune / Noida',
                verdict: 'apply',
                score: 89,
                source: 'Lever',
                pay: '₹24.0L - ₹38.0L',
                isIntern: false,
                cgpa: 7.5,
                skills: ['PyTorch', 'LLMs', 'FastAPI', 'LangChain']
              },
              {
                id: 'sample-3',
                title: 'Software Engineer Intern (Summer Analyst)',
                company: 'Coinbase',
                location: 'Remote',
                verdict: 'apply',
                score: 86,
                source: 'Ashby',
                pay: '₹1.2L / mo',
                isIntern: true,
                cgpa: null,
                skills: ['React', 'TypeScript', 'Node.js', 'Go']
              }
            ].map((sample) => (
              <div 
                key={sample.id}
                className="bg-zinc-900/60 p-4 sm:p-5 rounded-2xl border border-zinc-800/80 hover:border-indigo-500/40 hover:bg-zinc-900 transition-all flex flex-col xl:flex-row xl:items-center justify-between gap-4"
              >
                <div className="flex-1 min-w-0 space-y-2.5">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="font-bold text-base sm:text-lg text-zinc-100">{sample.title}</span>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-green-500/10 text-green-400 border border-green-500/30 shrink-0">
                      {sample.verdict}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-800/60 border border-zinc-700/50 text-zinc-200 font-semibold shrink-0">
                      <Building2 className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      <span>{sample.company}</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-800/60 border border-zinc-700/50 text-zinc-300 shrink-0">
                      <MapPin className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      <span>{sample.location}</span>
                    </span>
                    {sample.isIntern && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-500/15 border border-purple-500/30 text-purple-300 font-bold shrink-0">
                        <GraduationCap className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                        <span>Internship</span>
                      </span>
                    )}
                    {sample.cgpa ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 font-bold shrink-0">
                        <span>Min {sample.cgpa} CGPA</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-800/40 border border-zinc-700/40 text-zinc-400 shrink-0">
                        <span>No CGPA Cutoff</span>
                      </span>
                    )}
                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-[10px] font-bold tracking-wider uppercase shrink-0">
                      {sample.source}
                    </span>
                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono font-medium shrink-0">
                      {sample.pay}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {sample.skills.map(s => (
                      <span key={s} className="px-2 py-0.5 rounded-md bg-zinc-800/80 border border-zinc-700/50 text-zinc-300 text-[11px] font-medium">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0 border-t xl:border-t-0 border-zinc-800/60 pt-3 xl:pt-0 justify-between sm:justify-end">
                  <SignInButton mode="modal">
                    <button className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-4 py-2 rounded-xl text-xs transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm">
                      <span>Sign In to Apply</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  </SignInButton>

                  <div className="flex flex-col items-center justify-center px-3 py-1.5 rounded-xl bg-zinc-950/70 border border-zinc-800/80 shrink-0 min-w-[62px]">
                    <div className="text-xl sm:text-2xl font-black tracking-tight leading-none text-emerald-400">
                      {sample.score}
                    </div>
                    <div className="text-[9px] text-zinc-500 uppercase tracking-widest font-extrabold mt-0.5">Match</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8 pb-12 font-sans">
      {/* Unified Page Header */}
      <PageHeader
        suite="Discovery & Intelligence"
        title="Live Requisitions Feed"
        subtitle="Real-time multi-ATS discovery engine with deep JD parsing, automated fit analysis, internship detection, and academic score matching."
        icon={LayoutDashboard}
        badge="Live Fleet"
        badgeColor="indigo"
        actions={
          <>
            <button
              onClick={() => syncJobsMutation.mutate()}
              disabled={syncJobsMutation.isPending}
              className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300 px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
              title="Auto-fetch latest verified openings directly from Greenhouse, Lever & Ashby boards"
            >
              {syncJobsMutation.isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                  <span>Syncing ATS...</span>
                </>
              ) : (
                <>
                  <Zap className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400" />
                  <span>Sync Live Openings</span>
                </>
              )}
            </button>
            <Link 
              href="/tracker" 
              className="bg-zinc-900/80 border border-zinc-800 text-zinc-300 px-3.5 py-2 rounded-xl text-xs font-semibold hover:bg-zinc-800 hover:text-white transition-all flex items-center gap-1.5 shadow-sm"
            >
              <ListTodo className="w-3.5 h-3.5 text-indigo-400" />
              <span>Tracker ({applications?.length || 0})</span>
            </Link>
            <Link 
              href="/jobs/new" 
              className="bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-[0_0_15px_rgba(99,102,241,0.3)] flex items-center gap-1.5 active:scale-95"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Job</span>
            </Link>
          </>
        }
      />

      {/* Sync Status Banner */}
      <AnimatePresence>
        {syncMessage && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl px-5 py-3 text-sm text-emerald-300 flex items-center justify-between shadow-sm"
          >
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="font-medium">{syncMessage}</span>
            </div>
            <button onClick={() => setSyncMessage(null)} className="text-zinc-500 hover:text-zinc-300 transition-colors">
              <XCircle className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Interactive KPI Filter Cards (4 Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: All Postings */}
        <button
          type="button"
          onClick={() => {
            setVerdictFilter('all')
            setFilter('all')
          }}
          className={`text-left p-5 rounded-2xl flex items-center justify-between transition-all cursor-pointer group border ${
            verdictFilter === 'all' && filter === 'all'
              ? 'bg-blue-950/20 border-blue-500/50 shadow-[0_0_20px_rgba(59,130,246,0.15)] ring-1 ring-blue-500/40'
              : 'bg-zinc-900/40 border-zinc-800/60 hover:border-zinc-700 hover:bg-zinc-900/70 hover:scale-[1.01]'
          }`}
        >
          <div className="flex items-center gap-3.5">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center border transition-all ${
              verdictFilter === 'all' && filter === 'all'
                ? 'bg-blue-500/20 border-blue-500/40 text-blue-300'
                : 'bg-blue-500/10 border-blue-500/20 text-blue-400 group-hover:scale-105'
            }`}>
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <div className="text-2xl font-bold text-white tracking-tight">{stats.total}</div>
              <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">All Postings</div>
            </div>
          </div>
          <div className={`text-[10px] font-bold px-2 py-0.5 rounded-full border transition-all ${
            verdictFilter === 'all' && filter === 'all'
              ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
              : 'bg-zinc-800 text-zinc-400 border-zinc-700/50 group-hover:text-zinc-200'
          }`}>
            {verdictFilter === 'all' && filter === 'all' ? '● Active' : 'View'}
          </div>
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
          className={`text-left p-5 rounded-2xl flex items-center justify-between transition-all cursor-pointer group border ${
            verdictFilter === 'apply'
              ? 'bg-emerald-950/30 border-emerald-500/60 shadow-[0_0_25px_rgba(16,185,129,0.2)] ring-1 ring-emerald-500/50 scale-[1.01]'
              : 'bg-zinc-900/40 border-zinc-800/60 hover:border-emerald-500/40 hover:bg-zinc-900/70 hover:scale-[1.01]'
          }`}
        >
          <div className="flex items-center gap-3.5">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center border transition-all ${
              verdictFilter === 'apply'
                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 scale-105 shadow-inner'
                : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 group-hover:scale-105'
            }`}>
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <div className="text-2xl font-bold text-white tracking-tight">{stats.applies}</div>
              <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">High Fit</div>
            </div>
          </div>
          <div className={`text-[10px] font-bold px-2 py-0.5 rounded-full border transition-all flex items-center gap-1 ${
            verdictFilter === 'apply'
              ? 'bg-emerald-500 text-zinc-950 border-emerald-400 shadow-sm'
              : 'bg-zinc-800 text-zinc-400 border-zinc-700/50 group-hover:text-emerald-400 group-hover:border-emerald-500/30'
          }`}>
            {verdictFilter === 'apply' ? '✓ Active' : 'Filter'}
          </div>
        </button>

        {/* Card 3: 🎓 Internships */}
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
          className={`text-left p-5 rounded-2xl flex items-center justify-between transition-all cursor-pointer group border ${
            filter === 'internships'
              ? 'bg-purple-950/30 border-purple-500/60 shadow-[0_0_25px_rgba(168,85,247,0.2)] ring-1 ring-purple-500/50 scale-[1.01]'
              : 'bg-zinc-900/40 border-zinc-800/60 hover:border-purple-500/40 hover:bg-zinc-900/70 hover:scale-[1.01]'
          }`}
        >
          <div className="flex items-center gap-3.5">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center border transition-all ${
              filter === 'internships'
                ? 'bg-purple-500/20 border-purple-500/50 text-purple-300 scale-105 shadow-inner'
                : 'bg-purple-500/10 border-purple-500/20 text-purple-400 group-hover:scale-105'
            }`}>
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <div className="text-2xl font-bold text-white tracking-tight">{stats.internships}</div>
              <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Internships</div>
            </div>
          </div>
          <div className={`text-[10px] font-bold px-2 py-0.5 rounded-full border transition-all flex items-center gap-1 ${
            filter === 'internships'
              ? 'bg-purple-500 text-zinc-950 border-purple-400 shadow-sm'
              : 'bg-zinc-800 text-zinc-400 border-zinc-700/50 group-hover:text-purple-400 group-hover:border-purple-500/30'
          }`}>
            {filter === 'internships' ? '✓ Active' : 'Filter'}
          </div>
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
          className={`text-left p-5 rounded-2xl flex items-center justify-between transition-all cursor-pointer group border ${
            filter === 'bookmarks'
              ? 'bg-amber-950/30 border-amber-500/60 shadow-[0_0_25px_rgba(245,158,11,0.2)] ring-1 ring-amber-500/50 scale-[1.01]'
              : 'bg-zinc-900/40 border-zinc-800/60 hover:border-amber-500/40 hover:bg-zinc-900/70 hover:scale-[1.01]'
          }`}
        >
          <div className="flex items-center gap-3.5">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center border transition-all ${
              filter === 'bookmarks'
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 scale-105'
                : 'bg-amber-500/10 border-amber-500/20 text-amber-400 group-hover:scale-105'
            }`}>
              <Bookmark className="w-5 h-5" />
            </div>
            <div>
              <div className="text-2xl font-bold text-white tracking-tight">{stats.bookmarked}</div>
              <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Bookmarked</div>
            </div>
          </div>
          <div className={`text-[10px] font-bold px-2 py-0.5 rounded-full border transition-all flex items-center gap-1 ${
            filter === 'bookmarks'
              ? 'bg-amber-500 text-zinc-950 border-amber-400 shadow-sm'
              : 'bg-zinc-800 text-zinc-400 border-zinc-700/50 group-hover:text-amber-400 group-hover:border-amber-500/30'
          }`}>
            {filter === 'bookmarks' ? '✓ Active' : 'Filter'}
          </div>
        </button>
      </div>

      {/* Main Filter & Search Toolbar */}
      <div className="bg-zinc-900/40 p-5 rounded-2xl border border-zinc-800/80 backdrop-blur-md space-y-4">
        
        {/* Row 1: Search and Primary Tabs */}
        <div className="flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Search by role, company, skills (Python, GenAI, React), or city..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-10 pr-4 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 text-xs"
              >
                Clear
              </button>
            )}
          </div>

          {/* Quick Primary Tab Toggles */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
            {[
              { id: 'all', label: 'All Jobs' },
              { id: 'internships', label: '🎓 Internships' },
              { id: 'bookmarks', label: '⭐ Saved' },
              { id: 'deadlines', label: '⏳ Deadlines' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id as any)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 cursor-pointer ${
                  filter === tab.id
                    ? 'bg-zinc-800 text-white shadow-sm border border-zinc-700/80 font-bold'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40 border border-transparent'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Row 2: Location, Employment Type, CGPA Cutoff, Verdict, and Sort Selectors */}
        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-zinc-800/60 text-[13px]">
          
          {/* Location Selector */}
          <div className="flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-zinc-500" />
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium appearance-none pr-7 cursor-pointer text-xs"
              style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2714%27 height=%2714%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%2371717a%27 stroke-width=%272%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27%3E%3Cpolyline points=%276 9 12 15 18 9%27%3E%3C/polyline%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center' }}
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
                if (['bengaluru', 'bangalore', 'mumbai', 'pune', 'hyderabad', 'delhi', 'noida', 'chennai', 'remote', 'pan india'].some(preset => lower.includes(preset))) {
                  return null
                }
                return <option key={loc} value={loc}>{loc}</option>
              })}
            </select>
          </div>

          {/* Role Type Filter (Internship vs Full-Time) */}
          <div className="flex items-center gap-1.5">
            <Briefcase className="w-3.5 h-3.5 text-purple-400" />
            <select
              value={roleTypeFilter}
              onChange={(e: any) => setRoleTypeFilter(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium appearance-none pr-7 cursor-pointer text-xs"
              style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2714%27 height=%2714%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%2371717a%27 stroke-width=%272%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27%3E%3Cpolyline points=%276 9 12 15 18 9%27%3E%3C/polyline%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center' }}
            >
              <option value="all">All Role Types</option>
              <option value="internship">🎓 Internships Only</option>
              <option value="fulltime">💼 Full-Time Only</option>
            </select>
          </div>

          {/* Academic CGPA Cutoff Filter */}
          <div className="flex items-center gap-1.5">
            <GraduationCap className="w-3.5 h-3.5 text-amber-400" />
            <select
              value={cgpaFilter}
              onChange={(e) => setCgpaFilter(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium appearance-none pr-7 cursor-pointer text-xs"
              style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2714%27 height=%2714%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%2371717a%27 stroke-width=%272%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27%3E%3Cpolyline points=%276 9 12 15 18 9%27%3E%3C/polyline%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center' }}
            >
              <option value="all">All CGPA Criteria</option>
              <option value="nocutoff">🟢 No CGPA Cutoff (Open to all)</option>
              <option value="7.0">Eligible with ≥ 7.0 CGPA</option>
              <option value="7.5">Eligible with ≥ 7.5 CGPA</option>
              <option value="8.0">Eligible with ≥ 8.0 CGPA</option>
            </select>
          </div>

          {/* Verdict Filter */}
          <div className="flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            <select
              value={verdictFilter}
              onChange={(e) => setVerdictFilter(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium appearance-none pr-7 cursor-pointer text-xs"
              style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2714%27 height=%2714%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%2371717a%27 stroke-width=%272%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27%3E%3Cpolyline points=%276 9 12 15 18 9%27%3E%3C/polyline%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center' }}
            >
              <option value="all">All Verdicts</option>
              <option value="apply">Apply Only (Fit)</option>
              <option value="stretch">Stretch Roles</option>
              <option value="skip">Skip Roles</option>
            </select>
          </div>

          {/* Date Filter */}
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-zinc-500" />
            <select
              value={dateFilter}
              onChange={(e: any) => setDateFilter(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium appearance-none pr-7 cursor-pointer text-xs"
              style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2714%27 height=%2714%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%2371717a%27 stroke-width=%272%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27%3E%3Cpolyline points=%276 9 12 15 18 9%27%3E%3C/polyline%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center' }}
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
            <span className="text-zinc-500 font-semibold uppercase tracking-wider text-[10px]">Sort:</span>
            <select
              value={sortBy}
              onChange={(e: any) => setSortBy(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium appearance-none pr-7 cursor-pointer text-xs"
              style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2714%27 height=%2714%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%2371717a%27 stroke-width=%272%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27%3E%3Cpolyline points=%276 9 12 15 18 9%27%3E%3C/polyline%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center' }}
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
              className="text-[11px] text-indigo-400 hover:text-indigo-300 font-bold tracking-wide uppercase px-2 py-1 rounded bg-indigo-500/10 border border-indigo-500/20 transition-colors ml-1 cursor-pointer"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Active Filter Pills Bar */}
      <div className="flex flex-wrap items-center justify-between text-xs text-zinc-500 px-1 font-medium gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span>Showing <strong className="text-zinc-200">{filteredJobs.length}</strong> of {jobs?.length || 0} analyzed postings</span>
          {verdictFilter === 'apply' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-semibold text-[11px]">
              High Fit Only
              <button onClick={() => setVerdictFilter('all')} className="hover:text-emerald-200 transition-colors cursor-pointer">✕</button>
            </span>
          )}
          {filter === 'bookmarks' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 font-semibold text-[11px]">
              Bookmarked Only
              <button onClick={() => setFilter('all')} className="hover:text-amber-200 transition-colors cursor-pointer">✕</button>
            </span>
          )}
          {filter === 'internships' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/30 font-semibold text-[11px]">
              🎓 Internships Only
              <button onClick={() => setFilter('all')} className="hover:text-purple-200 transition-colors cursor-pointer">✕</button>
            </span>
          )}
          {roleTypeFilter === 'internship' && filter !== 'internships' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/30 font-semibold text-[11px]">
              Internships
              <button onClick={() => setRoleTypeFilter('all')} className="hover:text-purple-200 transition-colors cursor-pointer">✕</button>
            </span>
          )}
          {roleTypeFilter === 'fulltime' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/30 font-semibold text-[11px]">
              Full-Time Only
              <button onClick={() => setRoleTypeFilter('all')} className="hover:text-sky-200 transition-colors cursor-pointer">✕</button>
            </span>
          )}
          {cgpaFilter !== 'all' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 font-semibold text-[11px]">
              {cgpaFilter === 'nocutoff' ? 'No CGPA Cutoff' : `Eligible with ≥ ${cgpaFilter} CGPA`}
              <button onClick={() => setCgpaFilter('all')} className="hover:text-amber-200 transition-colors cursor-pointer">✕</button>
            </span>
          )}
          {locationFilter !== 'all' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 font-semibold text-[11px]">
              Location: {locationFilter}
              <button onClick={() => setLocationFilter('all')} className="hover:text-indigo-200 transition-colors cursor-pointer">✕</button>
            </span>
          )}
        </div>
        {hasActiveFilters && (
          <button 
            onClick={clearAllFilters}
            className="text-[11px] text-zinc-400 hover:text-white underline underline-offset-2 transition-colors cursor-pointer"
          >
            Clear all filters
          </button>
        )}
      </div>

      {/* Job Cards */}
      {!jobs || jobs.length === 0 ? (
        <div className="text-center py-20 bg-zinc-900/40 rounded-3xl border border-zinc-800/80 backdrop-blur-md p-8 sm:p-12 space-y-5">
          <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mx-auto">
            <Zap className="w-7 h-7 fill-indigo-400" />
          </div>
          <div className="space-y-2 max-w-md mx-auto">
            <h2 className="text-xl font-bold text-white tracking-tight">Your Requisition Pipeline is Ready</h2>
            <p className="text-zinc-400 text-sm leading-relaxed">
              No live job requisitions have been loaded into your account yet. Trigger an autonomous ATS sync across verified company boards, or add a job link.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              onClick={() => syncJobsMutation.mutate()}
              disabled={syncJobsMutation.isPending}
              className="bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-bold px-5 py-2.5 rounded-xl text-xs transition-all shadow-[0_0_20px_rgba(99,102,241,0.35)] flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {syncJobsMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Syncing ATS Openings...</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 fill-white" />
                  <span>Sync Live Openings</span>
                </>
              )}
            </button>
            <Link
              href="/jobs/new"
              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold px-4 py-2.5 rounded-xl text-xs border border-zinc-700 transition-all flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Add Custom Job</span>
            </Link>
          </div>
        </div>
      ) : filteredJobs.length === 0 ? (
        <div className="text-center py-20 bg-zinc-900/30 rounded-2xl border border-zinc-800/50 backdrop-blur-sm space-y-4">
          <Search className="w-12 h-12 text-zinc-600 mx-auto" />
          <h2 className="text-xl font-bold text-zinc-300">No jobs matched your filters</h2>
          <p className="text-zinc-500 text-sm max-w-sm mx-auto">
            Try adjusting your search terms, changing the location filter, or toggling between internships and full-time roles.
          </p>
          {hasActiveFilters && (
            <button 
              onClick={clearAllFilters}
              className="mt-4 text-[13px] bg-zinc-800 hover:bg-zinc-700 text-white font-semibold px-5 py-2.5 rounded-xl transition-all shadow-sm inline-block cursor-pointer"
            >
              Reset All Filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4">
          <AnimatePresence>
            {filteredJobs.map((job: any, i: number) => {
              const analysis = job.job_analyses && job.job_analyses[0]
              const currentStatus = trackedJobIdMap[job.id]
              const isIntern = isJobInternship(job)
              const cgpaCutoff = getJobCgpaCutoff(job)
              
              let verdictStyle = 'bg-zinc-800 text-zinc-300 border-zinc-700'
              if (analysis) {
                if (analysis.verdict === 'apply') verdictStyle = 'bg-green-500/10 text-green-400 border-green-500/30'
                if (analysis.verdict === 'stretch') verdictStyle = 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                if (analysis.verdict === 'skip') verdictStyle = 'bg-red-500/10 text-red-400 border-red-500/30'
              }

              return (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  key={job.id} 
                  className="bg-zinc-900/60 p-4 sm:p-5 rounded-2xl border border-zinc-800/80 hover:border-indigo-500/40 hover:-translate-y-0.5 hover:bg-zinc-900 hover:shadow-[0_8px_30px_rgb(0,0,0,0.4)] transition-all duration-300 flex flex-col xl:flex-row xl:items-center justify-between gap-4 group"
                >
                  <div className="flex-1 min-w-0 space-y-2.5">
                    {/* Title & Status */}
                    <div className="flex flex-wrap items-center gap-2.5">
                      <Link 
                        href={`/jobs/${job.id}`} 
                        className="font-bold text-base sm:text-lg text-white hover:text-indigo-400 transition-colors tracking-tight line-clamp-1"
                        title={cleanTitle(job.role_title)}
                      >
                        {cleanTitle(job.role_title)}
                      </Link>
                      {analysis && (
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border shrink-0 ${verdictStyle}`}>
                          {analysis.verdict}
                        </span>
                      )}
                      {currentStatus && (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center gap-1 shrink-0">
                          <ListTodo className="w-3 h-3" /> {currentStatus}
                        </span>
                      )}
                    </div>
                    
                    {/* Aligned Metadata Pills Ribbon */}
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {/* Company */}
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-800/60 border border-zinc-700/50 text-zinc-200 font-semibold shrink-0">
                        <Building2 className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                        <span className="truncate max-w-[150px]">{job.company}</span>
                      </span>
                      
                      {/* Location */}
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-800/60 border border-zinc-700/50 text-zinc-300 shrink-0">
                        <MapPin className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                        <span className="truncate max-w-[150px]">{job.location || 'Location Unspecified'}</span>
                      </span>

                      {/* Internship Badge */}
                      {isIntern && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-500/15 border border-purple-500/30 text-purple-300 font-bold shrink-0">
                          <GraduationCap className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                          <span>Internship</span>
                        </span>
                      )}

                      {/* Academic CGPA Cutoff Badge */}
                      {cgpaCutoff ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 font-bold shrink-0" title={`Minimum CGPA requirement: ${cgpaCutoff}`}>
                          <span>Min {cgpaCutoff} CGPA</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-800/40 border border-zinc-700/40 text-zinc-400 shrink-0" title="No CGPA cutoff mentioned in JD">
                          <span>No CGPA Cutoff</span>
                        </span>
                      )}
                      
                      {/* Workplace Type */}
                      {job.remote_type && job.remote_type !== 'unclear' && (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-zinc-800/60 border border-zinc-700/50 text-zinc-300 capitalize shrink-0 font-medium">
                          {job.remote_type}
                        </span>
                      )}
                      
                      {/* Compensation */}
                      {job.pay_min && (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono font-medium shrink-0">
                          ₹{(job.pay_min / 100000).toFixed(1)}L {job.pay_max ? `- ${(job.pay_max / 100000).toFixed(1)}L` : ''}
                        </span>
                      )}

                      {/* Date Badge */}
                      {(() => {
                        const dateInfo = formatJobDate(job.posting_date || job.first_seen_at || job.fetched_at)
                        if (!dateInfo) return null
                        return (
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border shrink-0 ${
                            dateInfo.isNew 
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 font-semibold' 
                              : 'bg-zinc-800/60 text-zinc-300 border-zinc-700/50'
                          }`}>
                            <Calendar className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                            <span>{dateInfo.label}</span>
                            {dateInfo.isNew && (
                              <span className="px-1 py-0.2 text-[9px] font-black uppercase tracking-wider bg-emerald-500 text-zinc-950 rounded">
                                NEW
                              </span>
                            )}
                          </span>
                        )
                      })()}

                      {/* Source ATS Badge */}
                      {job.source_type && job.source_type !== 'manual' && (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-[10px] font-bold tracking-wider uppercase shrink-0">
                          {job.source_type}
                        </span>
                      )}
                      
                      {/* Deadline */}
                      {job.deadline && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-300 shrink-0 font-medium">
                          <Clock className="w-3.5 h-3.5 shrink-0" />
                          <span>{new Date(job.deadline).toLocaleDateString()}</span>
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {/* Actions & Score Cluster */}
                  <div className="flex items-center gap-3 shrink-0 justify-between sm:justify-end flex-wrap xl:flex-nowrap pt-3 xl:pt-0 border-t xl:border-t-0 border-zinc-800/60">
                    {/* Action Buttons Group */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Track Button */}
                      <button 
                        onClick={() => trackMutation.mutate({ job, status: currentStatus ? (currentStatus === 'applied' ? 'interview' : 'applied') : 'saved' })}
                        disabled={trackMutation.isPending}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all active:scale-95 cursor-pointer ${
                          currentStatus 
                            ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/25'
                            : 'bg-zinc-800/80 hover:bg-zinc-800 text-zinc-300 border border-zinc-700/60 hover:text-white'
                        }`}
                        title={currentStatus ? `Tracked: ${currentStatus}` : "Track this role"}
                      >
                        <ListTodo className="w-3.5 h-3.5 text-zinc-400" />
                        <span>{currentStatus ? currentStatus.toUpperCase() : 'Track'}</span>
                      </button>

                      {/* AI Coach Prep Link */}
                      <Link
                        href={`/jobs/${job.id}?tab=coach`}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/20 transition-all active:scale-95 shrink-0"
                        title="Prepare for this interview with AI Coach"
                      >
                        <BrainCircuit className="w-3.5 h-3.5 text-purple-400" />
                        <span>Coach</span>
                      </Link>

                      {/* Bookmark Toggle */}
                      <button
                        onClick={async () => {
                          const newBm = !job.is_bookmarked
                          await apiFetch(`/api/jobs/${job.id}/bookmark`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ is_bookmarked: newBm })
                          })
                          refetchJobs()
                        }}
                        className={`p-1.5 rounded-xl border transition-all active:scale-95 cursor-pointer ${
                          job.is_bookmarked 
                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' 
                            : 'border-zinc-800 bg-zinc-900/60 text-zinc-500 hover:text-amber-400 hover:border-zinc-700'
                        }`}
                        title={job.is_bookmarked ? 'Remove bookmark' : 'Bookmark job'}
                      >
                        <Bookmark className={`w-3.5 h-3.5 ${job.is_bookmarked ? 'fill-amber-400' : ''}`} />
                      </button>

                      {/* Quick Apply Link */}
                      {job.url && (
                        <a 
                          href={job.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all shadow-sm shadow-indigo-600/30 active:scale-95 shrink-0"
                          title="Open official job posting"
                        >
                          <span>Apply</span>
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </a>
                      )}

                      {/* Auto-Apply */}
                      {job.url && (
                        <button 
                          onClick={() => autoApplyMutation.mutate({ url: job.url, jobId: job.id })}
                          disabled={autoApplyMutation.isPending}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition-all active:scale-95 cursor-pointer disabled:opacity-50 shrink-0"
                          title="Experimental Playwright Auto-Apply"
                        >
                          <Zap className="w-3.5 h-3.5 fill-emerald-400 shrink-0" />
                          <span>{autoApplyMutation.isPending ? '...' : 'Auto'}</span>
                        </button>
                      )}

                      {/* Quick Dismiss / Delete Job */}
                      <button
                        onClick={() => {
                          if (confirm(`Remove "${cleanTitle(job.role_title)}" at ${job.company} from your feed?`)) {
                            deleteJobMutation.mutate(job.id);
                          }
                        }}
                        disabled={deleteJobMutation.isPending}
                        className="p-1.5 rounded-xl border border-transparent hover:border-red-500/20 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-all active:scale-95 cursor-pointer shrink-0"
                        title="Dismiss job"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Match Score Display */}
                    {analysis && (
                      <Link 
                        href={`/jobs/${job.id}`} 
                        className="flex flex-col items-center justify-center px-3 py-1.5 rounded-xl bg-zinc-950/70 border border-zinc-800/80 hover:border-indigo-500/40 group-hover:bg-zinc-950 transition-all shrink-0 min-w-[62px]"
                        title={`AI Match Score: ${analysis.match_score}% - Click to view detailed analysis`}
                      >
                        <div className={`text-xl sm:text-2xl font-black tracking-tight leading-none ${
                          analysis.match_score >= 80 ? 'text-emerald-400' : analysis.match_score >= 50 ? 'text-amber-400' : 'text-zinc-500'
                        }`}>
                          {analysis.match_score}
                        </div>
                        <div className="text-[9px] text-zinc-500 uppercase tracking-widest font-extrabold mt-0.5">Match</div>
                      </Link>
                    )}
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}

export default function Dashboard() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center py-32 space-y-4 font-sans">
        <RefreshCcw className="w-8 h-8 text-indigo-500 animate-spin" />
        <div className="text-zinc-400 font-medium">Loading your job pipeline...</div>
      </div>
    }>
      <DashboardContent />
    </Suspense>
  )
}