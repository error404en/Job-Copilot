'use client'
import { Search, MapPin, Building2, Clock, CheckCircle2, XCircle, ArrowUpRight, Plus, Bookmark, CalendarClock, Briefcase, ChevronDown, ListTodo, RefreshCcw, Activity } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'


import { useQuery, useMutation } from '@tanstack/react-query'
import Link from 'next/link'
import { useState, useMemo } from 'react'
import { useApiClient } from '@/lib/useApiClient'

export default function Dashboard() {
  const [filter, setFilter] = useState<'all' | 'bookmarks' | 'deadlines'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [locationFilter, setLocationFilter] = useState('all')
  const [verdictFilter, setVerdictFilter] = useState('all')
  const [sortBy, setSortBy] = useState<'score' | 'newest' | 'deadline'>('score')

  const { fetch: apiFetch, isLoaded, isSignedIn } = useApiClient()

  const { data: jobs, isLoading } = useQuery({
    queryKey: ['jobs'],
    enabled: isLoaded && !!isSignedIn,
    queryFn: async () => {
      const res = await apiFetch('/api/jobs')
      if (!res.ok) throw new Error('Failed to fetch jobs')
      return res.json()
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
          // Add primary city words
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

    // 1. Tab filter
    if (filter === 'bookmarks') {
      list = list.filter((job: any) => job.is_bookmarked)
    } else if (filter === 'deadlines') {
      list = list.filter((job: any) => job.deadline)
    }

    // 2. Search query filter
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

    // 3. Location filter
    if (locationFilter !== 'all') {
      const targetLoc = locationFilter.toLowerCase().trim()
      list = list.filter((job: any) => {
        const jobLoc = (job.location || '').toLowerCase()
        return jobLoc.includes(targetLoc)
      })
    }

    // 4. Verdict filter
    if (verdictFilter !== 'all') {
      list = list.filter((job: any) => {
        const analysis = job.job_analyses && job.job_analyses[0]
        return analysis && analysis.verdict === verdictFilter
      })
    }

    // 5. Sorting
    list.sort((a: any, b: any) => {
      if (sortBy === 'deadline') {
        const dA = a.deadline ? new Date(a.deadline).getTime() : Infinity
        const dB = b.deadline ? new Date(b.deadline).getTime() : Infinity
        return dA - dB
      }
      if (sortBy === 'newest') {
        const tA = a.fetched_at ? new Date(a.fetched_at).getTime() : 0
        const tB = b.fetched_at ? new Date(b.fetched_at).getTime() : 0
        return tB - tA
      }
      // Default: match score descending
      const scoreA = (a.job_analyses && a.job_analyses[0]?.match_score) || 0
      const scoreB = (b.job_analyses && b.job_analyses[0]?.match_score) || 0
      return scoreB - scoreA
    })

    return list
  }, [jobs, filter, searchQuery, locationFilter, verdictFilter, sortBy])

  const verdictColors: Record<string, string> = {
    apply: 'bg-green-500/10 text-green-400 border-green-500/20',
    stretch: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    skip: 'bg-red-500/10 text-red-400 border-red-500/20'
  }

  const hasActiveFilters = searchQuery !== '' || locationFilter !== 'all' || verdictFilter !== 'all' || filter !== 'all'

  const clearAllFilters = () => {
    setSearchQuery('')
    setLocationFilter('all')
    setVerdictFilter('all')
    setFilter('all')
  }


  // Filter counts
  const stats = useMemo(() => {
    if (!jobs) return { total: 0, applies: 0, bookmarked: 0 }
    return {
      total: jobs.length,
      applies: jobs.filter((j: any) => j.job_analyses?.[0]?.verdict === 'apply').length,
      bookmarked: jobs.filter((j: any) => j.is_bookmarked).length
    }
  }, [jobs])

  if (isLoading) return (
    <div className="flex flex-col items-center justify-center py-32 space-y-4">
      <RefreshCcw className="w-8 h-8 text-indigo-500 animate-spin" />
      <div className="text-zinc-400 font-medium">Loading your job pipeline...</div>
    </div>
  )

  return (
    <div className="space-y-8 pb-12">
      {/* Top Header & Metrics */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Job Dashboard</h1>
          <p className="text-zinc-400 text-sm">
            AI-scored postings, application tracking, and real-time location filtering.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link 
            href="/tracker" 
            className="bg-zinc-900 border border-zinc-800/80 text-zinc-300 px-4 py-2.5 rounded-xl text-[13px] font-semibold hover:bg-zinc-800 hover:text-white transition-all flex items-center gap-2 shadow-sm"
          >
            <ListTodo className="w-4 h-4 text-indigo-400" />
            Tracker ({applications?.length || 0})
          </Link>
          <Link 
            href="/jobs/new" 
            className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-[13px] font-bold hover:bg-indigo-500 transition-all shadow-[0_4px_14px_rgba(79,70,229,0.3)] hover:shadow-[0_6px_20px_rgba(79,70,229,0.4)] flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Add Job
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-2xl p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20 text-blue-400">
            <Briefcase className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-white">{stats.total}</div>
            <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Analyzed Postings</div>
          </div>
        </div>
        <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-2xl p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center border border-green-500/20 text-green-400">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-white">{stats.applies}</div>
            <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider">High Fit (Apply)</div>
          </div>
        </div>
        <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-2xl p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center border border-amber-500/20 text-amber-400">
            <Bookmark className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-white">{stats.bookmarked}</div>
            <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Bookmarked</div>
          </div>
        </div>
      </div>

      {/* Main Filter & Search Toolbar */}
      <div className="bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800/80 backdrop-blur-xl space-y-4 shadow-sm">
        {/* Row 1: Primary Tabs & Search */}
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="flex gap-2 w-full md:w-auto bg-zinc-950/50 p-1 rounded-xl border border-zinc-800/50 overflow-x-auto no-scrollbar">
            <button 
              onClick={() => setFilter('all')} 
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${filter === 'all' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'}`}
            >
              All
            </button>
            <button 
              onClick={() => setFilter('bookmarks')} 
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${filter === 'bookmarks' ? 'bg-amber-500/10 text-amber-400 shadow-sm border border-amber-500/20' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'}`}
            >
              <Bookmark className="w-3.5 h-3.5" /> Bookmarks
            </button>
            <button 
              onClick={() => setFilter('deadlines')} 
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${filter === 'deadlines' ? 'bg-purple-500/10 text-purple-400 shadow-sm border border-purple-500/20' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'}`}
            >
              <CalendarClock className="w-3.5 h-3.5" /> Deadlines
            </button>
          </div>

          <div className="relative w-full md:w-96 group">
            <Search className="absolute left-3.5 top-3 w-4 h-4 text-zinc-500 group-focus-within:text-indigo-400 transition-colors" />
            <input 
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search title, company, skill..."
              className="w-full bg-zinc-950 border border-zinc-800 text-white pl-10 pr-8 py-2.5 rounded-xl text-[13px] placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all shadow-inner"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-3.5 text-zinc-500 hover:text-white"
              >
                <XCircle className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Row 2: Location, Verdict, and Sort Selectors */}
        <div className="flex flex-wrap items-center gap-4 pt-4 border-t border-zinc-800/60 text-[13px]">
          
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-zinc-500" />
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium appearance-none pr-8 cursor-pointer relative"
              style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2716%27 height=%2716%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%2371717a%27 stroke-width=%272%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27%3E%3Cpolyline points=%276 9 12 15 18 9%27%3E%3C/polyline%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}
            >
              <option value="all">All Locations</option>
              <option value="bengaluru">Bengaluru / Bangalore</option>
              <option value="mumbai">Mumbai</option>
              <option value="pune">Pune</option>
              <option value="hyderabad">Hyderabad</option>
              <option value="delhi">Delhi / NCR</option>
              <option value="remote">Remote</option>
              {availableLocations.map((loc) => {
                const lower = loc.toLowerCase()
                if (['bengaluru', 'bangalore', 'mumbai', 'pune', 'hyderabad', 'delhi', 'chennai', 'remote', 'pan india'].some(preset => lower.includes(preset))) {
                  return null
                }
                return <option key={loc} value={loc}>{loc}</option>
              })}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-zinc-500" />
            <select
              value={verdictFilter}
              onChange={(e) => setVerdictFilter(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium appearance-none pr-8 cursor-pointer"
              style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2716%27 height=%2716%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%2371717a%27 stroke-width=%272%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27%3E%3Cpolyline points=%276 9 12 15 18 9%27%3E%3C/polyline%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}
            >
              <option value="all">All Verdicts</option>
              <option value="apply">Apply Only (Fit)</option>
              <option value="stretch">Stretch Roles</option>
              <option value="skip">Skip Roles</option>
            </select>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <span className="text-zinc-500 font-semibold uppercase tracking-wider text-[10px]">Sort:</span>
            <select
              value={sortBy}
              onChange={(e: any) => setSortBy(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium appearance-none pr-8 cursor-pointer"
              style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2716%27 height=%2716%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%2371717a%27 stroke-width=%272%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27%3E%3Cpolyline points=%276 9 12 15 18 9%27%3E%3C/polyline%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}
            >
              <option value="score">Highest Match Score</option>
              <option value="newest">Newest Analyzed</option>
              <option value="deadline">Upcoming Deadline</option>
            </select>
          </div>

          {hasActiveFilters && (
            <button 
              onClick={clearAllFilters}
              className="text-[11px] text-indigo-400 hover:text-indigo-300 font-bold tracking-wide uppercase px-2 py-1 rounded bg-indigo-500/10 border border-indigo-500/20 transition-colors ml-2"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-zinc-500 px-1 font-medium">
        <span>Showing <strong className="text-zinc-300">{filteredJobs.length}</strong> of {jobs?.length || 0} analyzed postings</span>
      </div>

      {/* Job Cards */}
      {!filteredJobs || filteredJobs.length === 0 ? (
        <div className="text-center py-24 bg-zinc-900/30 rounded-2xl border border-zinc-800/50 backdrop-blur-sm space-y-4">
          <Search className="w-12 h-12 text-zinc-600 mx-auto" />
          <h2 className="text-xl font-bold text-zinc-300">No jobs matched your filters</h2>
          <p className="text-zinc-500 text-sm max-w-sm mx-auto">
            Try adjusting your search terms, changing the location filter, or adding new jobs via screenshot/URL.
          </p>
          {hasActiveFilters && (
            <button 
              onClick={clearAllFilters}
              className="mt-4 text-[13px] bg-zinc-800 hover:bg-zinc-700 text-white font-semibold px-5 py-2.5 rounded-xl transition-all shadow-sm inline-block"
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
                  className="bg-zinc-900/60 p-5 rounded-2xl border border-zinc-800/80 hover:border-indigo-500/40 hover:-translate-y-1 hover:bg-zinc-900 hover:shadow-[0_8px_30px_rgb(0,0,0,0.4)] transition-all duration-300 flex flex-col md:flex-row md:items-center justify-between gap-5 group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <Link 
                        href={`/jobs/${job.id}`} 
                        className="font-bold text-lg text-zinc-100 hover:text-indigo-300 transition-colors truncate max-w-[80%]"
                      >
                        {job.role_title}
                      </Link>
                      {analysis && (
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${verdictStyle}`}>
                          {analysis.verdict}
                        </span>
                      )}
                      {currentStatus && (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center gap-1">
                          <ListTodo className="w-3 h-3" /> {currentStatus}
                        </span>
                      )}
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-zinc-400">
                      <div className="flex items-center gap-1.5 font-medium text-zinc-300">
                        <Building2 className="w-4 h-4 text-zinc-500" />
                        {job.company}
                      </div>
                      
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-4 h-4 text-zinc-500" />
                        {job.location || 'Location Unclear'}
                      </div>
                      
                      {job.remote_type && job.remote_type !== 'unclear' && (
                        <span className="capitalize bg-zinc-800/80 border border-zinc-700/50 px-2 py-0.5 rounded text-[11px] font-medium text-zinc-300">
                          {job.remote_type}
                        </span>
                      )}
                      
                      {job.pay_min && (
                        <div className="font-mono text-green-400 font-medium bg-green-500/5 px-2 py-0.5 rounded border border-green-500/10">
                          ₹{(job.pay_min / 100000).toFixed(1)}L {job.pay_max ? `- ${(job.pay_max / 100000).toFixed(1)}L` : ''}
                        </div>
                      )}
                      
                      {job.deadline && (
                        <div className="flex items-center gap-1 text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20 text-[11px] font-medium">
                          <Clock className="w-3.5 h-3.5" />
                          {new Date(job.deadline).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Actions & Score */}
                  <div className="flex items-center gap-4 shrink-0 mt-2 md:mt-0 border-t md:border-t-0 border-zinc-800 pt-4 md:pt-0">
                    {/* Track Button */}
                    <button 
                      onClick={() => trackMutation.mutate({ job, status: currentStatus ? (currentStatus === 'applied' ? 'interview' : 'applied') : 'saved' })}
                      disabled={trackMutation.isPending}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                        currentStatus 
                          ? 'bg-zinc-800/80 text-indigo-400 border border-indigo-500/30 hover:bg-zinc-800'
                          : 'bg-zinc-800/80 text-zinc-300 border border-zinc-700/50 hover:bg-zinc-700 hover:text-white'
                      }`}
                    >
                      <ListTodo className="w-3.5 h-3.5" />
                      <span>{currentStatus ? `Tracked (${currentStatus})` : 'Track'}</span>
                    </button>

                    {job.url && job.url !== 'Screenshot Upload' && (
                      <div className="flex gap-2 items-center">
                        <a 
                          href={job.url} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="bg-zinc-800 text-zinc-200 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-zinc-200 hover:text-zinc-950 transition-colors flex items-center gap-1"
                        >
                          Apply <ArrowUpRight className="w-3.5 h-3.5" />
                        </a>
                        <button
                          onClick={() => {
                            if (confirm("Trigger Hermes AI to navigate and apply to this job in the background?")) {
                              autoApplyMutation.mutate({ url: job.url, jobId: job.id });
                            }
                          }}
                          disabled={autoApplyMutation.isPending}
                          className="bg-indigo-600/10 text-indigo-400 border border-indigo-500/30 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-600/20 transition-colors flex items-center gap-1.5 disabled:opacity-50 relative overflow-hidden group/btn"
                        >
                          <Activity className="w-3.5 h-3.5 group-hover/btn:animate-pulse" />
                          {autoApplyMutation.isPending ? 'Working...' : 'Auto-Apply'}
                        </button>
                      </div>
                    )}

                    {analysis && (
                      <Link href={`/jobs/${job.id}`} className="flex flex-col items-end justify-center pl-4 border-l border-zinc-800/80 group-hover:border-indigo-500/30 transition-colors min-w-[70px]">
                        <div className={`text-3xl font-black tracking-tighter leading-none ${analysis.match_score >= 80 ? 'text-green-400' : analysis.match_score >= 50 ? 'text-amber-400' : 'text-zinc-500'}`}>
                          {analysis.match_score}
                        </div>
                        <div className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold mt-1">Match</div>
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