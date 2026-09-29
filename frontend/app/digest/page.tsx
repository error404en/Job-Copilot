'use client'

import { useQuery, useMutation } from '@tanstack/react-query'
import Link from 'next/link'
import { useApiClient } from '@/lib/useApiClient'
import { 
  Flame, 
  Loader2, 
  Calendar, 
  RefreshCcw, 
  ArrowUpRight, 
  MapPin, 
  Building2, 
  Briefcase, 
  Banknote,
  Sparkles,
  Zap,
  AlertCircle
} from 'lucide-react'

export default function DigestPage() {
  const { fetch: apiFetch, isLoaded, isSignedIn } = useApiClient()
  const { data: jobs, isLoading, refetch: refetchDigest } = useQuery({
    queryKey: ['digest'],
    enabled: isLoaded && !!isSignedIn,
    queryFn: async () => {
      const res = await apiFetch('/api/jobs/digest')
      if (!res.ok) throw new Error('Failed to fetch digest')
      return res.json()
    }
  })

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch('/api/jobs/sync', { method: 'POST' })
      if (!res.ok) throw new Error('Sync failed')
      return res.json()
    },
    onSuccess: () => {
      refetchDigest()
    }
  })

  const retryMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch('/api/jobs/retry-analyses', { method: 'POST' })
      if (!res.ok) throw new Error('Retry failed')
      return res.json()
    },
    onSuccess: () => {
      refetchDigest()
    }
  })

  if (isLoading) return (
    <div className="flex flex-col items-center justify-center py-32 space-y-4 font-sans">
      <RefreshCcw className="w-8 h-8 text-indigo-500 animate-spin" />
      <div className="text-zinc-400 text-sm font-medium">Preparing your daily intelligence digest...</div>
    </div>
  )

  const filteredJobs = jobs?.matched || []
  const pendingJobs = jobs?.analysis_pending || []
  const failedJobs = jobs?.analysis_failed || []
  const windowDesc = jobs?.window_description || 'Past 24 Hours'
  const briefing = jobs?.placement_briefing

  const verdictStyles: Record<string, { bg: string; text: string; border: string }> = {
    apply:   { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30' },
    stretch: { bg: 'bg-amber-500/10',   text: 'text-amber-400',   border: 'border-amber-500/30' },
    skip:    { bg: 'bg-rose-500/10',    text: 'text-rose-400',    border: 'border-rose-500/30' }
  }

  const probabilityStyles: Record<string, { bg: string; text: string; border: string }> = {
    'High Odds':     { bg: 'bg-emerald-500/15', text: 'text-emerald-300', border: 'border-emerald-500/40' },
    'Strong Target': { bg: 'bg-indigo-500/15',  text: 'text-indigo-300',  border: 'border-indigo-500/40' },
    'Stretch Reach': { bg: 'bg-amber-500/15',   text: 'text-amber-300',   border: 'border-amber-500/40' }
  }

  return (
    <div className="space-y-8 pb-16 max-w-5xl mx-auto font-sans">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 border-b border-zinc-800/80 pb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white shadow-[0_0_20px_rgba(245,158,11,0.3)] border border-amber-400/20">
              <Flame className="w-5 h-5 fill-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                  Placement Cell Intelligence
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  Live Dispatch
                </span>
              </div>
            </div>
          </div>
          <p className="text-xs sm:text-sm text-zinc-400 max-w-xl leading-relaxed">
            Autonomous placement engine filtering high-selection-probability openings from <strong className="text-zinc-200">{windowDesc}</strong> tailored to your target track, dream companies, and salary floor.
          </p>
          {(pendingJobs.length > 0 || failedJobs.length > 0) && (
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              {pendingJobs.length > 0 && (
                <span className="px-2.5 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full text-[11px] font-semibold flex items-center gap-1">
                  <RefreshCcw className="w-3 h-3 animate-spin" /> {pendingJobs.length} analyzing...
                </span>
              )}
              {failedJobs.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="px-2.5 py-0.5 bg-amber-500/10 text-amber-300 border border-amber-500/20 rounded-full text-[11px] font-semibold flex items-center gap-1" title="Roles where AI match analysis was interrupted during background sync. Ready to re-score.">
                    <AlertCircle className="w-3 h-3 text-amber-400" />
                    {failedJobs.length} Unscored Leads
                  </span>
                  <button
                    onClick={() => retryMutation.mutate()}
                    disabled={retryMutation.isPending}
                    className="px-2.5 py-0.5 bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/30 rounded-full text-[11px] font-bold transition-all flex items-center gap-1 shadow-sm active:scale-95 disabled:opacity-50"
                    title="Run AI match scoring on these roles now"
                  >
                    {retryMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCcw className="w-3 h-3" />}
                    <span>{retryMutation.isPending ? 'Scoring...' : 'Score Now'}</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <button
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-[0_0_15px_rgba(16,185,129,0.25)] disabled:opacity-50 active:scale-95 shrink-0"
        >
          {syncMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-white" />
              <span>Scanning Dream Companies & ATS...</span>
            </>
          ) : (
            <>
              <Zap className="w-4 h-4 fill-white" />
              <span>Sync Live Requisitions</span>
            </>
          )}
        </button>
      </div>

      {/* Placement Cell Command Officer Briefing Banner */}
      {briefing && (
        <div className="bg-gradient-to-br from-zinc-900/90 via-zinc-900/60 to-zinc-950/80 p-6 rounded-3xl border border-zinc-800/80 shadow-2xl backdrop-blur-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>

          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative z-10">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-[11px] font-bold uppercase tracking-wider">
                  <Sparkles className="w-3 h-3 text-indigo-400" /> Automated Placement Briefing
                </span>
                <span className="text-zinc-500 text-xs">•</span>
                <span className="text-xs text-zinc-400 font-medium">Daily Placement Audit</span>
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                {briefing.officer_verdict}
              </h2>
              <p className="text-xs text-zinc-400 leading-relaxed max-w-xl">
                Primary Submission Recommendation: <span className="text-indigo-300 font-semibold underline decoration-indigo-500/40">{briefing.top_recommended_resume}</span> provides the highest skill-overlap across current openings.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 w-full md:w-auto shrink-0">
              <div className="bg-zinc-950/60 p-3.5 rounded-2xl border border-zinc-800/80 text-center">
                <span className="text-2xl font-black text-emerald-400 block">{briefing.high_odds_count}</span>
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">High Odds</span>
              </div>
              <div className="bg-zinc-950/60 p-3.5 rounded-2xl border border-zinc-800/80 text-center">
                <span className="text-2xl font-black text-white block">{briefing.eligible_matches}</span>
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Eligible</span>
              </div>
              <div className="bg-zinc-950/60 p-3.5 rounded-2xl border border-zinc-800/80 text-center">
                <span className="text-2xl font-black text-indigo-400 block">{briefing.dream_companies_tracked}</span>
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Dream Monitored</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      {!filteredJobs || filteredJobs.length === 0 ? (
        <div className="text-center py-20 bg-zinc-900/40 rounded-3xl border border-zinc-800/80 backdrop-blur-xl space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto border border-amber-500/20">
            <Flame className="w-6 h-6 fill-amber-400" />
          </div>
          <h2 className="text-base font-bold text-white">No New Openings in this Window</h2>
          <p className="text-xs text-zinc-400 max-w-sm mx-auto leading-relaxed">
            The placement officer auto-fetches every 4 hours, or you can trigger an immediate sync of your Dream Companies & official ATS boards right now.
          </p>
          <button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            className="mt-2 bg-zinc-800 hover:bg-zinc-700 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition-all inline-flex items-center gap-2 border border-zinc-700"
          >
            {syncMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 text-amber-400" />}
            <span>Sync Live Requisitions</span>
          </button>
        </div>
      ) : (
        <div className="grid gap-3.5">
          {filteredJobs.map((job: any) => {
            const analysis = job.job_analyses && job.job_analyses[0]
            const vStyle = analysis ? verdictStyles[analysis.verdict] || verdictStyles.apply : verdictStyles.apply
            const probTier = job.selection_probability || (analysis?.match_score >= 75 ? 'High Odds' : 'Strong Target')
            const probStyle = probabilityStyles[probTier] || probabilityStyles['Strong Target']
            const applyUrl = job.official_apply_url || job.url
            const recommendedResume = analysis?.recommended_resume_title
            
            return (
              <Link key={job.id} href={`/jobs/${job.id}`} className="block group">
                <div className="bg-zinc-900/60 p-5 rounded-2xl border border-zinc-800/80 hover:border-zinc-700 hover:bg-zinc-900/90 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
                  
                  <div className="flex-1 min-w-0 space-y-2.5">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h3 className="font-bold text-base text-zinc-100 group-hover:text-white transition-colors truncate">
                        {job.role_title}
                      </h3>
                      
                      {/* Selection Probability Badge */}
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border ${probStyle.bg} ${probStyle.text} ${probStyle.border}`}>
                        {probTier}
                      </span>

                      {analysis && (
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${vStyle.bg} ${vStyle.text} ${vStyle.border}`}>
                          {analysis.verdict}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400 font-medium">
                      <span className="flex items-center gap-1.5 text-zinc-200 font-semibold">
                        <Building2 className="w-3.5 h-3.5 text-indigo-400" />
                        {job.company}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-zinc-500" />
                        {job.location || 'Location Not Stated'}
                      </span>
                      {job.pay_min && (
                        <>
                          <span>•</span>
                          <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                            <Banknote className="w-3.5 h-3.5" />
                            ₹{(job.pay_min / 100000).toFixed(1)}L - {(job.pay_max / 100000).toFixed(1)}L
                          </span>
                        </>
                      )}
                    </div>

                    {/* Recommended Resume Pill to Apply From */}
                    {recommendedResume && (
                      <div className="inline-flex items-center gap-1.5 text-[11px] font-bold text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-1 rounded-lg">
                        <span className="text-indigo-400">📄 Apply with:</span>
                        <span className="text-zinc-200">{recommendedResume}</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-4 shrink-0 w-full sm:w-auto justify-between sm:justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-zinc-800/60">
                    {analysis && (
                      <div className="text-right">
                        <div className={`text-2xl font-black ${analysis.match_score >= 80 ? 'text-emerald-400' : analysis.match_score >= 50 ? 'text-amber-400' : 'text-zinc-500'}`}>
                          {analysis.match_score}
                        </div>
                        <div className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold">Match Score</div>
                      </div>
                    )}

                    {applyUrl && applyUrl !== 'Screenshot Upload' && (
                      <a
                        href={applyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm border border-indigo-500/30"
                      >
                        <span>Apply</span>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>

                </div>
              </Link>
            )
          })}
        </div>
      )}

    </div>
  )
}
