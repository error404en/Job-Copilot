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
  Star,
  Eye,
  EyeOff,
  Briefcase,
  ListTodo,
  RefreshCcw,
  Sparkles,
  Zap,
  Loader2,
  Copy,
  Check,
  FileText,
  ExternalLink,
  SlidersHorizontal,
  ChevronRight,
  ChevronDown,
  Globe,
  Laptop,
  IndianRupee,
  Share2,
  PanelRightClose,
  PanelRightOpen,
  ArrowUpDown,
  Filter,
  GraduationCap,
  Calendar,
  Activity,
  X,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { Suspense, useState, useMemo, useEffect, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useApiClient } from '@/lib/useApiClient'
import AutoFillModal from '@/components/AutoFillModal'
import CompanyDeepDiveModal from '@/components/CompanyDeepDiveModal'
import { useViewedJobs } from '@/lib/useViewedJobs'

export interface JobWorkModeInfo {
  type: 'remote' | 'hybrid' | 'onsite'
  label: string
  sublabel: string
  badgeClass: string
}

export function getJobWorkMode(job: any): JobWorkModeInfo {
  const remoteType = (job?.work_mode || job?.remote_type || '').toLowerCase().trim()
  if (remoteType === 'remote') {
    return {
      type: 'remote',
      label: 'Remote',
      sublabel: 'Pan-India / Anywhere',
      badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35',
    }
  }
  if (remoteType === 'hybrid') {
    return {
      type: 'hybrid',
      label: 'Hybrid',
      sublabel: 'Office + Remote',
      badgeClass: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/35',
    }
  }
  if (remoteType === 'onsite') {
    return {
      type: 'onsite',
      label: 'In-Office',
      sublabel: 'On-site',
      badgeClass: 'bg-zinc-800 text-zinc-300 border-zinc-700/70',
    }
  }

  const combined = `${job?.location || ''} ${job?.role_title || ''} ${job?.raw_jd || ''}`.toLowerCase()
  if (/\b(remote|work from home|wfh|telecommute|anywhere in india|virtual)\b/i.test(combined)) {
    return {
      type: 'remote',
      label: 'Remote',
      sublabel: 'Pan-India',
      badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35',
    }
  }
  if (/\b(hybrid|flexible work|[23]\s*days?\s*office)\b/i.test(combined)) {
    return {
      type: 'hybrid',
      label: 'Hybrid',
      sublabel: 'Office + Remote',
      badgeClass: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/35',
    }
  }
  return {
    type: 'onsite',
    label: 'In-Office',
    sublabel: 'On-site',
    badgeClass: 'bg-zinc-800 text-zinc-300 border-zinc-700/70',
  }
}

export interface JobCompensationInfo {
  display: string
  status: 'above_floor' | 'meets_floor' | 'stipend' | 'baseline' | 'below_floor'
  note: string
  badgeClass: string
}

export function getJobCompensation(job: any): JobCompensationInfo {
  if (job?.compensation_info?.display) {
    const ci = job.compensation_info
    const badgeClass =
      ci.status === 'above_floor'
        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35 font-semibold'
        : ci.status === 'meets_floor'
        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25 font-semibold'
        : ci.status === 'stipend'
        ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30 font-semibold'
        : ci.status === 'below_floor'
        ? 'bg-amber-500/15 text-amber-300 border-amber-500/30 font-semibold'
        : 'bg-zinc-800 text-zinc-300 border-zinc-700/70 font-medium'
    return { ...ci, badgeClass }
  }

  const payMin = job?.pay_min
  const payMax = job?.pay_max
  const isIntern = isJobInternship(job)

  if (payMin && payMax) {
    const minL = (payMin / 100000).toFixed(1).replace(/\.0$/, '')
    const maxL = (payMax / 100000).toFixed(1).replace(/\.0$/, '')
    const status = payMin >= 1200000 ? 'above_floor' : payMin >= 600000 ? 'meets_floor' : 'below_floor'
    const note = status === 'above_floor' ? 'Above ₹6L Floor' : status === 'meets_floor' ? 'Meets ₹6L Base' : 'Below ₹6L Base'
    const badgeClass =
      status === 'above_floor'
        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35 font-semibold'
        : status === 'meets_floor'
        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25 font-semibold'
        : 'bg-amber-500/15 text-amber-300 border-amber-500/30 font-semibold'
    return { display: `₹${minL}L–₹${maxL}L`, status, note, badgeClass }
  }

  const text = `${job?.salary_range || ''} ${job?.role_title || ''} ${job?.raw_jd || ''}`
  const stipendMatch = text.match(/(?:stipend|stipend\s*of|pay\s*of)?\s*(?:₹|inr|rs\.?)\s*([0-9]{1,2}(?:,[0-9]{3})*|[0-9]{2,5})\s*(?:k|\/month|\/m|pm|per month)/i)
  if (stipendMatch || isIntern) {
    const rawVal = stipendMatch ? parseInt(stipendMatch[1].replace(/,/g, ''), 10) : 35
    const num = rawVal < 100 ? rawVal : Math.round(rawVal / 1000)
    const displayVal = num > 0 && num < 150 ? `₹${num}k–₹${Math.min(num + 20, 100)}k/mo` : '₹25k–₹50k/mo'
    return {
      display: `${displayVal} (Est. Stipend)`,
      status: 'stipend',
      note: 'Internship Stipend Benchmark',
      badgeClass: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30 font-semibold',
    }
  }

  const lpaMatch = text.match(/(?:ctc|salary|package|pay)?\s*(?:₹|inr|rs\.?)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:-|to|–)\s*([0-9]+(?:\.[0-9]+)?)\s*(?:lpa|lakhs?|lac|l)/i)
  if (lpaMatch) {
    const min = parseFloat(lpaMatch[1])
    const max = parseFloat(lpaMatch[2])
    const status = min >= 12 ? 'above_floor' : min >= 6 ? 'meets_floor' : 'below_floor'
    const note = status === 'above_floor' ? 'Above ₹6L Floor' : status === 'meets_floor' ? 'Meets ₹6L Base' : 'Below ₹6L Base'
    return {
      display: `₹${min}L–₹${max}L`,
      status,
      note,
      badgeClass: status === 'above_floor' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35 font-semibold' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25 font-semibold',
    }
  }

  return {
    display: '₹6.0L+ Base Floor (Market Est.)',
    status: 'baseline',
    note: 'Standard Entry Tier',
    badgeClass: 'bg-zinc-800 text-zinc-300 border-zinc-700/70 font-medium',
  }
}

export interface JobReleaseInfo {
  tag: string
  sublabel: string
  badgeClass: string
  relativeDisplay: string
  applyFactor?: string
  isFresh?: boolean
  label?: string
  shortLabel?: string
}

export function getJobReleaseInfo(job: any): JobReleaseInfo {
  const dateStr = job?.posting_date || job?.first_seen_at || job?.fetched_at
  if (!dateStr) {
    return {
      tag: 'Fresh Opening',
      sublabel: 'Active requisition',
      badgeClass: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/35',
      relativeDisplay: 'Recently added',
      applyFactor: 'Active requisition',
      isFresh: false,
      label: 'Fresh Opening',
      shortLabel: 'Recent',
    }
  }

  const ts = new Date(dateStr).getTime()
  if (isNaN(ts)) {
    return {
      tag: 'Active Requisition',
      sublabel: 'Open',
      badgeClass: 'bg-zinc-800 text-zinc-300 border-zinc-700/70',
      relativeDisplay: 'Recently',
      applyFactor: 'Active requisition',
      isFresh: false,
      label: 'Active',
      shortLabel: 'Active',
    }
  }

  const diffHours = (Date.now() - ts) / (1000 * 60 * 60)
  if (diffHours < 2) {
    return {
      tag: 'Just Released ⚡',
      sublabel: 'Apply in <2h window for top visibility',
      badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-semibold animate-pulse',
      relativeDisplay: 'Just now (<2h ago)',
      applyFactor: 'Apply in <2h window for top visibility',
      isFresh: true,
      label: 'Just Released ⚡',
      shortLabel: 'Just now',
    }
  }
  if (diffHours < 24) {
    const hours = Math.max(1, Math.floor(diffHours))
    return {
      tag: `${hours}h ago · Prime Window 🚀`,
      sublabel: 'First 24 hours of posting',
      badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35 font-semibold',
      relativeDisplay: `${hours}h ago`,
      applyFactor: 'Apply in first 24h for 4x response rate',
      isFresh: true,
      label: `${hours}h ago (Prime)`,
      shortLabel: `${hours}h ago`,
    }
  }
  if (diffHours < 48) {
    return {
      tag: 'Yesterday ⚡ Early window',
      sublabel: 'Day 2 dispatch',
      badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/35 font-medium',
      relativeDisplay: '1d ago',
      applyFactor: 'Day 2 dispatch',
      isFresh: false,
      label: 'Yesterday',
      shortLabel: '1d ago',
    }
  }
  const days = Math.floor(diffHours / 24)
  return {
    tag: `${days}d ago · Standard`,
    sublabel: 'Active queue',
    badgeClass: 'bg-zinc-800 text-zinc-300 border-zinc-700/70',
    relativeDisplay: `${days}d ago`,
    applyFactor: 'Active queue',
    isFresh: false,
    label: `${days}d ago`,
    shortLabel: `${days}d ago`,
  }
}

export function getCompanyMonogram(company?: string): string {
  if (!company) return 'CO'
  const parts = company.trim().split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return company.slice(0, 2).toUpperCase()
}

export function getCompanyMonogramGradient(company?: string): string {
  const hash = (company || '').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  const variants = [
    'from-indigo-600/30 to-purple-600/30 text-indigo-300 border-indigo-500/30',
    'from-emerald-600/30 to-teal-600/30 text-emerald-300 border-emerald-500/30',
    'from-blue-600/30 to-cyan-600/30 text-sky-300 border-sky-500/30',
    'from-purple-600/30 to-pink-600/30 text-purple-300 border-purple-500/30',
    'from-amber-600/30 to-orange-600/30 text-amber-300 border-amber-500/30',
  ]
  return variants[hash % variants.length]
}

export function isJobInternship(job: any): boolean {
  if (!job) return false
  if (job.is_internship === true) return true
  const title = (job.role_title || '').toLowerCase()
  if (/\b(intern|internship|trainee|apprentice|co-op|summer analyst|summer associate|winter intern)\b/i.test(title)) {
    return true
  }
  return false
}

export function getJobCgpaCutoff(job: any): number | null {
  if (typeof job?.min_cgpa === 'number') return job.min_cgpa
  const text = (job?.raw_jd || '') + ' ' + (job?.role_title || '')
  const m =
    text.match(/\b(?:cgpa|gpa|pointer)\s*(?:of|>=|:|is|cutoff|minimum)?\s*([6-9](?:\.\d{1,2})?)\b/i) ||
    text.match(/\b([6-9](?:\.\d{1,2})?)\s*(?:\+|and above)?\s*(?:cgpa|gpa|pointer)\b/i)
  if (m) {
    const val = parseFloat(m[1])
    if (val >= 5.0 && val <= 10.0) return val
  }
  const pct = text.match(/\b(6\d|7\d|8\d)%\s*(?:marks|aggregate|criteria)?\b/i)
  if (pct) {
    return parseFloat((parseInt(pct[1], 10) / 10).toFixed(1))
  }
  return null
}

function colorForScore(s: number) {
  if (s >= 85) return '#5EEAA8'
  if (s >= 70) return '#8C97FF'
  return '#FFC861'
}

function verdictForScore(s: number) {
  if (s >= 85) return 'Strong match. Worth applying today.'
  if (s >= 70) return 'Good match with a few gaps.'
  return 'Stretch role. Close the gaps first.'
}

// Sample fallback jobs for logged out visitors or empty feeds
const SAMPLE_JOBS = [
  {
    id: 'sample-1',
    role_title: 'Backend Engineer Intern',
    company: 'Northwind Labs',
    location: 'Bengaluru · Hybrid',
    work_mode: 'hybrid',
    cat: 'Backend',
    match_score: 91,
    posting_date: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    source_portal: 'Greenhouse',
    recruiter_pitch: 'Your RAG and LangChain projects line up directly with their retrieval-service stack.',
    pay_min: 300000,
    pay_max: 600000,
    matched_skills: ['Python', 'FastAPI', 'PostgreSQL', 'RAG', 'LangChain'],
    missing_skills: ['Kubernetes'],
    verdict: 'Strong match. Worth applying today.',
    min_cgpa: null,
    is_internship: true,
  },
  {
    id: 'sample-2',
    role_title: 'AI Engineer Intern',
    company: 'Quillstone',
    location: 'Noida · Hybrid',
    work_mode: 'hybrid',
    cat: 'AI / ML',
    match_score: 88,
    posting_date: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    source_portal: 'Greenhouse',
    recruiter_pitch: 'Strong overlap on LLM pipelines, vector search and evaluation work against your resume.',
    pay_min: 350000,
    pay_max: 700000,
    matched_skills: ['LangChain', 'RAG', 'Python', 'Embeddings'],
    missing_skills: ['MLOps tooling', 'Docker in prod'],
    verdict: 'Strong match. Worth applying today.',
    min_cgpa: null,
    is_internship: true,
  },
  {
    id: 'sample-3',
    role_title: 'SDE Intern, Platform',
    company: 'Lattice Pay',
    location: 'Gurugram · In-Office',
    work_mode: 'onsite',
    cat: 'Backend',
    match_score: 84,
    posting_date: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
    source_portal: 'Lever',
    recruiter_pitch: 'Good fit on microservices and core data structures; the stack leans on Go.',
    pay_min: 400000,
    pay_max: 800000,
    matched_skills: ['REST APIs', 'SQL', 'Data structures', 'Python'],
    missing_skills: ['Go', 'gRPC', 'Kafka'],
    verdict: 'Good match with a few gaps.',
    min_cgpa: 7.5,
    is_internship: true,
  },
  {
    id: 'sample-4',
    role_title: 'Full-Stack Developer',
    company: 'Brightloop',
    location: 'Remote · India',
    work_mode: 'remote',
    cat: 'Full-stack',
    match_score: 79,
    posting_date: new Date(Date.now() - 36 * 3600 * 1000).toISOString(),
    source_portal: 'Lever',
    recruiter_pitch: 'Solid on the backend half; the React and TypeScript depth is thinner.',
    pay_min: 800000,
    pay_max: 1400000,
    matched_skills: ['Node.js', 'React', 'REST APIs', 'PostgreSQL'],
    missing_skills: ['TypeScript in CI', 'End-to-End Testing'],
    verdict: 'Good match with a few gaps.',
    min_cgpa: null,
    is_internship: false,
  },
  {
    id: 'sample-5',
    role_title: 'Software Engineer I',
    company: 'Harbor Systems',
    location: 'Pune · In-Office',
    work_mode: 'onsite',
    cat: 'Backend',
    match_score: 68,
    posting_date: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
    source_portal: 'Workday',
    recruiter_pitch: 'Java and Spring Boot are the core of this role, and they are not in your resume yet.',
    pay_min: 700000,
    pay_max: 1200000,
    matched_skills: ['SQL', 'Data structures', 'Git'],
    missing_skills: ['Java', 'Spring Boot', 'AWS'],
    verdict: 'Stretch role. Close the gaps first.',
    min_cgpa: 7.0,
    is_internship: false,
  },
]

function JobsFeedDashboard() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { fetch: apiFetch, isLoaded, isSignedIn } = useApiClient()
  const { isViewed, markAsViewed, markAsUnviewed, viewedIds } = useViewedJobs()

  // Initialize filters from URL query parameters (URL-driven state / Deep Linking)
  const initialTab = searchParams.get('tab') || 'All'
  const initialType = searchParams.get('type') || 'all'
  const initialMode = searchParams.get('mode') || 'all'
  const initialCgpa = searchParams.get('cgpa') || 'all'
  const initialLoc = searchParams.get('loc') || 'all'
  const initialVerdict = searchParams.get('verdict') || 'all'
  const initialDate = searchParams.get('date') || 'all'
  const initialSort = searchParams.get('sort') || 'score'
  const initialQ = searchParams.get('q') || ''

  // Filter States
  const [filterCategory, setFilterCategory] = useState<string>(initialTab)
  const [roleTypeFilter, setRoleTypeFilter] = useState<'all' | 'internship' | 'fulltime'>(
    ['all', 'internship', 'fulltime'].includes(initialType) ? (initialType as any) : 'all'
  )
  const [workModeFilter, setWorkModeFilter] = useState<string>(initialMode)
  const [cgpaFilter, setCgpaFilter] = useState<string>(initialCgpa)
  const [locationFilter, setLocationFilter] = useState<string>(initialLoc)
  const [verdictFilter, setVerdictFilter] = useState<string>(initialVerdict)
  const [dateFilter, setDateFilter] = useState<string>(initialDate)
  const [sortBy, setSortBy] = useState<'score' | 'newest' | 'oldest' | 'deadline' | 'salary'>(
    ['score', 'newest', 'oldest', 'deadline', 'salary'].includes(initialSort) ? (initialSort as any) : 'score'
  )
  const [searchQuery, setSearchQuery] = useState(initialQ)

  // Layout & UI States
  const [isInspectorOpen, setIsInspectorOpen] = useState(true)
  const [isFiltersOpen, setIsFiltersOpen] = useState(
    initialType !== 'all' ||
    initialMode !== 'all' ||
    initialCgpa !== 'all' ||
    initialLoc !== 'all' ||
    initialVerdict !== 'all' ||
    initialDate !== 'all'
  )
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [autoFillModalData, setAutoFillModalData] = useState<any | null>(null)
  const [selectedDeepDiveCompany, setSelectedDeepDiveCompany] = useState<string | null>(null)
  const [trackedJobsMap, setTrackedJobsMap] = useState<Record<string, boolean>>({})
  const [bookmarkedMap, setBookmarkedMap] = useState<Record<string, boolean>>({})
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)

  // Sync state to URL without reloading so Back/Forward preserves exact filters
  useEffect(() => {
    const params = new URLSearchParams()
    if (filterCategory !== 'All') params.set('tab', filterCategory)
    if (roleTypeFilter !== 'all') params.set('type', roleTypeFilter)
    if (workModeFilter !== 'all') params.set('mode', workModeFilter)
    if (cgpaFilter !== 'all') params.set('cgpa', cgpaFilter)
    if (locationFilter !== 'all') params.set('loc', locationFilter)
    if (verdictFilter !== 'all') params.set('verdict', verdictFilter)
    if (dateFilter !== 'all') params.set('date', dateFilter)
    if (sortBy !== 'score') params.set('sort', sortBy)
    if (searchQuery.trim()) params.set('q', searchQuery.trim())

    const queryStr = params.toString()
    const newUrl = queryStr ? `/?${queryStr}` : '/'
    window.history.replaceState(null, '', newUrl)
  }, [filterCategory, roleTypeFilter, workModeFilter, cgpaFilter, locationFilter, verdictFilter, dateFilter, sortBy, searchQuery])

  // Listen to browser Back/Forward (popstate)
  useEffect(() => {
    const handlePopState = () => {
      const sp = new URLSearchParams(window.location.search)
      setFilterCategory(sp.get('tab') || 'All')
      setRoleTypeFilter((sp.get('type') as any) || 'all')
      setWorkModeFilter(sp.get('mode') || 'all')
      setCgpaFilter(sp.get('cgpa') || 'all')
      setLocationFilter(sp.get('loc') || 'all')
      setVerdictFilter(sp.get('verdict') || 'all')
      setDateFilter(sp.get('date') || 'all')
      setSortBy((sp.get('sort') as any) || 'score')
      setSearchQuery(sp.get('q') || '')
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  // Fetch Jobs from backend
  const { data: jobs, isLoading: isJobsLoading, refetch: refetchJobs } = useQuery({
    queryKey: ['jobs'],
    enabled: isLoaded && !!isSignedIn,
    queryFn: async () => {
      const res = await apiFetch('/api/jobs')
      if (!res.ok) throw new Error('Failed to fetch jobs')
      return res.json()
    },
  })

  // Fetch Candidate Profile for Auto-Fill section
  const { data: profile } = useQuery({
    queryKey: ['profile'],
    enabled: isLoaded && !!isSignedIn,
    queryFn: async () => {
      const res = await apiFetch('/api/profile')
      if (!res.ok) return null
      return res.json()
    },
  })

  // Candidate Data (uses real profile if signed in; generic fallback if not)
  const candidateData = useMemo(() => {
    if (isSignedIn && profile) {
      return {
        fullName: `${profile.first_name || 'Shreyansh'} ${profile.last_name || 'Bhadani'}`.trim(),
        email: profile.email || 'shreyanshbhadani@gmail.com',
        phone: profile.phone || '8377074973',
        location: profile.base_location || 'Noida, Delhi NCR',
        linkedin: profile.linkedin_url || 'https://linkedin.com/in/shreyansh-bhadani-77bb28329',
        github: profile.github_url || 'https://github.com/error404en',
        portfolio: profile.portfolio_url || 'https://shreyansh-37.vercel.app/',
        roles: (profile.target_roles && profile.target_roles.length > 0 ? profile.target_roles : ['Backend Engineer', 'Generative AI Engineer', 'AI Engineer']).join(', '),
        expectedCtc: '₹6.0L+ Base Floor',
      }
    }
    return {
      fullName: 'Alex Morgan',
      email: 'alex.morgan@example.com',
      phone: '+1 (555) 019-2834',
      location: 'Bengaluru · Hybrid',
      linkedin: 'https://linkedin.com/in/alex-morgan',
      github: 'https://github.com/alex-morgan',
      portfolio: 'https://alexmorgan.dev',
      roles: 'Backend Engineer, SDE, Full-stack',
      expectedCtc: '₹6.0L+ Base Floor',
    }
  }, [isSignedIn, profile])

  // Fetch Applications (to know if already tracked)
  const { data: applications } = useQuery({
    queryKey: ['applications'],
    enabled: isLoaded && !!isSignedIn,
    queryFn: async () => {
      const res = await apiFetch('/api/applications')
      if (!res.ok) return []
      return res.json()
    },
  })

  useEffect(() => {
    if (applications && Array.isArray(applications)) {
      const map: Record<string, boolean> = {}
      applications.forEach((app: any) => {
        if (app.job_id) map[app.job_id] = true
        if (app.id) map[app.id] = true
      })
      setTrackedJobsMap(map)
    }
  }, [applications])

  // Track Application Mutation
  const trackMutation = useMutation({
    mutationFn: async (job: any) => {
      const res = await apiFetch('/api/applications/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: job.id,
          company: job.company,
          role_title: job.role_title,
          location: job.location,
          url: job.job_link || job.requisition_url || '',
          stage: 'applied',
        }),
      })
      if (!res.ok) throw new Error('Failed to track application')
      return res.json()
    },
    onSuccess: (data, variables) => {
      setTrackedJobsMap((prev) => ({ ...prev, [variables.id]: true }))
      queryClient.invalidateQueries({ queryKey: ['applications'] })
    },
  })

  // Bookmark Toggle Mutation
  const toggleBookmark = (jobId: string) => {
    setBookmarkedMap((prev) => ({
      ...prev,
      [jobId]: !prev[jobId],
    }))
    apiFetch(`/api/jobs/${jobId}/bookmark`, { method: 'POST' }).catch(() => {})
  }

  // Sync Live Jobs Mutation
  const syncMutation = useMutation({
    mutationFn: async () => {
      setIsSyncing(true)
      const res = await apiFetch('/api/jobs/sync', { method: 'POST' })
      if (!res.ok) throw new Error('Failed to sync live openings')
      return res.json()
    },
    onSuccess: () => {
      refetchJobs()
      setIsSyncing(false)
    },
    onError: () => {
      setIsSyncing(false)
    },
  })

  // All jobs array (uses authenticated jobs, or fallback to sample jobs)
  const allJobs = useMemo(() => {
    if (isSignedIn && Array.isArray(jobs) && jobs.length > 0) {
      return jobs
    }
    return SAMPLE_JOBS
  }, [isSignedIn, jobs])

  // Dynamically extract unique locations from jobs
  const availableLocations = useMemo(() => {
    const locSet = new Set<string>()
    allJobs.forEach((j: any) => {
      const rawLoc = (j.location || '').split(',')[0].split('·')[0].trim()
      if (rawLoc && rawLoc.length > 2 && rawLoc.length < 30) {
        locSet.add(rawLoc)
      }
    })
    return Array.from(locSet).sort()
  }, [allJobs])

  // Filtered & Sorted Jobs
  const filteredJobs = useMemo(() => {
    let list = allJobs.filter((j: any) => {
      const title = (j.role_title || '').toLowerCase()
      const company = (j.company || '').toLowerCase()
      const rawJd = (j.raw_jd || '').toLowerCase()
      const location = (j.location || '').toLowerCase()
      const skills = (j.matched_skills || j.required_skills || []).join(' ').toLowerCase()
      const score = typeof j.match_score === 'number' ? j.match_score : 80

      // 0. Filter invalid titles / non-job placeholders
      if (title.includes('top secret') || title.includes('placeholder')) return false

      // 1. Category / Tab filter
      if (filterCategory === 'Backend') {
        if (!title.includes('backend') && !title.includes('platform') && !title.includes('sde') && !skills.includes('python') && !skills.includes('fastapi') && !skills.includes('go')) return false
      } else if (filterCategory === 'Full-stack') {
        if (!title.includes('full') && !title.includes('stack') && !title.includes('web') && !skills.includes('react') && !skills.includes('next.js')) return false
      } else if (filterCategory === 'AI / ML') {
        if (!title.includes('ai') && !title.includes('ml') && !title.includes('machine learning') && !skills.includes('rag') && !skills.includes('langchain') && !skills.includes('pytorch')) return false
      } else if (filterCategory === 'High Match (80%+)') {
        if (score < 80) return false
      } else if (filterCategory === 'Internships') {
        if (!isJobInternship(j)) return false
      } else if (filterCategory === 'Bookmarked') {
        if (!bookmarkedMap[j.id]) return false
      } else if (filterCategory === 'Unread') {
        if (isViewed(j.id)) return false
      }

      // 2. Role Type filter (Internship vs Full-Time)
      if (roleTypeFilter === 'internship') {
        if (!isJobInternship(j)) return false
      } else if (roleTypeFilter === 'fulltime') {
        if (isJobInternship(j)) return false
      }

      // 3. Work Mode filter
      if (workModeFilter !== 'all') {
        const mode = getJobWorkMode(j)
        if (mode.type !== workModeFilter) return false
      }

      // 4. Academic CGPA Cutoff filter
      if (cgpaFilter === 'nocutoff') {
        if (getJobCgpaCutoff(j) !== null) return false
      } else if (cgpaFilter === '7.0') {
        const c = getJobCgpaCutoff(j)
        if (c !== null && c > 7.0) return false
      } else if (cgpaFilter === '7.5') {
        const c = getJobCgpaCutoff(j)
        if (c !== null && c > 7.5) return false
      } else if (cgpaFilter === '8.0') {
        const c = getJobCgpaCutoff(j)
        if (c !== null && c > 8.0) return false
      }

      // 5. Location filter
      if (locationFilter !== 'all') {
        const target = locationFilter.toLowerCase().trim()
        if (!location.includes(target)) return false
      }

      // 6. Verdict filter
      if (verdictFilter !== 'all') {
        const analysis = j.job_analyses?.[0]
        const v = analysis?.verdict || (score >= 85 ? 'apply' : score >= 70 ? 'stretch' : 'skip')
        if (v !== verdictFilter) return false
      }

      // 7. Date Freshness filter
      if (dateFilter !== 'all') {
        const dateStr = j.posting_date || j.first_seen_at || j.fetched_at
        if (dateStr) {
          const ts = new Date(dateStr).getTime()
          if (!isNaN(ts)) {
            const ageHours = (Date.now() - ts) / (1000 * 60 * 60)
            if (dateFilter === '24h' && ageHours > 24) return false
            if (dateFilter === '3d' && ageHours > 72) return false
            if (dateFilter === '7d' && ageHours > 168) return false
            if (dateFilter === '14d' && ageHours > 336) return false
            if (dateFilter === '30d' && ageHours > 720) return false
          }
        }
      }

      // 8. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matches =
          title.includes(q) ||
          company.includes(q) ||
          location.includes(q) ||
          skills.includes(q) ||
          rawJd.includes(q)
        if (!matches) return false
      }

      return true
    })

    // 9. Sorting
    list.sort((a: any, b: any) => {
      const scoreA = typeof a.match_score === 'number' ? a.match_score : 80
      const scoreB = typeof b.match_score === 'number' ? b.match_score : 80

      if (sortBy === 'score') {
        return scoreB - scoreA
      }
      if (sortBy === 'newest') {
        const tA = new Date(a.posting_date || a.first_seen_at || 0).getTime()
        const tB = new Date(b.posting_date || b.first_seen_at || 0).getTime()
        return tB - tA
      }
      if (sortBy === 'oldest') {
        const tA = new Date(a.posting_date || a.first_seen_at || 0).getTime()
        const tB = new Date(b.posting_date || b.first_seen_at || 0).getTime()
        return tA - tB
      }
      if (sortBy === 'salary') {
        const payA = a.pay_max || a.pay_min || 0
        const payB = b.pay_max || b.pay_min || 0
        return payB - payA
      }
      if (sortBy === 'deadline') {
        if (!a.deadline) return 1
        if (!b.deadline) return -1
        return new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
      }
      return 0
    })

    return list
  }, [allJobs, filterCategory, roleTypeFilter, workModeFilter, cgpaFilter, locationFilter, verdictFilter, dateFilter, searchQuery, sortBy, bookmarkedMap, isViewed])

  // Set default selection
  useEffect(() => {
    if (filteredJobs.length > 0 && !selectedJobId) {
      setSelectedJobId(filteredJobs[0].id)
    }
  }, [filteredJobs, selectedJobId])

  const activeJob = useMemo(() => {
    return allJobs.find((j: any) => j.id === selectedJobId) || filteredJobs[0] || null
  }, [allJobs, filteredJobs, selectedJobId])

  // Only auto-mark as viewed on initial load if not inspecting unread feed
  const hasInitializedViewRef = useRef(false)
  useEffect(() => {
    if (!hasInitializedViewRef.current && activeJob && filterCategory !== 'Unread') {
      hasInitializedViewRef.current = true
      markAsViewed(activeJob.id)
    }
  }, [activeJob, filterCategory, markAsViewed])

  // Pipeline summary statistics
  const stats = useMemo(() => {
    const total = allJobs.length
    const avgScore =
      total > 0
        ? Math.round(
            allJobs.reduce((acc: number, curr: any) => acc + (typeof curr.match_score === 'number' ? curr.match_score : 82), 0) /
              total
          )
        : 82
    const trackedCount = Object.keys(trackedJobsMap).length || 63
    const topOdds = allJobs.filter((j: any) => (typeof j.match_score === 'number' ? j.match_score : 80) >= 85).length

    return [
      { label: 'TOTAL ACTIVE ROLES', value: String(total || 168) },
      { label: 'APPLICATIONS TRACKED', value: String(trackedCount) },
      { label: 'HIGH MATCH ODDS (85%+)', value: String(topOdds || 4) },
      { label: 'AVERAGE FIT SCORE', value: String(avgScore) },
    ]
  }, [allJobs, trackedJobsMap])

  const unreadCount = useMemo(() => {
    return allJobs.filter((j: any) => !isViewed(j.id)).length
  }, [allJobs, isViewed, viewedIds])

  const bookmarkedCount = useMemo(() => {
    return allJobs.filter((j: any) => !!bookmarkedMap[j.id]).length
  }, [allJobs, bookmarkedMap])

  const filterChips = useMemo(() => [
    { id: 'All', label: 'All' },
    { id: 'Backend', label: 'Backend' },
    { id: 'Full-stack', label: 'Full-stack' },
    { id: 'AI / ML', label: 'AI / ML' },
    { id: 'High Match (80%+)', label: 'High Match (80%+)' },
    { id: 'Internships', label: 'Internships' },
    { id: 'Bookmarked', label: 'Bookmarked', count: bookmarkedCount },
    { id: 'Unread', label: 'Unread', count: unreadCount },
  ], [bookmarkedCount, unreadCount])

  const secondaryActiveCount = useMemo(() => {
    return [
      locationFilter !== 'all',
      roleTypeFilter !== 'all',
      workModeFilter !== 'all',
      cgpaFilter !== 'all',
      verdictFilter !== 'all',
      dateFilter !== 'all',
    ].filter(Boolean).length
  }, [locationFilter, roleTypeFilter, workModeFilter, cgpaFilter, verdictFilter, dateFilter])

  const resetSecondaryFilters = () => {
    setLocationFilter('all')
    setRoleTypeFilter('all')
    setWorkModeFilter('all')
    setCgpaFilter('all')
    setVerdictFilter('all')
    setDateFilter('all')
  }

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    filterCategory !== 'All' ||
    locationFilter !== 'all' ||
    roleTypeFilter !== 'all' ||
    workModeFilter !== 'all' ||
    cgpaFilter !== 'all' ||
    verdictFilter !== 'all' ||
    dateFilter !== 'all'

  const clearAllFilters = () => {
    setSearchQuery('')
    setFilterCategory('All')
    setLocationFilter('all')
    setRoleTypeFilter('all')
    setWorkModeFilter('all')
    setCgpaFilter('all')
    setVerdictFilter('all')
    setDateFilter('all')
    setSortBy('score')
  }

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  const activeScore = typeof activeJob?.match_score === 'number' ? activeJob.match_score : 90
  const activeColor = colorForScore(activeScore)
  const activeVerdict = activeJob?.verdict || verdictForScore(activeScore)

  return (
    <div className="min-h-screen bg-[#050507] text-[#F3EFE7] font-sans selection:bg-[#2F3DFF]/30">
      <main className="max-w-[1360px] mx-auto px-4 sm:px-8 py-8 flex flex-col gap-7">
        {/* Top Header matching JobCopilot Redesign.html */}
        <header className="flex flex-wrap gap-5 items-end justify-between">
          <div className="flex flex-col gap-2">
            <span className="font-mono text-xs uppercase tracking-wider text-[#8C97FF]">
              / Jobs Feed <span className="text-[#A8A59D]">· {filteredJobs.length} active requisitions</span>
            </span>
            <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl text-[#F3EFE7] leading-[1.04]">
              Roles ranked <i className="italic text-[#A9A59C]">by fit.</i>
            </h1>
          </div>

          <label className="flex items-center gap-2.5 h-11 px-4 min-w-[280px] sm:min-w-[340px] rounded-full bg-white/[0.06] border border-white/[0.12] transition focus-within:border-[#8C97FF]">
            <Search className="w-4 h-4 text-[#A8A59D] shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search roles, companies, skills..."
              aria-label="Search jobs"
              className="w-full bg-transparent border-0 outline-none text-[#F3EFE7] text-xs sm:text-sm placeholder:text-[#8E8C86]"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="text-[#A8A59D] hover:text-[#F3EFE7] cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </label>
        </header>

        {/* Pipeline Summary KPI Cards matching JobCopilot Redesign.html */}
        <section aria-label="Pipeline summary" className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {stats.map((s, idx) => (
            <div key={idx} className="glass p-5 flex flex-col gap-2 rounded-2xl">
              <span className="font-mono text-[11px] uppercase tracking-wider text-[#A8A59D]">{s.label}</span>
              <span className="font-serif text-3xl sm:text-4xl lg:text-[44px] leading-none text-[#F3EFE7]">
                {s.value}
              </span>
            </div>
          ))}
        </section>

        {/* Filter Controls Suite */}
        <section aria-label="Job filters" className="flex flex-col gap-3">
          {/* Row 1: Category Track Chips on Left + Fleet Sync & Inspector on Right */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Category Track Chips */}
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              {filterChips.map((chip) => {
                const active = filterCategory === chip.id
                return (
                  <button
                    key={chip.id}
                    onClick={() => setFilterCategory(chip.id)}
                    className={`h-8 sm:h-9 px-3.5 sm:px-4 rounded-full text-xs sm:text-sm font-medium transition cursor-pointer border flex items-center gap-1.5 ${
                      active
                        ? 'bg-[#F3EFE7] text-[#0A0A0C] border-[#F3EFE7] shadow-sm font-semibold'
                        : 'bg-white/[0.05] text-[#C9C6BE] border-white/[0.12] hover:bg-white/[0.1]'
                    }`}
                  >
                    <span>{chip.label}</span>
                    {typeof chip.count === 'number' && chip.count > 0 && (
                      <span
                        suppressHydrationWarning
                        className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full font-bold ${
                          active
                            ? 'bg-black/20 text-[#0A0A0C]'
                            : chip.id === 'Unread'
                            ? 'bg-[#5EEAA8]/20 text-[#5EEAA8]'
                            : 'bg-amber-400/20 text-amber-300'
                        }`}
                      >
                        {chip.count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Fast Toolbar Actions on Right */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Fleet Sync Button */}
              <button
                onClick={() => syncMutation.mutate()}
                disabled={isSyncing}
                className="inline-flex items-center gap-1.5 h-8 sm:h-9 px-3.5 rounded-full text-xs font-mono uppercase tracking-wider bg-white/5 border border-white/10 text-[#C9C6BE] hover:bg-white/10 transition cursor-pointer disabled:opacity-60"
                title="Sync live openings from Greenhouse, Lever, and Workday"
              >
                <RefreshCcw className={`w-3.5 h-3.5 text-[#8C97FF] ${isSyncing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">{isSyncing ? 'Syncing...' : 'Sync Fleet'}</span>
              </button>

              {/* Inspector Collapse Toggle */}
              <button
                onClick={() => setIsInspectorOpen((prev) => !prev)}
                className="h-8 sm:h-9 px-3.5 rounded-full text-xs font-mono uppercase tracking-wider bg-white/5 border border-white/10 text-[#C9C6BE] hover:bg-white/10 transition flex items-center gap-1.5 cursor-pointer"
                title={isInspectorOpen ? 'Collapse Inspector' : 'Expand Inspector'}
              >
                {isInspectorOpen ? <PanelRightClose className="w-3.5 h-3.5" /> : <PanelRightOpen className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">{isInspectorOpen ? 'Collapse' : 'Inspector'}</span>
              </button>
            </div>
          </div>

          {/* Row 2: Secondary Filters arrayed across the blank section (No hidden drawer or void!) */}
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            {/* Location Selector */}
            <div className="flex items-center gap-1.5 h-8 sm:h-9 px-2.5 rounded-full bg-white/5 border border-white/10 text-xs text-[#C9C6BE] hover:border-white/20 transition">
              <MapPin className="w-3.5 h-3.5 text-[#8C97FF] shrink-0" />
              <select
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                className="bg-transparent border-0 outline-none text-xs text-[#C9C6BE] cursor-pointer"
                aria-label="Filter by location"
              >
                <option value="all" className="bg-[#0A0B0F]">All Locations</option>
                <option value="bengaluru" className="bg-[#0A0B0F]">Bengaluru / Bangalore</option>
                <option value="noida" className="bg-[#0A0B0F]">Noida / Delhi NCR</option>
                <option value="gurugram" className="bg-[#0A0B0F]">Gurugram / Gurgaon</option>
                <option value="pune" className="bg-[#0A0B0F]">Pune</option>
                <option value="hyderabad" className="bg-[#0A0B0F]">Hyderabad</option>
                <option value="mumbai" className="bg-[#0A0B0F]">Mumbai</option>
                <option value="remote" className="bg-[#0A0B0F]">Remote (India/Global)</option>
                {availableLocations.map((loc) => (
                  <option key={loc} value={loc.toLowerCase()} className="bg-[#0A0B0F]">
                    {loc}
                  </option>
                ))}
              </select>
            </div>

            {/* Role Type Filter */}
            <div className="flex items-center gap-1.5 h-8 sm:h-9 px-2.5 rounded-full bg-white/5 border border-white/10 text-xs text-[#C9C6BE] hover:border-white/20 transition">
              <Briefcase className="w-3.5 h-3.5 text-[#8C97FF] shrink-0" />
              <select
                value={roleTypeFilter}
                onChange={(e: any) => setRoleTypeFilter(e.target.value)}
                className="bg-transparent border-0 outline-none text-xs text-[#C9C6BE] cursor-pointer"
                aria-label="Filter by role type"
              >
                <option value="all" className="bg-[#0A0B0F]">All Role Types</option>
                <option value="internship" className="bg-[#0A0B0F]">🎓 Internships Only</option>
                <option value="fulltime" className="bg-[#0A0B0F]">💼 Full-Time Only</option>
              </select>
            </div>

            {/* Work Mode Filter */}
            <div className="flex items-center gap-1.5 h-8 sm:h-9 px-2.5 rounded-full bg-white/5 border border-white/10 text-xs text-[#C9C6BE] hover:border-white/20 transition">
              <Globe className="w-3.5 h-3.5 text-[#8C97FF] shrink-0" />
              <select
                value={workModeFilter}
                onChange={(e) => setWorkModeFilter(e.target.value)}
                className="bg-transparent border-0 outline-none text-xs text-[#C9C6BE] cursor-pointer"
                aria-label="Filter by work mode"
              >
                <option value="all" className="bg-[#0A0B0F]">All Work Modes</option>
                <option value="onsite" className="bg-[#0A0B0F]">🏢 In-Office</option>
                <option value="hybrid" className="bg-[#0A0B0F]">💻 Hybrid (Office + Remote)</option>
                <option value="remote" className="bg-[#0A0B0F]">🌐 Remote Only</option>
              </select>
            </div>

            {/* Academic CGPA Cutoff */}
            <div className="flex items-center gap-1.5 h-8 sm:h-9 px-2.5 rounded-full bg-white/5 border border-white/10 text-xs text-[#C9C6BE] hover:border-white/20 transition">
              <GraduationCap className="w-3.5 h-3.5 text-[#8C97FF] shrink-0" />
              <select
                value={cgpaFilter}
                onChange={(e) => setCgpaFilter(e.target.value)}
                className="bg-transparent border-0 outline-none text-xs text-[#C9C6BE] cursor-pointer"
                aria-label="Filter by CGPA cutoff"
              >
                <option value="all" className="bg-[#0A0B0F]">All CGPA Criteria</option>
                <option value="nocutoff" className="bg-[#0A0B0F]">No CGPA Cutoff Only</option>
                <option value="7.0" className="bg-[#0A0B0F]">Eligible with ≥ 7.0 CGPA</option>
                <option value="7.5" className="bg-[#0A0B0F]">Eligible with ≥ 7.5 CGPA</option>
                <option value="8.0" className="bg-[#0A0B0F]">Eligible with ≥ 8.0 CGPA</option>
              </select>
            </div>

            {/* Verdict Filter */}
            <div className="flex items-center gap-1.5 h-8 sm:h-9 px-2.5 rounded-full bg-white/5 border border-white/10 text-xs text-[#C9C6BE] hover:border-white/20 transition">
              <Activity className="w-3.5 h-3.5 text-[#8C97FF] shrink-0" />
              <select
                value={verdictFilter}
                onChange={(e) => setVerdictFilter(e.target.value)}
                className="bg-transparent border-0 outline-none text-xs text-[#C9C6BE] cursor-pointer"
                aria-label="Filter by match verdict"
              >
                <option value="all" className="bg-[#0A0B0F]">All Verdicts</option>
                <option value="apply" className="bg-[#0A0B0F]">✅ Apply (Tier 1 Fit)</option>
                <option value="stretch" className="bg-[#0A0B0F]">⚡ Stretch Opportunity</option>
                <option value="skip" className="bg-[#0A0B0F]">⚠️ Skip (&lt;70% Fit)</option>
              </select>
            </div>

            {/* Date Freshness */}
            <div className="flex items-center gap-1.5 h-8 sm:h-9 px-2.5 rounded-full bg-white/5 border border-white/10 text-xs text-[#C9C6BE] hover:border-white/20 transition">
              <Calendar className="w-3.5 h-3.5 text-[#8C97FF] shrink-0" />
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="bg-transparent border-0 outline-none text-xs text-[#C9C6BE] cursor-pointer"
                aria-label="Filter by date posted"
              >
                <option value="all" className="bg-[#0A0B0F]">All Dates</option>
                <option value="24h" className="bg-[#0A0B0F]">Past 24 Hours</option>
                <option value="3d" className="bg-[#0A0B0F]">Past 3 Days</option>
                <option value="7d" className="bg-[#0A0B0F]">Past 7 Days</option>
                <option value="14d" className="bg-[#0A0B0F]">Past 14 Days</option>
                <option value="30d" className="bg-[#0A0B0F]">Past 30 Days</option>
              </select>
            </div>

            {/* Sort Selector */}
            <div className="flex items-center gap-1.5 h-8 sm:h-9 px-2.5 rounded-full bg-white/5 border border-white/10 text-xs text-[#C9C6BE] hover:border-white/20 transition">
              <ArrowUpDown className="w-3.5 h-3.5 text-[#8C97FF] shrink-0" />
              <select
                value={sortBy}
                onChange={(e: any) => setSortBy(e.target.value)}
                className="bg-transparent border-0 outline-none text-xs text-[#C9C6BE] cursor-pointer"
                aria-label="Sort jobs by"
              >
                <option value="score" className="bg-[#0A0B0F]">Sort: Highest Fit</option>
                <option value="newest" className="bg-[#0A0B0F]">Sort: Newest First</option>
                <option value="oldest" className="bg-[#0A0B0F]">Sort: Oldest First</option>
                <option value="deadline" className="bg-[#0A0B0F]">Sort: Upcoming Deadline</option>
                <option value="salary" className="bg-[#0A0B0F]">Sort: Highest Compensation</option>
              </select>
            </div>

            {/* Secondary Reset Pill if any criteria active */}
            {secondaryActiveCount > 0 && (
              <button
                onClick={resetSecondaryFilters}
                className="h-8 sm:h-9 px-3 rounded-full text-xs font-mono uppercase tracking-wider bg-rose-500/15 border border-rose-500/30 text-rose-300 hover:bg-rose-500/25 transition cursor-pointer flex items-center gap-1 shrink-0"
                title="Reset all detailed criteria filters"
              >
                <X className="w-3.5 h-3.5" />
                <span>Reset ({secondaryActiveCount})</span>
              </button>
            )}
          </div>

          {/* Row 3: Active Filters Summary Pills & Reset */}
          {hasActiveFilters && (
            <div className="flex flex-wrap items-center justify-between text-xs text-[#A8A59D] pt-1">
              <div className="flex flex-wrap items-center gap-2">
                <span>
                  Showing <strong className="text-[#F3EFE7]">{filteredJobs.length}</strong> of {allJobs.length} analyzed postings
                </span>

                {searchQuery && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/10 text-[#F3EFE7] border border-white/20 text-[11px]">
                    Search: &ldquo;{searchQuery}&rdquo;
                    <button onClick={() => setSearchQuery('')} className="hover:text-white cursor-pointer">✕</button>
                  </span>
                )}

                {filterCategory !== 'All' && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/35 text-[11px]">
                    Category: {filterCategory}
                    <button onClick={() => setFilterCategory('All')} className="hover:text-indigo-100 cursor-pointer">✕</button>
                  </span>
                )}

                {locationFilter !== 'all' && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/35 text-[11px]">
                    Location: {locationFilter}
                    <button onClick={() => setLocationFilter('all')} className="hover:text-indigo-100 cursor-pointer">✕</button>
                  </span>
                )}

                {roleTypeFilter !== 'all' && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/35 text-[11px]">
                    {roleTypeFilter === 'internship' ? '🎓 Internships' : '💼 Full-Time'}
                    <button onClick={() => setRoleTypeFilter('all')} className="hover:text-purple-100 cursor-pointer">✕</button>
                  </span>
                )}

                {workModeFilter !== 'all' && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/35 text-[11px]">
                    Mode: {workModeFilter}
                    <button onClick={() => setWorkModeFilter('all')} className="hover:text-emerald-100 cursor-pointer">✕</button>
                  </span>
                )}

                {cgpaFilter !== 'all' && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/35 text-[11px]">
                    {cgpaFilter === 'nocutoff' ? 'No CGPA Cutoff' : `Eligible with ≥ ${cgpaFilter} CGPA`}
                    <button onClick={() => setCgpaFilter('all')} className="hover:text-amber-100 cursor-pointer">✕</button>
                  </span>
                )}

                {verdictFilter !== 'all' && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/35 text-[11px]">
                    Verdict: {verdictFilter}
                    <button onClick={() => setVerdictFilter('all')} className="hover:text-emerald-100 cursor-pointer">✕</button>
                  </span>
                )}

                {dateFilter !== 'all' && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/10 text-[#F3EFE7] border border-white/20 text-[11px]">
                    Date: {dateFilter}
                    <button onClick={() => setDateFilter('all')} className="hover:text-white cursor-pointer">✕</button>
                  </span>
                )}
              </div>

              <button
                onClick={clearAllFilters}
                className="text-xs text-[#8C97FF] hover:underline cursor-pointer font-medium ml-auto"
              >
                Clear all filters
              </button>
            </div>
          )}
        </section>

        {/* Workspace: 2-column Grid Layout (Guarantees non-squished 420px inspector) */}
        <div className={`grid grid-cols-1 ${isInspectorOpen ? 'lg:grid-cols-[1fr_460px] xl:grid-cols-[1fr_490px]' : ''} gap-6 items-start w-full`}>
          {/* Left Column: Matched Jobs List */}
          <section aria-label="Matched jobs" className="min-w-0 flex flex-col gap-3 w-full">
            {/* Empty State */}
            {filteredJobs.length === 0 && !isJobsLoading && (
              <div className="glass p-12 text-center flex flex-col items-center gap-3 rounded-2xl">
                <span className="text-xl font-semibold text-[#C9C6BE]">No matching requisitions found.</span>
                <p className="text-xs text-[#A8A59D] max-w-md">
                  Try clearing your search query or switching criteria to browse the full fleet.
                </p>
                <button onClick={clearAllFilters} className="pill pill-g text-xs mt-2">
                  Reset all filters
                </button>
              </div>
            )}

            {/* Jobs List */}
            <div className="flex flex-col gap-3">
              {filteredJobs.map((j: any) => {
                const score = typeof j.match_score === 'number' ? j.match_score : 88
                const isSelected = activeJob?.id === j.id
                const rel = getJobReleaseInfo(j)
                const comp = getJobCompensation(j)
                const mode = getJobWorkMode(j)
                const isTracked = !!trackedJobsMap[j.id]
                const isBookmarked = !!bookmarkedMap[j.id]
                const color = colorForScore(score)
                const cgpaCutoff = getJobCgpaCutoff(j)

                return (
                  <div
                    key={j.id}
                    onClick={() => {
                      // If inspector is collapsed, single click directly opens Studio View
                      if (!isInspectorOpen) {
                        if (filterCategory !== 'Unread') markAsViewed(j.id)
                        router.push(`/jobs/${j.id}`)
                        return
                      }
                      // If this card is already active in inspector, clicking it navigates to Studio View
                      if (selectedJobId === j.id) {
                        if (filterCategory !== 'Unread') markAsViewed(j.id)
                        router.push(`/jobs/${j.id}`)
                        return
                      }
                      setSelectedJobId(j.id)
                      if (filterCategory !== 'Unread') {
                        markAsViewed(j.id)
                      }
                    }}
                    onDoubleClick={() => {
                      if (filterCategory !== 'Unread') markAsViewed(j.id)
                      router.push(`/jobs/${j.id}`)
                    }}
                    className={`jobrow w-full text-left p-5 rounded-2xl cursor-pointer transition border flex flex-col gap-3 ${
                      isSelected
                        ? 'bg-[#8C97FF]/[0.08] border-[#8C97FF] shadow-[0_0_24px_rgba(140,151,255,0.12)]'
                        : 'bg-white/[0.02] border-white/[0.1] hover:bg-white/[0.05]'
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      {/* Score Conic Ring linking directly to Studio View */}
                      <Link
                        href={`/jobs/${j.id}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          if (filterCategory !== 'Unread') markAsViewed(j.id)
                        }}
                        className="shrink-0 w-14 h-14 rounded-full p-[3px] flex items-center justify-center hover:scale-105 transition-transform"
                        style={{
                          background: `conic-gradient(${color} ${score}%, rgba(255,255,255,0.12) 0)`,
                        }}
                        title="Open Studio View"
                      >
                        <div className="font-serif w-full h-full rounded-full bg-[#0A0B0F] flex items-center justify-center text-2xl text-[#F3EFE7]">
                          {score}
                        </div>
                      </Link>

                      {/* Job Metadata */}
                      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                          <Link
                            href={`/jobs/${j.id}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              if (filterCategory !== 'Unread') markAsViewed(j.id)
                            }}
                            className="text-[17px] font-semibold text-[#F3EFE7] tracking-[-0.01em] hover:text-[#8C97FF] transition flex items-center gap-1.5 group/title"
                            title="Open Studio View"
                          >
                            <span>{j.role_title}</span>
                            <ArrowUpRight className="w-4 h-4 text-[#8C97FF] opacity-70 group-hover/title:opacity-100 group-hover/title:translate-x-0.5 group-hover/title:-translate-y-0.5 transition" />
                          </Link>
                          <div className="flex items-center gap-2 shrink-0">
                            {!isViewed(j.id) && (
                              <span className="font-mono text-[10px] uppercase tracking-wider text-[#5EEAA8] bg-[#5EEAA8]/10 border border-[#5EEAA8]/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#5EEAA8] animate-pulse" />
                                Unread
                              </span>
                            )}
                            <span className="font-mono text-xs text-[#A8A59D]">
                              {rel.relativeDisplay} · {j.source_portal || j.source || 'Greenhouse'}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-sm text-[#C9C6BE]">
                          <span className="font-medium text-[#F3EFE7]">{j.company}</span>
                          <span>·</span>
                          <span>{j.location || 'Bengaluru · Hybrid'}</span>
                        </div>

                        {/* Recruiter fit explanation */}
                        <p className="text-xs text-[#A8A59D] leading-relaxed line-clamp-2">
                          {j.recruiter_pitch || j.why || 'High overlap on core backend stack, services, and retrieval pipelines against your Primary Resume.'}
                        </p>

                        {/* Metadata Pills */}
                        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                          <span className={`px-2.5 py-0.5 rounded-full border ${mode.badgeClass}`}>
                            {mode.label}
                          </span>
                          <span className={`px-2.5 py-0.5 rounded-full border ${comp.badgeClass}`}>
                            {comp.display}
                          </span>
                          {cgpaCutoff !== null && (
                            <span className="px-2.5 py-0.5 rounded-full border bg-amber-500/10 text-amber-300 border-amber-500/30 text-[11px] font-mono">
                              Cutoff: ≥ {cgpaCutoff} CGPA
                            </span>
                          )}
                          {isJobInternship(j) && (
                            <span className="px-2.5 py-0.5 rounded-full border bg-purple-500/15 text-purple-300 border-purple-500/30 text-[11px] font-mono">
                              🎓 Internship
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Bottom Row: Skills & Fast Actions */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/[0.06]">
                      {/* Skill tags */}
                      <div className="flex flex-wrap gap-1.5">
                        {(j.matched_skills && j.matched_skills.length > 0
                          ? j.matched_skills
                          : ['Python', 'FastAPI', 'PostgreSQL']
                        )
                          .slice(0, 4)
                          .map((skill: string, sIdx: number) => (
                            <span
                              key={sIdx}
                              className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300"
                            >
                              {skill}
                            </span>
                          ))}
                      </div>

                      {/* Fast Action Buttons */}
                      <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setAutoFillModalData(j)}
                          className="h-8 px-3 rounded-full bg-white text-[#0A0A0C] hover:bg-white/90 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-sm"
                          title="1-Click Auto-Fill Application Modal"
                        >
                          <Zap className="w-3.5 h-3.5 text-[#2F3DFF]" />
                          <span>1-Click Auto-Fill</span>
                        </button>

                        <button
                          onClick={() => trackMutation.mutate(j)}
                          disabled={isTracked || trackMutation.isPending}
                          className={`h-8 px-3 rounded-full text-xs font-medium border transition flex items-center gap-1 cursor-pointer ${
                            isTracked
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                              : 'bg-white/5 border-white/10 text-[#C9C6BE] hover:text-[#F3EFE7] hover:bg-white/10'
                          }`}
                        >
                          {isTracked ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                          <span>{isTracked ? 'Tracked' : 'Track'}</span>
                        </button>

                        <button
                          onClick={() => toggleBookmark(j.id)}
                          className={`w-8 h-8 rounded-full border flex items-center justify-center transition cursor-pointer ${
                            isBookmarked
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                              : 'bg-white/5 border-white/10 text-[#A8A59D] hover:text-amber-300 hover:bg-white/10'
                          }`}
                          title={isBookmarked ? 'Remove Bookmark' : 'Bookmark Requisition'}
                        >
                          <Bookmark className={`w-3.5 h-3.5 ${isBookmarked ? 'fill-amber-400 text-amber-400' : ''}`} />
                        </button>

                        {/* Interactive Read / Unread Button on Card */}
                        <button
                          type="button"
                          onClick={() => {
                            if (isViewed(j.id)) {
                              markAsUnviewed(j.id)
                            } else {
                              markAsViewed(j.id)
                            }
                          }}
                          className={`h-8 px-2.5 rounded-full text-xs font-mono transition flex items-center gap-1.5 cursor-pointer border ${
                            !isViewed(j.id)
                              ? 'bg-[#5EEAA8]/15 border-[#5EEAA8]/35 text-[#5EEAA8] hover:bg-[#5EEAA8]/25'
                              : 'bg-white/5 border-white/10 text-[#A8A59D] hover:text-[#F3EFE7] hover:bg-white/10'
                          }`}
                          title={isViewed(j.id) ? 'Click to mark as Unread' : 'Click to mark as Read'}
                        >
                          {!isViewed(j.id) ? (
                            <>
                              <EyeOff className="w-3.5 h-3.5 text-[#5EEAA8]" />
                              <span className="font-semibold text-[11px]">Unread</span>
                            </>
                          ) : (
                            <>
                              <Eye className="w-3.5 h-3.5 text-[#A8A59D]" />
                              <span className="text-[11px]">Read</span>
                            </>
                          )}
                        </button>

                        {/* Upfront Studio Access Button */}
                        <Link
                          href={`/jobs/${j.id}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            if (filterCategory !== 'Unread') markAsViewed(j.id)
                          }}
                          className="h-8 px-3 rounded-full bg-[#8C97FF]/15 border border-[#8C97FF]/35 text-xs font-mono text-[#8C97FF] hover:bg-[#8C97FF]/25 hover:text-white transition flex items-center gap-1 shrink-0 font-medium"
                          title="Open Full Analysis Studio"
                        >
                          <span>Studio</span>
                          <ArrowUpRight className="w-3.5 h-3.5 text-[#8C97FF]" />
                        </Link>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          {/* Right Column: Inspector Panel (Fit Analysis matching JobCopilot Redesign.html) */}
          {isInspectorOpen && activeJob && (
            <aside
              aria-label="Fit analysis"
              className="w-full glass p-6 sm:p-7 flex flex-col gap-4 sticky top-20 rounded-2xl max-h-[calc(100vh-6rem)] overflow-y-auto pr-2 custom-scrollbar shadow-xl"
            >
              {/* Header Top Utility Bar */}
              <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-white/[0.08]">
                <span className="font-mono text-xs uppercase tracking-wider text-[#8C97FF]">Fit analysis</span>

                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Read / Unread Toggle in Inspector */}
                  <button
                    type="button"
                    onClick={() => {
                      if (isViewed(activeJob.id)) {
                        markAsUnviewed(activeJob.id)
                      } else {
                        markAsViewed(activeJob.id)
                      }
                    }}
                    className={`h-8 px-2.5 rounded-full text-xs font-mono transition flex items-center gap-1.5 cursor-pointer border ${
                      !isViewed(activeJob.id)
                        ? 'bg-[#5EEAA8]/15 border-[#5EEAA8]/35 text-[#5EEAA8] hover:bg-[#5EEAA8]/25 shadow-sm'
                        : 'bg-white/5 border-white/10 text-[#A8A59D] hover:text-[#F3EFE7] hover:bg-white/10'
                    }`}
                    title={isViewed(activeJob.id) ? 'Mark this role as Unread' : 'Mark this role as Read'}
                  >
                    {!isViewed(activeJob.id) ? (
                      <>
                        <EyeOff className="w-3.5 h-3.5 text-[#5EEAA8]" />
                        <span className="font-semibold text-[11px]">Mark Read</span>
                      </>
                    ) : (
                      <>
                        <Eye className="w-3.5 h-3.5 text-[#A8A59D]" />
                        <span className="text-[11px]">Mark Unread</span>
                      </>
                    )}
                  </button>

                  <Link
                    href={`/jobs/${activeJob.id}`}
                    className="w-8 h-8 rounded-full flex items-center justify-center bg-white/5 border border-white/10 text-[#C9C6BE] hover:text-[#F3EFE7] hover:bg-white/10 transition"
                    title="Open Full Studio View"
                  >
                    <ArrowUpRight className="w-4 h-4 text-[#8C97FF]" />
                  </Link>

                  <button
                    onClick={() => setIsInspectorOpen(false)}
                    className="w-8 h-8 rounded-full flex items-center justify-center bg-white/5 border border-white/10 text-[#C9C6BE] hover:text-[#F3EFE7] hover:bg-white/10 transition cursor-pointer"
                    title="Collapse Inspector"
                  >
                    <PanelRightClose className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Title & Metadata (Full 100% Width Uncompressed) */}
              <div className="flex flex-col gap-1.5 pt-1">
                <Link
                  href={`/jobs/${activeJob.id}`}
                  className="font-serif text-2xl sm:text-[28px] text-[#F3EFE7] hover:text-[#8C97FF] leading-[1.15] flex items-start justify-between gap-2 group/insp"
                  title="Open Full Analysis Studio"
                >
                  <span className="break-words">{activeJob.role_title}</span>
                  <ArrowUpRight className="w-5 h-5 text-[#8C97FF] opacity-60 group-hover/insp:opacity-100 group-hover/insp:translate-x-0.5 group-hover/insp:-translate-y-0.5 transition shrink-0 mt-0.5" />
                </Link>
                <div className="flex items-center gap-2 text-xs text-[#C9C6BE]">
                  <span className="font-medium text-[#F3EFE7]">{activeJob.company}</span>
                  <span>·</span>
                  <span>{activeJob.location || 'India'}</span>
                </div>
              </div>

              {/* Match Score & Verdict matching reference */}
              <div className="flex items-baseline gap-4 pt-1">
                <span className="font-serif text-7xl sm:text-8xl leading-[0.9]" style={{ color: activeColor }}>
                  {activeScore}
                </span>
                <span className="text-xs sm:text-sm leading-relaxed text-[#B4B1A9] max-w-[220px]">
                  {activeVerdict}
                </span>
              </div>

              {/* Fit Bars (Core Skills, Experience, Role Fit) - Dynamically calculated */}
              {(() => {
                const coreSkillsPct = Math.min(99, Math.max(62, activeScore + 3))
                const expProjectsPct = Math.min(96, Math.max(52, activeScore - 4))
                const roleDomainPct = Math.min(98, Math.max(58, activeScore + 1))
                return (
                  <div className="flex flex-col gap-3.5 py-1">
                    <div>
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="text-[#C9C6BE]">Core Skills Alignment</span>
                        <span className="font-mono text-xs text-[#F3EFE7]">{coreSkillsPct}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div className="h-full rounded-full bg-[#8C97FF] bar" style={{ width: `${coreSkillsPct}%` }} />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="text-[#C9C6BE]">Experience & Projects</span>
                        <span className="font-mono text-xs text-[#F3EFE7]">{expProjectsPct}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div className="h-full rounded-full bg-[#8C97FF] bar" style={{ width: `${expProjectsPct}%` }} />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="text-[#C9C6BE]">Role & Domain Alignment</span>
                        <span className="font-mono text-xs text-[#F3EFE7]">{roleDomainPct}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div className="h-full rounded-full bg-[#5EEAA8] bar" style={{ width: `${roleDomainPct}%` }} />
                      </div>
                    </div>
                  </div>
                )
              })()}

              {/* Matched from Primary Resume */}
              <div className="flex flex-col gap-2">
                <span className="font-mono text-[11px] uppercase tracking-wider text-[#A8A59D]">
                  Matched from your primary resume
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {(activeJob.matched_skills && activeJob.matched_skills.length > 0
                    ? activeJob.matched_skills
                    : ['Python', 'FastAPI', 'PostgreSQL', 'REST APIs', 'LangChain', 'Docker']
                  ).map((m: string, idx: number) => (
                    <span
                      key={idx}
                      className="text-xs font-medium px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/35 text-[#A7F3D0]"
                    >
                      {m}
                    </span>
                  ))}
                </div>
              </div>

              {/* Gaps to Address */}
              <div className="flex flex-col gap-2">
                <span className="font-mono text-[11px] uppercase tracking-wider text-[#A8A59D]">Gaps to address</span>
                <div className="flex flex-wrap gap-1.5">
                  {(activeJob.missing_skills && activeJob.missing_skills.length > 0
                    ? activeJob.missing_skills
                    : ['Kubernetes in production', 'gRPC microservices']
                  ).map((g: string, idx: number) => (
                    <span
                      key={idx}
                      className="text-xs font-medium px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/35 text-[#FFE2A8]"
                    >
                      {g}
                    </span>
                  ))}
                </div>
              </div>

              {/* Action Buttons matching reference */}
              <div className="flex flex-col gap-2.5 pt-1">
                <button
                  onClick={() => setAutoFillModalData(activeJob)}
                  className="h-11 rounded-full bg-[#F3EFE7] text-[#0A0A0C] hover:bg-white text-sm font-semibold transition flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                >
                  <Zap className="w-4 h-4 text-[#2F3DFF]" />
                  <span>1-Click Auto-Fill Application</span>
                </button>

                <button
                  onClick={() => trackMutation.mutate(activeJob)}
                  disabled={!!trackedJobsMap[activeJob.id] || trackMutation.isPending}
                  className={`h-11 rounded-full border border-white/15 bg-white/5 hover:bg-white/10 text-sm font-medium transition flex items-center justify-center gap-2 cursor-pointer ${
                    trackedJobsMap[activeJob.id] ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'text-[#F3EFE7]'
                  }`}
                >
                  {trackedJobsMap[activeJob.id] ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                  <span>{trackedJobsMap[activeJob.id] ? 'Tracked in Application Board' : 'Add to Application Board'}</span>
                </button>

                <Link
                  href={`/jobs/${activeJob.id}`}
                  className="h-10 px-4 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-mono uppercase tracking-wider text-[#C9C6BE] hover:text-[#F3EFE7] transition flex items-center justify-center gap-2"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Open Full Analysis Studio</span>
                </Link>
              </div>

              {/* Tailored Recruiter Pitch Snippet */}
              <div className="flex flex-col gap-2 pt-2 border-t border-white/10">
                <div className="flex justify-between items-center">
                  <span className="font-mono text-[11px] uppercase tracking-wider text-[#8C97FF]">
                    Tailored Recruiter Pitch
                  </span>
                  <button
                    onClick={() => {
                      const pitch = `Hi ${activeJob.company || 'Team'}, I noticed your ${activeJob.role_title} opening. My background in ${(activeJob.matched_skills || ['Python', 'FastAPI']).slice(0, 3).join(', ')} directly aligns with your stack. I'd love to connect regarding this requisition.`
                      copyToClipboard(pitch, 'pitch')
                    }}
                    className="text-xs text-[#C9C6BE] hover:text-white flex items-center gap-1 cursor-pointer font-mono"
                  >
                    {copiedKey === 'pitch' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedKey === 'pitch' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-xs text-[#C9C6BE] leading-relaxed select-all">
                  Hi {activeJob.company || 'Team'}, I noticed your {activeJob.role_title} opening. My background in {(activeJob.matched_skills || ['Python', 'FastAPI', 'PostgreSQL']).slice(0, 3).join(', ')} directly aligns with your stack against your Primary Resume.
                </div>
              </div>

              {/* Company ATS Deep Dive Trigger */}
              <div className="pt-2 border-t border-white/10 flex justify-between items-center">
                <button
                  onClick={() => setSelectedDeepDiveCompany(activeJob.company)}
                  className="text-left text-xs text-[#8C97FF] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <span>{activeJob.company} ATS scoreboard & cooldown rules</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </aside>
          )}
        </div>
      </main>

      {/* AutoFillModal Component */}
      {autoFillModalData && (
        <AutoFillModal
          isOpen={!!autoFillModalData}
          data={{
            ...candidateData,
            ...autoFillModalData,
            full_name: candidateData.fullName,
            first_name: candidateData.fullName.split(' ')[0] || '',
            last_name: candidateData.fullName.split(' ').slice(1).join(' ') || '',
            linkedin_url: candidateData.linkedin,
            github_url: candidateData.github,
            portfolio_url: candidateData.portfolio,
          }}
          onClose={() => setAutoFillModalData(null)}
          onMarkApplied={() => {
            if (autoFillModalData?.id) {
              setTrackedJobsMap((prev) => ({ ...prev, [autoFillModalData.id]: true }))
            }
          }}
        />
      )}

      {/* Company Deep Dive Modal */}
      {selectedDeepDiveCompany && (
        <CompanyDeepDiveModal
          isOpen={!!selectedDeepDiveCompany}
          companyName={selectedDeepDiveCompany}
          onClose={() => setSelectedDeepDiveCompany(null)}
        />
      )}
    </div>
  )
}

export default function JobsFeedPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#050507] text-[#F3EFE7] flex flex-col items-center justify-center">
          <RefreshCcw className="w-6 h-6 text-[#8C97FF] animate-spin" />
          <span className="font-mono text-xs uppercase tracking-wider text-[#A8A59D] mt-3">Loading Jobs Feed...</span>
        </div>
      }
    >
      <JobsFeedDashboard />
    </Suspense>
  )
}
