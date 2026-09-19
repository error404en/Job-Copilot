'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useApiClient } from '@/lib/useApiClient'

export default function DigestPage() {
  const { fetch: apiFetch, isLoaded, isSignedIn } = useApiClient()
  const { data: jobs, isLoading } = useQuery({
    queryKey: ['digest'],
    enabled: isLoaded && !!isSignedIn,
    queryFn: async () => {
      const res = await apiFetch('/api/jobs/digest')
      if (!res.ok) throw new Error('Failed to fetch digest')
      return res.json()
    }
  })

  if (isLoading) return <div>Loading digest...</div>

  const filteredJobs = jobs?.matched || []
  const pendingJobs = jobs?.analysis_pending || []
  const failedJobs = jobs?.analysis_failed || []

  const verdictColors: Record<string, string> = {
    apply: 'bg-green-500/10 text-green-400 border-green-500/20',
    stretch: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    skip: 'bg-red-500/10 text-red-400 border-red-500/20'
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2 text-white">Daily Digest</h1>
          <p className="text-zinc-400">High-quality jobs from the last 24 hours that passed your pay floor.</p>
          {(pendingJobs.length > 0 || failedJobs.length > 0) && (
            <div className="flex gap-2 mt-4">
              {pendingJobs.length > 0 && (
                <span className="px-3 py-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded text-sm font-medium">
                  ⏳ {pendingJobs.length} analyzing...
                </span>
              )}
              {failedJobs.length > 0 && (
                <span className="px-3 py-1 bg-red-500/10 text-red-400 border border-red-500/20 rounded text-sm font-medium">
                  ❌ {failedJobs.length} failed analysis
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {!filteredJobs || filteredJobs.length === 0 ? (
        <div className="text-center py-24 bg-zinc-900/50 rounded-xl border border-zinc-800/50 backdrop-blur-sm">
          <div className="text-4xl mb-4">☕</div>
          <h2 className="text-xl font-medium text-zinc-300 mb-2">You're all caught up!</h2>
          <p className="text-zinc-500 max-w-md mx-auto">No new jobs in the last 24 hours met your strict criteria. Go relax, or use the extension to capture some more.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredJobs.map((job: any) => {
            const analysis = job.job_analyses && job.job_analyses[0]
            const vColor = analysis ? verdictColors[analysis.verdict] : 'bg-gray-100 text-gray-800'
            
            return (
              <Link key={job.id} href={`/jobs/${job.id}`} className="block">
                <div className="bg-zinc-900/40 p-6 rounded-xl border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/80 transition-all flex items-center justify-between group shadow-sm">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1.5">
                      <h3 className="font-semibold text-lg text-zinc-100 group-hover:text-white transition-colors">{job.role_title}</h3>
                      {analysis && (
                        <span className={`px-2.5 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider border ${vColor}`}>
                          {analysis.verdict}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-zinc-400 font-medium">
                      {job.company} <span className="text-zinc-600 mx-1">•</span> {job.location || 'Location Unclear'}
                    </div>
                  </div>
                  
                  {analysis && (
                    <div className="text-right">
                      <div className={`text-3xl font-black ${analysis.match_score >= 80 ? 'text-green-400' : analysis.match_score >= 50 ? 'text-amber-400' : 'text-zinc-500'}`}>
                        {analysis.match_score}
                      </div>
                      <div className="text-[10px] text-zinc-500 uppercase tracking-widest mt-1 font-bold">Score</div>
                    </div>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
