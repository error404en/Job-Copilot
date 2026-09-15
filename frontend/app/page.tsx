'use client'

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

  if (isLoading) return <div className="p-8 text-zinc-400 animate-pulse">Loading analyzed jobs...</div>

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Job Dashboard</h1>
          <p className="text-zinc-400 text-sm">
            AI-scored postings, application tracking, and real-time location filtering.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link 
            href="/tracker" 
            className="bg-zinc-900 border border-zinc-800 text-zinc-200 px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-zinc-800 transition-colors flex items-center gap-2"
          >
            <span>📋</span> View Tracker ({applications?.length || 0})
          </Link>
          <Link 
            href="/jobs/new" 
            className="bg-blue-600 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-500 transition-colors shadow-sm"
          >
            + Add Job / Paste SS
          </Link>
        </div>
      </div>

      {/* Main Filter & Search Toolbar */}
      <div className="bg-zinc-900/60 p-4 rounded-xl border border-zinc-800/80 backdrop-blur-md space-y-3">
        {/* Row 1: Primary Tabs & Search */}
        <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
          <div className="flex gap-2 w-full md:w-auto">
            <button 
              onClick={() => setFilter('all')} 
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${filter === 'all' ? 'bg-blue-600 text-white shadow-md' : 'bg-zinc-950 text-zinc-400 hover:text-white border border-zinc-800'}`}
            >
              All ({jobs?.length || 0})
            </button>
            <button 
              onClick={() => setFilter('bookmarks')} 
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${filter === 'bookmarks' ? 'bg-yellow-500 text-zinc-950 shadow-md' : 'bg-zinc-950 text-zinc-400 hover:text-white border border-zinc-800'}`}
            >
              ★ Bookmarked
            </button>
            <button 
              onClick={() => setFilter('deadlines')} 
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${filter === 'deadlines' ? 'bg-purple-500 text-zinc-950 shadow-md' : 'bg-zinc-950 text-zinc-400 hover:text-white border border-zinc-800'}`}
            >
              ⏳ Deadlines
            </button>
          </div>

          <div className="relative w-full md:w-80">
            <span className="absolute left-3 top-2.5 text-zinc-500 text-sm">🔍</span>
            <input 
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search title, company, skill..."
              className="w-full bg-zinc-950 border border-zinc-800 text-white pl-9 pr-8 py-2 rounded-lg text-xs placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-zinc-500 hover:text-white text-xs"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Row 2: Location, Verdict, and Sort Selectors */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-zinc-800/60 text-xs">
          
          {/* Location Filter Dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-zinc-500 font-semibold uppercase tracking-wider text-[10px]">Location / Place:</span>
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">📍 All Locations</option>
              <option value="bengaluru">Bengaluru / Bangalore</option>
              <option value="mumbai">Mumbai</option>
              <option value="pune">Pune</option>
              <option value="hyderabad">Hyderabad</option>
              <option value="delhi">Delhi / NCR / Noida / Gurugram</option>
              <option value="chennai">Chennai</option>
              <option value="pan india">Pan India</option>
              <option value="remote">Remote</option>
              {availableLocations.map((loc) => {
                const lower = loc.toLowerCase()
                if (['bengaluru', 'bangalore', 'mumbai', 'pune', 'hyderabad', 'delhi', 'chennai', 'remote', 'pan india'].some(preset => lower.includes(preset))) {
                  return null
                }
                return (
                  <option key={loc} value={loc}>{loc}</option>
                )
              })}
            </select>
          </div>

          {/* Verdict Filter */}
          <div className="flex items-center gap-2">
            <span className="text-zinc-500 font-semibold uppercase tracking-wider text-[10px]">Verdict:</span>
            <select
              value={verdictFilter}
              onChange={(e) => setVerdictFilter(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">All Verdicts</option>
              <option value="apply">Apply Only (Fit)</option>
              <option value="stretch">Stretch Roles</option>
              <option value="skip">Skip Roles</option>
            </select>
          </div>

          {/* Sort By */}
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-zinc-500 font-semibold uppercase tracking-wider text-[10px]">Sort:</span>
            <select
              value={sortBy}
              onChange={(e: any) => setSortBy(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="score">Highest Match Score</option>
              <option value="newest">Newest Analyzed</option>
              <option value="deadline">Upcoming Deadline</option>
            </select>
          </div>

          {/* Clear Filters Button */}
          {hasActiveFilters && (
            <button 
              onClick={clearAllFilters}
              className="text-xs text-blue-400 hover:text-blue-300 font-semibold underline ml-2"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Results Header */}
      <div className="flex items-center justify-between text-xs text-zinc-500 px-1">
        <span>Showing {filteredJobs.length} of {jobs?.length || 0} analyzed postings</span>
        {locationFilter !== 'all' && (
          <span className="bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded border border-blue-500/20">
            Filtered by Place: {locationFilter}
          </span>
        )}
      </div>

      {/* Job Cards */}
      {!filteredJobs || filteredJobs.length === 0 ? (
        <div className="text-center py-20 bg-zinc-900/40 rounded-xl border border-zinc-800/50 backdrop-blur-sm space-y-3">
          <span className="text-4xl block">🔍</span>
          <h2 className="text-lg font-semibold text-zinc-300">No jobs matched your filters</h2>
          <p className="text-zinc-500 text-xs max-w-sm mx-auto">
            Try adjusting your search terms, changing the location filter, or adding new jobs via screenshot/URL.
          </p>
          {hasActiveFilters && (
            <button 
              onClick={clearAllFilters}
              className="mt-2 text-xs bg-zinc-800 hover:bg-zinc-700 text-white font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              Reset All Filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-3.5">
          {filteredJobs.map((job: any) => {
            const analysis = job.job_analyses && job.job_analyses[0]
            const vColor = analysis ? verdictColors[analysis.verdict] : 'bg-gray-100 text-gray-800'
            const currentStatus = trackedJobIdMap[job.id]
            
            return (
              <div 
                key={job.id} 
                className="bg-zinc-900/40 p-5 rounded-xl border border-zinc-800 hover:border-blue-500/50 hover:-translate-y-1 hover:shadow-[0_10px_40px_-10px_rgba(59,130,246,0.2)] transition-all duration-300 flex flex-col md:flex-row md:items-center justify-between gap-4 group"
              >
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <Link 
                      href={`/jobs/${job.id}`} 
                      className="font-bold text-lg text-zinc-100 hover:text-white hover:underline transition-colors"
                    >
                      {job.role_title}
                    </Link>
                    {analysis && (
                      <span className={`px-2.5 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider border ${vColor}`}>
                        {analysis.verdict}
                      </span>
                    )}
                    {currentStatus && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        📋 {currentStatus}
                      </span>
                    )}
                  </div>
                  
                  <div className="text-xs text-zinc-400 font-medium flex flex-wrap items-center gap-2">
                    <span className="text-zinc-200 font-semibold">{job.company}</span>
                    <span className="text-zinc-600">•</span>
                    <span>📍 {job.location || 'Location Unclear'}</span>
                    {job.remote_type && job.remote_type !== 'unclear' && (
                      <>
                        <span className="text-zinc-600">•</span>
                        <span className="capitalize bg-zinc-800 px-1.5 py-0.5 rounded text-[10px] text-zinc-300">
                          {job.remote_type}
                        </span>
                      </>
                    )}
                    {job.pay_min && (
                      <>
                        <span className="text-zinc-600">•</span>
                        <span className="text-green-400 font-mono">
                          ₹{(job.pay_min / 100000).toFixed(1)}L {job.pay_max ? `- ₹${(job.pay_max / 100000).toFixed(1)}L` : ''}
                        </span>
                      </>
                    )}
                    {job.deadline && (
                      <span className="text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20 text-[11px] font-medium">
                        ⏳ Deadline: {new Date(job.deadline).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
                
                {/* Actions & Score */}
                <div className="flex items-center gap-4 shrink-0 self-end md:self-center">
                  {/* Track Button */}
                  <button 
                    onClick={() => trackMutation.mutate({ job, status: currentStatus ? (currentStatus === 'applied' ? 'interview' : 'applied') : 'saved' })}
                    disabled={trackMutation.isPending}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                      currentStatus 
                        ? 'bg-zinc-800 text-blue-400 border border-blue-500/30 hover:bg-zinc-750'
                        : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white'
                    }`}
                  >
                    <span>📋</span>
                    <span>{currentStatus ? `Tracked (${currentStatus})` : '+ Track Application'}</span>
                  </button>

                  {job.url && job.url !== 'Screenshot Upload' && (
                    <a 
                      href={job.url} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="bg-zinc-800 text-zinc-300 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-white hover:text-zinc-950 transition-colors"
                    >
                      Apply ↗
                    </a>
                  )}

                  {analysis && (
                    <Link href={`/jobs/${job.id}`} className="text-right block hover:opacity-80 transition-opacity pl-2 border-l border-zinc-800">
                      <div className={`text-2xl font-black ${analysis.match_score >= 80 ? 'text-green-400' : analysis.match_score >= 50 ? 'text-amber-400' : 'text-zinc-500'}`}>
                        {analysis.match_score}
                      </div>
                      <div className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold">Fit Score</div>
                    </Link>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
