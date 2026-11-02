'use client'

import { useQuery, useMutation } from '@tanstack/react-query'
import Link from 'next/link'
import { useApiClient } from '@/lib/useApiClient'
import {
  Flame,
  Loader2,
  RefreshCcw,
  ArrowUpRight,
  MapPin,
  Building2,
  Banknote,
  Sparkles,
  Zap,
  AlertCircle,
  BrainCircuit,
  FileText
} from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'

function cleanTitle(title?: string): string {
  if (!title) return 'Job Opportunity'
  return title
    .replace(/[\uFFFD]/g, '—')
    .replace(/\s+/g, ' ')
    .trim()
}

export default function DigestPage() {
  const { fetch: apiFetch, isLoaded, isSignedIn } = useApiClient()
  const { data: jobs, isLoading, refetch: refetchDigest } = useQuery({
    queryKey: ['digest'],
    enabled: isLoaded && !!isSignedIn,
    queryFn: async () => {
      const res = await apiFetch('/api/jobs/digest')
      if (!res.ok) throw new Error('Failed to fetch digest')
      return res.json()
    },
  })

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch('/api/jobs/sync', { method: 'POST' })
      if (!res.ok) throw new Error('Sync failed')
      return res.json()
    },
    onSuccess: () => {
      refetchDigest()
    },
  })

  const retryMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch('/api/jobs/retry-analyses', { method: 'POST' })
      if (!res.ok) throw new Error('Retry failed')
      return res.json()
    },
    onSuccess: () => {
      refetchDigest()
    },
  })

  if (isLoading)
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-3 font-sans">
        <RefreshCcw className="w-6 h-6 text-[#5b5bd6] animate-spin" />
        <div className="text-[#918f9f] text-xs font-medium">Preparing your daily curated digest...</div>
      </div>
    )

  const filteredJobs = jobs?.matched || []
  const pendingJobs = jobs?.analysis_pending || []
  const failedJobs = jobs?.analysis_failed || []
  const windowDesc = jobs?.window_description || 'Past 24 Hours'
  const briefing = jobs?.placement_briefing

  const verdictStyles: Record<string, { bg: string; text: string; border: string }> = {
    apply:   { bg: 'bg-[#45dfa4]/10', text: 'text-[#45dfa4]', border: 'border-[#45dfa4]/30' },
    stretch: { bg: 'bg-[#ffb77e]/10', text: 'text-[#ffb77e]', border: 'border-[#ffb77e]/30' },
    skip:    { bg: 'bg-rose-500/10',  text: 'text-rose-400',  border: 'border-rose-500/30' },
  }

  const probabilityStyles: Record<string, { bg: string; text: string; border: string }> = {
    'High Odds':     { bg: 'bg-[#45dfa4]/12', text: 'text-[#45dfa4]', border: 'border-[#45dfa4]/35' },
    'Strong Target': { bg: 'bg-[#5b5bd6]/15', text: 'text-[#c3c0ff]', border: 'border-[#5b5bd6]/35' },
    'Stretch Reach': { bg: 'bg-[#ffb77e]/12', text: 'text-[#ffb77e]', border: 'border-[#ffb77e]/35' },
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6 pb-16 font-sans">
      <PageHeader
        suite="Daily Curated Digest"
        title="Daily Digest"
        subtitle={`High-probability roles discovered in the ${windowDesc.toLowerCase()}, ranked against your Primary Resume and compensation floor.`}
        icon={Flame}
        badge="Curated Dispatch"
        badgeColor="amber"
        actions={
          <button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            className="bg-[#5b5bd6] hover:bg-[#4f4fc7] text-white px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 disabled:opacity-50 shrink-0"
          >
            {syncMutation.isPending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                <span>Scanning ATS Boards...</span>
              </>
            ) : (
              <>
                <Zap className="w-3.5 h-3.5" />
                <span>Sync Live Requisitions</span>
              </>
            )}
          </button>
        }
      />

      {(pendingJobs.length > 0 || failedJobs.length > 0) && (
        <div className="flex items-center gap-2 flex-wrap">
          {pendingJobs.length > 0 && (
            <span className="px-3 py-1 bg-[#5b5bd6]/12 text-[#c3c0ff] border border-[#5b5bd6]/30 rounded-lg text-xs font-semibold flex items-center gap-1.5">
              <RefreshCcw className="w-3.5 h-3.5 animate-spin" /> {pendingJobs.length} analyzing...
            </span>
          )}
          {failedJobs.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-[#ffb77e]/10 text-[#ffb77e] border border-[#ffb77e]/30 rounded-lg text-xs font-semibold flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-[#ffb77e]" />
                {failedJobs.length} Unscored Leads
              </span>
              <button
                onClick={() => retryMutation.mutate()}
                disabled={retryMutation.isPending}
                className="px-3 py-1 bg-[#282a2e] hover:bg-[#33353a] text-[#e2e2e8] border border-[#464553]/40 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 disabled:opacity-50"
              >
                {retryMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCcw className="w-3.5 h-3.5" />
                )}
                <span>{retryMutation.isPending ? 'Scoring...' : 'Score Now'}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Placement Briefing Card */}
      {briefing && (
        <div className="bg-[#1a1c20] p-6 rounded-xl border border-[#464553]/35">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-[#5b5bd6]/15 border border-[#5b5bd6]/30 text-[#c3c0ff] text-[10px] font-semibold uppercase tracking-wider">
                  <Sparkles className="w-3 h-3 text-[#5b5bd6]" /> Daily Briefing
                </span>
                <span className="text-[#918f9f] text-xs">•</span>
                <span className="text-xs text-[#918f9f] font-medium">Automated Fit Summary</span>
              </div>
              <h2 className="text-base sm:text-lg font-bold text-[#e2e2e8] tracking-tight">
                {briefing.officer_verdict}
              </h2>
              <p className="text-xs text-[#918f9f] leading-relaxed max-w-xl">
                Recommended Resume Variant:{' '}
                <span className="text-[#e2e2e8] font-semibold">{briefing.top_recommended_resume}</span> provides the
                strongest skill overlap across today&apos;s roles.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 w-full md:w-auto shrink-0">
              <div className="bg-[#0c0e12] p-3.5 rounded-xl border border-[#464553]/35 text-center">
                <span className="text-xl font-bold font-mono text-[#45dfa4] block">{briefing.high_odds_count}</span>
                <span className="text-[10px] font-semibold text-[#918f9f] uppercase tracking-wider">High Odds</span>
              </div>
              <div className="bg-[#0c0e12] p-3.5 rounded-xl border border-[#464553]/35 text-center">
                <span className="text-xl font-bold font-mono text-[#e2e2e8] block">{briefing.eligible_matches}</span>
                <span className="text-[10px] font-semibold text-[#918f9f] uppercase tracking-wider">Eligible</span>
              </div>
              <div className="bg-[#0c0e12] p-3.5 rounded-xl border border-[#464553]/35 text-center">
                <span className="text-xl font-bold font-mono text-[#c3c0ff] block">
                  {briefing.dream_companies_tracked}
                </span>
                <span className="text-[10px] font-semibold text-[#918f9f] uppercase tracking-wider">Dream Boards</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      {!filteredJobs || filteredJobs.length === 0 ? (
        <div className="text-center py-20 bg-[#1a1c20] rounded-xl border border-[#464553]/35 space-y-4">
          <div className="w-11 h-11 rounded-xl bg-[#ffb77e]/10 text-[#ffb77e] flex items-center justify-center mx-auto border border-[#ffb77e]/30">
            <Flame className="w-5 h-5" />
          </div>
          <h2 className="text-sm font-bold text-[#e2e2e8]">No New Openings in this Window</h2>
          <p className="text-xs text-[#918f9f] max-w-sm mx-auto leading-relaxed">
            JobCopilot syncs periodically in the background, or you can trigger an immediate scan of your subscribed ATS
            boards right now.
          </p>
          <button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            className="mt-2 bg-[#282a2e] hover:bg-[#33353a] text-[#e2e2e8] px-5 py-2.5 rounded-xl text-xs font-semibold transition-all inline-flex items-center gap-2 border border-[#464553]/40"
          >
            {syncMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Zap className="w-3.5 h-3.5 text-[#ffb77e]" />
            )}
            <span>Sync Live Requisitions</span>
          </button>
        </div>
      ) : (
        <div className="grid gap-3.5">
          {filteredJobs.map((job: any) => {
            const analysis = job.job_analyses && job.job_analyses[0]
            const vStyle = analysis ? verdictStyles[analysis.verdict] || verdictStyles.apply : verdictStyles.apply
            const probTier =
              job.selection_probability || (analysis?.match_score >= 75 ? 'High Odds' : 'Strong Target')
            const probStyle = probabilityStyles[probTier] || probabilityStyles['Strong Target']
            const applyUrl = job.official_apply_url || job.url
            const recommendedResume = analysis?.recommended_resume_title

            return (
              <Link key={job.id} href={`/jobs/${job.id}`} className="block group">
                <div className="bg-[#1a1c20] p-5 rounded-xl border border-[#464553]/35 hover:border-[#5b5bd6]/50 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-base text-[#e2e2e8] group-hover:text-white transition-colors truncate">
                        {cleanTitle(job.role_title)}
                      </h3>

                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider border ${probStyle.bg} ${probStyle.text} ${probStyle.border}`}
                      >
                        {probTier}
                      </span>

                      {analysis && (
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider border ${vStyle.bg} ${vStyle.text} ${vStyle.border}`}
                        >
                          {analysis.verdict}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-[#918f9f] font-medium">
                      <span className="flex items-center gap-1.5 text-[#e2e2e8] font-semibold">
                        <Building2 className="w-3.5 h-3.5 text-[#5b5bd6]" />
                        {job.company}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-[#918f9f]" />
                        {job.location || 'Location Not Stated'}
                      </span>
                      {job.pay_min && (
                        <>
                          <span>•</span>
                          <span className="flex items-center gap-1 text-[#45dfa4] font-mono font-semibold">
                            <Banknote className="w-3.5 h-3.5" />₹{(job.pay_min / 100000).toFixed(1)}L -{' '}
                            {(job.pay_max / 100000).toFixed(1)}L
                          </span>
                        </>
                      )}
                    </div>

                    {recommendedResume && (
                      <div className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#c3c0ff] bg-[#0c0e12] border border-[#464553]/35 px-2.5 py-1 rounded-lg">
                        <FileText className="w-3 h-3 text-[#5b5bd6]" />
                        <span className="text-[#918f9f]">Best Variant:</span>
                        <span className="text-[#e2e2e8] font-semibold">{recommendedResume}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-3 shrink-0 w-full sm:w-auto justify-between sm:justify-end pt-3 sm:pt-0 border-t sm:border-t-0 border-[#464553]/25">
                    {analysis && (
                      <div className="text-right">
                        <div
                          className={`text-xl font-bold font-mono ${
                            analysis.match_score >= 80
                              ? 'text-[#45dfa4]'
                              : analysis.match_score >= 50
                              ? 'text-[#ffb77e]'
                              : 'text-[#918f9f]'
                          }`}
                        >
                          {analysis.match_score}%
                        </div>
                        <div className="text-[10px] text-[#918f9f] uppercase tracking-wider font-semibold">Match</div>
                      </div>
                    )}

                    <Link
                      href={`/jobs/${job.id}?tab=coach`}
                      onClick={(e) => e.stopPropagation()}
                      className="bg-[#282a2e] hover:bg-[#33353a] text-[#e2e2e8] px-3 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 border border-[#464553]/40"
                    >
                      <BrainCircuit className="w-3.5 h-3.5 text-[#45dfa4]" />
                      <span className="hidden sm:inline">Prep Coach</span>
                    </Link>

                    {applyUrl && applyUrl !== 'Screenshot Upload' && (
                      <a
                        href={applyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="bg-[#5b5bd6] hover:bg-[#4f4fc7] text-white px-3.5 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5"
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
