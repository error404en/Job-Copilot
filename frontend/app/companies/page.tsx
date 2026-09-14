'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useApiClient } from '@/lib/useApiClient'

const LOCATION_OPTIONS = [
  { id: 'all', label: '📍 All Locations' },
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

  // Fetch target companies
  const { data: companies, isLoading } = useQuery({
    queryKey: ['target_companies', selectedLocation, selectedIndustry, fresherOnly],
    enabled: isLoaded && !!isSignedIn,
    queryFn: async () => {
      let url = '/api/companies?'
      const params = new URLSearchParams()
      if (selectedLocation !== 'all') params.append('location', selectedLocation)
      if (selectedIndustry !== 'all') params.append('industry', selectedIndustry)
      if (fresherOnly) params.append('fresher_only', 'true')
      
      const res = await apiFetch(url + params.toString())
      if (!res.ok) throw new Error('Failed to fetch companies')
      return res.json()
    }
  })

  // Track company mutation
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
          notes: `Target company from Curated Directory (${company.industry})`
        })
      })
      if (!res.ok) throw new Error('Failed to track')
      return res.json()
    },
    onSuccess: (_, variables) => {
      setTrackedMap(prev => ({ ...prev, [variables.id]: true }))
      queryClient.invalidateQueries({ queryKey: ['applications'] })
    }
  })

  // Filter by search query
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2 flex items-center gap-2">
            <span>🏢</span> Target Companies Directory
          </h1>
          <p className="text-zinc-400 text-sm">
            Curated list of high-paying tech, banking, and product companies to apply to with place filters and verified CTC breakdowns.
          </p>
        </div>
        <Link
          href="/tracker"
          className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-zinc-800 transition-colors flex items-center gap-2"
        >
          <span>📋</span> Open Application Tracker
        </Link>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-zinc-900/60 p-5 rounded-2xl border border-zinc-800/80 backdrop-blur-md space-y-4">
        {/* Row 1: Search & Fresher Toggle */}
        <div className="flex flex-col md:flex-row gap-3 justify-between items-center">
          <div className="relative w-full md:w-96">
            <span className="absolute left-3 top-2.5 text-zinc-500 text-sm">🔍</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search companies, tech stack, roles..."
              className="w-full bg-zinc-950 border border-zinc-800 text-white pl-9 pr-8 py-2 rounded-xl text-xs placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
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

          <label className="flex items-center gap-2.5 text-xs text-zinc-300 cursor-pointer select-none bg-zinc-950 px-3.5 py-2 rounded-xl border border-zinc-800 hover:border-zinc-700">
            <input
              type="checkbox"
              checked={fresherOnly}
              onChange={(e) => setFresherOnly(e.target.checked)}
              className="w-4 h-4 rounded bg-zinc-900 border-zinc-700 text-purple-600 focus:ring-0"
            />
            <span className="font-semibold text-purple-300">🎓 Freshers / 0-2 Yrs Friendly Only</span>
          </label>
        </div>

        {/* Row 2: Location Place Filter & Industry Filters */}
        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-zinc-800/60 text-xs">
          
          {/* Location Filter */}
          <div className="flex items-center gap-2">
            <span className="text-zinc-500 font-bold uppercase tracking-wider text-[10px]">Filter by Place:</span>
            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-purple-500 font-medium"
            >
              {LOCATION_OPTIONS.map((loc) => (
                <option key={loc.id} value={loc.id}>{loc.label}</option>
              ))}
            </select>
          </div>

          {/* Industry Filter */}
          <div className="flex items-center gap-2">
            <span className="text-zinc-500 font-bold uppercase tracking-wider text-[10px]">Industry:</span>
            <select
              value={selectedIndustry}
              onChange={(e) => setSelectedIndustry(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-purple-500 font-medium"
            >
              {INDUSTRY_OPTIONS.map((ind) => (
                <option key={ind.id} value={ind.id}>{ind.label}</option>
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
              }}
              className="text-xs text-purple-400 hover:text-purple-300 font-semibold underline ml-auto"
            >
              Reset all filters
            </button>
          )}
        </div>
      </div>

      {/* Results Count & Location Badge */}
      <div className="flex items-center justify-between text-xs text-zinc-500 px-1">
        <span>Showing {filteredCompanies.length} target companies</span>
        {selectedLocation !== 'all' && (
          <span className="bg-purple-500/10 text-purple-400 px-2.5 py-0.5 rounded-full border border-purple-500/20 font-medium">
            Place: {LOCATION_OPTIONS.find(l => l.id === selectedLocation)?.label}
          </span>
        )}
      </div>

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="p-16 text-center text-zinc-500 animate-pulse">Loading target companies...</div>
      )}

      {/* Company Cards Grid */}
      {!isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredCompanies.map((c: any) => {
            const isTracked = trackedMap[c.id]
            return (
              <div
                key={c.id}
                className="bg-zinc-900/40 border border-zinc-800 hover:border-zinc-700/80 rounded-2xl p-6 space-y-4 backdrop-blur-sm transition-all group flex flex-col justify-between"
              >
                <div className="space-y-3">
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-xl font-bold text-white tracking-tight group-hover:text-purple-300 transition-colors">
                          {c.name}
                        </h2>
                        <span className="text-xs bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded-md font-medium">
                          {c.industry}
                        </span>
                      </div>
                      <div className="text-xs text-purple-400 font-semibold mt-1">
                        {c.badge}
                      </div>
                    </div>

                    {c.fresher_friendly && (
                      <span className="text-[10px] bg-green-500/10 text-green-400 border border-green-500/20 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shrink-0">
                        Freshers OK
                      </span>
                    )}
                  </div>

                  {/* Description */}
                  <p className="text-xs text-zinc-400 leading-relaxed line-clamp-2">
                    {c.description}
                  </p>

                  {/* Locations */}
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-400">
                    <span className="text-zinc-500 font-semibold">Offices:</span>
                    {c.locations.map((loc: string) => (
                      <span key={loc} className="bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800 text-zinc-300">
                        📍 {loc}
                      </span>
                    ))}
                  </div>

                  {/* Compensation Highlight */}
                  <div className="bg-gradient-to-r from-purple-950/40 to-blue-950/20 border border-purple-800/30 rounded-xl p-3 text-xs space-y-1">
                    <div className="text-[10px] text-purple-400 font-bold uppercase tracking-wider">
                      💰 Typical Compensation Benchmark
                    </div>
                    <div className="text-zinc-200 font-medium font-mono text-[11px] leading-snug">
                      {c.compensation_highlight}
                    </div>
                  </div>

                  {/* Verified Levels Table */}
                  {c.verified_levels && (
                    <div className="bg-zinc-950/80 rounded-xl border border-zinc-800/80 overflow-hidden text-[11px]">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="border-b border-zinc-800/80 text-zinc-500 text-[10px] uppercase font-semibold">
                            <th className="py-1.5 px-3">Role</th>
                            <th className="py-1.5 px-3">Base</th>
                            <th className="py-1.5 px-3 text-right text-purple-400">Total CTC</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/50 text-zinc-300">
                          {c.verified_levels.map((lvl: any, i: number) => (
                            <tr key={i}>
                              <td className="py-1.5 px-3 font-medium text-white">{lvl.role}</td>
                              <td className="py-1.5 px-3 font-mono text-zinc-400">{lvl.base}</td>
                              <td className="py-1.5 px-3 font-mono font-bold text-right text-green-400">{lvl.ctc}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Card Action Buttons */}
                <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between gap-2 text-xs">
                  <a
                    href={c.careers_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-zinc-300 hover:text-white font-semibold flex items-center gap-1 hover:underline"
                  >
                    Official Portal ↗
                  </a>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => trackMutation.mutate(c)}
                      disabled={trackMutation.isPending}
                      className={`px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1 ${
                        isTracked 
                          ? 'bg-green-600/20 text-green-400 border border-green-500/30'
                          : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
                      }`}
                    >
                      {isTracked ? '✓ In Tracker' : '+ Track'}
                    </button>

                    <button
                      onClick={() => router.push(`/jobs/new?tab=deep-dive&company=${encodeURIComponent(c.name)}`)}
                      className="bg-purple-600 hover:bg-purple-500 text-white font-semibold px-3.5 py-1.5 rounded-lg transition-colors shadow-sm flex items-center gap-1"
                    >
                      <span>🔍</span> Deep Dive
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!isLoading && filteredCompanies.length === 0 && (
        <div className="text-center py-20 bg-zinc-900/40 rounded-2xl border border-zinc-800 text-zinc-400 space-y-2">
          <span className="text-4xl block">🏢</span>
          <p className="font-semibold text-zinc-300">No companies found matching your filters.</p>
          <p className="text-xs text-zinc-500">Try changing the location filter or clearing the search query.</p>
        </div>
      )}
    </div>
  )
}
