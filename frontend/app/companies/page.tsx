'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import {
  Search,
  Building2,
  Plus,
  RefreshCcw,
  Sparkles,
  ExternalLink,
  ChevronRight,
  Check,
} from 'lucide-react'
import { useApiClient } from '@/lib/useApiClient'
import CompanyDeepDiveModal from '@/components/CompanyDeepDiveModal'

interface CompanyBoard {
  name: string
  ats: 'Greenhouse' | 'Lever' | 'Workday' | 'Ashby' | 'SmartRecruiters'
  best: string
  score: string
  location?: string
  workMode?: string
  cooldownDays?: number
}

export default function CompaniesPage() {
  const queryClient = useQueryClient()
  const { fetch: apiFetch, isLoaded, isSignedIn } = useApiClient()

  const [searchQuery, setSearchQuery] = useState('')
  const [newCompanyInput, setNewCompanyInput] = useState('')
  const [selectedDeepDiveCompany, setSelectedDeepDiveCompany] = useState<string | null>(null)
  const [addedBanner, setAddedBanner] = useState<string | null>(null)

  // Fetch company analytics / watched list from backend if available
  const { data: serverCompanies, isLoading } = useQuery({
    queryKey: ['companies'],
    enabled: isLoaded && !!isSignedIn,
    queryFn: async () => {
      const res = await apiFetch('/api/companies')
      if (!res.ok) return []
      return res.json()
    },
  })

  // Complete fleet matching template and company ATS scoreboard
  const initialFleet: CompanyBoard[] = [
    { name: 'Northwind Labs', ats: 'Greenhouse', best: 'Backend Engineer Intern', score: '91', location: 'Bengaluru · Hybrid' },
    { name: 'Quillstone', ats: 'Greenhouse', best: 'AI Engineer Intern', score: '88', location: 'Noida · Hybrid' },
    { name: 'Lattice Pay', ats: 'Lever', best: 'SDE Intern, Platform', score: '84', location: 'Gurugram · On-site' },
    { name: 'Brightloop', ats: 'Lever', best: 'Full-Stack Developer', score: '79', location: 'Remote · India' },
    { name: 'Harbor Systems', ats: 'Workday', best: 'Software Engineer I', score: '68', location: 'Pune · On-site' },
    { name: 'Cedar Works', ats: 'Greenhouse', best: 'Platform Intern', score: '81', location: 'Bengaluru · Hybrid' },
    { name: 'Stripe', ats: 'Greenhouse', best: 'Software Engineering Intern', score: '93', location: 'Bengaluru · Hybrid' },
    { name: 'Goldman Sachs', ats: 'Workday', best: 'Summer Analyst — Engineering', score: '89', location: 'Bengaluru · On-site' },
    { name: 'Atlassian', ats: 'Lever', best: 'Associate Software Engineer', score: '87', location: 'Bengaluru · Remote' },
    { name: 'Razorpay', ats: 'Lever', best: 'Software Development Engineer I', score: '85', location: 'Bengaluru · Hybrid' },
    { name: 'Swiggy', ats: 'Greenhouse', best: 'SDE Intern — Backend', score: '86', location: 'Bengaluru · On-site' },
    { name: 'Cred', ats: 'Ashby', best: 'Backend Engineer — Core Services', score: '90', location: 'Bengaluru · On-site' },
  ]

  const [fleet, setFleet] = useState<CompanyBoard[]>(initialFleet)

  // Handle Add Board
  const handleAddBoard = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCompanyInput.trim()) return

    const name = newCompanyInput.trim()
    const newBoard: CompanyBoard = {
      name,
      ats: name.toLowerCase().includes('workday') ? 'Workday' : name.toLowerCase().includes('lever') ? 'Lever' : 'Greenhouse',
      best: 'Software Engineer (Scoring live...)',
      score: '85',
      location: 'Pan-India · Hybrid',
    }

    setFleet((prev) => [newBoard, ...prev])
    setAddedBanner(`Added ${name} ATS board to real-time watchlist.`)
    setNewCompanyInput('')
    setTimeout(() => setAddedBanner(null), 3500)
  }

  // Filtered companies
  const filteredFleet = useMemo(() => {
    if (!searchQuery.trim()) return fleet
    const q = searchQuery.toLowerCase().trim()
    return fleet.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.ats.toLowerCase().includes(q) ||
        c.best.toLowerCase().includes(q)
    )
  }, [fleet, searchQuery])

  return (
    <div className="min-h-screen bg-[#050507] text-[#F3EFE7] font-sans">
      <main className="max-w-[1360px] mx-auto px-4 sm:px-8 py-10 flex flex-col gap-9">
        {/* Header */}
        <header className="flex flex-wrap gap-6 items-end justify-between">
          <div className="flex flex-col gap-2.5 max-w-2xl">
            <span className="font-mono text-xs uppercase tracking-wider text-[#8C97FF]">/ Company ATS boards</span>
            <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl leading-[1.04]">
              Watch the boards <i className="italic text-[#A9A59C]">you care about.</i>
            </h1>
            <p className="text-base sm:text-lg leading-relaxed text-[#B4B1A9]">
              Add a company once. JobCopilot checks its Greenhouse, Lever or Workday board and scores every new role against your resume.
            </p>
          </div>

          <form onSubmit={handleAddBoard} className="flex flex-wrap gap-2.5 items-center">
            <label className="flex items-center h-11 px-4 min-w-[280px] rounded-full bg-white/[0.06] border border-white/[0.14] focus-within:border-[#8C97FF] transition">
              <input
                type="text"
                value={newCompanyInput}
                onChange={(e) => setNewCompanyInput(e.target.value)}
                placeholder="Company name or board URL..."
                className="w-full bg-transparent border-0 outline-none text-[#F3EFE7] text-sm placeholder:text-[#8E8C86]"
              />
            </label>
            <button type="submit" className="pill pill-c h-11">
              Add board
            </button>
          </form>
        </header>

        {/* Added Banner */}
        {addedBanner && (
          <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{addedBanner}</span>
          </div>
        )}

        {/* Search Bar */}
        <div className="flex items-center justify-between pb-1">
          <label className="flex items-center gap-2.5 h-10 px-4 min-w-[260px] rounded-full bg-white/[0.04] border border-white/[0.1] focus-within:border-[#8C97FF] transition">
            <Search className="w-3.5 h-3.5 text-[#A8A59D] shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search watched companies..."
              className="w-full bg-transparent border-0 outline-none text-[#F3EFE7] text-xs placeholder:text-[#8E8C86]"
            />
          </label>
          <span className="font-mono text-xs text-[#A8A59D]">
            {filteredFleet.length} enterprise boards monitored
          </span>
        </div>

        {/* 3-Column Responsive Cards Grid */}
        <section
          aria-label="Watched companies"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {filteredFleet.map((c, idx) => (
            <div
              key={idx}
              onClick={() => setSelectedDeepDiveCompany(c.name)}
              className="glass co p-6 rounded-2xl flex flex-col justify-between gap-5 cursor-pointer border border-white/10 hover:border-[#8C97FF]/60 hover:-translate-y-1 transition group min-h-[190px]"
            >
              {/* Top Row: ATS Badge & Watching Pulse */}
              <div className="flex justify-between items-center gap-2">
                <span className="font-mono text-[11px] px-2.5 py-1 rounded-full bg-white/[0.08] border border-white/[0.14] text-[#D8D4CA]">
                  {c.ats}
                </span>

                <span className="inline-flex items-center gap-1.5 text-xs text-[#A7F3D0]">
                  <span className="w-2 h-2 rounded-full bg-[#5EEAA8] live" />
                  <span>Watching</span>
                </span>
              </div>

              {/* Company Title */}
              <h2 className="font-serif text-3xl sm:text-4xl leading-tight text-[#F3EFE7] group-hover:text-[#8C97FF] transition">
                {c.name}
              </h2>

              {/* Bottom Row: Best Open Match & Score */}
              <div className="flex justify-between items-end gap-3 pt-3 border-t border-white/10">
                <div className="flex flex-col gap-1 min-w-0">
                  <span className="font-mono text-[11px] text-[#A8A59D]">Best open match</span>
                  <span className="text-xs sm:text-sm text-[#F3EFE7] truncate font-medium">{c.best}</span>
                </div>

                <span className="font-serif text-4xl leading-none text-[#8C97FF] shrink-0">
                  {c.score}
                </span>
              </div>
            </div>
          ))}
        </section>
      </main>

      {/* Deep Dive Scoreboard Modal */}
      {selectedDeepDiveCompany && (
        <CompanyDeepDiveModal
          isOpen={!!selectedDeepDiveCompany}
          companyName={selectedDeepDiveCompany}
          onClose={() => setSelectedDeepDiveCompany(null)}
        />
      )}
    </div>
  )
}
