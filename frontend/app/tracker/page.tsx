'use client'

import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import {
  Search,
  Plus,
  ExternalLink,
  Trash2,
  Check,
  RefreshCcw,
  Sparkles,
  Calendar,
  X,
  ArrowRight,
  Briefcase,
} from 'lucide-react'
import { useApiClient } from '@/lib/useApiClient'

interface ApplicationItem {
  id: string
  company: string
  role_title: string
  status: 'saved' | 'applied' | 'interview' | 'offer' | 'rejected'
  location?: string
  salary?: string
  url?: string
  notes?: string
  created_at?: string
  updated_at?: string
  match_score?: number
  jobs?: any
}

export default function TrackerPage() {
  const queryClient = useQueryClient()
  const { fetch: apiFetch, isLoaded, isSignedIn } = useApiClient()

  const [searchQuery, setSearchQuery] = useState('')
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [newCompany, setNewCompany] = useState('')
  const [newRole, setNewRole] = useState('')
  const [newLocation, setNewLocation] = useState('Bengaluru · Hybrid')
  const [newSalary, setNewSalary] = useState('₹6.0L+ Base Floor')
  const [newUrl, setNewUrl] = useState('')
  const [newStatus, setNewStatus] = useState<'saved' | 'applied' | 'interview' | 'offer'>('applied')
  const [newNotes, setNewNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Fetch applications
  const { data: applications, isLoading, refetch } = useQuery({
    queryKey: ['applications'],
    enabled: isLoaded && !!isSignedIn,
    queryFn: async () => {
      const res = await apiFetch('/api/applications')
      if (!res.ok) throw new Error('Failed to fetch applications')
      return res.json()
    },
  })

  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await apiFetch(`/api/applications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error('Failed to update status')
      return res.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['applications'] }),
  })

  // Delete application mutation
  const deleteAppMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/api/applications/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete application')
      return res.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['applications'] }),
  })

  // Create application
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCompany.trim() || !newRole.trim()) return
    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      const res = await apiFetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: newCompany.trim(),
          role_title: newRole.trim(),
          location: newLocation.trim() || 'Pan-India',
          salary: newSalary.trim(),
          url: newUrl.trim(),
          status: newStatus,
          notes: newNotes.trim() || 'Tracked via JobCopilot',
        }),
      })
      if (!res.ok) throw new Error('Failed to record application')
      setIsAddModalOpen(false)
      setNewCompany('')
      setNewRole('')
      setNewUrl('')
      setNewNotes('')
      queryClient.invalidateQueries({ queryKey: ['applications'] })
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to add application')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Pre-seed mock / live applications into 4 Kanban stages
  const allApps: ApplicationItem[] = useMemo(() => {
    if (applications && Array.isArray(applications) && applications.length > 0) {
      return applications.map((a: any) => ({
        id: a.id,
        company: a.company || a.jobs?.company || 'Company',
        role_title: a.role_title || a.jobs?.role_title || 'Software Engineer',
        status: (['saved', 'applied', 'interview', 'offer'].includes(a.status)
          ? a.status
          : 'applied') as any,
        location: a.location || a.jobs?.location || 'Bengaluru · Hybrid',
        salary: a.salary || '₹6.0L+ Base Floor',
        url: a.url || a.jobs?.job_link || '',
        notes: a.notes || 'Recently active',
        match_score: a.jobs?.match_score || 88,
      }))
    }

    // Default seeded boards matching template design
    return [
      { id: 'app-1', status: 'saved', role_title: 'SDE Intern, Platform', company: 'Lattice Pay', notes: 'Saved today', match_score: 84 },
      { id: 'app-2', status: 'saved', role_title: 'Full-Stack Developer', company: 'Brightloop', notes: 'Saved yesterday', match_score: 79 },
      { id: 'app-3', status: 'saved', role_title: 'Software Engineer I', company: 'Harbor Systems', notes: 'Saved 2 days ago', match_score: 68 },
      { id: 'app-4', status: 'applied', role_title: 'Backend Engineer Intern', company: 'Northwind Labs', notes: 'Applied 2 days ago', match_score: 91 },
      { id: 'app-5', status: 'applied', role_title: 'AI Engineer Intern', company: 'Quillstone', notes: 'Applied 3 days ago', match_score: 88 },
      { id: 'app-6', status: 'applied', role_title: 'Platform Intern', company: 'Cedar Works', notes: 'Applied 5 days ago', match_score: 81 },
      { id: 'app-7', status: 'interview', role_title: 'Backend Developer Intern', company: 'Tidewater Data', notes: 'Technical round Monday', match_score: 86 },
    ]
  }, [applications])

  // Filtered by search query
  const filteredApps = useMemo(() => {
    if (!searchQuery.trim()) return allApps
    const q = searchQuery.toLowerCase().trim()
    return allApps.filter(
      (a) =>
        a.company.toLowerCase().includes(q) ||
        a.role_title.toLowerCase().includes(q) ||
        (a.notes && a.notes.toLowerCase().includes(q))
    )
  }, [allApps, searchQuery])

  // 4 Columns definition
  const columns = [
    {
      id: 'saved',
      name: 'Saved',
      nextStatus: 'applied',
      nextLabel: 'Mark applied →',
      emptyText: 'Nothing saved. Star roles from the Jobs Feed to queue them.',
    },
    {
      id: 'applied',
      name: 'Applied',
      nextStatus: 'interview',
      nextLabel: 'Move to interview →',
      emptyText: 'Nothing applied yet. Use 1-Click Auto-Fill to apply to roles.',
    },
    {
      id: 'interview',
      name: 'Interviewing',
      nextStatus: 'offer',
      nextLabel: 'Mark offer →',
      emptyText: 'No interviews yet. Keep applications flowing.',
    },
    {
      id: 'offer',
      name: 'Offer',
      nextStatus: null,
      nextLabel: '',
      emptyText: 'Offers land here.',
    },
  ]

  const handleAdvance = (item: ApplicationItem, nextStatus: string | null) => {
    if (!nextStatus) return
    updateStatusMutation.mutate({ id: item.id, status: nextStatus })
  }

  const handleDelete = (id: string) => {
    if (confirm('Remove this application from the tracker?')) {
      deleteAppMutation.mutate(id)
    }
  }

  return (
    <div className="min-h-screen bg-[#050507] text-[#F3EFE7] font-sans">
      <main className="max-w-[1360px] mx-auto px-4 sm:px-8 py-10 flex flex-col gap-8">
        {/* Header */}
        <header className="flex flex-wrap gap-5 items-end justify-between">
          <div className="flex flex-col gap-2">
            <span className="font-mono text-xs uppercase tracking-wider text-[#8C97FF]">/ Application tracker</span>
            <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl leading-[1.04]">
              Every application, <i className="italic text-[#A9A59C]">one board.</i>
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2.5 h-11 px-4 min-w-[260px] rounded-full bg-white/[0.06] border border-white/[0.12] transition focus-within:border-[#8C97FF]">
              <Search className="w-4 h-4 text-[#A8A59D] shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search applications..."
                className="w-full bg-transparent border-0 outline-none text-[#F3EFE7] text-sm placeholder:text-[#8E8C86]"
              />
            </label>

            <button
              onClick={() => setIsAddModalOpen(true)}
              className="pill pill-c flex items-center gap-1.5 h-11"
            >
              <Plus className="w-4 h-4" />
              <span>Add application</span>
            </button>
          </div>
        </header>

        {/* 4-Column Kanban Board */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
          {columns.map((col) => {
            const colItems = filteredApps.filter((a) => a.status === col.id)
            const count = colItems.length

            return (
              <section
                key={col.id}
                aria-label={col.name}
                className="glass p-4 sm:p-5 flex flex-col gap-3.5 rounded-2xl min-h-[500px]"
              >
                {/* Column Header */}
                <div className="flex justify-between items-center px-1 pb-2 border-b border-white/[0.08]">
                  <h2 className="font-mono text-xs uppercase tracking-wider text-[#F3EFE7]">{col.name}</h2>
                  <span className="font-serif text-2xl text-[#A9A59C]">{count}</span>
                </div>

                {/* Cards List */}
                <div className="flex flex-col gap-3">
                  {colItems.map((c) => (
                    <div
                      key={c.id}
                      className="kcard bg-[#0E1015] border border-white/10 rounded-2xl p-4 flex flex-col gap-2.5 transition hover:border-[#8C97FF]/60 hover:-translate-y-0.5 group"
                    >
                      <div className="flex justify-between items-start gap-2">
                        <span className="text-[15px] font-semibold leading-snug text-[#F3EFE7] group-hover:text-[#8C97FF] transition">
                          {c.role_title}
                        </span>
                        <span className="font-serif text-2xl leading-none text-[#8C97FF] shrink-0">
                          {c.match_score || 88}
                        </span>
                      </div>

                      <span className="text-xs text-[#C9C6BE] font-medium">{c.company}</span>
                      <span className="font-mono text-[11px] text-[#A8A59D]">{c.notes}</span>

                      {/* Card Footer Actions */}
                      <div className="flex items-center justify-between pt-2 border-t border-white/[0.06] mt-1">
                        {col.nextStatus ? (
                          <button
                            onClick={() => handleAdvance(c, col.nextStatus)}
                            className="mv cursor-pointer h-8 px-3.5 rounded-full border border-white/15 bg-white/[0.06] hover:bg-white/15 text-[#F3EFE7] text-xs font-medium transition"
                          >
                            {col.nextLabel}
                          </button>
                        ) : (
                          <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/30">
                            Offer Stage ✨
                          </span>
                        )}

                        <div className="flex items-center gap-1.5 opacity-60 group-hover:opacity-100 transition">
                          {c.url && (
                            <a
                              href={c.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="w-7 h-7 rounded-full flex items-center justify-center text-[#A8A59D] hover:text-[#F3EFE7] hover:bg-white/10 transition"
                              title="Open Application Link"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                          <button
                            onClick={() => handleDelete(c.id)}
                            className="w-7 h-7 rounded-full flex items-center justify-center text-[#A8A59D] hover:text-rose-400 hover:bg-white/10 transition"
                            title="Remove Application"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Empty State */}
                {count === 0 && (
                  <div className="border border-dashed border-white/20 rounded-2xl p-7 text-center text-xs text-[#A8A59D] leading-relaxed">
                    {col.emptyText}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      </main>

      {/* Manual Add Application Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
          <div className="relative w-full max-w-lg glass p-7 rounded-3xl bg-[#0A0B0F] border border-white/15 flex flex-col gap-5">
            <div className="flex justify-between items-center">
              <div>
                <span className="font-mono text-xs uppercase tracking-wider text-[#8C97FF]">New Application</span>
                <h3 className="font-serif text-2xl text-[#F3EFE7] mt-0.5">Record an application</h3>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center bg-white/5 border border-white/10 text-[#C9C6BE] hover:text-[#F3EFE7]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                {errorMessage}
              </div>
            )}

            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-[#C9C6BE]">Company Name</label>
                <input
                  type="text"
                  required
                  value={newCompany}
                  onChange={(e) => setNewCompany(e.target.value)}
                  placeholder="e.g. Stripe, Northwind Labs"
                  className="fld"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-[#C9C6BE]">Role Title</label>
                <input
                  type="text"
                  required
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  placeholder="e.g. Backend Engineer Intern"
                  className="fld"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-[#C9C6BE]">Location</label>
                  <input
                    type="text"
                    value={newLocation}
                    onChange={(e) => setNewLocation(e.target.value)}
                    placeholder="e.g. Bengaluru · Hybrid"
                    className="fld"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-[#C9C6BE]">Board Stage</label>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value as any)}
                    className="fld text-xs"
                  >
                    <option value="saved" className="bg-[#0A0B0F]">Saved</option>
                    <option value="applied" className="bg-[#0A0B0F]">Applied</option>
                    <option value="interview" className="bg-[#0A0B0F]">Interviewing</option>
                    <option value="offer" className="bg-[#0A0B0F]">Offer</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-[#C9C6BE]">Application URL (Optional)</label>
                <input
                  type="url"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="https://boards.greenhouse.io/..."
                  className="fld"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-[#C9C6BE]">Notes / Next Round</label>
                <input
                  type="text"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="e.g. Submitted resume variant, recruiter call next Tuesday"
                  className="fld"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="pill pill-g text-xs h-10 px-4"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="pill pill-c text-xs h-10 px-5 flex items-center gap-1.5"
                >
                  {isSubmitting && <RefreshCcw className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save Application</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
