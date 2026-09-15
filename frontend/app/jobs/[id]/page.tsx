'use client'

import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useState } from 'react'
import { useApiClient } from '@/lib/useApiClient'
import TailoringStudio from './TailoringStudio'
import CopilotCoach from '@/components/CopilotCoach'

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
        return 3000; // poll every 3s while analysis is missing
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
        body: JSON.stringify({}) // Let backend pick the recommended resume
      })
      if (!res.ok) throw new Error('Failed to generate draft')
      // Invalidate to fetch the new draft
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
      <div className="bg-zinc-900/40 p-8 rounded-2xl border border-zinc-800/50 space-y-3">
        <div className="h-4 bg-zinc-800 rounded w-1/4"></div>
        <div className="h-4 bg-zinc-800/60 rounded w-full"></div>
        <div className="h-4 bg-zinc-800/60 rounded w-5/6"></div>
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
    // Parse UTC timestamp safely regardless of local browser timezone
    const rawTime = job.fetched_at || '';
    const dateStr = rawTime
      ? (rawTime.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(rawTime) ? rawTime : `${rawTime}Z`)
      : new Date().toISOString();
    const fetchedAt = new Date(dateStr).getTime();
    // Only consider timed out after 3 minutes of true elapsed time
    const isTimeout = (Date.now() - fetchedAt) > 3 * 60 * 1000;

    if (isTimeout) {
      return (
        <div className="flex flex-col items-center justify-center py-24 text-center max-w-lg mx-auto">
          <div className="text-4xl mb-4">⏳</div>
          <h2 className="text-2xl font-bold text-white mb-2">Analysis in Progress or Timed Out</h2>
          <p className="text-zinc-400 mb-8 text-sm leading-relaxed">
            AI analysis usually takes 15-30 seconds. If the backend was cold or a model timed out, you can re-run analysis with 1-click or remove this job.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => reanalyzeMutation.mutate()}
              disabled={reanalyzeMutation.isPending}
              className="bg-blue-600 text-white px-5 py-2.5 rounded-lg font-bold hover:bg-blue-500 transition-colors disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-blue-600/20"
            >
              {reanalyzeMutation.isPending ? 'Starting AI...' : '🔄 Re-analyze Job'}
            </button>
            <button
              onClick={() => {
                if (confirm('Are you sure you want to delete this job?')) {
                  deleteJobMutation.mutate()
                }
              }}
              disabled={deleteJobMutation.isPending}
              className="bg-red-500/10 text-red-400 border border-red-500/20 px-5 py-2.5 rounded-lg font-bold hover:bg-red-500/20 transition-colors disabled:opacity-50"
            >
              {deleteJobMutation.isPending ? 'Deleting...' : '🗑 Delete Job'}
            </button>
            <Link href="/" className="bg-zinc-800 text-zinc-300 px-5 py-2.5 rounded-lg font-semibold hover:bg-zinc-700 hover:text-white transition-colors">
              Back to Dashboard
            </Link>
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
          <p className="text-zinc-400 max-w-md mx-auto text-sm">
            JobCopilot is scoring your match, drafting recommendations, and gathering company intelligence. This usually takes 15-30 seconds.
          </p>
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
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-zinc-900/40 p-8 rounded-2xl border border-zinc-800/50 flex justify-between items-start shadow-sm backdrop-blur-sm">
        <div>
          <div className="flex items-center gap-4 mb-3">
            <button 
              onClick={toggleBookmark}
              className={`text-2xl transition-colors ${job.is_bookmarked ? 'text-yellow-400 hover:text-yellow-300' : 'text-zinc-600 hover:text-yellow-400'}`}
              title={job.is_bookmarked ? "Remove Bookmark" : "Bookmark Job"}
            >
              ★
            </button>
            <h1 className="text-3xl font-bold tracking-tight text-white">{job.role_title}</h1>
            <span className={`px-3 py-1 rounded-full text-xs font-bold border uppercase tracking-wider ${vColor}`}>
              {analysis.verdict}
            </span>
            {job.url ? (
              <div className="flex items-center ml-4 gap-2">
                <a href={job.url} target="_blank" rel="noopener noreferrer" className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm font-semibold hover:bg-blue-500 transition-colors shadow-sm flex items-center gap-1">
                  Apply ↗
                </a>
                <button 
                  onClick={() => {
                    const newUrl = prompt('Edit apply link:', job.url)
                    if (newUrl !== null) updateJobMutation.mutate({ url: newUrl })
                  }}
                  className="text-zinc-500 hover:text-white text-sm"
                  title="Edit Link"
                >
                  ✎
                </button>
              </div>
            ) : (
              <button 
                onClick={() => {
                  const newUrl = prompt('Enter the apply link for this job:')
                  if (newUrl) updateJobMutation.mutate({ url: newUrl })
                }} 
                className="ml-4 bg-zinc-800 text-zinc-400 px-4 py-1.5 rounded-lg text-sm font-semibold hover:bg-zinc-700 hover:text-white transition-colors shadow-sm flex items-center gap-1"
              >
                + Add Link
              </button>
            )}
          </div>
          <p className="text-zinc-400 text-xl font-medium">{job.company}</p>
          <div className="flex gap-6 mt-6 text-sm text-zinc-500 font-medium items-center">
            <span className="flex items-center gap-2"><span className="text-zinc-600">📍</span> {job.location || 'Location Not Stated'} ({job.remote_type})</span>
            <span className="flex items-center gap-2"><span className="text-zinc-600">💰</span> {job.pay_min ? `₹${job.pay_min.toLocaleString()} - ₹${job.pay_max.toLocaleString()}` : 'Pay Unclear'}</span>
            <span className="flex items-center gap-2"><span className="text-zinc-600">🎓</span> {job.seniority_required}</span>
            <span className="flex items-center gap-2 bg-zinc-950 px-3 py-1.5 rounded-lg border border-zinc-800">
              <span className="text-zinc-600">⏳ Deadline:</span>
              <input 
                type="date" 
                value={job.deadline ? job.deadline.split('T')[0] : ''} 
                onChange={handleDeadlineChange}
                className="bg-transparent border-none text-zinc-300 focus:outline-none text-sm cursor-pointer"
              />
            </span>
          </div>
        </div>
        <div className="text-center bg-zinc-950/50 p-4 rounded-xl border border-zinc-800/50 min-w-[120px]">
          <div className={`text-5xl font-black ${analysis.match_score >= 80 ? 'text-green-400' : analysis.match_score >= 50 ? 'text-amber-400' : 'text-zinc-500'}`}>
            {analysis.match_score}
          </div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-widest mt-2 font-bold">Match Score</div>
        </div>
      </div>

      {/* Reasoning */}
      <div className="bg-zinc-900/40 p-8 rounded-2xl border border-zinc-800/50 shadow-sm backdrop-blur-sm">
        <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-500 mb-4">AI Verdict Reasoning</h2>
        <p className="text-zinc-300 leading-relaxed text-lg">{analysis.reasoning}</p>
        
        <div className="mt-6 p-5 bg-zinc-950/50 rounded-xl border border-zinc-800/50 text-sm">
          <strong className="text-zinc-400 mr-2 uppercase tracking-wide text-xs">Goal Alignment:</strong> 
          <span className="text-zinc-300">{analysis.goal_alignment_note}</span>
        </div>
        
        {analysis.recommended_resume_title && (
          <div className="mt-4 p-5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-xl text-sm font-medium flex justify-between items-center">
            <span>Recommended Resume: <span className="text-white">{analysis.recommended_resume_title}</span></span>
            <button 
              onClick={() => navigator.clipboard.writeText(analysis.recommended_resume_title)}
              className="bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors border border-blue-500/20"
            >
              Copy Title
            </button>
          </div>
        )}
      </div>

      {/* Keywords */}
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-zinc-900/40 p-8 rounded-2xl border border-zinc-800/50 shadow-sm backdrop-blur-sm">
          <h2 className="text-sm font-bold uppercase tracking-widest text-green-500 mb-5 flex items-center gap-2">
            <span>✓</span> Matched Skills
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
        
        <div className="bg-zinc-900/40 p-8 rounded-2xl border border-zinc-800/50 shadow-sm backdrop-blur-sm">
          <h2 className="text-sm font-bold uppercase tracking-widest text-red-500 mb-5 flex items-center gap-2">
            <span>✗</span> Missing Requirements
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

      {/* Company Intelligence */}
      {analysis.company_info && (
        <div className="bg-zinc-900/40 p-8 rounded-2xl border border-zinc-800/50 shadow-sm backdrop-blur-sm">
          <h2 className="text-xl font-bold text-white tracking-tight mb-6 flex items-center gap-2">
            <span>🏢</span> Company Intelligence
          </h2>
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <strong className="text-zinc-500 uppercase tracking-widest text-xs block mb-1">Work Culture</strong>
                <p className="text-zinc-300 text-sm leading-relaxed">{analysis.company_info.work_culture}</p>
              </div>
              <div>
                <strong className="text-zinc-500 uppercase tracking-widest text-xs block mb-1">Work/Life Balance</strong>
                <p className="text-zinc-300 text-sm leading-relaxed">{analysis.company_info.work_life_balance}</p>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <strong className="text-zinc-500 uppercase tracking-widest text-xs block mb-1">Compensation Estimates</strong>
                <p className="text-zinc-300 text-sm leading-relaxed">{analysis.company_info.compensation_estimates}</p>
              </div>
              <div>
                <strong className="text-zinc-500 uppercase tracking-widest text-xs block mb-1">Perks & Benefits</strong>
                <p className="text-zinc-300 text-sm leading-relaxed">{analysis.company_info.perks}</p>
              </div>
              <div>
                <strong className="text-zinc-500 uppercase tracking-widest text-xs block mb-1">Bonds / Contracts</strong>
                <p className="text-zinc-300 text-sm leading-relaxed">{analysis.company_info.bonds_or_contracts}</p>
              </div>
            </div>
          </div>
          <div className="mt-6 p-4 bg-zinc-950/50 rounded-xl border border-zinc-800/50 text-sm flex justify-between items-center">
            <span className="text-zinc-400 font-medium">Overall Sentiment</span>
            <span className="text-white font-bold px-3 py-1 bg-zinc-800 rounded-lg">{analysis.company_info.overall_sentiment}</span>
          </div>
        </div>
      )}

      {/* Tailoring Studio */}
      <TailoringStudio jobId={jobId} missingKeywords={analysis.missing_keywords || []} />

      {/* Contextual AI Coach */}
      <div className="bg-zinc-900/40 p-8 rounded-2xl border border-zinc-800/50 shadow-sm backdrop-blur-sm mt-8">
        <h2 className="text-xl font-bold text-white tracking-tight mb-6 flex items-center gap-2">
          <span>🧠</span> Discuss this Job with Coach
        </h2>
        <CopilotCoach jobId={jobId} inline={true} />
      </div>

      {/* Legacy Application Prep Section (Saved Drafts) */}
      <div className="bg-zinc-900/40 p-8 rounded-2xl border border-zinc-800/50 shadow-sm backdrop-blur-sm relative overflow-hidden mt-8">
        {/* Subtle decorative glow */}
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-blue-500/10 blur-3xl rounded-full pointer-events-none"></div>

        <div className="flex justify-between items-center mb-6 relative">
          <h2 className="text-xl font-bold text-white tracking-tight">Application Prep</h2>
          <button 
            onClick={generateDraft}
            disabled={isGenerating}
            className="bg-white text-zinc-950 px-5 py-2.5 rounded-lg font-semibold hover:bg-zinc-200 transition-colors shadow-[0_0_15px_rgba(255,255,255,0.1)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isGenerating ? (
              <>
                <span className="animate-spin text-lg leading-none">⚙️</span>
                Drafting...
              </>
            ) : (
              <>
                <span className="text-lg leading-none">✍️</span>
                Generate Anti-AI Cover Letter
              </>
            )}
          </button>
        </div>
        
        {error && <div className="text-red-400 bg-red-500/10 border border-red-500/20 p-4 rounded-xl text-sm mb-6 relative">{error}</div>}

        {job.application_drafts && job.application_drafts.length > 0 ? (
          <div className="space-y-6 relative">
            {job.application_drafts.map((draft: any, idx: number) => (
              <div key={draft.id} className="border border-zinc-800/80 rounded-xl p-6 bg-zinc-950/80 shadow-inner group transition-all hover:border-zinc-700">
                <div className="flex justify-between items-center mb-4 border-b border-zinc-800 pb-3">
                  <div className="text-[11px] text-zinc-500 font-mono uppercase tracking-widest">
                    Draft {job.application_drafts.length - idx} • {new Date(draft.generated_at).toLocaleString()}
                  </div>
                  <button className="text-zinc-500 hover:text-white transition-colors text-sm" onClick={() => navigator.clipboard.writeText(draft.cover_letter_text)}>
                    Copy
                  </button>
                </div>
                <div className="whitespace-pre-wrap text-zinc-300 font-sans text-[15px] leading-relaxed">
                  {draft.cover_letter_text}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 px-4 border border-dashed border-zinc-800 rounded-xl relative">
            <div className="text-4xl mb-3 opacity-50">📝</div>
            <p className="text-zinc-400 text-sm max-w-md mx-auto leading-relaxed">
              No cover letter drafts generated yet. Click the button to have AI write a strict, human-sounding cold email based on your recommended resume.
            </p>
          </div>
        )}
      </div>

    </div>
  )
}
