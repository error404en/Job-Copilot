'use client'

import {
  Search,
  Building2,
  MapPin,
  Briefcase,
  GraduationCap,
  CheckCircle2,
  AlertCircle,
  ArrowUpRight,
  Activity,
  RefreshCcw,
  ListTodo,
  XCircle
} from 'lucide-react'
import { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useApiClient } from '@/lib/useApiClient'
import { PageHeader } from '@/components/ui/PageHeader'

const STORAGE_KEY_COMPANIES = 'apply_tool_companies_state'

const LOCATION_OPTIONS = [
  { id: 'all', label: 'All Locations' },
  { id: 'bengaluru', label: 'Bengaluru / Bangalore' },
  { id: 'mumbai', label: 'Mumbai' },
  { id: 'pune', label: 'Pune' },
  { id: 'hyderabad', label: 'Hyderabad' },
  { id: 'delhi', label: 'Delhi / NCR / Noida / Gurugram' },
  { id: 'chennai', label: 'Chennai' },
  { id: 'pan india', label: 'Pan India' },
  { id: 'remote', label: 'Remote' },
]

const INDUSTRY_OPTIONS = [
  { id: 'all', label: 'All Industries' },
  { id: 'banking', label: 'Banking & Fintech' },
  { id: 'product', label: 'Tech & Product' },
  { id: 'services', label: 'IT Services & Consulting' },
]

export default function CompaniesPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { fetch: apiFetch, isLoaded, isSignedIn } = useApiClient()

  const [selectedLocation, setSelectedLocation] = useState('all')
  const [selectedIndustry, setSelectedIndustry] = useState('all')
  const [fresherOnly, setFresherOnly] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [trackedMap, setTrackedMap] = useState<Record<string, boolean>>({})
  const [companyScores, setCompanyScores] = useState<Record<string, any>>({})
  const [loadingScores, setLoadingScores] = useState<Record<string, boolean>>({})
  const [statusBanner, setStatusBanner] = useState<{ text: string; type: 'error' | 'success' } | null>(null)

  const isHydratedRef = useRef(false)

  useEffect(() => {
    const hydrate = () => {
      if (typeof window === 'undefined') return
      const sp = new URLSearchParams(window.location.search)
      const hasUrlParams = window.location.search && window.location.search.length > 1

      let saved: any = null
      try {
        const raw = sessionStorage.getItem(STORAGE_KEY_COMPANIES)
        if (raw) saved = JSON.parse(raw)
      } catch {}

      const targetLoc = hasUrlParams ? (sp.get('loc') || 'all') : (saved?.selectedLocation || 'all')
      const targetInd = hasUrlParams ? (sp.get('ind') || 'all') : (saved?.selectedIndustry || 'all')
      const targetFresher = hasUrlParams ? sp.get('fresher') === 'true' : (saved?.fresherOnly || false)
      const targetQ = hasUrlParams ? (sp.get('q') || '') : (saved?.searchQuery || '')

      setSelectedLocation(targetLoc)
      setSelectedIndustry(targetInd)
      setFresherOnly(targetFresher)
      setSearchQuery(targetQ)

      isHydratedRef.current = true
    }

    hydrate()

    const handlePopState = () => {
      hydrate()
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    if (!isHydratedRef.current || typeof window === 'undefined') return

    const params = new URLSearchParams()
    if (selectedLocation !== 'all') params.set('loc', selectedLocation)
    if (selectedIndustry !== 'all') params.set('ind', selectedIndustry)
    if (fresherOnly) params.set('fresher', 'true')
    if (searchQuery.trim()) params.set('q', searchQuery.trim())

    const q = params.toString()
    const newUrl = q ? `/companies?${q}` : '/companies'
    window.history.replaceState(null, '', newUrl)

    try {
      sessionStorage.setItem(
        STORAGE_KEY_COMPANIES,
        JSON.stringify({
          selectedLocation,
          selectedIndustry,
          fresherOnly,
          searchQuery,
        })
      )
    } catch {}
  }, [selectedLocation, selectedIndustry, fresherOnly, searchQuery])

  const handleCheckFit = async (company: any, roleTitle?: string, seniority?: string) => {
    const key = `${company.id}_${roleTitle || 'default'}`
    setLoadingScores((prev) => ({ ...prev, [key]: true }))
    try {
      const targetRole = roleTitle || (company.verified_levels ? company.verified_levels[0]?.role : 'Software Engineer')
      const res = await apiFetch('/api/jobs/quick-score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: company.name,
          role_title: targetRole,
          location: company.locations[0] || 'India',
          url: company.careers_url,
          seniority_required: seniority || (company.fresher_friendly ? '0-2yr' : '2-5yr'),
          experience_level: company.fresher_friendly ? '0-2 Yrs (Freshers Match)' : '2-5 Yrs',
        }),
      })
      if (!res.ok) throw new Error('Failed to score role')
      const data = await res.json()
      setCompanyScores((prev) => ({ ...prev, [key]: data }))
    } catch (err: any) {
      setStatusBanner({ text: err.message || 'Failed to score profile against role.', type: 'error' })
      setTimeout(() => setStatusBanner(null), 4000)
    } finally {
      setLoadingScores((prev) => ({ ...prev, [key]: false }))
    }
  }

  const { data: companies, isLoading } = useQuery({
    queryKey: ['target_companies', selectedLocation, selectedIndustry, fresherOnly],
    enabled: isLoaded && !!isSignedIn,
    queryFn: async () => {
      const url = '/api/companies?'
      const params = new URLSearchParams()
      if (selectedLocation !== 'all') params.append('location', selectedLocation)
      if (selectedIndustry !== 'all') params.append('industry', selectedIndustry)
      if (fresherOnly) params.append('fresher_only', 'true')

      const res = await apiFetch(url + params.toString())
      if (!res.ok) throw new Error('Failed to fetch companies')
      return res.json()
    },
  })

  const trackMutation = useMutation({
    mutationFn: async (company: any) => {
      const res = await apiFetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: company.name,
          role_title: company.verified_levels ? company.verified_levels[0]?.role : 'Target Role',
          location: company.locations[0] || 'Pan India',
          url: company.careers_url,
          status: 'saved',
          notes: `Target company from Curated Directory (${company.industry})`,
        }),
      })
      if (!res.ok) throw new Error('Failed to track')
      return res.json()
    },
    onSuccess: (_, variables) => {
      setTrackedMap((prev) => ({ ...prev, [variables.id]: true }))
      queryClient.invalidateQueries({ queryKey: ['applications'] })
    },
  })

  const filteredCompanies = useMemo(() => {
    if (!companies) return []
    if (!searchQuery.trim()) return companies
    const q = searchQuery.toLowerCase().trim()
    return companies.filter((c: any) => {
      return (
        c.name.toLowerCase().includes(q) ||
        c.industry.toLowerCase().includes(q) ||
        c.locations.some((l: string) => l.toLowerCase().includes(q)) ||
        (c.compensation_highlight || '').toLowerCase().includes(q)
      )
    })
  }, [companies, searchQuery])

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 pb-16 font-sans">
      <PageHeader
        suite="Company ATS Boards"
        title="Target Companies & Compensation"
        subtitle="Curated directory of premier tech, banking, and high-growth employers with verified CTC levels, direct career portals, and instant fit scoring."
        icon={Building2}
        badge={`${filteredCompanies.length} Employers`}
        badgeColor="indigo"
        actions={
          <div className="flex items-center gap-2.5">
            <Link
              href="/jobs/new?tab=ats"
              className="bg-[#1a1c20] border border-[#464553]/35 text-[#e2e2e8] px-3.5 py-2 rounded-xl text-xs font-semibold hover:bg-[#282a2e] transition-all flex items-center gap-1.5"
            >
              <span>+ Add ATS Board</span>
            </Link>
            <Link
              href="/tracker"
              className="bg-[#5b5bd6] hover:bg-[#4f4fc7] text-white px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5"
            >
              <ListTodo className="w-3.5 h-3.5" />
              <span>Open Tracker</span>
            </Link>
          </div>
        }
      />

      {statusBanner && (
        <div
          className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-between ${
            statusBanner.type === 'error'
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              : 'bg-[#45dfa4]/10 border-[#45dfa4]/30 text-[#45dfa4]'
          }`}
        >
          <span>{statusBanner.text}</span>
          <button onClick={() => setStatusBanner(null)} className="opacity-70 hover:opacity-100">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="bg-[#1a1c20] p-4 rounded-xl border border-[#464553]/35 space-y-4">
        <div className="flex flex-col md:flex-row gap-3 justify-between items-center">
          <div className="relative w-full md:w-[28rem]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#918f9f]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search companies, tech stack, roles..."
              className="w-full bg-[#0c0e12] border border-[#464553]/40 text-[#e2e2e8] pl-10 pr-8 py-2 rounded-lg text-xs placeholder-[#918f9f] focus:outline-none focus:border-[#5b5bd6] transition-all"
            />
          </div>

          <label className="flex items-center gap-2.5 text-xs text-[#e2e2e8] cursor-pointer select-none bg-[#0c0e12] px-3.5 py-2 rounded-lg border border-[#464553]/40 hover:border-[#5b5bd6]/50 transition-colors">
            <input
              type="checkbox"
              checked={fresherOnly}
              onChange={(e) => setFresherOnly(e.target.checked)}
              className="w-4 h-4 rounded bg-[#1a1c20] border-[#464553] text-[#5b5bd6] focus:ring-[#5b5bd6] cursor-pointer"
            />
            <span className="font-semibold flex items-center gap-1.5">
              <GraduationCap className="w-4 h-4 text-[#45dfa4]" /> Freshers (0-2 Yrs) Friendly Only
            </span>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-[#464553]/25 text-xs">
          <div className="flex items-center gap-2">
            <MapPin className="w-3.5 h-3.5 text-[#918f9f]" />
            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="bg-[#0c0e12] border border-[#464553]/40 text-[#e2e2e8] rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#5b5bd6] font-medium cursor-pointer"
            >
              {LOCATION_OPTIONS.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <Briefcase className="w-3.5 h-3.5 text-[#918f9f]" />
            <select
              value={selectedIndustry}
              onChange={(e) => setSelectedIndustry(e.target.value)}
              className="bg-[#0c0e12] border border-[#464553]/40 text-[#e2e2e8] rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#5b5bd6] font-medium cursor-pointer"
            >
              {INDUSTRY_OPTIONS.map((ind) => (
                <option key={ind.id} value={ind.id}>
                  {ind.label}
                </option>
              ))}
            </select>
          </div>

          {(selectedLocation !== 'all' || selectedIndustry !== 'all' || fresherOnly || searchQuery) && (
            <button
              onClick={() => {
                setSelectedLocation('all')
                setSelectedIndustry('all')
                setFresherOnly(false)
                setSearchQuery('')
                if (typeof window !== 'undefined') {
                  try {
                    sessionStorage.removeItem(STORAGE_KEY_COMPANIES)
                  } catch {}
                  window.history.replaceState(null, '', '/companies')
                }
              }}
              className="text-[11px] text-[#c3c0ff] hover:text-white font-semibold px-2.5 py-1 rounded-md bg-[#5b5bd6]/15 border border-[#5b5bd6]/30 transition-colors ml-auto"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {isLoading && (
        <div className="flex flex-col items-center justify-center py-24 space-y-3">
          <RefreshCcw className="w-6 h-6 text-[#5b5bd6] animate-spin" />
          <div className="text-[#918f9f] text-xs font-medium">Loading target companies...</div>
        </div>
      )}

      {!isLoading && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {filteredCompanies.map((c: any) => {
            const isTracked = trackedMap[c.id]
            const scoreData = companyScores[`${c.id}_default`]
            const isScoring = loadingScores[`${c.id}_default`]

            return (
              <div
                key={c.id}
                className="bg-[#1a1c20] border border-[#464553]/35 hover:border-[#464553]/60 rounded-xl p-6 space-y-4 transition-all flex flex-col justify-between"
              >
                <div className="space-y-4">
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-lg font-bold text-[#e2e2e8] tracking-tight">{c.name}</h2>
                        <span className="text-[11px] bg-[#282a2e] text-[#e2e2e8] px-2.5 py-0.5 rounded-md font-medium border border-[#464553]/40">
                          {c.industry}
                        </span>
                      </div>
                      <div className="text-xs text-[#c3c0ff] font-medium mt-1 flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5 text-[#5b5bd6]" /> {c.badge}
                      </div>
                    </div>

                    {c.fresher_friendly && (
                      <span className="text-[10px] bg-[#45dfa4]/10 text-[#45dfa4] border border-[#45dfa4]/30 px-2.5 py-0.5 rounded-md font-semibold uppercase tracking-wider shrink-0 flex items-center gap-1">
                        <GraduationCap className="w-3 h-3" /> Freshers OK
                      </span>
                    )}
                  </div>

                  {/* Description */}
                  <p className="text-xs text-[#918f9f] leading-relaxed line-clamp-2">{c.description}</p>

                  {/* Locations */}
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[#918f9f]">
                    <span className="text-[#918f9f] font-medium mr-1">Hubs:</span>
                    {c.locations.map((loc: string) => (
                      <span
                        key={loc}
                        className="bg-[#0c0e12] px-2.5 py-0.5 rounded-md border border-[#464553]/35 text-[#e2e2e8] font-medium flex items-center gap-1"
                      >
                        <MapPin className="w-3 h-3 text-[#918f9f]" /> {loc}
                      </span>
                    ))}
                  </div>

                  {/* Compensation Highlight */}
                  <div className="bg-[#0c0e12] border border-[#464553]/35 rounded-xl p-3.5 text-xs space-y-1">
                    <div className="text-[10px] text-[#918f9f] font-semibold uppercase tracking-wider">
                      Compensation Benchmark
                    </div>
                    <div className="text-[#e2e2e8] font-medium font-mono text-xs leading-snug">
                      {c.compensation_highlight}
                    </div>
                  </div>

                  {/* Verified Levels Table */}
                  {c.verified_levels && (
                    <div className="bg-[#0c0e12] rounded-xl border border-[#464553]/35 overflow-hidden text-xs">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="border-b border-[#464553]/30 text-[#918f9f] text-[10px] uppercase font-semibold tracking-wider bg-[#14161a]">
                            <th className="py-2 px-3">Role & Band</th>
                            <th className="py-2 px-3">Base</th>
                            <th className="py-2 px-3 text-right text-[#45dfa4]">Total CTC</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#464553]/20 text-[#e2e2e8]">
                          {c.verified_levels.map((lvl: any, idx: number) => (
                            <tr key={idx} className="hover:bg-[#1a1c20]/60 transition-colors">
                              <td className="py-2 px-3 font-medium text-[#e2e2e8] flex items-center justify-between gap-2">
                                <span>{lvl.role}</span>
                                <span className="text-[10px] text-[#918f9f] bg-[#1a1c20] px-1.5 py-0.5 rounded border border-[#464553]/35 font-mono shrink-0">
                                  {idx === 0 ? '0-2 YRS' : idx === 1 ? '2-4 YRS' : '4+ YRS'}
                                </span>
                              </td>
                              <td className="py-2 px-3 font-mono text-[#918f9f]">{lvl.base}</td>
                              <td className="py-2 px-3 font-mono font-semibold text-right text-[#45dfa4]">
                                {lvl.ctc}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Inline Score & Verdict Result */}
                  {scoreData && (
                    <div className="bg-[#0c0e12] p-4 rounded-xl border border-[#464553]/45 space-y-2.5 text-xs">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[#918f9f] font-semibold uppercase tracking-wider text-[10px]">
                            Your Fit:
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-md font-bold text-[10px] uppercase tracking-wider flex items-center gap-1 ${
                              scoreData.verdict === 'apply'
                                ? 'bg-[#45dfa4]/10 text-[#45dfa4] border border-[#45dfa4]/30'
                                : scoreData.verdict === 'stretch'
                                ? 'bg-[#ffb77e]/10 text-[#ffb77e] border border-[#ffb77e]/30'
                                : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                            }`}
                          >
                            {scoreData.verdict === 'apply' ? (
                              <>
                                <CheckCircle2 className="w-3 h-3" /> APPLY
                              </>
                            ) : scoreData.verdict === 'stretch' ? (
                              <>
                                <AlertCircle className="w-3 h-3" /> STRETCH
                              </>
                            ) : (
                              <>
                                <XCircle className="w-3 h-3" /> SKIP
                              </>
                            )}
                          </span>
                          <span className="text-[11px] text-[#918f9f] font-medium pl-2 border-l border-[#464553]/40">
                            {scoreData.experience_level}
                          </span>
                        </div>
                        <div className="text-right flex items-baseline gap-1">
                          <span
                            className={`font-bold font-mono text-lg ${
                              scoreData.match_score >= 80
                                ? 'text-[#45dfa4]'
                                : scoreData.match_score >= 50
                                ? 'text-[#ffb77e]'
                                : 'text-[#918f9f]'
                            }`}
                          >
                            {scoreData.match_score}%
                          </span>
                          <span className="text-[10px] text-[#918f9f] uppercase tracking-wider">Match</span>
                        </div>
                      </div>
                      {scoreData.reasoning && (
                        <p className="text-xs text-[#918f9f] leading-relaxed">{scoreData.reasoning}</p>
                      )}
                      <div className="flex items-center justify-between pt-2 text-[11px] border-t border-[#464553]/25">
                        <span className="text-[#918f9f]">
                          Evaluated role: <strong className="text-[#e2e2e8]">{scoreData.role_title}</strong>
                        </span>
                        {scoreData.job_id && (
                          <Link
                            href={`/jobs/${scoreData.job_id}`}
                            className="text-[#c3c0ff] hover:text-white font-semibold flex items-center gap-1"
                          >
                            Full Breakdown <ArrowUpRight className="w-3.5 h-3.5" />
                          </Link>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Card Action Buttons */}
                <div className="pt-4 border-t border-[#464553]/25 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <a
                    href={c.careers_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-[#5b5bd6] hover:bg-[#4f4fc7] text-white font-semibold px-4 py-2 rounded-lg text-xs transition-all flex items-center gap-1.5"
                  >
                    <span>Careers Portal</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </a>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => handleCheckFit(c)}
                      disabled={isScoring}
                      className="bg-[#0c0e12] hover:bg-[#282a2e] text-[#e2e2e8] border border-[#464553]/40 px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {isScoring ? (
                        <RefreshCcw className="w-3.5 h-3.5 animate-spin text-[#5b5bd6]" />
                      ) : (
                        <Activity className="w-3.5 h-3.5 text-[#5b5bd6]" />
                      )}
                      <span>{isScoring ? 'Scoring...' : scoreData ? 'Re-Score' : 'Score Fit'}</span>
                    </button>

                    <button
                      onClick={() => trackMutation.mutate(c)}
                      disabled={trackMutation.isPending}
                      className={`px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 border ${
                        isTracked
                          ? 'bg-[#45dfa4]/10 text-[#45dfa4] border-[#45dfa4]/30'
                          : 'bg-[#0c0e12] hover:bg-[#282a2e] text-[#e2e2e8] border-[#464553]/40'
                      }`}
                    >
                      <ListTodo className="w-3.5 h-3.5" />
                      <span>{isTracked ? 'Tracked' : 'Track'}</span>
                    </button>

                    <Link
                      href={`/?q=${encodeURIComponent(c.name)}`}
                      className="bg-[#0c0e12] hover:bg-[#282a2e] text-[#918f9f] hover:text-[#e2e2e8] border border-[#464553]/40 font-semibold px-3 py-1.5 rounded-lg transition-all flex items-center gap-1"
                    >
                      <Search className="w-3.5 h-3.5" />
                      <span>Feed</span>
                    </Link>

                    <button
                      onClick={() =>
                        router.push(`/jobs/new?tab=deep-dive&company=${encodeURIComponent(c.name)}`)
                      }
                      className="bg-[#5b5bd6]/12 hover:bg-[#5b5bd6]/20 text-[#c3c0ff] font-semibold px-3 py-1.5 border border-[#5b5bd6]/30 rounded-lg transition-colors flex items-center gap-1"
                    >
                      <span>Deep Dive</span>
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!isLoading && filteredCompanies.length === 0 && (
        <div className="text-center py-20 bg-[#1a1c20] rounded-xl border border-[#464553]/35 text-[#918f9f] space-y-2">
          <Building2 className="w-10 h-10 text-[#464553] mx-auto" />
          <p className="font-semibold text-[#e2e2e8] text-sm">No companies found matching your filters.</p>
          <p className="text-xs text-[#918f9f]">Try changing the location filter or clearing the search query.</p>
        </div>
      )}
    </div>
  )
}
