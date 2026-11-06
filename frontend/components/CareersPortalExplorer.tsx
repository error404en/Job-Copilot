'use client'

import { useState } from 'react'
import {
  ExternalLink,
  ChevronDown,
  Sparkles,
  Search,
  GraduationCap,
  Briefcase,
  Award,
  Globe2,
  RotateCcw,
  Check,
  Building2,
  ArrowUpRight,
} from 'lucide-react'
import { useApiClient } from '@/lib/useApiClient'
import { useQueryClient } from '@tanstack/react-query'

interface CareersPortalExplorerProps {
  job: any
  compact?: boolean
  className?: string
}

export default function CareersPortalExplorer({
  job,
  compact = false,
  className = '',
}: CareersPortalExplorerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isResolving, setIsResolving] = useState(false)
  const [resolvedNotice, setResolvedNotice] = useState<string | null>(null)
  const { fetch: apiFetch } = useApiClient()
  const queryClient = useQueryClient()

  const isDirect = job.is_direct_apply ?? false
  const effectiveUrl = job.effective_apply_url || job.official_apply_url || job.url || ''
  const portalFilters = job.portal_filters || {}
  const portalSearchUrl = job.portal_search_url || portalFilters.exact_role || effectiveUrl
  const primaryHref = isDirect ? (effectiveUrl || job.official_apply_url || job.url) : (portalSearchUrl || effectiveUrl)

  const handleResolveDirectUrl = async () => {
    setIsResolving(true)
    setResolvedNotice(null)
    try {
      const res = await apiFetch(`/api/jobs/${job.id}/resolve-direct-url`, {
        method: 'POST',
      })
      if (res.ok) {
        const data = await res.json()
        queryClient.invalidateQueries({ queryKey: ['jobs'] })
        queryClient.invalidateQueries({ queryKey: ['job', job.id] })
        if (data.is_direct && data.resolved_url) {
          setResolvedNotice(`Direct requisition verified!`)
        } else {
          setResolvedNotice(`Targeted search ready on company portal.`)
        }
      }
    } catch (e: any) {
      setResolvedNotice('Search portal prepared.')
    } finally {
      setIsResolving(false)
    }
  }

  return (
    <div className={`relative inline-flex items-center ${className}`}>
      {/* Primary Apply Button */}
      {primaryHref && (
        <a
          href={primaryHref}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={`inline-flex items-center gap-1.5 font-semibold transition-all rounded-l-lg ${
            compact ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-xs'
          } ${
            isDirect
              ? 'bg-[#5b5bd6] hover:bg-[#4f4fc7] text-white shadow-sm'
              : 'bg-indigo-600/25 hover:bg-indigo-600/40 text-indigo-200 border border-indigo-500/40'
          }`}
          title={
            isDirect
              ? 'Open verified direct job requisition listing'
              : 'Search company portal or Google Jobs for exact requisition'
          }
        >
          {isDirect ? (
            <>
              <span>Apply</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </>
          ) : (
            <>
              <Search className="w-3.5 h-3.5 text-indigo-300" />
              <span>Find Requisition</span>
            </>
          )}
        </a>
      )}

      {/* Explorer Dropdown Trigger */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setIsOpen(!isOpen)
        }}
        className={`border-l border-white/20 inline-flex items-center justify-center transition-all rounded-r-lg ${
          compact ? 'px-1.5 py-1 text-xs' : 'px-2 py-1.5 text-xs'
        } ${
          isDirect
            ? 'bg-[#5b5bd6] hover:bg-[#4f4fc7] text-white'
            : 'bg-indigo-600/25 hover:bg-indigo-600/40 text-indigo-200 border-t border-r border-b border-indigo-500/40'
        }`}
        title="Careers Portal Explorer: Search site, filter by experience & locate direct requisition"
      >
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Menu Flyout */}
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={(e) => {
              e.stopPropagation()
              setIsOpen(false)
            }}
          />
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute right-0 top-full mt-1.5 w-72 bg-[#14161a] border border-[#464553]/55 rounded-xl shadow-2xl p-2 z-50 text-xs space-y-1 backdrop-blur-md animate-in fade-in zoom-in-95 duration-100"
          >
            {/* Header info */}
            <div className="px-2.5 py-1.5 border-b border-[#464553]/35 flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[#918f9f] flex items-center gap-1">
                <Building2 className="w-3 h-3 text-[#5b5bd6]" /> {job.company} Portal
              </span>
              <span
                className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                  isDirect
                    ? 'bg-[#45dfa4]/15 text-[#45dfa4] border border-[#45dfa4]/30'
                    : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                }`}
              >
                {isDirect ? 'Direct Link' : 'Portal Search'}
              </span>
            </div>

            {resolvedNotice && (
              <div className="px-2.5 py-1 text-[11px] bg-[#45dfa4]/10 text-[#45dfa4] rounded-lg border border-[#45dfa4]/30 flex items-center gap-1.5">
                <Check className="w-3 h-3 shrink-0" />
                <span>{resolvedNotice}</span>
              </div>
            )}

            {/* Direct Requisition Listing */}
            {isDirect && (
              <a
                href={effectiveUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setIsOpen(false)}
                className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-[#282a2e] text-[#e2e2e8] flex items-center justify-between transition-colors group cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-[#45dfa4]" />
                  <span className="font-semibold">Direct Requisition Listing</span>
                </div>
                <ExternalLink className="w-3 h-3 text-[#918f9f] group-hover:text-white" />
              </a>
            )}

            {/* Search entire careers portal pre-filled */}
            {portalSearchUrl && (
              <a
                href={portalSearchUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setIsOpen(false)}
                className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-[#282a2e] text-[#e2e2e8] flex items-center justify-between transition-colors group cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Search className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="font-semibold">Search Portal: {job.role_title?.slice(0, 20)}</span>
                </div>
                <ExternalLink className="w-3 h-3 text-[#918f9f] group-hover:text-white" />
              </a>
            )}

            {/* Google Jobs 1-Click Direct Requisition Search */}
            {portalFilters.google_direct && (
              <a
                href={portalFilters.google_direct}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setIsOpen(false)}
                className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-[#282a2e] text-[#e2e2e8] flex items-center justify-between transition-colors group cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="font-semibold">Google Jobs 1-Click Requisition</span>
                </div>
                <ExternalLink className="w-3 h-3 text-[#918f9f] group-hover:text-white" />
              </a>
            )}

            {/* Experience Level Filters */}
            <div className="pt-1 border-t border-[#464553]/35">
              <span className="px-2.5 text-[10px] uppercase font-bold text-[#918f9f] block mb-1">
                Filter by Experience Level
              </span>

              {portalFilters.fresher_intern && (
                <a
                  href={portalFilters.fresher_intern}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setIsOpen(false)}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-[#282a2e] text-[#918f9f] hover:text-[#e2e2e8] flex items-center justify-between transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <GraduationCap className="w-3.5 h-3.5 text-[#5b5bd6]" />
                    <span>Fresher / Intern / 0-2 Yrs</span>
                  </div>
                  <ExternalLink className="w-3 h-3 opacity-60" />
                </a>
              )}

              {portalFilters.mid_level && (
                <a
                  href={portalFilters.mid_level}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setIsOpen(false)}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-[#282a2e] text-[#918f9f] hover:text-[#e2e2e8] flex items-center justify-between transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Briefcase className="w-3.5 h-3.5 text-[#ffb77e]" />
                    <span>Mid-Level (2–5 Yrs)</span>
                  </div>
                  <ExternalLink className="w-3 h-3 opacity-60" />
                </a>
              )}

              {portalFilters.senior_lead && (
                <a
                  href={portalFilters.senior_lead}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setIsOpen(false)}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-[#282a2e] text-[#918f9f] hover:text-[#e2e2e8] flex items-center justify-between transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Award className="w-3.5 h-3.5 text-[#45dfa4]" />
                    <span>Senior / Lead (5+ Yrs)</span>
                  </div>
                  <ExternalLink className="w-3 h-3 opacity-60" />
                </a>
              )}

              {portalFilters.remote && (
                <a
                  href={portalFilters.remote}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setIsOpen(false)}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-[#282a2e] text-[#918f9f] hover:text-[#e2e2e8] flex items-center justify-between transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Globe2 className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Remote / WFH Openings</span>
                  </div>
                  <ExternalLink className="w-3 h-3 opacity-60" />
                </a>
              )}
            </div>

            {/* Re-resolve Live Link Action */}
            <div className="pt-1 border-t border-[#464553]/35">
              <button
                type="button"
                onClick={handleResolveDirectUrl}
                disabled={isResolving}
                className="w-full text-left px-2.5 py-2 rounded-lg bg-[#282a2e]/60 hover:bg-[#282a2e] text-[#c3c0ff] flex items-center justify-between transition-all cursor-pointer disabled:opacity-50"
              >
                <div className="flex items-center gap-2">
                  <RotateCcw className={`w-3.5 h-3.5 text-[#5b5bd6] ${isResolving ? 'animate-spin' : ''}`} />
                  <span className="font-semibold">
                    {isResolving ? 'Scanning Careers Site...' : 'Auto-Locate Exact Requisition'}
                  </span>
                </div>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
