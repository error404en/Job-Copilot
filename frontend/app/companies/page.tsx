'use client'
import { Search, Building2, MapPin, Briefcase, GraduationCap, CheckCircle2, AlertCircle, ArrowUpRight, Plus, Activity, RefreshCcw, Filter, ChevronDown, ListTodo, XCircle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'


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
  const [companyScores, setCompanyScores] = useState<Record<string, any>>({})
  const [loadingScores, setLoadingScores] = useState<Record<string, boolean>>({})

  const handleCheckFit = async (company: any, roleTitle?: string, seniority?: string) => {
    const key = `${company.id}_${roleTitle || 'default'}`
    setLoadingScores(prev => ({ ...prev, [key]: true }))
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
          experience_level: company.fresher_friendly ? '0-2 Yrs (Freshers Match)' : '2-5 Yrs'
        })
      })
      if (!res.ok) throw new Error('Failed to score role')
      const data = await res.json()
      setCompanyScores(prev => ({ ...prev, [key]: data }))
    } catch (err: any) {
      alert(err.message || 'Failed to score profile against role.')
    } finally {
      setLoadingScores(prev => ({ ...prev, [key]: false }))
    }
  }

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
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white shadow-[0_0_15px_rgba(99,102,241,0.3)] border border-indigo-400/20">
              <Building2 className="w-5 h-5" />
            </div>
            Target Companies
          </h1>
          <p className="text-zinc-400 text-sm max-w-2xl">
            Curated list of high-paying tech, banking, and product companies to apply to with place filters and verified CTC breakdowns.
          </p>
        </div>
        <Link
          href="/tracker"
          className="bg-zinc-900 border border-zinc-800/80 text-zinc-300 px-5 py-2.5 rounded-xl text-[13px] font-semibold hover:bg-zinc-800 hover:text-white transition-all flex items-center gap-2 shadow-sm shrink-0"
        >
          <ListTodo className="w-4 h-4 text-indigo-400" />
          Open Application Tracker
        </Link>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-zinc-900/50 p-5 rounded-2xl border border-zinc-800/80 backdrop-blur-xl space-y-5 shadow-sm">
        {/* Row 1: Search & Fresher Toggle */}
        <div className="flex flex-col md:flex-row gap-4 justify-between items-center">
          <div className="relative w-full md:w-[28rem] group">
            <Search className="absolute left-3.5 top-3 w-4 h-4 text-zinc-500 group-focus-within:text-indigo-400 transition-colors" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search companies, tech stack, roles..."
              className="w-full bg-zinc-950 border border-zinc-800 text-white pl-10 pr-8 py-2.5 rounded-xl text-[13px] placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all shadow-inner"
            />
          </div>

          <label className="flex items-center gap-3 text-[13px] text-zinc-300 cursor-pointer select-none bg-zinc-950 px-4 py-2.5 rounded-xl border border-zinc-800 hover:border-zinc-700 transition-colors">
            <div className="relative flex items-center">
              <input
                type="checkbox"
                checked={fresherOnly}
                onChange={(e) => setFresherOnly(e.target.checked)}
                className="peer sr-only"
              />
              <div className="w-5 h-5 bg-zinc-900 border border-zinc-700 rounded flex items-center justify-center peer-checked:bg-indigo-500 peer-checked:border-indigo-500 transition-all">
                {fresherOnly && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
              </div>
            </div>
            <span className="font-semibold flex items-center gap-1.5"><GraduationCap className="w-4 h-4 text-indigo-400" /> Freshers (0-2 Yrs) Only</span>
          </label>
        </div>

        {/* Row 2: Location Place Filter & Industry Filters */}
        <div className="flex flex-wrap items-center gap-4 pt-4 border-t border-zinc-800/60 text-[13px]">
          
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-zinc-500" />
            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium appearance-none pr-8 cursor-pointer relative"
              style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2716%27 height=%2716%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%2371717a%27 stroke-width=%272%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27%3E%3Cpolyline points=%276 9 12 15 18 9%27%3E%3C/polyline%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}
            >
              {LOCATION_OPTIONS.map((loc) => (
                <option key={loc.id} value={loc.id}>{loc.label.replace('📍 ', '')}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-zinc-500" />
            <select
              value={selectedIndustry}
              onChange={(e) => setSelectedIndustry(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium appearance-none pr-8 cursor-pointer"
              style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2716%27 height=%2716%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%2371717a%27 stroke-width=%272%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27%3E%3Cpolyline points=%276 9 12 15 18 9%27%3E%3C/polyline%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}
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
              className="text-[11px] text-indigo-400 hover:text-indigo-300 font-bold tracking-wide uppercase px-2 py-1 rounded bg-indigo-500/10 border border-indigo-500/20 transition-colors ml-auto"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Results Count & Location Badge */}
      <div className="flex items-center justify-between text-xs text-zinc-500 px-1 font-medium">
        <span>Showing <strong className="text-zinc-300">{filteredCompanies.length}</strong> target companies</span>
        {selectedLocation !== 'all' && (
          <span className="bg-indigo-500/10 text-indigo-400 px-2.5 py-0.5 rounded-full border border-indigo-500/20 font-bold">
            {LOCATION_OPTIONS.find(l => l.id === selectedLocation)?.label.replace('📍 ', '')}
          </span>
        )}
      </div>

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-32 space-y-4">
          <RefreshCcw className="w-8 h-8 text-indigo-500 animate-spin" />
          <div className="text-zinc-400 font-medium">Loading target companies...</div>
        </div>
      )}

      {/* Company Cards Grid */}
      {!isLoading && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <AnimatePresence>
            {filteredCompanies.map((c: any, i: number) => {
              const isTracked = trackedMap[c.id]
              return (
                <motion.div
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.05 }}
                  key={c.id}
                  className="bg-zinc-900/60 border border-zinc-800/80 hover:border-indigo-500/40 hover:-translate-y-1 hover:shadow-[0_8px_30px_rgb(0,0,0,0.4)] rounded-2xl p-6 space-y-5 backdrop-blur-sm transition-all duration-300 group flex flex-col justify-between"
                >
                  <div className="space-y-4">
                    {/* Card Header */}
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-xl font-bold text-white tracking-tight group-hover:text-indigo-300 transition-colors">
                            {c.name}
                          </h2>
                          <span className="text-[11px] bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded-md font-medium border border-zinc-700/50">
                            {c.industry}
                          </span>
                        </div>
                        <div className="text-xs text-indigo-400 font-semibold mt-1.5 flex items-center gap-1.5">
                          <Activity className="w-3.5 h-3.5" /> {c.badge}
                        </div>
                      </div>

                      {c.fresher_friendly && (
                        <span className="text-[10px] bg-green-500/10 text-green-400 border border-green-500/20 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shrink-0 flex items-center gap-1">
                          <GraduationCap className="w-3 h-3" /> Freshers OK
                        </span>
                      )}
                    </div>

                    {/* Description */}
                    <p className="text-[13px] text-zinc-400 leading-relaxed line-clamp-2">
                      {c.description}
                    </p>

                    {/* Locations */}
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
                      <span className="text-zinc-500 font-medium">Offices:</span>
                      {c.locations.map((loc: string) => (
                        <span key={loc} className="bg-zinc-950 px-2.5 py-0.5 rounded border border-zinc-800/80 text-zinc-300 font-medium flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-zinc-500" /> {loc}
                        </span>
                      ))}
                    </div>

                    {/* Compensation Highlight */}
                    <div className="bg-gradient-to-r from-indigo-950/40 to-violet-950/20 border border-indigo-800/30 rounded-xl p-3.5 text-xs space-y-1.5 shadow-sm">
                      <div className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                        Typical Compensation Benchmark
                      </div>
                      <div className="text-zinc-200 font-medium font-mono text-[11px] leading-snug">
                        {c.compensation_highlight}
                      </div>
                    </div>

                    {/* Verified Levels Table */}
                    {c.verified_levels && (
                      <div className="bg-zinc-950/80 rounded-xl border border-zinc-800/80 overflow-hidden text-[11px] shadow-sm">
                        <table className="w-full text-left">
                          <thead>
                            <tr className="border-b border-zinc-800/80 text-zinc-500 text-[10px] uppercase font-bold tracking-wider bg-zinc-900/40">
                              <th className="py-2 px-3">Role & Experience</th>
                              <th className="py-2 px-3">Base</th>
                              <th className="py-2 px-3 text-right text-indigo-400">Total CTC</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-800/50 text-zinc-300">
                            {c.verified_levels.map((lvl: any, i: number) => (
                              <tr key={i} className="hover:bg-zinc-900/40 transition-colors">
                                <td className="py-2 px-3 font-medium text-white flex items-center justify-between gap-2">
                                  <span>{lvl.role}</span>
                                  <span className="text-[9px] text-indigo-300 bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20 font-mono shrink-0 font-semibold tracking-wide">
                                    {i === 0 ? '0-2 YRS' : i === 1 ? '2-4 YRS' : '4+ YRS'}
                                  </span>
                                </td>
                                <td className="py-2 px-3 font-mono text-zinc-400">{lvl.base}</td>
                                <td className="py-2 px-3 font-mono font-bold text-right text-green-400">{lvl.ctc}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Inline Score & Verdict Result */}
                    {companyScores[`${c.id}_default`] && (
                      <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 space-y-3 text-xs animate-in fade-in slide-in-from-top-2 duration-300 shadow-sm">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span className="text-zinc-500 font-bold uppercase tracking-wider text-[10px]">Your Fit:</span>
                            <span className={`px-2.5 py-0.5 rounded font-black text-[10px] uppercase tracking-wider flex items-center gap-1 ${
                              companyScores[`${c.id}_default`].verdict === 'apply' 
                                ? 'bg-green-500/10 text-green-400 border border-green-500/30'
                                : companyScores[`${c.id}_default`].verdict === 'stretch'
                                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                                : 'bg-red-500/10 text-red-400 border border-red-500/30'
                            }`}>
                              {companyScores[`${c.id}_default`].verdict === 'apply' 
                                ? <><CheckCircle2 className="w-3 h-3"/> APPLY</> 
                                : companyScores[`${c.id}_default`].verdict === 'stretch' 
                                ? <><AlertCircle className="w-3 h-3"/> STRETCH</> 
                                : <><XCircle className="w-3 h-3"/> SKIP</>}
                            </span>
                            <span className="text-[11px] text-zinc-300 font-medium px-2 border-l border-zinc-800">
                              {companyScores[`${c.id}_default`].experience_level}
                            </span>
                          </div>
                          <div className="text-right flex items-end gap-1.5">
                            <span className={`font-black text-2xl leading-none ${
                              companyScores[`${c.id}_default`].match_score >= 80 
                                ? 'text-green-400' 
                                : companyScores[`${c.id}_default`].match_score >= 50 
                                ? 'text-amber-400' 
                                : 'text-zinc-500'
                            }`}>
                              {companyScores[`${c.id}_default`].match_score}
                            </span>
                            <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold pb-0.5">Match</span>
                          </div>
                        </div>
                        {companyScores[`${c.id}_default`].reasoning && (
                          <p className="text-[12px] text-zinc-400 line-clamp-2 leading-relaxed bg-zinc-900/50 p-2.5 rounded-lg border border-zinc-800/50">
                            {companyScores[`${c.id}_default`].reasoning}
                          </p>
                        )}
                        <div className="flex items-center justify-between pt-1.5 text-[11px] border-t border-zinc-900">
                          <span className="text-zinc-500 font-medium">Evaluated role: <strong className="text-zinc-300">{companyScores[`${c.id}_default`].role_title}</strong></span>
                          {companyScores[`${c.id}_default`].job_id && (
                            <Link 
                              href={`/jobs/${companyScores[`${c.id}_default`].job_id}`} 
                              className="text-indigo-400 hover:text-indigo-300 font-bold hover:underline flex items-center gap-1"
                            >
                              Full Breakdown <ArrowUpRight className="w-3.5 h-3.5" />
                            </Link>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Card Action Buttons */}
                  <div className="pt-5 border-t border-zinc-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
                    {/* Direct Apply Option */}
                    <a
                      href={c.careers_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-zinc-100 text-zinc-950 font-bold px-4 py-2 rounded-xl text-xs hover:bg-white hover:scale-105 transition-all flex items-center gap-1.5 shadow-[0_2px_10px_rgba(255,255,255,0.1)]"
                    >
                      <ArrowUpRight className="w-4 h-4" />
                      Apply Now
                    </a>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleCheckFit(c)}
                        disabled={loadingScores[`${c.id}_default`]}
                        className="bg-zinc-950 hover:bg-zinc-900 text-zinc-300 border border-zinc-800 hover:border-indigo-500/50 px-3.5 py-2 rounded-xl font-bold transition-all flex items-center gap-1.5 disabled:opacity-50"
                        title="Scores this company role against your resume and tells whether to apply or skip"
                      >
                        {loadingScores[`${c.id}_default`] ? <RefreshCcw className="w-4 h-4 animate-spin"/> : <Activity className="w-4 h-4 text-indigo-400"/>}
                        <span>
                          {loadingScores[`${c.id}_default`] 
                            ? 'Scoring...' 
                            : companyScores[`${c.id}_default`] 
                            ? 'Re-Score' 
                            : 'Score Fit'}
                        </span>
                      </button>

                      <button
                        onClick={() => trackMutation.mutate(c)}
                        disabled={trackMutation.isPending}
                        className={`px-3.5 py-2 rounded-xl font-bold transition-all flex items-center gap-1.5 ${
                          isTracked 
                            ? 'bg-green-500/10 text-green-400 border border-green-500/30'
                            : 'bg-zinc-800/80 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/50'
                        }`}
                      >
                        <ListTodo className="w-4 h-4" />
                        {isTracked ? 'In Tracker' : 'Track'}
                      </button>

                      <button
                        onClick={() => router.push(`/jobs/new?tab=deep-dive&company=${encodeURIComponent(c.name)}`)}
                        className="bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 font-bold px-3.5 py-2 border border-indigo-500/30 rounded-xl transition-colors shadow-sm flex items-center gap-1.5"
                      >
                        <Search className="w-4 h-4" /> Deep Dive
                      </button>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      )}

      {!isLoading && filteredCompanies.length === 0 && (
        <div className="text-center py-24 bg-zinc-900/30 rounded-2xl border border-zinc-800/50 text-zinc-400 space-y-3">
          <Building2 className="w-12 h-12 text-zinc-600 mx-auto" />
          <p className="font-bold text-zinc-300 text-lg">No companies found matching your filters.</p>
          <p className="text-sm text-zinc-500">Try changing the location filter or clearing the search query.</p>
        </div>
      )}
    </div>
  )
}
