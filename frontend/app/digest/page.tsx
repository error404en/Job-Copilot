'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useState, useMemo } from 'react'
import {
  Sparkles,
  RefreshCcw,
  ExternalLink,
  Zap,
  ArrowRight,
  Clock,
  Building2,
  Calendar,
} from 'lucide-react'
import { useApiClient } from '@/lib/useApiClient'
import AutoFillModal from '@/components/AutoFillModal'

export default function DigestPage() {
  const queryClient = useQueryClient()
  const { fetch: apiFetch, isLoaded, isSignedIn } = useApiClient()
  const [autoFillJob, setAutoFillJob] = useState<any | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)

  // Fetch digest from backend
  const { data: digestData, isLoading, refetch } = useQuery({
    queryKey: ['digest'],
    enabled: isLoaded && !!isSignedIn,
    queryFn: async () => {
      const res = await apiFetch('/api/jobs/digest')
      if (!res.ok) throw new Error('Failed to fetch digest')
      return res.json()
    },
  })

  // Sync / Re-evaluate mutation
  const syncMutation = useMutation({
    mutationFn: async () => {
      setIsSyncing(true)
      const res = await apiFetch('/api/jobs/sync', { method: 'POST' })
      if (!res.ok) throw new Error('Sync failed')
      return res.json()
    },
    onSuccess: () => {
      refetch()
      setIsSyncing(false)
    },
    onError: () => {
      setIsSyncing(false)
    },
  })

  // Date formatting
  const todayFormatted = useMemo(() => {
    const d = new Date()
    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    })
  }, [])

  // Picks: top 3-5 roles scored overnight
  const topPicks = useMemo(() => {
    const rawMatches = digestData?.matched || []
    if (rawMatches.length > 0) {
      return rawMatches.slice(0, 4).map((j: any) => ({
        id: j.id,
        score: typeof j.match_score === 'number' ? String(j.match_score) : '91',
        title: j.role_title,
        company: j.company,
        location: j.location || 'Bengaluru · Hybrid',
        why: j.fit_reason || 'Retrieval services and FastAPI stack line up with your RAG projects.',
        posted: j.release_info?.shortLabel || '2h ago',
        raw: j,
      }))
    }

    return [
      {
        id: 'd1',
        score: '91',
        title: 'Backend Engineer Intern',
        company: 'Northwind Labs',
        location: 'Bengaluru · Hybrid',
        why: 'Retrieval services and FastAPI line up with your RAG projects.',
        posted: '2h ago',
        raw: {
          id: 'd1',
          role_title: 'Backend Engineer Intern',
          company: 'Northwind Labs',
          location: 'Bengaluru · Hybrid',
          match_score: 91,
          matched_skills: ['Python', 'FastAPI', 'PostgreSQL', 'RAG'],
        },
      },
      {
        id: 'd2',
        score: '88',
        title: 'AI Engineer Intern',
        company: 'Quillstone',
        location: 'Noida · Hybrid',
        why: 'LLM pipelines, vector search and evaluation, all verified on your resume.',
        posted: '1d ago',
        raw: {
          id: 'd2',
          role_title: 'AI Engineer Intern',
          company: 'Quillstone',
          location: 'Noida · Hybrid',
          match_score: 88,
          matched_skills: ['LangChain', 'RAG', 'Python', 'Embeddings'],
        },
      },
      {
        id: 'd3',
        score: '84',
        title: 'SDE Intern, Platform',
        company: 'Lattice Pay',
        location: 'Gurugram · On-site',
        why: 'Good fit on services and data structures. Go is the only minor gap.',
        posted: '5h ago',
        raw: {
          id: 'd3',
          role_title: 'SDE Intern, Platform',
          company: 'Lattice Pay',
          location: 'Gurugram · On-site',
          match_score: 84,
          matched_skills: ['REST APIs', 'SQL', 'Data Structures'],
        },
      },
    ]
  }, [digestData])

  const topPick = topPicks[0]

  return (
    <div className="min-h-screen bg-[#050507] text-[#F3EFE7] font-sans">
      <main className="max-w-[1360px] mx-auto px-4 sm:px-8 py-10 flex flex-col gap-10">
        {/* Header */}
        <header className="flex flex-col gap-3 max-w-3xl">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs uppercase tracking-wider text-[#8C97FF]">
              / Daily digest · {todayFormatted}
            </span>
            <button
              onClick={() => syncMutation.mutate()}
              disabled={isSyncing}
              className="inline-flex items-center gap-2 h-9 px-4 rounded-full text-xs font-mono uppercase tracking-wider bg-white/5 border border-white/10 text-[#C9C6BE] hover:bg-white/10 transition cursor-pointer"
            >
              <RefreshCcw className={`w-3.5 h-3.5 text-[#8C97FF] ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Scoring...' : 'Refresh Digest'}</span>
            </button>
          </div>
          <h1 className="font-serif text-4xl sm:text-6xl lg:text-7xl leading-[1.03]">
            Good morning. <i className="italic text-[#A9A59C]">Three roles are worth your time today.</i>
          </h1>
          <p className="text-base sm:text-lg leading-relaxed text-[#B4B1A9] max-w-xl">
            New postings were scored overnight against your primary resume. Here is what to do first, and what is about to close.
          </p>
        </header>

        {/* 2-Column Layout */}
        <div className="flex flex-col lg:flex-row gap-8 items-start">
          {/* Left Column: Top Matches */}
          <section className="w-full lg:flex-[1.5] min-w-0 flex flex-col">
            <span className="font-mono text-xs uppercase tracking-wider text-[#A8A59D] pb-3 border-b border-white/10">
              Top matches
            </span>

            <div className="flex flex-col divide-y divide-white/10">
              {topPicks.map((p: any) => (
                <div
                  key={p.id}
                  onClick={() => setAutoFillJob(p.raw)}
                  className="pick flex flex-col sm:flex-row gap-4 sm:gap-5 items-start sm:items-center py-5 px-3 -mx-3 rounded-2xl cursor-pointer hover:bg-white/[0.04] transition group border border-transparent hover:border-white/10"
                >
                  <span className="font-serif text-5xl sm:text-6xl leading-none text-[#8C97FF] shrink-0 group-hover:scale-105 transition-transform">
                    {p.score}
                  </span>

                  <div className="flex-1 min-w-0 flex flex-col gap-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="text-lg font-semibold tracking-tight text-[#F3EFE7] group-hover:text-[#8C97FF] transition">
                        {p.title}
                      </h3>
                      <span className="font-mono text-[11px] text-[#A8A59D] shrink-0">{p.posted}</span>
                    </div>

                    <span className="text-sm text-[#C9C6BE]">
                      {p.company} · {p.location}
                    </span>

                    <p className="text-xs leading-relaxed text-[#A8A59D] mt-0.5">{p.why}</p>

                    <div className="flex items-center gap-2 pt-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setAutoFillJob(p.raw)}
                        className="h-8 px-3.5 rounded-full bg-[#F3EFE7] text-[#0A0A0C] hover:bg-white text-xs font-medium transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                      >
                        <Zap className="w-3 h-3 text-[#2F3DFF]" />
                        <span>1-Click Auto-Fill</span>
                      </button>

                      <Link
                        href={`/?q=${encodeURIComponent(p.company)}`}
                        className="h-8 px-3 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 text-xs text-[#C9C6BE] hover:text-[#F3EFE7] transition flex items-center gap-1 font-mono"
                      >
                        <span>Inspect in Feed</span>
                        <ArrowRight className="w-3 h-3" />
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-white/10 pt-6 mt-2">
              <Link href="/" className="pill pill-c inline-flex items-center gap-2">
                <span>Open the full feed</span>
                <span aria-hidden="true">→</span>
              </Link>
            </div>
          </section>

          {/* Right Column: Widgets */}
          <aside className="w-full lg:flex-[1] min-w-0 flex flex-col gap-4">
            {/* Closing Soon */}
            <div className="glass p-6 flex flex-col gap-4 rounded-2xl">
              <span className="font-mono text-xs uppercase tracking-wider text-[#FFC861]">Closing soon</span>
              <div className="flex flex-col divide-y divide-white/[0.08]">
                <Link
                  href="/?q=Quillstone"
                  className="flex justify-between gap-3 items-baseline py-3 hover:pl-1 transition group cursor-pointer"
                >
                  <span className="text-sm text-[#F3EFE7] group-hover:text-[#FFC861] transition">Quillstone, AI Engineer Intern</span>
                  <span className="font-mono text-xs text-[#FFE2A8] shrink-0 group-hover:underline flex items-center gap-1">
                    <span>Closes in 2 days</span>
                    <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition" />
                  </span>
                </Link>
                <Link
                  href="/?q=Lattice"
                  className="flex justify-between gap-3 items-baseline py-3 hover:pl-1 transition group cursor-pointer"
                >
                  <span className="text-sm text-[#F3EFE7] group-hover:text-[#FFC861] transition">Lattice Pay, SDE Intern</span>
                  <span className="font-mono text-xs text-[#FFE2A8] shrink-0 group-hover:underline flex items-center gap-1">
                    <span>Closes in 5 days</span>
                    <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition" />
                  </span>
                </Link>
              </div>
            </div>

            {/* Pipeline Since Yesterday */}
            <div className="glass p-6 flex flex-col gap-4 rounded-2xl">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs uppercase tracking-wider text-[#8C97FF]">Pipeline since yesterday</span>
                <Link href="/tracker" className="text-[11px] font-mono text-zinc-400 hover:text-white transition">
                  View Board →
                </Link>
              </div>
              <div className="flex flex-col divide-y divide-white/[0.08]">
                <Link
                  href="/inbox"
                  className="flex justify-between gap-3 items-baseline py-3 hover:bg-white/[0.02] px-2 -mx-2 rounded-lg transition group cursor-pointer"
                >
                  <span className="text-sm text-[#C9C6BE] group-hover:text-[#F3EFE7] transition">New leads scored</span>
                  <span className="font-serif text-2xl text-[#F3EFE7] group-hover:text-[#8C97FF] transition">12</span>
                </Link>
                <Link
                  href="/tracker"
                  className="flex justify-between gap-3 items-baseline py-3 hover:bg-white/[0.02] px-2 -mx-2 rounded-lg transition group cursor-pointer"
                >
                  <span className="text-sm text-[#C9C6BE] group-hover:text-[#F3EFE7] transition">Applications sent</span>
                  <span className="font-serif text-2xl text-[#F3EFE7] group-hover:text-[#8C97FF] transition">2</span>
                </Link>
                <Link
                  href="/tracker"
                  className="flex justify-between gap-3 items-baseline py-3 hover:bg-white/[0.02] px-2 -mx-2 rounded-lg transition group cursor-pointer"
                >
                  <span className="text-sm text-[#C9C6BE] group-hover:text-[#F3EFE7] transition">Replies received</span>
                  <span className="font-serif text-2xl text-[#5EEAA8]">1</span>
                </Link>
              </div>
            </div>

            {/* One Thing to Do Today */}
            <div className="glass p-6 flex flex-col gap-3 rounded-2xl">
              <span className="font-mono text-xs uppercase tracking-wider text-[#5EEAA8]">One thing to do today</span>
              <p className="font-serif text-2xl leading-snug text-[#F3EFE7] m-0">
                Apply to {topPick?.company || 'Northwind Labs'} before the requisition hits the volume cap.
              </p>
              <button
                onClick={() => setAutoFillJob(topPick?.raw)}
                className="pill pill-c self-start mt-1 text-xs cursor-pointer flex items-center gap-1.5"
              >
                <Zap className="w-3.5 h-3.5 text-[#2F3DFF]" />
                <span>Auto-fill application now →</span>
              </button>
            </div>
          </aside>
        </div>
      </main>

      {/* AutoFill Modal */}
      {autoFillJob && (
        <AutoFillModal
          isOpen={!!autoFillJob}
          data={autoFillJob}
          onClose={() => setAutoFillJob(null)}
        />
      )}
    </div>
  )
}
