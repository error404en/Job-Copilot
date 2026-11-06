'use client'

import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import { useApiClient } from '@/lib/useApiClient'
import { useViewedJobs } from '@/lib/useViewedJobs'
import TailoringStudio from './TailoringStudio'
import CopilotCoach from '@/components/CopilotCoach'
import AutoFillModal from '@/components/AutoFillModal'
import CompanyDeepDiveModal from '@/components/CompanyDeepDiveModal'
import CareersPortalExplorer from '@/components/CareersPortalExplorer'
import { 
  ArrowUpRight, 
  Zap, 
  Target, 
  ListTodo, 
  Calendar, 
  MapPin, 
  Building2, 
  Clock, 
  Briefcase, 
  Activity,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  RotateCcw,
  Trash2,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  FileText,
  Bot,
  Layers,
  Banknote,
  Search,
  Star,
  Users,
  Scale,
  Award,
  ArrowLeft,
  GraduationCap,
  X,
  PanelLeftClose,
  PanelLeft,
  Eye,
  EyeOff,
  Globe,
  Laptop,
  IndianRupee,
} from 'lucide-react'
import { 
  getJobWorkMode, 
  getJobCompensation, 
  getJobReleaseInfo, 
  getCompanyMonogram, 
  getCompanyMonogramGradient 
} from '@/app/page'

function formatSeniority(sen?: string): string {
  if (!sen) return 'Not Stated'
  const s = sen.toLowerCase()
  if (s.includes('fresher') || s.includes('intern') || s.includes('0-1') || s.includes('entry')) return 'Fresher / Entry Level'
  if (s.includes('2-5') || s.includes('mid')) return 'Mid-Level (2–5 Yrs)'
  if (s.includes('senior') || s.includes('5+')) return 'Senior (5+ Yrs)'
  if (s.includes('lead') || s.includes('staff')) return 'Lead / Staff'
  return sen.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function cleanReasoning(text?: string): string {
  if (!text) return ''
  return text
    .replace(/\bgood_fit\b/gi, 'Optimal Seniority Alignment')
    .replace(/\bunderqualified\b/gi, 'Seniority Stretch')
    .replace(/\bAlgorithmic Evaluation:\s*/gi, '')
    .trim()
}

function formatDeadlineDate(dateStr?: string | null): string {
  if (!dateStr) return 'Rolling Applications'
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return dateStr
  }
}

function getApplySourceLabel(url?: string, sourceType?: string): { label: string; isOfficial: boolean } {
  if (!url) return { label: 'Application Link', isOfficial: false }
  try {
    const host = new URL(url).hostname.toLowerCase()
    if (['greenhouse.io', 'lever.co', 'ashbyhq.com', 'smartrecruiters.com', 'workdayjobs.com', 'myworkdayjobs.com', 'oraclecloud.com', 'taleo.net', 'icims.com'].some(ats => host.includes(ats))) {
      return { label: 'Official ATS Portal', isOfficial: true }
    }
    if (sourceType === 'curated_official' || sourceType === 'official_portal') {
      return { label: 'Official Careers Portal', isOfficial: true }
    }
    if (host.includes('linkedin.com')) {
      return { label: 'LinkedIn Posting', isOfficial: false }
    }
    if (host.includes('wellfound.com') || host.includes('instahyre.com')) {
      return { label: 'Direct Board Posting', isOfficial: false }
    }
    if (!['glassdoor', 'indeed', 'naukri', 'monster', 'shine'].some(agg => host.includes(agg))) {
      return { label: 'Company Portal', isOfficial: true }
    }
    return { label: 'External Job Link', isOfficial: false }
  } catch {
    return { label: 'Application Portal', isOfficial: false }
  }
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
  if (/\b(new grad|graduate engineer|full-time|full time|permanent|developer|engineer|analyst|associate|manager|lead)\b/i.test(title) && !/\b(intern|internship|trainee)\b/i.test(title)) {
    return false
  }
  const seniority = (job.seniority_required || '').toLowerCase()
  if (seniority === 'intern') return true
  const rawJd = (job.raw_jd || '').toLowerCase()
  if (/\b(this internship|internship position|internship role|duration of the internship|summer internship program|winter internship program|internship stipend)\b/i.test(rawJd)) {
    return true
  }
  return false
}

export default function JobDetailPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const { fetch: apiFetch, isLoaded, isSignedIn } = useApiClient()
  const { isViewed, markAsViewed, markAsUnviewed } = useViewedJobs()
  
  const jobId = params.id as string
  const initialTab = (searchParams.get('tab') as any) || 'analysis'
  const [activeTab, setActiveTab] = useState<'analysis' | 'studio' | 'coach' | 'description' | 'resume-target'>('analysis')
  const [tailorPrompt, setTailorPrompt] = useState('')
  const [isEditingDeadline, setIsEditingDeadline] = useState(false)
  const [deadlineInput, setDeadlineInput] = useState('')
  const [trackingDropdownOpen, setTrackingDropdownOpen] = useState(false)
  const [copiedResumeTitle, setCopiedResumeTitle] = useState(false)
  const [copiedJd, setCopiedJd] = useState(false)
  const [jdSearchQuery, setJdSearchQuery] = useState('')
  const [autoFillModalData, setAutoFillModalData] = useState<any | null>(null)
  const [isSyncingResume, setIsSyncingResume] = useState(false)
  const [deepDiveOpen, setDeepDiveOpen] = useState(false)

  // Auto-mark as viewed when user inspects the full job page
  useEffect(() => {
    if (jobId) {
      markAsViewed(jobId)
    }
  }, [jobId, markAsViewed])

  // Sync tab with URL search parameter and sessionStorage on browser popstate / back button / mount
  useEffect(() => {
    const syncTab = () => {
      if (typeof window === 'undefined') return
      const sp = new URLSearchParams(window.location.search)
      let tab = sp.get('tab') as any
      if (!tab) {
        try {
          tab = sessionStorage.getItem(`apply_tool_job_tab_${jobId}`)
        } catch {}
      }
      if (['analysis', 'studio', 'coach', 'description', 'resume-target'].includes(tab)) {
        setActiveTab(tab)
      } else {
        setActiveTab('analysis')
      }
    }
    syncTab()

    const handlePopState = () => {
      syncTab()
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [jobId])

  const handleTabChange = (newTab: 'analysis' | 'studio' | 'coach' | 'description' | 'resume-target') => {
    setActiveTab(newTab)
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem(`apply_tool_job_tab_${jobId}`, newTab)
      } catch {}
      const url = new URL(window.location.href)
      url.searchParams.set('tab', newTab)
      window.history.replaceState(null, '', url.pathname + url.search)
    }
  }

  // 1. Fetch Job
  const { data: job, isLoading } = useQuery({
    queryKey: ['job', jobId],
    enabled: isLoaded && !!isSignedIn,
    queryFn: async () => {
      const res = await apiFetch(`/api/jobs/${jobId}`)
      if (!res.ok) throw new Error('Failed to fetch job')
      return res.json()
    },
    refetchInterval: (query) => {
      const data = query.state.data as any
      if (data && (!data.job_analyses || data.job_analyses.length === 0)) {
        return 3000
      }
      return false
    }
  })

  // 2. Fetch User Profile (for Dream Company sync)
  const { data: profile } = useQuery({
    queryKey: ['profile'],
    enabled: isLoaded && !!isSignedIn,
    queryFn: async () => {
      const res = await apiFetch('/api/profile')
      if (!res.ok) return null
      return res.json()
    }
  })

  // 3. Fetch tracked applications to know current tracking status
  const { data: applications } = useQuery({
    queryKey: ['applications'],
    enabled: isLoaded && !!isSignedIn,
    queryFn: async () => {
      const res = await apiFetch('/api/applications')
      if (!res.ok) return []
      return res.json()
    }
  })

  const currentApplication = applications?.find((a: any) => a.job_id === jobId)
  const isDreamCompany = !!(profile?.dream_companies && job?.company && profile.dream_companies.includes(job.company))

  // Mutations
  const updateJobMutation = useMutation({
    mutationFn: async (updates: any) => {
      if ('is_bookmarked' in updates && Object.keys(updates).length === 1) {
        const res = await apiFetch(`/api/jobs/${jobId}/bookmark`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_bookmarked: updates.is_bookmarked }),
        })
        if (!res.ok) throw new Error('Failed to update bookmark')
        return res.json()
      }
      const res = await apiFetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (!res.ok) throw new Error('Failed to update job')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job', jobId] })
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
  })

  const reanalyzeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`/api/jobs/${jobId}/reanalyze`, {
        method: 'POST'
      })
      if (!res.ok) throw new Error('Failed to re-analyze job')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job', jobId] })
    }
  })

  const deleteJobMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`/api/jobs/${jobId}`, {
        method: 'DELETE'
      })
      if (!res.ok) throw new Error('Failed to delete job')
      return res.json()
    },
    onSuccess: () => {
      router.push('/')
    }
  })

  const trackMutation = useMutation({
    mutationFn: async ({ jobData, status }: { jobData: any; status: string }) => {
      const res = await apiFetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: jobData.id,
          company: jobData.company,
          role_title: jobData.role_title,
          location: jobData.location,
          url: jobData.official_apply_url || jobData.url,
          status: status,
          notes: `Added from Job Copilot detail view`
        })
      })
      if (!res.ok) throw new Error('Failed to track job')
      return res.json()
    },
    onSuccess: (data, variables) => {
      setTrackingDropdownOpen(false)
      queryClient.setQueryData(['applications'], (old: any) => {
        if (!old) return [data]
        const filtered = old.filter((a: any) => a.job_id !== jobId)
        return [...filtered, data]
      })
      queryClient.invalidateQueries({ queryKey: ['applications'] })
    }
  })

  const dreamCompanyMutation = useMutation({
    mutationFn: async (companyName: string) => {
      const current = profile?.dream_companies || []
      const updated = current.includes(companyName)
        ? current.filter((c: string) => c !== companyName)
        : [...current, companyName]
      const res = await apiFetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dream_companies: updated })
      })
      if (!res.ok) throw new Error('Failed to update dream companies')
      return updated
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['profile'], (old: any) => old ? { ...old, dream_companies: updated } : { dream_companies: updated })
      queryClient.invalidateQueries({ queryKey: ['profile'] })
    }
  })

  const autoApplyMutation = useMutation({
    mutationFn: async ({ url, jobId }: { url: string; jobId: string }) => {
      // 1. Fetch Auto-Fill data packet immediately from /api/auto-apply/data (fast & resilient)
      const dataRes = await apiFetch(
        `/api/auto-apply/data?url=${encodeURIComponent(url || '')}&job_id=${encodeURIComponent(jobId || '')}`
      )
      if (dataRes.ok) {
        const packet = await dataRes.json()
        return { autofill: packet, ...packet }
      }
      // 2. Fallback to POST /api/applications/auto-apply
      const res = await apiFetch('/api/applications/auto-apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, job_id: jobId })
      })
      if (!res.ok) throw new Error('Failed to build auto-fill kit')
      return res.json()
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['applications'] })
      setAutoFillModalData(data)
    },
    onError: (err: any) => {
      console.error('AutoApply mutation error:', err)
    }
  })

  const handleSyncIdentityFromResume = async () => {
    setIsSyncingResume(true)
    try {
      const res = await apiFetch('/api/profile/sync-from-resume', { method: 'POST' })
      if (res.ok && autoFillModalData) {
        const currentUrl = autoFillModalData?.autofill?.apply_url || ''
        const refreshed = await apiFetch(`/api/auto-apply/data?url=${encodeURIComponent(currentUrl)}&job_id=${jobId}`)
        if (refreshed.ok) {
          const newPacket = await refreshed.json()
          setAutoFillModalData({ ...autoFillModalData, autofill: newPacket })
        }
      }
      queryClient.invalidateQueries({ queryKey: ['profile'] })
    } finally {
      setIsSyncingResume(false)
    }
  }

  const toggleBookmark = () => {
    const nextBm = !job?.is_bookmarked
    queryClient.setQueryData(['job', jobId], (old: any) => (old ? { ...old, is_bookmarked: nextBm } : old))
    queryClient.setQueryData(['jobs'], (old: any) => {
      if (!old) return old
      return old.map((j: any) => (j.id === jobId ? { ...j, is_bookmarked: nextBm } : j))
    })
    updateJobMutation.mutate({ is_bookmarked: nextBm })
  }

  const handleSaveDeadline = () => {
    updateJobMutation.mutate({ deadline: deadlineInput ? new Date(deadlineInput).toISOString() : null })
    setIsEditingDeadline(false)
  }

  const handleWeaveSkillIntoStudio = (skill: string) => {
    setTailorPrompt(`Weave in demonstrated proficiency with ${skill}.`)
    setActiveTab('studio')
  }

  const handleCopyTitle = (title: string) => {
    navigator.clipboard.writeText(title)
    setCopiedResumeTitle(true)
    setTimeout(() => setCopiedResumeTitle(false), 2000)
  }

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-6xl mx-auto py-6 animate-pulse font-sans">
        <div className="h-6 w-36 bg-zinc-800 rounded-lg"></div>
        <div className="bg-zinc-900/40 p-8 rounded-2xl border border-zinc-800/60 flex flex-col md:flex-row justify-between items-start gap-6">
          <div className="space-y-4 flex-1">
            <div className="h-8 bg-zinc-800 rounded-lg w-2/3"></div>
            <div className="h-5 bg-zinc-800/60 rounded w-1/3"></div>
            <div className="h-10 bg-zinc-800/40 rounded-xl w-full"></div>
          </div>
          <div className="w-36 h-36 bg-zinc-800/60 rounded-2xl shrink-0"></div>
        </div>
      </div>
    )
  }

  if (!job) {
    return (
      <div className="flex flex-col items-center justify-center py-28 text-center max-w-md mx-auto font-sans">
        <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-3xl mb-4">
          🔍
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Job Requisition Not Found</h2>
        <p className="text-sm text-zinc-500 mb-6 leading-relaxed">
          This job may have been removed or the requisition link has expired.
        </p>
        <Link 
          href="/" 
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-md"
        >
          Return to Dashboard
        </Link>
      </div>
    )
  }

  const analysis = job.job_analyses && job.job_analyses[0]

  if (!analysis) {
    const rawTime = job.fetched_at || ''
    const dateStr = rawTime ? (rawTime.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(rawTime) ? rawTime : `${rawTime}Z`) : new Date().toISOString()
    const fetchedAt = new Date(dateStr).getTime()
    const isTimeout = (Date.now() - fetchedAt) > 3 * 60 * 1000

    if (isTimeout) {
      return (
        <div className="flex flex-col items-center justify-center py-28 text-center max-w-lg mx-auto font-sans">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-3xl mb-4 text-amber-400">
            ⏳
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Analysis Queued or Timed Out</h2>
          <p className="text-sm text-zinc-400 mb-6 leading-relaxed">
            The background AI evaluation worker timed out while parsing this requisition. Click below to immediately run deterministic analysis.
          </p>
          <button
            onClick={() => reanalyzeMutation.mutate()}
            disabled={reanalyzeMutation.isPending}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-md disabled:opacity-50 flex items-center gap-2"
          >
            <RotateCcw className={`w-4 h-4 ${reanalyzeMutation.isPending ? 'animate-spin' : ''}`} />
            {reanalyzeMutation.isPending ? 'Analyzing Requisition...' : 'Re-analyze Requisition'}
          </button>
        </div>
      )
    }

    return (
      <div className="flex flex-col items-center justify-center py-32 text-center space-y-5 font-sans">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
          <div className="absolute inset-0 flex items-center justify-center text-xl">🤖</div>
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Synthesizing Job Evaluation...</h2>
          <p className="text-xs text-zinc-500 mt-1">Comparing technical requirements, seniority thresholds, and company intelligence.</p>
        </div>
      </div>
    )
  }

  const verdictStyles: Record<string, { bg: string; text: string; border: string; label: string }> = {
    apply: {
      bg: 'bg-emerald-500/10',
      text: 'text-emerald-400',
      border: 'border-emerald-500/30',
      label: 'Optimal Apply Match'
    },
    stretch: {
      bg: 'bg-amber-500/10',
      text: 'text-amber-400',
      border: 'border-amber-500/30',
      label: 'Growth Stretch Role'
    },
    skip: {
      bg: 'bg-rose-500/10',
      text: 'text-rose-400',
      border: 'border-rose-500/30',
      label: 'Seniority / Pay Skip'
    }
  }

  const vStyle = verdictStyles[analysis.verdict] || {
    bg: 'bg-zinc-800',
    text: 'text-zinc-300',
    border: 'border-zinc-700',
    label: analysis.verdict?.toUpperCase() || 'EVALUATED'
  }

  const scoreColor = analysis.match_score >= 80 
    ? 'text-emerald-400 from-emerald-400 to-teal-500' 
    : analysis.match_score >= 55 
    ? 'text-amber-400 from-amber-400 to-orange-500' 
    : 'text-rose-400 from-rose-400 to-red-500'

  const applyUrl = job.official_apply_url || job.url
  const applySource = getApplySourceLabel(applyUrl, job.source_type || job.source)

  return (
    <div className="space-y-6 pb-16 max-w-6xl mx-auto font-sans antialiased">
      {/* Top Navigation & Actions Bar */}
      <div className="flex items-center justify-between text-xs text-[#918f9f] pb-1">
        <Link
          href="/"
          className="flex items-center gap-1.5 text-[#918f9f] hover:text-[#e2e2e8] transition-colors group text-xs font-semibold"
        >
          <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
          <span>Back to Live Feed</span>
        </Link>
        <div className="flex items-center gap-2">
          <button
            onClick={() => reanalyzeMutation.mutate()}
            disabled={reanalyzeMutation.isPending}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#1a1c20] border border-[#464553]/35 hover:border-[#464553]/60 text-[#918f9f] hover:text-[#e2e2e8] transition-colors cursor-pointer text-xs font-semibold"
            title="Re-run AI scoring"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${reanalyzeMutation.isPending ? 'animate-spin' : ''}`} />
            <span>Re-score</span>
          </button>
          <button
            onClick={() => {
              if (confirm('Are you sure you want to delete this job from your pipeline?')) {
                deleteJobMutation.mutate()
              }
            }}
            disabled={deleteJobMutation.isPending}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#1a1c20] border border-[#464553]/35 hover:border-rose-500/40 text-[#918f9f] hover:text-rose-400 transition-colors cursor-pointer text-xs font-semibold"
            title="Delete requisition"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete</span>
          </button>
        </div>
      </div>

      {/* 1. DECLUTTERED HERO COMMAND CENTER */}
      {(() => {
        const workMode = getJobWorkMode(job)
        const comp = getJobCompensation(job)
        const release = getJobReleaseInfo(job)
        const isIntern = isJobInternship(job)
        const text = (job.raw_jd || '') + ' ' + (job.role_title || '')
        const m = text.match(/\b(?:cgpa|gpa|pointer)\s*(?:of|>=|:|is|cutoff|minimum)?\s*([6-9](?:\.\d{1,2})?)\b/i) || text.match(/\b([6-9](?:\.\d{1,2})?)\s*(?:\+|and above)?\s*(?:cgpa|gpa|pointer)\b/i)
        const cgpaCutoff = job.min_cgpa || (m ? parseFloat(m[1]) : null)

        return (
          <div className="space-y-4">
            <div className="bg-[#141519] rounded-2xl border border-[#27272a] shadow-lg overflow-hidden relative">
              <div className="p-5 sm:p-6 space-y-4 relative z-10">
                {/* Identity Header */}
                <div className="flex flex-col lg:flex-row items-start justify-between gap-4">
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    {/* Company Monogram Tile */}
                    <div className={`w-12 sm:w-14 h-12 sm:h-14 rounded-2xl bg-gradient-to-br ${getCompanyMonogramGradient(job.company)} border flex items-center justify-center shrink-0 font-bold font-mono text-base sm:text-lg shadow-inner relative`}>
                      {getCompanyMonogram(job.company)}
                      <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#141519] ${job.source === 'inbox' ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                    </div>

                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white font-heading truncate max-w-2xl">
                          {cleanTitle(job.role_title)}
                        </h1>
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-bold border shrink-0 ${
                          analysis.match_score >= 80 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25' : 'bg-amber-500/10 text-amber-400 border-amber-500/25'
                        }`}>
                          {analysis.match_score}% Match
                        </span>
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${vStyle.bg} ${vStyle.text} ${vStyle.border}`}>
                          {analysis.verdict}
                        </span>
                      </div>

                      {/* Company Subtitle & Quick Controls */}
                      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                        <button
                          type="button"
                          onClick={() => setDeepDiveOpen(true)}
                          className="font-bold text-zinc-200 hover:text-indigo-400 flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <Building2 className="w-3.5 h-3.5 text-indigo-400" />
                          <span>{job.company}</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-500/15 text-indigo-300 font-mono">Deep Dive ↗</span>
                        </button>

                        {job.cooldown_policy && (
                          <button
                            type="button"
                            onClick={() => setDeepDiveOpen(true)}
                            className="px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/35 text-amber-300 text-[10px] font-semibold flex items-center gap-1 hover:bg-amber-500/25 transition-colors cursor-pointer"
                            title={job.cooldown_policy.description}
                          >
                            <Clock className="w-2.5 h-2.5 text-amber-400" /> {job.cooldown_policy.cooldown_days}d Cooldown
                          </button>
                        )}

                        <button
                          onClick={() => dreamCompanyMutation.mutate(job.company)}
                          disabled={dreamCompanyMutation.isPending}
                          className={`px-2 py-0.5 rounded-md text-[10px] font-semibold transition-all flex items-center gap-1 border cursor-pointer ${
                            isDreamCompany
                              ? 'bg-amber-500/15 text-amber-300 border-amber-500/35'
                              : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border-zinc-800'
                          }`}
                        >
                          <Target className={`w-2.5 h-2.5 ${isDreamCompany ? 'text-amber-400' : 'text-zinc-500'}`} />
                          <span>{isDreamCompany ? 'Dream Company' : '+ Dream Target'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => (isViewed(jobId) ? markAsUnviewed(jobId) : markAsViewed(jobId))}
                          className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border flex items-center gap-1 transition-all cursor-pointer ${
                            !isViewed(jobId)
                              ? 'bg-cyan-500/15 border-cyan-500/35 text-cyan-300'
                              : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                          }`}
                        >
                          {!isViewed(jobId) ? <EyeOff className="w-2.5 h-2.5 text-cyan-400" /> : <Eye className="w-2.5 h-2.5 text-emerald-400" />}
                          <span>{!isViewed(jobId) ? 'Unreviewed' : 'Looked At'}</span>
                        </button>

                        <button
                          onClick={toggleBookmark}
                          className="p-1 rounded-md text-zinc-400 hover:text-amber-300 transition-colors cursor-pointer"
                          title={job.is_bookmarked ? "Bookmarked Role" : "Bookmark Role"}
                        >
                          <Star className={`w-3.5 h-3.5 ${job.is_bookmarked ? 'fill-amber-400 text-amber-400' : 'text-zinc-500'}`} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Top Action Launchpad */}
                  <div className="flex items-center gap-2 shrink-0 flex-wrap w-full lg:w-auto pt-2 lg:pt-0 border-t lg:border-t-0 border-zinc-800">
                    {applyUrl && (
                      <button
                        type="button"
                        onClick={() => autoApplyMutation.mutate({ url: applyUrl, jobId: job.id })}
                        disabled={autoApplyMutation.isPending}
                        className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)] flex items-center gap-1.5 active:scale-95 cursor-pointer disabled:opacity-50"
                      >
                        <Zap className="w-3.5 h-3.5 fill-white" />
                        <span>{autoApplyMutation.isPending ? 'Preparing...' : '1-Click Auto-Fill'}</span>
                      </button>
                    )}

                    {applyUrl && <CareersPortalExplorer job={job} />}

                    {/* Track Status Dropdown */}
                    <div className="relative">
                      <button
                        onClick={() => setTrackingDropdownOpen(!trackingDropdownOpen)}
                        disabled={trackMutation.isPending}
                        className={`px-3 py-2 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer ${
                          currentApplication
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                            : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700'
                        }`}
                        title="Track Application Status"
                      >
                        <ListTodo className={`w-3.5 h-3.5 ${currentApplication ? 'text-emerald-400' : 'text-indigo-400'}`} />
                        <span className="capitalize">{trackMutation.isPending ? 'Saving...' : currentApplication ? currentApplication.status : 'Track'}</span>
                        <ChevronDown className="w-3 h-3 text-zinc-400" />
                      </button>

                      {trackingDropdownOpen && (
                        <div className="absolute right-0 top-full mt-2 w-48 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-1.5 z-50 space-y-1">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 px-2 py-1">
                            Set Pipeline Status
                          </div>
                          {[
                            { id: 'saved', label: 'Wishlist / Saved' },
                            { id: 'applied', label: 'Applied' },
                            { id: 'interviewing', label: 'Interviewing' },
                            { id: 'offer', label: 'Offer Received' },
                          ].map((st) => (
                            <button
                              key={st.id}
                              onClick={() => trackMutation.mutate({ jobData: job, status: st.id })}
                              className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center justify-between cursor-pointer ${
                                currentApplication?.status === st.id
                                  ? 'bg-indigo-600/30 text-indigo-200 font-bold'
                                  : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
                              }`}
                            >
                              <span>{st.label}</span>
                              {currentApplication?.status === st.id ? (
                                <Check className="w-3.5 h-3.5 text-indigo-400" />
                              ) : (
                                <ChevronRight className="w-3 h-3 text-zinc-500" />
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Upfront Vital Factors Strip */}
                <div className="flex flex-wrap items-center gap-2 pt-2.5 border-t border-zinc-800/60 text-xs">
                  {/* 1. Work Mode Badge */}
                  <span className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border flex items-center gap-1.5 shrink-0 ${workMode.badgeClass}`}>
                    {workMode.type === 'remote' ? <Globe className="w-3.5 h-3.5 text-emerald-400" /> : workMode.type === 'hybrid' ? <Laptop className="w-3.5 h-3.5 text-indigo-400" /> : <Building2 className="w-3.5 h-3.5 text-zinc-400" />}
                    <span>{workMode.label} ({workMode.sublabel})</span>
                  </span>

                  {/* 2. Upfront Compensation (vs ₹6L Lower Threshold) */}
                  <span className={`px-2.5 py-1 rounded-lg text-[11px] border flex items-center gap-1.5 shrink-0 cursor-help ${comp.badgeClass}`} title={`${comp.note} (Base condition: ₹600,000 INR lower threshold)`}>
                    <IndianRupee className="w-3.5 h-3.5 text-current" />
                    <span>{comp.display}</span>
                  </span>

                  {/* 3. Opening Release Recency */}
                  <span className={`px-2.5 py-1 rounded-lg text-[11px] border flex items-center gap-1.5 shrink-0 cursor-help ${release.badgeClass}`} title={release.applyFactor}>
                    {release.isFresh ? <Zap className="w-3.5 h-3.5 fill-emerald-400/20 text-emerald-400" /> : <Calendar className="w-3.5 h-3.5 text-zinc-400" />}
                    <span>{release.label}</span>
                  </span>

                  {/* 4. Geographic City Pill */}
                  <span className="flex items-center gap-1.5 text-[11px] text-zinc-300 px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800">
                    <MapPin className="w-3.5 h-3.5 text-zinc-500" />
                    <span>{job.location || 'India Tech Hub'}</span>
                  </span>

                  {/* Academic Cutoff */}
                  <span className="text-[11px] px-2.5 py-1 rounded-lg bg-zinc-900 text-zinc-300 border border-zinc-800 font-medium">
                    {cgpaCutoff ? `Min ${cgpaCutoff} CGPA` : 'No CGPA Cutoff'}
                  </span>

                  {/* Seniority Track */}
                  <span className="text-[11px] px-2.5 py-1 rounded-lg bg-zinc-900 text-zinc-300 border border-zinc-800 font-medium">
                    {isIntern ? 'Internship / Trainee' : formatSeniority(job.seniority_required)}
                  </span>

                  {/* Formatted Deadline with Clean Popover */}
                  <div className="px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center gap-1.5 text-[11px] text-zinc-300 relative">
                    <Clock className="w-3 h-3 text-zinc-400" />
                    <span>{formatDeadlineDate(job.deadline)}</span>
                    <button
                      onClick={() => {
                        setDeadlineInput(job.deadline ? job.deadline.split('T')[0] : '')
                        setIsEditingDeadline(!isEditingDeadline)
                      }}
                      className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold ml-1 transition-colors underline cursor-pointer"
                    >
                      {job.deadline ? 'Edit' : '+ Set'}
                    </button>
                    {isEditingDeadline && (
                      <div className="absolute top-full left-0 mt-2 p-3 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl z-50 flex items-center gap-2">
                        <input
                          type="date"
                          value={deadlineInput}
                          onChange={(e) => setDeadlineInput(e.target.value)}
                          className="bg-zinc-950 border border-zinc-700 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-indigo-500"
                        />
                        <button
                          onClick={handleSaveDeadline}
                          className="bg-indigo-600 hover:bg-indigo-500 text-white px-2.5 py-1 rounded-lg text-xs font-bold"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setIsEditingDeadline(false)}
                          className="text-zinc-400 hover:text-zinc-200 p-1"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Company Cooldown Callout Strip if Applicable */}
              {job.cooldown_policy && (
                <div className="border-t border-amber-500/25 bg-amber-500/10 px-5 sm:px-6 py-3 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 text-amber-300">
                    <Clock className="w-4 h-4 shrink-0 text-amber-400" />
                    <span className="font-semibold">
                      {job.cooldown_policy.company_name} enforces a {job.cooldown_policy.cooldown_days}-day reapplication cooldown.
                    </span>
                    <span className="hidden sm:inline text-zinc-400">
                      Strategy: {job.cooldown_policy.recommendation}
                    </span>
                  </div>
                  <button
                    onClick={() => setDeepDiveOpen(true)}
                    className="text-amber-400 hover:text-amber-300 font-bold shrink-0 underline"
                  >
                    View Policy Details →
                  </button>
                </div>
              )}
            </div>

            {/* 2. SIX-FACTOR VITAL METRIC GRID */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {/* Box 1: Match Score */}
              <div className="bg-[#141519] p-3.5 rounded-xl border border-[#27272a] shadow-sm">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 block">
                  Match Score
                </span>
                <span className="text-lg font-bold font-mono text-emerald-400 mt-0.5 block">
                  {analysis.match_score}%
                </span>
                <span className="text-[10px] text-zinc-400 block truncate">
                  {vStyle.label}
                </span>
              </div>

              {/* Box 2: Work Mode */}
              <div className="bg-[#141519] p-3.5 rounded-xl border border-[#27272a] shadow-sm">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 block">
                  Work Mode
                </span>
                <span className="text-xs font-bold text-zinc-100 mt-1 flex items-center gap-1.5 truncate">
                  {workMode.type === 'remote' ? <Globe className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> : workMode.type === 'hybrid' ? <Laptop className="w-3.5 h-3.5 text-indigo-400 shrink-0" /> : <Building2 className="w-3.5 h-3.5 text-zinc-400 shrink-0" />}
                  <span>{workMode.label}</span>
                </span>
                <span className="text-[10px] text-zinc-400 block truncate">
                  {workMode.sublabel}
                </span>
              </div>

              {/* Box 3: Compensation (Calibrated to ₹6L Floor) */}
              <div className="bg-[#141519] p-3.5 rounded-xl border border-[#27272a] shadow-sm">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 block">
                  Compensation
                </span>
                <span className={`text-xs font-bold font-mono mt-1 block truncate ${comp.status === 'above_floor' ? 'text-emerald-400' : comp.status === 'meets_floor' ? 'text-emerald-300' : 'text-zinc-200'}`}>
                  {comp.display}
                </span>
                <span className="text-[10px] text-zinc-400 block truncate" title={`${comp.note} (Base condition: ₹600k lower threshold)`}>
                  {comp.note}
                </span>
              </div>

              {/* Box 4: Release Timing */}
              <div className="bg-[#141519] p-3.5 rounded-xl border border-[#27272a] shadow-sm">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 block">
                  Release Recency
                </span>
                <span className={`text-xs font-bold mt-1 flex items-center gap-1.5 truncate ${release.isFresh ? 'text-emerald-400' : 'text-zinc-200'}`}>
                  {release.isFresh ? <Zap className="w-3.5 h-3.5 fill-emerald-400/20 text-emerald-400 shrink-0" /> : <Calendar className="w-3.5 h-3.5 text-zinc-400 shrink-0" />}
                  <span>{release.shortLabel}</span>
                </span>
                <span className="text-[10px] text-zinc-400 block truncate" title={release.applyFactor}>
                  {release.isFresh ? '🔥 High Response' : '📅 Active Requisition'}
                </span>
              </div>

              {/* Box 5: Role Track */}
              <div className="bg-[#141519] p-3.5 rounded-xl border border-[#27272a] shadow-sm">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 block">
                  Role Track
                </span>
                <span className="text-xs font-semibold text-zinc-200 mt-1 block truncate">
                  {isIntern ? 'Internship' : formatSeniority(job.seniority_required)}
                </span>
                <span className="text-[10px] text-zinc-400 block truncate">
                  {job.min_years_experience !== null && job.min_years_experience !== undefined ? `${job.min_years_experience} yr min exp` : 'Fresher Friendly'}
                </span>
              </div>

              {/* Box 6: Academic Cutoff */}
              <div className="bg-[#141519] p-3.5 rounded-xl border border-[#27272a] shadow-sm">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 block">
                  Academic Cutoff
                </span>
                <span className="text-xs font-semibold font-mono text-amber-300 mt-1 block truncate">
                  {cgpaCutoff ? `Min ${cgpaCutoff} CGPA` : 'No CGPA Cutoff'}
                </span>
                <span className="text-[10px] text-zinc-400 block truncate">
                  Open to all candidates
                </span>
              </div>
            </div>
          </div>
        )
      })()}

      {/* 3. SEGMENTED WORKSPACE TAB NAVIGATION */}
      <div className="flex items-center gap-1.5 bg-[#141519] p-1.5 rounded-2xl border border-[#27272a] backdrop-blur-md overflow-x-auto custom-scrollbar">
        {/* Recommended Resume Tab */}
        {analysis.recommended_resume_title && (
          <button
            onClick={() => handleTabChange('resume-target')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 border cursor-pointer ${
              activeTab === 'resume-target'
                ? 'bg-indigo-600 text-white shadow-sm border-indigo-500'
                : 'bg-indigo-500/10 text-indigo-300 hover:text-white hover:bg-indigo-500/20 border-indigo-500/30'
            }`}
            title={`Recommended Resume: ${analysis.recommended_resume_title}`}
          >
            <FileText className="w-3.5 h-3.5 text-indigo-300" />
            <span>Recommended Resume</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
          </button>
        )}

        <button
          onClick={() => handleTabChange('analysis')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
            activeTab === 'analysis'
              ? 'bg-zinc-800 text-white shadow-sm border border-zinc-700'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-800/40 border border-transparent'
          }`}
        >
          <Activity className="w-3.5 h-3.5 text-emerald-400" />
          <span>Role Analysis &amp; Intel</span>
        </button>

        <button
          onClick={() => handleTabChange('studio')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
            activeTab === 'studio'
              ? 'bg-zinc-800 text-white shadow-sm border border-zinc-700'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-800/40 border border-transparent'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          <span>Tailoring Studio</span>
          {analysis.missing_keywords && analysis.missing_keywords.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold">
              {analysis.missing_keywords.length} Gaps
            </span>
          )}
        </button>

        <button
          onClick={() => handleTabChange('coach')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
            activeTab === 'coach'
              ? 'bg-zinc-800 text-white shadow-sm border border-zinc-700'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-800/40 border border-transparent'
          }`}
        >
          <Bot className="w-3.5 h-3.5 text-purple-400" />
          <span>Interview Coach</span>
        </button>

        <button
          onClick={() => handleTabChange('description')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
            activeTab === 'description'
              ? 'bg-zinc-800 text-white shadow-sm border border-zinc-700'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-800/40 border border-transparent'
          }`}
        >
          <FileText className="w-3.5 h-3.5 text-sky-400" />
          <span>Job Description</span>
        </button>
      </div>

      {/* 4. TAB PANELS */}

      {/* TAB 1: ROLE ANALYSIS & COMPANY INTEL */}
      {activeTab === 'analysis' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          
          {/* Matched vs Missing Skills Matrix */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Matched Skills */}
            <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800/80 backdrop-blur-sm shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Verified Matched Proficiencies
                </h3>
                <span className="text-[11px] font-semibold text-zinc-500">
                  {analysis.matched_keywords?.length || 0} proficiencies
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                {analysis.matched_keywords?.map((kw: string) => (
                  <span 
                    key={kw} 
                    className="px-3 py-1 bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 rounded-xl text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Check className="w-3 h-3 text-emerald-400" />
                    {kw}
                  </span>
                ))}
                {!analysis.matched_keywords?.length && (
                  <span className="text-xs text-zinc-500 italic">No direct keyword overlap identified.</span>
                )}
              </div>
            </div>

            {/* Missing Requirements with 1-Click Action */}
            <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800/80 backdrop-blur-sm shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  Potential Gaps & Missing Keywords
                </h3>
                <span className="text-[11px] font-semibold text-zinc-500">Click to weave in</span>
              </div>

              <div className="flex flex-wrap gap-2">
                {analysis.missing_keywords?.map((kw: string) => (
                  <button 
                    key={kw}
                    onClick={() => handleWeaveSkillIntoStudio(kw)}
                    className="px-3 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/20 hover:border-amber-500/40 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all group"
                    title="Click to switch to Tailoring Studio and weave into prompt"
                  >
                    <span>{kw}</span>
                    <Sparkles className="w-3 h-3 text-amber-400 group-hover:scale-125 transition-transform" />
                  </button>
                ))}
                {!analysis.missing_keywords?.length && (
                  <div className="text-xs text-emerald-400 flex items-center gap-1.5 bg-emerald-500/10 p-2.5 rounded-xl border border-emerald-500/20 w-full">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>No missing technical requirements detected!</span>
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* Company Intelligence Grid */}
          {analysis.company_info ? (
            <div className="bg-zinc-900/50 p-6 sm:p-8 rounded-2xl border border-zinc-800/80 backdrop-blur-sm shadow-sm space-y-6">
              <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-indigo-400" />
                  Verified Company Intelligence: {job.company}
                </h3>
                {analysis.company_info.overall_sentiment && (
                  <span className="text-xs font-bold px-3 py-1 bg-zinc-800 text-zinc-200 rounded-full border border-zinc-700">
                    Sentiment: {analysis.company_info.overall_sentiment}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                <div className="p-4 bg-zinc-950/60 rounded-xl border border-zinc-800/60 space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
                    <Users className="w-3 h-3 text-indigo-400" />
                    Work Culture
                  </span>
                  <p className="text-xs text-zinc-300 leading-relaxed">
                    {analysis.company_info.work_culture || 'Engineering-driven culture with structured project cycles.'}
                  </p>
                </div>

                <div className="p-4 bg-zinc-950/60 rounded-xl border border-zinc-800/60 space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
                    <Scale className="w-3 h-3 text-sky-400" />
                    Work / Life Balance
                  </span>
                  <p className="text-xs text-zinc-300 leading-relaxed">
                    {analysis.company_info.work_life_balance || 'Competitive pace aligned with high-growth technology expectations.'}
                  </p>
                </div>

                <div className="p-4 bg-zinc-950/60 rounded-xl border border-zinc-800/60 space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
                    <Banknote className="w-3 h-3 text-emerald-400" />
                    Comp Estimates
                  </span>
                  <p className="text-xs text-zinc-300 leading-relaxed">
                    {analysis.company_info.compensation_estimates || 'Market-competitive base pay plus stock equity bands.'}
                  </p>
                </div>

                <div className="p-4 bg-zinc-950/60 rounded-xl border border-zinc-800/60 space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
                    <Award className="w-3 h-3 text-amber-400" />
                    Perks & Benefits
                  </span>
                  <p className="text-xs text-zinc-300 leading-relaxed">
                    {analysis.company_info.perks || 'Comprehensive healthcare, wellness allowances, and learning stipend.'}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-zinc-900/40 p-8 rounded-2xl border border-zinc-800/60 text-center text-xs text-zinc-500">
              Company intelligence will populate on next automatic pipeline sync.
            </div>
          )}

        </div>
      )}

      {/* TAB 2: TAILORING STUDIO */}
      {activeTab === 'studio' && (
        <div className="animate-in fade-in duration-300">
          <TailoringStudio 
            jobId={jobId} 
            missingKeywords={analysis.missing_keywords || []}
            companyName={job.company}
            roleTitle={job.role_title}
            initialPrompt={tailorPrompt}
          />
        </div>
      )}

      {/* TAB 3: AI COPILOT COACH */}
      {activeTab === 'coach' && (
        <div className="bg-zinc-900/50 p-6 sm:p-8 rounded-3xl border border-zinc-800/80 shadow-2xl backdrop-blur-xl space-y-6 animate-in fade-in duration-300">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Bot className="w-5 h-5 text-purple-400" />
              Strategic Interview Coach: {job.company}
            </h3>
            <p className="text-xs text-zinc-400 mt-1">
              Simulate technical rounds, prepare system design arguments, and ask questions specific to this role.
            </p>
          </div>

          <div className="rounded-2xl overflow-hidden border border-zinc-800">
            <CopilotCoach jobId={jobId} inline={true} />
          </div>
        </div>
      )}

      {/* TAB 4: RAW JOB DESCRIPTION */}
      {activeTab === 'description' && (
        <div className="bg-zinc-900/50 p-6 sm:p-8 rounded-3xl border border-zinc-800/80 shadow-2xl backdrop-blur-xl space-y-5 animate-in fade-in duration-300">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-zinc-800/80 pb-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-sky-400" />
                Original Job Requisition Text
              </h3>
              <p className="text-xs text-zinc-500 mt-0.5">Directly parsed from official portal posting</p>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter keywords in JD..."
                  value={jdSearchQuery}
                  onChange={(e) => setJdSearchQuery(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(job.raw_jd || '')
                  setCopiedJd(true)
                  setTimeout(() => setCopiedJd(false), 2000)
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 shrink-0 ${
                  copiedJd
                    ? 'bg-[#45dfa4]/15 text-[#45dfa4] border border-[#45dfa4]/30'
                    : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
                }`}
              >
                {copiedJd ? <Check className="w-3.5 h-3.5 text-[#45dfa4]" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedJd ? 'Copied JD!' : 'Copy JD'}</span>
              </button>
            </div>
          </div>

          <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-2xl p-6 text-xs text-zinc-300 leading-relaxed font-mono whitespace-pre-wrap max-h-[500px] overflow-y-auto custom-scrollbar">
            {job.raw_jd ? (
              jdSearchQuery ? (
                job.raw_jd.split('\n').filter((l: string) => l.toLowerCase().includes(jdSearchQuery.toLowerCase())).join('\n') || 'No matching lines found.'
              ) : (
                job.raw_jd
              )
            ) : (
              <span className="text-zinc-600 italic">No raw job description available for this requisition.</span>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: RECOMMENDED RESUME TO APPLY FROM */}
      {activeTab === 'resume-target' && analysis.recommended_resume_title && (
        <div className="bg-zinc-900/50 p-6 sm:p-8 rounded-3xl border border-zinc-800/80 shadow-2xl backdrop-blur-xl space-y-6 animate-in fade-in duration-300">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-zinc-800/80 pb-5">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Targeted Submission Variant
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  {analysis.match_score}% Match Score
                </span>
              </div>
              <h3 className="text-xl font-bold text-white tracking-tight">
                Recommended Resume for {job.company}
              </h3>
              <p className="text-xs text-zinc-400 mt-1">
                Use this specific resume version when submitting your application on the official careers portal.
              </p>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button
                onClick={() => handleCopyTitle(analysis.recommended_resume_title)}
                className="flex-1 sm:flex-initial bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 active:scale-95"
              >
                {copiedResumeTitle ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedResumeTitle ? 'Title Copied!' : 'Copy Exact Title'}</span>
              </button>

              {applyUrl && (
                <a
                  href={applyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 sm:flex-initial bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 border border-zinc-700"
                >
                  <span>Open Portal</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 p-6 bg-zinc-950/60 rounded-2xl border border-zinc-800/80 space-y-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-400">
                <FileText className="w-4 h-4 text-indigo-400" />
                Selected Resume Identity
              </div>
              <div className="text-base sm:text-lg font-bold text-white">
                {analysis.recommended_resume_title}
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed">
                This resume variant was algorithmically matched because its core skills and past experience directly overlap with {analysis.matched_keywords?.length || 'core'} key technical proficiencies required by {job.company} for {job.role_title}.
              </p>

              <div className="pt-2 border-t border-zinc-800/60 flex flex-wrap gap-2">
                {analysis.matched_keywords?.map((kw: string) => (
                  <span key={kw} className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 text-xs font-medium flex items-center gap-1">
                    <Check className="w-3 h-3 text-emerald-400" /> {kw}
                  </span>
                ))}
              </div>
            </div>

            <div className="p-6 bg-zinc-950/60 rounded-2xl border border-zinc-800/80 space-y-4 flex flex-col justify-between">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  Pre-Submission Steps
                </h4>
                <ul className="text-xs text-zinc-300 space-y-2.5">
                  <li className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-indigo-500/20 text-indigo-300 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">1</span>
                    <span>Verify your PDF file in the <Link href="/resumes" className="text-indigo-400 underline font-semibold">Resumes Tab</Link>.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-indigo-500/20 text-indigo-300 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">2</span>
                    <span>Use <button onClick={() => setActiveTab('studio')} className="text-indigo-400 underline font-semibold">Tailoring Studio</button> to export custom single-page DOCX bullets.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-indigo-500/20 text-indigo-300 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">3</span>
                    <span>Submit on {job.company}&apos;s career portal and mark as <strong className="text-white">Applied</strong>.</span>
                  </li>
                </ul>
              </div>

              <Link
                href="/resumes"
                className="w-full bg-zinc-900 hover:bg-zinc-800 text-zinc-200 py-2.5 rounded-xl text-xs font-bold transition-all text-center border border-zinc-800"
              >
                Manage All Resume Versions →
              </Link>
            </div>
          </div>
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
          trackMutation.mutate({ jobData: job, status: 'applied' })
          setAutoFillModalData(null)
        }}
      />

      {/* High-Intelligence Executive Company Deep Dive Modal */}
      <CompanyDeepDiveModal
        companyName={job?.company}
        isOpen={deepDiveOpen}
        onClose={() => setDeepDiveOpen(false)}
      />
    </div>
  )
}
