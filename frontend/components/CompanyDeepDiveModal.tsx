'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useApiClient } from '@/lib/useApiClient'
import {
  X,
  Building2,
  ExternalLink,
  Layers,
  Code2,
  HelpCircle,
  ShieldCheck,
  Briefcase,
  Star,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  TrendingUp,
  MapPin,
  Clock,
  Coins,
  ChevronRight,
  ListTodo
} from 'lucide-react'
import Link from 'next/link'

interface CompanyDeepDiveModalProps {
  companyName: string | null
  isOpen: boolean
  onClose: () => void
  onTrackCompany?: (company: any) => void
}

export default function CompanyDeepDiveModal({
  companyName,
  isOpen,
  onClose,
  onTrackCompany
}: CompanyDeepDiveModalProps) {
  const [activeTab, setActiveTab] = useState<'comp' | 'tech' | 'interview' | 'culture'>('comp')
  const { fetch: apiFetch, isLoaded, isSignedIn } = useApiClient()

  const { data, isLoading, error } = useQuery({
    queryKey: ['company-deep-dive', companyName],
    enabled: isOpen && !!companyName && isLoaded && !!isSignedIn,
    staleTime: 1000 * 60 * 30, // 30 min cache
    queryFn: async () => {
      if (!companyName) return null
      const res = await apiFetch('/api/research/company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_name: companyName })
      })
      if (!res.ok) throw new Error('Failed to fetch company intelligence')
      return res.json()
    }
  })

  if (!isOpen || !companyName) return null

  const info = data?.company_info || {}
  const careersUrl = data?.careers_url
  const discoveredJobs = data?.jobs || []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-in fade-in duration-150 font-sans">
      <div className="bg-[#121418] border border-[#464553]/45 rounded-2xl max-w-3xl w-full max-h-[92vh] overflow-hidden shadow-2xl flex flex-col relative text-[#e2e2e8]">
        
        {/* Modal Top Header */}
        <div className="p-5 sm:p-6 border-b border-[#464553]/35 bg-[#1a1c20]/90 flex items-start justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#5b5bd6]/15 text-[#c3c0ff] border border-[#5b5bd6]/30 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-[#5b5bd6]" />
                Executive Company Intelligence
              </span>
              {info.rating && (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-400/10 text-amber-300 border border-amber-400/25 flex items-center gap-1">
                  <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                  {info.rating}
                </span>
              )}
              {info.overall_sentiment && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/25">
                  {info.overall_sentiment}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <h2 className="text-xl sm:text-2xl font-black text-[#fafafa] font-heading tracking-tight">
                {info.company_name || companyName}
              </h2>
              <span className="text-xs text-[#918f9f] font-medium hidden sm:inline-block">
                • {info.industry || 'Technology'}
              </span>
            </div>

            <div className="flex items-center gap-3 text-xs text-[#918f9f] flex-wrap">
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-[#5b5bd6]" />
                {info.headquarters || 'Bengaluru, India'}
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-[#45dfa4]" />
                {info.work_life_balance?.slice(0, 35) || 'Hybrid 2-3 Days'}
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-[#0c0e12] hover:bg-[#282a2e] text-[#918f9f] hover:text-[#e2e2e8] border border-[#464553]/35 transition-colors shrink-0 cursor-pointer"
            title="Close deep dive"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Quick Highlights Metric Ribbon */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 bg-[#0c0e12]/80 border-b border-[#464553]/35 text-xs">
          <div className="p-2.5 rounded-xl bg-[#1a1c20]/60 border border-[#464553]/25">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#918f9f] block">Starting CTC</span>
            <span className="font-bold text-[#45dfa4] text-xs sm:text-sm font-mono truncate block">
              {info.compensation_levels?.[0]?.total_comp || '₹12L - ₹20L'}
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-[#1a1c20]/60 border border-[#464553]/25">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#918f9f] block">Fresher Friendly</span>
            <span className="font-bold text-[#c3c0ff] text-xs sm:text-sm truncate block flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#45dfa4]" />
              {info.fresher_friendliness?.is_friendly !== false ? 'Yes (0-2 Yrs)' : 'Lateral Only'}
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-[#1a1c20]/60 border border-[#464553]/25">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#918f9f] block">Interview Bar</span>
            <span className="font-bold text-amber-300 text-xs sm:text-sm truncate block">
              {info.interview_process?.difficulty || 'Medium-Hard'}
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-[#1a1c20]/60 border border-[#464553]/25">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#918f9f] block">Service Bond</span>
            <span className="font-bold text-emerald-300 text-xs sm:text-sm truncate block flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              {info.bonds_or_contracts?.toLowerCase().includes('no bond') ? 'No Bond' : 'Standard'}
            </span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="px-5 border-b border-[#464553]/35 flex items-center gap-2 bg-[#121418] overflow-x-auto no-scrollbar">
          {[
            { id: 'comp', label: 'Compensation & Levels', icon: Coins },
            { id: 'tech', label: 'Tech Stack & Engineering', icon: Code2 },
            { id: 'interview', label: 'Interview Process & Loops', icon: HelpCircle },
            { id: 'culture', label: 'Culture & Benefits', icon: Layers },
          ].map((t) => {
            const Icon = t.icon
            const isActive = activeTab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id as any)}
                className={`py-3 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                  isActive
                    ? 'border-[#5b5bd6] text-[#c3c0ff] bg-[#5b5bd6]/8'
                    : 'border-transparent text-[#918f9f] hover:text-[#e2e2e8]'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-[#5b5bd6]' : 'text-[#918f9f]'}`} />
                <span>{t.label}</span>
              </button>
            )
          })}
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1 min-h-[300px]">
          {isLoading && (
            <div className="space-y-4 py-12 text-center">
              <div className="w-10 h-10 border-2 border-[#5b5bd6] border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-sm font-semibold text-[#e2e2e8]">Synthesizing technical intelligence for {companyName}...</p>
              <p className="text-xs text-[#918f9f]">Retrieving compensation ladders, interview loops, and engineering stacks.</p>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs">
              Failed to load real-time intelligence for {companyName}. Showing standard industry profile.
            </div>
          )}

          {!isLoading && (
            <>
              {/* Company Application Cooldown & Capping Policy Warning */}
              {data?.cooldown_policy?.has_policy && (
                <div
                  className={`p-4 rounded-xl border flex items-start gap-3 ${
                    data.cooldown_policy.is_in_cooldown
                      ? 'bg-amber-500/12 border-amber-500/40 text-amber-200'
                      : 'bg-indigo-500/12 border-indigo-500/35 text-indigo-200'
                  }`}
                >
                  <Clock
                    className={`w-5 h-5 shrink-0 mt-0.5 ${
                      data.cooldown_policy.is_in_cooldown ? 'text-amber-400' : 'text-indigo-400'
                    }`}
                  />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-xs uppercase tracking-wider text-[#e2e2e8]">
                        {data.cooldown_policy.policy.cooldown_days}-Day Application Cooldown Policy
                      </span>
                      {data.cooldown_policy.is_in_cooldown ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/25 border border-amber-500/45 text-amber-300 animate-pulse">
                          Active Cooldown ({data.cooldown_policy.days_remaining}d Remaining)
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[#45dfa4]/15 border border-[#45dfa4]/30 text-[#45dfa4]">
                          Eligible to Apply
                        </span>
                      )}
                    </div>
                    <p className="text-xs leading-relaxed text-[#e2e2e8]">
                      {data.cooldown_policy.message}
                    </p>
                    <p className="text-[11px] text-[#918f9f] italic">
                      💡 Strategy: {data.cooldown_policy.policy.recommendation}
                    </p>
                  </div>
                </div>
              )}

              {/* TAB 1: COMPENSATION LADDERS */}
              {activeTab === 'comp' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-[#1a1c20]/60 border border-[#464553]/35">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#918f9f] block mb-1">
                      Compensation Baseline Overview
                    </span>
                    <p className="text-sm text-[#e2e2e8] font-medium leading-relaxed">
                      {info.compensation_estimates || 'Market-competitive compensation with performance incentives and equity packages.'}
                    </p>
                  </div>

                  {info.compensation_levels && info.compensation_levels.length > 0 ? (
                    <div className="border border-[#464553]/35 rounded-xl overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-[#1a1c20] text-[#918f9f] uppercase text-[10px] font-bold border-b border-[#464553]/35">
                          <tr>
                            <th className="p-3">Level / Designation</th>
                            <th className="p-3">Base Pay</th>
                            <th className="p-3">Bonus</th>
                            <th className="p-3">Stock / RSUs</th>
                            <th className="p-3 text-right">Total CTC</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#464553]/25 font-mono">
                          {info.compensation_levels.map((lvl: any, i: number) => (
                            <tr key={i} className="hover:bg-[#1a1c20]/50 transition-colors">
                              <td className="p-3 font-sans font-bold text-[#e2e2e8]">{lvl.level_name}</td>
                              <td className="p-3 text-zinc-300">{lvl.base_pay || 'N/A'}</td>
                              <td className="p-3 text-zinc-400">{lvl.bonus || 'N/A'}</td>
                              <td className="p-3 text-zinc-400">{lvl.stock || 'N/A'}</td>
                              <td className="p-3 text-right font-bold text-[#45dfa4]">{lvl.total_comp}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-xs text-[#918f9f]">No granular level breakdown available for this employer.</p>
                  )}
                </div>
              )}

              {/* TAB 2: TECH STACK & ARCHITECTURE */}
              {activeTab === 'tech' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-[#1a1c20]/60 border border-[#464553]/35 space-y-2.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#918f9f] block">
                      Core Technology Stack & Languages
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {(info.tech_stack || ['Python', 'Java', 'Next.js', 'PostgreSQL', 'Docker', 'AWS']).map((tech: string, i: number) => (
                        <span
                          key={i}
                          className="px-3 py-1.5 rounded-lg bg-[#5b5bd6]/15 border border-[#5b5bd6]/30 text-[#c3c0ff] text-xs font-semibold flex items-center gap-1.5"
                        >
                          <Code2 className="w-3.5 h-3.5 text-[#5b5bd6]" />
                          {tech}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-[#1a1c20]/60 border border-[#464553]/35 space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#918f9f] block">
                      Engineering Culture & Methodology
                    </span>
                    <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                      {info.work_culture || 'Engineering-led culture with strong emphasis on scalable distributed systems, automated testing, and continuous delivery.'}
                    </p>
                  </div>
                </div>
              )}

              {/* TAB 3: INTERVIEW PROCESS & PREPARATION */}
              {activeTab === 'interview' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-[#1a1c20]/60 border border-[#464553]/35 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#918f9f]">
                        Interview Loops & Structure
                      </span>
                      <span className="text-xs font-bold text-amber-300 px-2 py-0.5 rounded bg-amber-400/10 border border-amber-400/25">
                        Difficulty: {info.interview_process?.difficulty || 'Medium-Hard'}
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-[#e2e2e8] font-medium leading-relaxed">
                      {info.interview_process?.rounds || '3-4 Rounds: Coding Assessment -> Technical Architecture -> System Design -> Leadership/Values'}
                    </p>
                  </div>

                  {info.interview_process?.topics && info.interview_process.topics.length > 0 && (
                    <div className="p-4 rounded-xl bg-[#1a1c20]/60 border border-[#464553]/35 space-y-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#918f9f] block">
                        High-Yield Topics Tested
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {info.interview_process.topics.map((t: string, i: number) => (
                          <span key={i} className="px-2.5 py-1 rounded bg-[#0c0e12] border border-[#464553]/35 text-xs text-zinc-300 font-medium">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {info.interview_process?.tips && (
                    <div className="p-4 rounded-xl bg-[#5b5bd6]/10 border border-[#5b5bd6]/30 space-y-1.5">
                      <span className="text-xs font-bold text-[#c3c0ff] flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-[#5b5bd6]" />
                        Strategic Preparation Tip
                      </span>
                      <p className="text-xs text-zinc-300 leading-relaxed">
                        {info.interview_process.tips}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: CULTURE & BENEFITS */}
              {activeTab === 'culture' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 space-y-2">
                      <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Top Advantages
                      </span>
                      <ul className="text-xs text-zinc-300 space-y-1.5 list-disc list-inside">
                        {(info.pros || [
                          'Strong compensation and career trajectory',
                          'High-caliber engineering peer group',
                          'Modern technology stack and tools'
                        ]).map((pro: string, i: number) => (
                          <li key={i}>{pro}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 space-y-2">
                      <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Watchouts & Considerations
                      </span>
                      <ul className="text-xs text-zinc-300 space-y-1.5 list-disc list-inside">
                        {(info.cons || [
                          'Project release sprint pressures',
                          'Office presence requirements on scheduled days'
                        ]).map((con: string, i: number) => (
                          <li key={i}>{con}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-[#1a1c20]/60 border border-[#464553]/35 space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#918f9f] block">
                      Perks & Benefits
                    </span>
                    <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                      {info.perks || 'Comprehensive family health insurance, meal allowances, annual bonus, and learning/certification budgets.'}
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 bg-[#1a1c20] border-t border-[#464553]/35 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <Link
              href={`/?q=${encodeURIComponent(companyName)}`}
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl bg-[#0c0e12] hover:bg-[#282a2e] text-[#e2e2e8] border border-[#464553]/40 font-semibold transition-all flex items-center gap-1.5"
            >
              <Briefcase className="w-3.5 h-3.5 text-[#5b5bd6]" />
              <span>View Requisitions in Feed</span>
            </Link>

            {onTrackCompany && (
              <button
                type="button"
                onClick={() => {
                  onTrackCompany({ name: companyName, industry: info.industry || 'Technology' })
                }}
                className="px-3.5 py-2 rounded-xl bg-[#0c0e12] hover:bg-[#282a2e] text-[#e2e2e8] border border-[#464553]/40 font-semibold transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <ListTodo className="w-3.5 h-3.5 text-[#45dfa4]" />
                <span>Track Target Employer</span>
              </button>
            )}
          </div>

          {careersUrl ? (
            <a
              href={careersUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#5b5bd6] to-[#45dfa4] text-white font-bold transition-all flex items-center gap-1.5 shadow-md hover:brightness-110 ml-auto"
            >
              <span>Official Careers Portal</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          ) : (
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-[#282a2e] text-[#e2e2e8] font-semibold hover:bg-[#32353a] transition-all ml-auto"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
