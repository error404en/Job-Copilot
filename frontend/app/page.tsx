'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useState } from 'react'
import { useApiClient } from '@/lib/useApiClient'

export default function Dashboard() {
  const [filter, setFilter] = useState<'all' | 'bookmarks' | 'deadlines'>('all')
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

  if (isLoading) return <div>Loading jobs...</div>

  let filteredJobs = jobs || []
  if (filter === 'bookmarks') {
    filteredJobs = filteredJobs.filter((job: any) => job.is_bookmarked)
  } else if (filter === 'deadlines') {
    filteredJobs = filteredJobs.filter((job: any) => job.deadline)
    filteredJobs.sort((a: any, b: any) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())
  }

  const verdictColors: Record<string, string> = {
    apply: 'bg-green-500/10 text-green-400 border-green-500/20',
    stretch: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    skip: 'bg-red-500/10 text-red-400 border-red-500/20'
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-4">Analyzed Jobs</h1>
          <div className="flex gap-2">
            <button 
              onClick={() => setFilter('all')} 
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${filter === 'all' ? 'bg-blue-600 text-white' : 'bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800'}`}
            >
              All Jobs
            </button>
            <button 
              onClick={() => setFilter('bookmarks')} 
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ${filter === 'bookmarks' ? 'bg-yellow-500 text-zinc-950' : 'bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800'}`}
            >
              ★ Bookmarks
            </button>
            <button 
              onClick={() => setFilter('deadlines')} 
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ${filter === 'deadlines' ? 'bg-purple-500 text-zinc-950' : 'bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800'}`}
            >
              ⏳ Upcoming Deadlines
            </button>
          </div>
        </div>
        <Link href="/jobs/new" className="bg-white text-zinc-950 px-5 py-2.5 rounded-lg font-semibold hover:bg-zinc-200 transition-colors shadow-sm self-start">
          + Add Job
        </Link>
      </div>

      {!filteredJobs || filteredJobs.length === 0 ? (
        <div className="text-center py-24 bg-zinc-900/50 rounded-xl border border-zinc-800/50 backdrop-blur-sm">
          <h2 className="text-xl font-medium text-zinc-400 mb-4">No jobs found for this filter</h2>
          {filter === 'all' && (
            <Link href="/jobs/new" className="text-blue-400 font-medium hover:text-blue-300 hover:underline">
              Analyze your first job →
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredJobs.map((job: any) => {
            const analysis = job.job_analyses && job.job_analyses[0]
            const vColor = analysis ? verdictColors[analysis.verdict] : 'bg-gray-100 text-gray-800'
            
            return (
              <div key={job.id} className="bg-zinc-900/40 p-6 rounded-xl border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/80 transition-all flex items-center justify-between group shadow-sm">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1.5">
                    <Link href={`/jobs/${job.id}`} className="font-semibold text-lg text-zinc-100 hover:text-white hover:underline transition-colors">
                      {job.role_title}
                    </Link>
                    {analysis && (
                      <span className={`px-2.5 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider border ${vColor}`}>
                        {analysis.verdict}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-zinc-400 font-medium">
                    {job.company} <span className="text-zinc-600 mx-1">•</span> {job.location || 'Location Unclear'}
                    {job.deadline && (
                      <span className="ml-3 text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20 text-xs">
                        ⏳ {new Date(job.deadline).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-6">
                  {job.url && job.url !== 'Screenshot Upload' && (
                    <a href={job.url} target="_blank" rel="noopener noreferrer" className="bg-zinc-800 text-zinc-300 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-white hover:text-zinc-950 transition-colors">
                      Apply ↗
                    </a>
                  )}
                  {analysis && (
                    <Link href={`/jobs/${job.id}`} className="text-right block hover:opacity-80 transition-opacity">
                      <div className={`text-3xl font-black ${analysis.match_score >= 80 ? 'text-green-400' : analysis.match_score >= 50 ? 'text-amber-400' : 'text-zinc-500'}`}>
                        {analysis.match_score}
                      </div>
                      <div className="text-[10px] text-zinc-500 uppercase tracking-widest mt-1 font-bold">Score</div>
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
