'use client'

import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useState } from 'react'
import { useApiClient } from '@/lib/useApiClient'
import TailoringStudio from './TailoringStudio'
import CopilotCoach from '@/components/CopilotCoach'
import { ArrowUpRight, Target, ListTodo, Calendar, MapPin, Building2, Clock, Briefcase, Activity } from 'lucide-react'

export default function JobDetailPage() {
  const params = useParams()
  const queryClient = useQueryClient()
  const { fetch: apiFetch, isLoaded, isSignedIn } = useApiClient()
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const jobId = params.id as string

  const { data: job, isLoading } = useQuery({
    queryKey: ['job', jobId],
    enabled: isLoaded && !!isSignedIn,
    queryFn: async () => {
      const res = await apiFetch(`/api/jobs/${jobId}`)
      if (!res.ok) throw new Error('Failed to fetch job')
      return res.json()
    },
    refetchInterval: (query) => {
      const data = query.state.data as any;
      if (data && (!data.job_analyses || data.job_analyses.length === 0)) {
        return 3000;
      }
      return false;
    }
  })

  const updateJobMutation = useMutation({
    mutationFn: async (updates: any) => {
      const res = await apiFetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      })
      if (!res.ok) throw new Error('Failed to update job')
      return res.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['job', jobId] })
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
      window.location.href = '/'
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
          url: jobData.url,
          status: status,
          notes: `Added from Job Detail`
        })
      })
      if (!res.ok) throw new Error('Failed to track job')
      return res.json()
    },
    onSuccess: () => alert("Job added to tracker!")
  })

  const dreamCompanyMutation = useMutation({
    mutationFn: async (companyName: string) => {
      const res = await apiFetch('/api/profile')
      if (!res.ok) throw new Error('Failed to fetch profile')
      const profile = await res.json()
      const current = profile.dream_companies || []
      if (!current.includes(companyName)) {
        const updateRes = await apiFetch('/api/profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dream_companies: [...current, companyName] })
        })
        if (!updateRes.ok) throw new Error('Failed to update dream companies')
      }
    },
    onSuccess: (_, companyName) => alert(`${companyName} added to Dream Companies!`)
  })

  const toggleBookmark = () => updateJobMutation.mutate({ is_bookmarked: !job.is_bookmarked })
  
  const handleDeadlineChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateJobMutation.mutate({ deadline: e.target.value || null })
  }

  const generateDraft = async () => {
    setIsGenerating(true)
    setError(null)
    try {
      const res = await apiFetch(`/api/jobs/${jobId}/application-draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
      if (!res.ok) throw new Error('Failed to generate draft')
      queryClient.invalidateQueries({ queryKey: ['job', jobId] })
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsGenerating(false)
    }
  }

  if (isLoading) return (
    <div className="space-y-6 animate-pulse">
      <div className="bg-zinc-900/40 p-8 rounded-2xl border border-zinc-800/50 flex justify-between items-start">
        <div className="flex-1 space-y-4">
          <div className="h-8 bg-zinc-800 rounded-lg w-2/3"></div>
          <div className="h-5 bg-zinc-800/60 rounded w-1/3"></div>
          <div className="flex gap-6 mt-4">
            <div className="h-4 bg-zinc-800/60 rounded w-32"></div>
            <div className="h-4 bg-zinc-800/60 rounded w-24"></div>
          </div>
        </div>
        <div className="w-28 h-28 bg-zinc-800 rounded-xl"></div>
      </div>
    </div>
  )
  
  if (!job) return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="text-5xl mb-4">🔍</div>
      <h2 className="text-xl font-bold text-white mb-2">Job not found</h2>
      <p className="text-zinc-500 mb-6">This job may have been deleted or the link is invalid.</p>
      <Link href="/" className="bg-zinc-800 text-white px-6 py-3 rounded-lg font-bold hover:bg-zinc-700 transition-colors">Back to Dashboard</Link>
    </div>
  )

  const analysis = job.job_analyses && job.job_analyses[0]
  if (!analysis) {
    const rawTime = job.fetched_at || '';
    const dateStr = rawTime ? (rawTime.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(rawTime) ? rawTime : `${rawTime}Z`) : new Date().toISOString();
    const fetchedAt = new Date(dateStr).getTime();
    const isTimeout = (Date.now() - fetchedAt) > 3 * 60 * 1000;

    if (isTimeout) {
      return (
        <div className="flex flex-col items-center justify-center py-24 text-center max-w-lg mx-auto">
          <div className="text-4xl mb-4">⏳</div>
          <h2 className="text-2xl font-bold text-white mb-2">Analysis in Progress or Timed Out</h2>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => reanalyzeMutation.mutate()}
              disabled={reanalyzeMutation.isPending}
              className="bg-blue-600 text-white px-5 py-2.5 rounded-lg font-bold hover:bg-blue-500 transition-colors disabled:opacity-50"
            >
              {reanalyzeMutation.isPending ? 'Starting AI...' : '🔄 Re-analyze Job'}
            </button>
          </div>
        </div>
      )
    }

    return (
      <div className="flex flex-col items-center justify-center py-32 text-center space-y-6">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
          <div className="absolute inset-0 flex items-center justify-center text-xl">🤖</div>
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">AI is analyzing this job...</h2>
        </div>
      </div>
    )
  }

  const verdictColors: Record<string, string> = {
    apply: 'bg-green-500/10 text-green-400 border-green-500/20',
    stretch: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    skip: 'bg-red-500/10 text-red-400 border-red-500/20'
  }

  const vColor = verdictColors[analysis.verdict] || 'bg-zinc-800 text-zinc-400 border-zinc-700'

  return (
    <div className="space-y-8 pb-12 max-w-[1200px] mx-auto">
      
      {/* COHESIVE HEADER & VERDICT CONTROL CENTER */}
      <div className="bg-zinc-900/60 rounded-2xl border border-zinc-800/80 shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-xl overflow-hidden relative">
        {/* Top Header Section */}
        <div className="p-8 pb-6 border-b border-zinc-800/80 flex flex-col md:flex-row justify-between items-start gap-6 relative z-10">
          <div className="flex-1 min-w-0 w-full">
            <div className="flex items-center gap-3 mb-4">
              <button 
                onClick={toggleBookmark}
                className={`text-2xl transition-all hover:scale-110 active:scale-95 ${job.is_bookmarked ? 'text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.5)]' : 'text-zinc-600 hover:text-yellow-400/70'}`}
                title={job.is_bookmarked ? "Remove Bookmark" : "Bookmark Job"}
              >
                ★
              </button>
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white truncate pr-4">{job.role_title}</h1>
              <span className={`px-3 py-1 rounded-full text-xs font-bold border uppercase tracking-widest shadow-sm shrink-0 ${vColor}`}>
                {analysis.verdict}
              </span>
            </div>
            
            <div className="flex items-center gap-3 mb-6">
              <p className="text-zinc-300 text-xl font-semibold flex items-center gap-2">
                <Building2 className="w-5 h-5 text-zinc-500" />
                {job.company}
              </p>
              <button 
                onClick={() => dreamCompanyMutation.mutate(job.company)}
                disabled={dreamCompanyMutation.isPending}
                className="bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider transition-colors flex items-center gap-1 shrink-0"
              >
                <Target className="w-3 h-3" />
                {dreamCompanyMutation.isPending ? 'Adding...' : 'Add to Dream Companies'}
              </button>
            </div>

            {/* Comprehensive Metadata Strip */}
            <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm text-zinc-400 font-medium items-center bg-zinc-950/40 p-4 rounded-xl border border-zinc-800/50">
              <span className="flex items-center gap-2"><MapPin className="w-4 h-4 text-zinc-500" /> {job.location || 'Location Not Stated'} ({job.remote_type})</span>
              <span className="flex items-center gap-2">
                <span className="text-zinc-500">💰</span> 
                {job.pay_min ? `₹${(job.pay_min / 100000).toFixed(1)}L - ${(job.pay_max / 100000).toFixed(1)}L` : 'Pay Unclear'}
              </span>
              <span className="flex items-center gap-2"><Briefcase className="w-4 h-4 text-zinc-500" /> {job.seniority_required}</span>
              
              {/* New Fields from Hermes */}
              {job.posting_date && (
                <span className="flex items-center gap-2"><Calendar className="w-4 h-4 text-zinc-500" /> Posted: {job.posting_date}</span>
              )}
              {job.region_wise_salary && (
                <span className="flex items-center gap-2"><Activity className="w-4 h-4 text-zinc-500" /> {job.region_wise_salary}</span>
              )}
              
              <span className="flex items-center gap-2 ml-auto">
                <Clock className="w-4 h-4 text-zinc-500" /> Deadline:
                <input 
                  type="date" 
                  value={job.deadline ? job.deadline.split('T')[0] : ''} 
                  onChange={handleDeadlineChange}
                  className="bg-transparent border-none text-zinc-200 focus:outline-none text-sm cursor-pointer ml-1"
                />
              </span>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center gap-4 shrink-0">
            {/* Match Score Display */}
            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity rounded-full"></div>
              <div className="text-center bg-zinc-950 p-6 rounded-2xl border border-zinc-800 shadow-inner min-w-[140px] relative z-10">
                <div className={`text-6xl font-black leading-none tracking-tighter ${analysis.match_score >= 80 ? 'text-transparent bg-clip-text bg-gradient-to-b from-green-400 to-emerald-600' : analysis.match_score >= 50 ? 'text-transparent bg-clip-text bg-gradient-to-b from-amber-400 to-orange-500' : 'text-zinc-500'}`}>
                  {analysis.match_score}
                </div>
                <div className="text-[10px] text-zinc-500 uppercase tracking-widest mt-3 font-bold">Match Score</div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex flex-col gap-2 w-full">
              {job.url ? (
                <a href={job.url} target="_blank" rel="noopener noreferrer" className="bg-indigo-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-indigo-500 transition-all shadow-[0_0_15px_rgba(79,70,229,0.3)] flex items-center justify-center gap-1.5 w-full">
                  Apply Now <ArrowUpRight className="w-4 h-4" />
                </a>
              ) : (
                <button onClick={() => { const newUrl = prompt('Enter apply link:'); if (newUrl) updateJobMutation.mutate({ url: newUrl }) }} className="bg-indigo-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-indigo-500 transition-all shadow-sm flex items-center justify-center w-full">
                  + Add Apply Link
                </button>
              )}
              <button 
                onClick={() => trackMutation.mutate({ jobData: job, status: 'saved' })}
                disabled={trackMutation.isPending}
                className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 w-full border border-zinc-700"
              >
                <ListTodo className="w-4 h-4 text-indigo-400" />
                {trackMutation.isPending ? 'Tracking...' : 'Track Application'}
              </button>
            </div>
          </div>
        </div>

        {/* Cohesive Verdict Reasoning Section (Integrated into the same card) */}
        <div className="bg-zinc-950/30 p-8 border-t border-zinc-800/50">
          <h3 className="text-[11px] font-black uppercase tracking-widest text-zinc-500 mb-3">AI Verdict Reasoning</h3>
          <p className="text-zinc-300 leading-relaxed text-lg font-medium">{analysis.reasoning}</p>
          
          <div className="mt-5 flex flex-col md:flex-row gap-4">
            <div className="flex-1 p-4 bg-zinc-900/80 rounded-xl border border-zinc-800/80 text-sm">
              <strong className="text-zinc-400 mr-2 uppercase tracking-wide text-xs">Goal Alignment:</strong> 
              <span className="text-zinc-300">{analysis.goal_alignment_note}</span>
            </div>
            
            {analysis.recommended_resume_title && (
              <div className="flex-1 p-4 bg-indigo-500/5 border border-indigo-500/20 rounded-xl text-sm flex flex-col justify-center gap-2">
                <span className="text-zinc-400 uppercase tracking-wide text-xs font-bold">Recommended Resume</span>
                <div className="flex justify-between items-center gap-4">
                  <span className="text-indigo-300 font-medium truncate">{analysis.recommended_resume_title}</span>
                  <button 
                    onClick={() => navigator.clipboard.writeText(analysis.recommended_resume_title)}
                    className="bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 px-3 py-1 rounded-lg text-xs font-semibold transition-colors shrink-0"
                  >
                    Copy Title
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Grid: Keywords & Company Intel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800/80 shadow-sm backdrop-blur-sm">
            <h2 className="text-sm font-bold uppercase tracking-widest text-green-500 mb-4 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center">✓</span> Matched Skills
            </h2>
            <div className="flex flex-wrap gap-2">
              {analysis.matched_keywords?.map((kw: string) => (
                <span key={kw} className="px-3 py-1.5 bg-green-500/10 text-green-400 border border-green-500/20 rounded-lg text-sm font-medium">
                  {kw}
                </span>
              ))}
              {!analysis.matched_keywords?.length && <span className="text-zinc-600 italic">None found</span>}
            </div>
          </div>
          
          <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800/80 shadow-sm backdrop-blur-sm">
            <h2 className="text-sm font-bold uppercase tracking-widest text-red-500 mb-4 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center">✗</span> Missing Requirements
            </h2>
            <div className="flex flex-wrap gap-2">
              {analysis.missing_keywords?.map((kw: string) => (
                <span key={kw} className="px-3 py-1.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg text-sm font-medium">
                  {kw}
                </span>
              ))}
              {!analysis.missing_keywords?.length && <span className="text-zinc-600 italic">None found</span>}
            </div>
          </div>
        </div>

        {analysis.company_info ? (
          <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800/80 shadow-sm backdrop-blur-sm h-full flex flex-col">
            <h2 className="text-lg font-bold text-white tracking-tight mb-5 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-indigo-400" /> Company Intelligence
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5 flex-1">
              <div>
                <strong className="text-zinc-500 uppercase tracking-widest text-[10px] block mb-1">Work Culture</strong>
                <p className="text-zinc-300 text-[13px] leading-relaxed">{analysis.company_info.work_culture}</p>
              </div>
              <div>
                <strong className="text-zinc-500 uppercase tracking-widest text-[10px] block mb-1">Work/Life Balance</strong>
                <p className="text-zinc-300 text-[13px] leading-relaxed">{analysis.company_info.work_life_balance}</p>
              </div>
              <div>
                <strong className="text-zinc-500 uppercase tracking-widest text-[10px] block mb-1">Comp Estimates</strong>
                <p className="text-zinc-300 text-[13px] leading-relaxed">{analysis.company_info.compensation_estimates}</p>
              </div>
              <div>
                <strong className="text-zinc-500 uppercase tracking-widest text-[10px] block mb-1">Perks & Benefits</strong>
                <p className="text-zinc-300 text-[13px] leading-relaxed">{analysis.company_info.perks}</p>
              </div>
            </div>
            <div className="mt-5 pt-5 border-t border-zinc-800/50 flex justify-between items-center">
              <span className="text-zinc-400 text-xs font-bold uppercase tracking-wider">Overall Sentiment</span>
              <span className="text-white text-xs font-bold px-3 py-1 bg-zinc-800 rounded-lg border border-zinc-700">{analysis.company_info.overall_sentiment}</span>
            </div>
          </div>
        ) : (
          <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800/80 flex items-center justify-center">
            <span className="text-zinc-600">Company Intelligence Unavailable</span>
          </div>
        )}
      </div>

      {/* Tailoring Studio */}
      <div className="mt-8">
        <TailoringStudio jobId={jobId} missingKeywords={analysis.missing_keywords || []} />
      </div>

      {/* Contextual AI Coach */}
      <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800/80 shadow-sm backdrop-blur-sm mt-8">
        <h2 className="text-xl font-bold text-white tracking-tight mb-6 flex items-center gap-2">
          <span className="bg-indigo-500/20 p-1.5 rounded-lg border border-indigo-500/30">🧠</span> Discuss this Job with Coach
        </h2>
        <CopilotCoach jobId={jobId} inline={true} />
      </div>

    </div>
  )
}
