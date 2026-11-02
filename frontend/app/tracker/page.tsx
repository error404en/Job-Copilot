'use client'

import {
  ClipboardList,
  Building2,
  Plus,
  Search,
  MapPin,
  LayoutGrid,
  List,
  Star,
  CalendarClock,
  Briefcase,
  Send,
  Target,
  Phone,
  X,
  ArrowUpRight,
  Sparkles,
  BrainCircuit
} from 'lucide-react'
import { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useApiClient } from '@/lib/useApiClient'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatusDatePicker } from '@/components/ui/StatusDatePicker'

const STATUS_COLUMNS = [
  { id: 'saved', label: 'Saved / Wishlist', dot: 'bg-[#918f9f]' },
  { id: 'applied', label: 'Applied', dot: 'bg-[#5b5bd6]' },
  { id: 'interview', label: 'Interviewing', dot: 'bg-[#ffb77e]' },
  { id: 'offer', label: 'Offer Received', dot: 'bg-[#45dfa4]' },
  { id: 'rejected', label: 'Archived / Closed', dot: 'bg-rose-400' },
]

const STORAGE_KEY_TRACKER = 'apply_tool_tracker_state'

export default function TrackerPage() {
  const queryClient = useQueryClient()
  const { fetch: apiFetch, isLoaded, isSignedIn } = useApiClient()

  const [locationFilter, setLocationFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban')

  const isHydratedRef = useRef(false)

  useEffect(() => {
    const hydrate = () => {
      if (typeof window === 'undefined') return
      const sp = new URLSearchParams(window.location.search)
      const hasUrlParams = window.location.search && window.location.search.length > 1

      let saved: any = null
      try {
        const raw = sessionStorage.getItem(STORAGE_KEY_TRACKER)
        if (raw) saved = JSON.parse(raw)
      } catch {}

      const targetView = hasUrlParams ? ((sp.get('view') as any) || 'kanban') : (saved?.viewMode || 'kanban')
      const targetLoc = hasUrlParams ? (sp.get('loc') || 'all') : (saved?.locationFilter || 'all')
      const targetQ = hasUrlParams ? (sp.get('q') || '') : (saved?.searchQuery || '')

      if (['kanban', 'list'].includes(targetView)) setViewMode(targetView)
      setLocationFilter(targetLoc)
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
    if (viewMode !== 'kanban') params.set('view', viewMode)
    if (locationFilter !== 'all') params.set('loc', locationFilter)
    if (searchQuery.trim()) params.set('q', searchQuery.trim())

    const q = params.toString()
    const newUrl = q ? `/tracker?${q}` : '/tracker'
    window.history.replaceState(null, '', newUrl)

    try {
      sessionStorage.setItem(
        STORAGE_KEY_TRACKER,
        JSON.stringify({
          viewMode,
          locationFilter,
          searchQuery,
        })
      )
    } catch {}
  }, [viewMode, locationFilter, searchQuery])

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [newCompany, setNewCompany] = useState('')
  const [newRole, setNewRole] = useState('')
  const [newLocation, setNewLocation] = useState('')
  const [newSalary, setNewSalary] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [newStatus, setNewStatus] = useState('applied')
  const [newDate, setNewDate] = useState(new Date())
  const [newNotes, setNewNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)

  const { data: applications, isLoading } = useQuery({
    queryKey: ['applications'],
    enabled: isLoaded && !!isSignedIn,
    queryFn: async () => {
      const res = await apiFetch('/api/applications')
      if (!res.ok) throw new Error('Failed to fetch applications')
      return res.json()
    },
  })

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

  const deleteAppMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/api/applications/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete application')
      return res.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['applications'] }),
  })

  const handleCreateApplication = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCompany || !newRole) return
    setIsSubmitting(true)
    try {
      const res = await apiFetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: newCompany,
          role_title: newRole,
          location: newLocation || 'Location Unclear',
          salary: newSalary,
          url: newUrl,
          status: newStatus,
          notes: newNotes,
        }),
      })
      if (!res.ok) throw new Error('Failed to add application')
      setIsModalOpen(false)
      setNewCompany('')
      setNewRole('')
      setNewLocation('')
      setNewSalary('')
      setNewUrl('')
      setNewNotes('')
      queryClient.invalidateQueries({ queryKey: ['applications'] })
    } catch (err: any) {
      setModalError(err.message || 'Failed to add application')
    } finally {
      setIsSubmitting(false)
    }
  }

  const availableLocations = useMemo(() => {
    const set = new Set<string>()
    if (applications) {
      applications.forEach((app: any) => {
        const loc = app.jobs?.location || ''
        if (loc && loc !== 'Location Unclear') {
          set.add(loc)
        }
      })
    }
    return Array.from(set).sort()
  }, [applications])

  const filteredApplications = useMemo(() => {
    if (!applications) return []
    return applications.filter((app: any) => {
      const company = (app.jobs?.company || '').toLowerCase()
      const role = (app.jobs?.role_title || '').toLowerCase()
      const loc = (app.jobs?.location || '').toLowerCase()
      const notes = (app.notes || '').toLowerCase()
      const q = searchQuery.toLowerCase().trim()

      const matchesSearch = !q || company.includes(q) || role.includes(q) || loc.includes(q) || notes.includes(q)
      const matchesLocation = locationFilter === 'all' || loc.includes(locationFilter.toLowerCase().trim())

      return matchesSearch && matchesLocation
    })
  }, [applications, searchQuery, locationFilter])

  const stats = useMemo(() => {
    const all = applications || []
    return {
      total: all.length,
      saved: all.filter((a: any) => a.status === 'saved').length,
      applied: all.filter((a: any) => a.status === 'applied').length,
      interview: all.filter((a: any) => a.status === 'interview').length,
      offer: all.filter((a: any) => a.status === 'offer').length,
    }
  }, [applications])

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 pb-16 font-sans">
      <PageHeader
        suite="Pipeline & Stages"
        title="Application Tracker"
        subtitle="Manage every saved, submitted, and active interview loop across a calm, breathable Kanban board."
        icon={ClipboardList}
        badge={`${stats.total} Tracked`}
        badgeColor="indigo"
        actions={
          <div className="flex items-center gap-2.5">
            <Link
              href="/companies"
              className="bg-[#1a1c20] border border-[#464553]/35 text-[#e2e2e8] px-3.5 py-2 rounded-xl text-xs font-semibold hover:bg-[#282a2e] transition-all flex items-center gap-1.5"
            >
              <Building2 className="w-3.5 h-3.5 text-[#5b5bd6]" />
              <span>Browse Companies</span>
            </Link>
            <button
              onClick={() => setIsModalOpen(true)}
              className="bg-[#5b5bd6] hover:bg-[#4f4fc7] text-white px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Log Application</span>
            </button>
          </div>
        }
      />

      {/* Calm Summary Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
        <div className="bg-[#1a1c20] p-4 rounded-xl border border-[#464553]/35 flex flex-col justify-between">
          <div className="text-[11px] text-[#918f9f] uppercase tracking-wider font-semibold flex items-center gap-1.5">
            <Briefcase className="w-3.5 h-3.5 text-[#918f9f]" /> Total Tracked
          </div>
          <div className="text-2xl font-bold text-[#e2e2e8] mt-1.5 font-mono">{stats.total}</div>
        </div>
        <div className="bg-[#1a1c20] p-4 rounded-xl border border-[#464553]/35 flex flex-col justify-between">
          <div className="text-[11px] text-[#918f9f] uppercase tracking-wider font-semibold flex items-center gap-1.5">
            <Star className="w-3.5 h-3.5 text-[#918f9f]" /> Saved / Wishlist
          </div>
          <div className="text-2xl font-bold text-[#e2e2e8] mt-1.5 font-mono">{stats.saved}</div>
        </div>
        <div className="bg-[#1a1c20] p-4 rounded-xl border border-[#5b5bd6]/30 flex flex-col justify-between">
          <div className="text-[11px] text-[#c3c0ff] uppercase tracking-wider font-semibold flex items-center gap-1.5">
            <Send className="w-3.5 h-3.5 text-[#5b5bd6]" /> Applied
          </div>
          <div className="text-2xl font-bold text-[#e2e2e8] mt-1.5 font-mono">{stats.applied}</div>
        </div>
        <div className="bg-[#1a1c20] p-4 rounded-xl border border-[#ffb77e]/30 flex flex-col justify-between">
          <div className="text-[11px] text-[#ffb77e] uppercase tracking-wider font-semibold flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5 text-[#ffb77e]" /> Interviewing
          </div>
          <div className="text-2xl font-bold text-[#ffb77e] mt-1.5 font-mono">{stats.interview}</div>
        </div>
        <div className="bg-[#1a1c20] p-4 rounded-xl border border-[#45dfa4]/30 flex flex-col justify-between">
          <div className="text-[11px] text-[#45dfa4] uppercase tracking-wider font-semibold flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5 text-[#45dfa4]" /> Offers Received
          </div>
          <div className="text-2xl font-bold text-[#45dfa4] mt-1.5 font-mono">{stats.offer}</div>
        </div>
      </div>

      {/* Filters & View Toggle */}
      <div className="bg-[#1a1c20] p-3.5 rounded-xl border border-[#464553]/35 flex flex-col md:flex-row gap-3 justify-between items-center">
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#918f9f]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search companies, roles, notes..."
              className="w-full bg-[#0c0e12] border border-[#464553]/40 text-[#e2e2e8] pl-10 pr-8 py-2 rounded-lg text-xs placeholder-[#918f9f] focus:outline-none focus:border-[#5b5bd6] transition-all"
            />
          </div>

          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-[#918f9f]" />
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="bg-[#0c0e12] border border-[#464553]/40 text-[#e2e2e8] rounded-lg px-3 py-2 focus:outline-none focus:border-[#5b5bd6] text-xs font-medium cursor-pointer"
            >
              <option value="all">All Locations</option>
              {availableLocations.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="bg-[#0c0e12] border border-[#464553]/35 p-1 rounded-lg flex">
          <button
            onClick={() => setViewMode('kanban')}
            className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
              viewMode === 'kanban' ? 'bg-[#282a2e] text-[#e2e2e8]' : 'text-[#918f9f] hover:text-[#e2e2e8]'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" /> Board
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
              viewMode === 'list' ? 'bg-[#282a2e] text-[#e2e2e8]' : 'text-[#918f9f] hover:text-[#e2e2e8]'
            }`}
          >
            <List className="w-3.5 h-3.5" /> Table
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="p-16 text-center text-[#918f9f] text-sm font-medium">
          Loading tracked applications...
        </div>
      )}

      {/* Main Content Area */}
      {!isLoading && (
        <div className="min-h-[60vh] w-full overflow-hidden">
          {viewMode === 'kanban' ? (
            <div className="flex gap-4 overflow-x-auto pb-6 snap-x w-full">
              {STATUS_COLUMNS.map((col) => {
                const colApps = filteredApplications.filter((a: any) => a.status === col.id)
                return (
                  <div
                    key={col.id}
                    className="min-w-[300px] max-w-[300px] shrink-0 bg-[#14161a] rounded-xl border border-[#464553]/30 p-3.5 flex flex-col snap-center"
                  >
                    <div className="flex items-center justify-between mb-3.5 px-1">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                        <div className="text-xs font-semibold text-[#e2e2e8]">{col.label}</div>
                      </div>
                      <span className="bg-[#282a2e] text-[#918f9f] text-[11px] font-mono font-semibold px-2 py-0.5 rounded-md">
                        {colApps.length}
                      </span>
                    </div>

                    <div className="space-y-3 overflow-y-auto pr-0.5 flex-1">
                      {colApps.map((app: any) => (
                        <div
                          key={app.id}
                          className="bg-[#1a1c20] p-4 rounded-xl border border-[#464553]/35 hover:border-[#5b5bd6]/50 transition-all flex flex-col gap-3"
                        >
                          <div className="flex justify-between items-start gap-2">
                            <div className="min-w-0">
                              <div className="font-semibold text-[#e2e2e8] text-sm leading-snug mb-1 truncate">
                                {app.jobs?.role_title}
                              </div>
                              <div className="text-xs font-medium text-[#918f9f] flex items-center gap-1.5">
                                <Building2 className="w-3.5 h-3.5 text-[#5b5bd6]" />
                                <span className="truncate">{app.jobs?.company}</span>
                              </div>
                            </div>
                            {app.job_id && (
                              <Link
                                href={`/jobs/${app.job_id}`}
                                className="text-[#918f9f] hover:text-[#e2e2e8] p-1 rounded-md hover:bg-[#282a2e] transition-colors shrink-0"
                                title="Open Full Job Workspace"
                              >
                                <ArrowUpRight className="w-4 h-4" />
                              </Link>
                            )}
                          </div>

                          <div className="text-[11px] text-[#918f9f] flex items-center gap-2 flex-wrap">
                            <span className="flex items-center gap-1 bg-[#0c0e12] px-2 py-0.5 rounded-md border border-[#464553]/30">
                              <MapPin className="w-3 h-3 text-[#918f9f]" /> {app.jobs?.location || 'Remote / Unclear'}
                            </span>
                            <span className="flex items-center gap-1 bg-[#0c0e12] px-2 py-0.5 rounded-md border border-[#464553]/30 font-mono">
                              <CalendarClock className="w-3 h-3 text-[#918f9f]" />{' '}
                              {new Date(app.created_at).toLocaleDateString()}
                            </span>
                          </div>

                          {app.job_id && (
                            <div className="flex items-center gap-1.5 pt-0.5">
                              <Link
                                href={`/jobs/${app.job_id}`}
                                className="text-[11px] font-semibold text-[#c3c0ff] bg-[#5b5bd6]/12 hover:bg-[#5b5bd6]/20 border border-[#5b5bd6]/30 px-2.5 py-1 rounded-md flex items-center gap-1 transition-all"
                              >
                                <Sparkles className="w-3 h-3 text-[#5b5bd6]" />
                                <span>Match Studio</span>
                              </Link>
                              <Link
                                href={`/jobs/${app.job_id}?tab=coach`}
                                className="text-[11px] font-semibold text-[#e2e2e8] bg-[#282a2e] hover:bg-[#33353a] border border-[#464553]/40 px-2.5 py-1 rounded-md flex items-center gap-1 transition-all"
                              >
                                <BrainCircuit className="w-3 h-3 text-[#45dfa4]" />
                                <span>Prep Coach</span>
                              </Link>
                            </div>
                          )}

                          <div className="pt-2.5 border-t border-[#464553]/25 flex items-center justify-between">
                            <select
                              value={app.status}
                              onChange={(e) => updateStatusMutation.mutate({ id: app.id, status: e.target.value })}
                              className="bg-[#0c0e12] border border-[#464553]/40 text-[#e2e2e8] text-[11px] font-semibold rounded-lg px-2.5 py-1 focus:outline-none focus:border-[#5b5bd6] cursor-pointer"
                            >
                              {STATUS_COLUMNS.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.label}
                                </option>
                              ))}
                            </select>

                            <button
                              onClick={() => {
                                if (confirm('Remove this application from tracker?')) deleteAppMutation.mutate(app.id)
                              }}
                              className="text-[#918f9f] hover:text-rose-400 p-1 rounded-md transition-colors"
                              title="Remove from tracker"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                      {colApps.length === 0 && (
                        <div className="text-center py-8 text-xs text-[#918f9f] border border-dashed border-[#464553]/30 rounded-xl bg-[#0c0e12]/40">
                          No roles in {col.label}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="bg-[#1a1c20] rounded-xl border border-[#464553]/35 overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#14161a] border-b border-[#464553]/35">
                  <tr className="text-[#918f9f] font-semibold uppercase tracking-wider text-[10px]">
                    <th className="p-4 pl-6">Company & Role</th>
                    <th className="p-4">Location</th>
                    <th className="p-4">Logged Date</th>
                    <th className="p-4">Stage</th>
                    <th className="p-4 text-right pr-6">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#464553]/25">
                  {filteredApplications.map((app: any) => (
                    <tr key={app.id} className="hover:bg-[#282a2e]/40 transition-colors">
                      <td className="p-4 pl-6">
                        <div className="font-semibold text-[#e2e2e8] text-sm">{app.jobs?.role_title}</div>
                        <div className="text-[#918f9f] font-medium text-xs flex items-center gap-1.5 mt-0.5">
                          <Building2 className="w-3.5 h-3.5 text-[#5b5bd6]" /> {app.jobs?.company}
                        </div>
                      </td>
                      <td className="p-4 text-[#918f9f]">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5" /> {app.jobs?.location || 'Unclear'}
                        </span>
                      </td>
                      <td className="p-4 text-[#918f9f] font-mono text-xs">
                        {new Date(app.created_at).toLocaleDateString()}
                      </td>
                      <td className="p-4">
                        <select
                          value={app.status}
                          onChange={(e) => updateStatusMutation.mutate({ id: app.id, status: e.target.value })}
                          className="bg-[#0c0e12] border border-[#464553]/40 text-[#e2e2e8] text-xs font-semibold rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#5b5bd6] cursor-pointer"
                        >
                          {STATUS_COLUMNS.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-4 text-right pr-6 space-x-2">
                        {app.job_id && (
                          <div className="inline-flex items-center gap-1.5 mr-2">
                            <Link
                              href={`/jobs/${app.job_id}`}
                              className="px-2.5 py-1 text-xs font-semibold bg-[#5b5bd6]/12 hover:bg-[#5b5bd6]/20 text-[#c3c0ff] rounded-md transition-colors border border-[#5b5bd6]/30 inline-flex items-center gap-1"
                            >
                              <Sparkles className="w-3 h-3 text-[#5b5bd6]" />
                              <span>Studio</span>
                            </Link>
                            <Link
                              href={`/jobs/${app.job_id}?tab=coach`}
                              className="px-2.5 py-1 text-xs font-semibold bg-[#282a2e] hover:bg-[#33353a] text-[#e2e2e8] rounded-md transition-colors border border-[#464553]/40 inline-flex items-center gap-1"
                            >
                              <BrainCircuit className="w-3 h-3 text-[#45dfa4]" />
                              <span>Coach</span>
                            </Link>
                          </div>
                        )}
                        <button
                          onClick={() => {
                            if (confirm('Remove application?')) deleteAppMutation.mutate(app.id)
                          }}
                          className="inline-flex p-1.5 bg-[#0c0e12] text-[#918f9f] hover:text-rose-400 rounded-md transition-colors border border-[#464553]/35"
                          title="Remove from tracker"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredApplications.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-12 text-center text-[#918f9f]">
                        <ClipboardList className="w-10 h-10 text-[#464553] mx-auto mb-2.5" />
                        No applications found matching your filter criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Manual Application Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-[#1a1c20] border border-[#464553]/45 w-full max-w-md rounded-2xl shadow-2xl p-6 relative">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute right-4 top-4 text-[#918f9f] hover:text-[#e2e2e8] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-bold text-[#e2e2e8] mb-5 flex items-center gap-2">
              <Plus className="w-5 h-5 text-[#5b5bd6]" />
              Log Manual Application
            </h2>
            {modalError && (
              <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-semibold">
                {modalError}
              </div>
            )}
            <form onSubmit={handleCreateApplication} className="space-y-4">
              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[11px] font-semibold text-[#918f9f] uppercase tracking-wider mb-1.5">
                    Company *
                  </label>
                  <input
                    type="text"
                    required
                    value={newCompany}
                    onChange={(e) => setNewCompany(e.target.value)}
                    className="w-full bg-[#0c0e12] border border-[#464553]/40 rounded-lg px-3 py-2 text-xs text-[#e2e2e8] focus:outline-none focus:border-[#5b5bd6]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#918f9f] uppercase tracking-wider mb-1.5">
                    Role Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    className="w-full bg-[#0c0e12] border border-[#464553]/40 rounded-lg px-3 py-2 text-xs text-[#e2e2e8] focus:outline-none focus:border-[#5b5bd6]"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3.5">
                <div className="col-span-2">
                  <label className="block text-[11px] font-semibold text-[#918f9f] uppercase tracking-wider mb-1.5">
                    Location
                  </label>
                  <input
                    type="text"
                    value={newLocation}
                    onChange={(e) => setNewLocation(e.target.value)}
                    placeholder="e.g. Bengaluru, Hybrid"
                    className="w-full bg-[#0c0e12] border border-[#464553]/40 rounded-lg px-3 py-2 text-xs text-[#e2e2e8] focus:outline-none focus:border-[#5b5bd6]"
                  />
                </div>
                <div className="col-span-2 mt-1">
                  <StatusDatePicker
                    date={newDate}
                    status={newStatus}
                    onDateChange={setNewDate}
                    onStatusChange={setNewStatus}
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#918f9f] uppercase tracking-wider mb-1.5">
                  Notes
                </label>
                <textarea
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Referral details, recruiter contact, or interview notes..."
                  className="w-full bg-[#0c0e12] border border-[#464553]/40 rounded-lg px-3 py-2 text-xs text-[#e2e2e8] focus:outline-none focus:border-[#5b5bd6] min-h-[80px]"
                />
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-[#5b5bd6] hover:bg-[#4f4fc7] text-white font-semibold py-2.5 rounded-xl transition-all disabled:opacity-50 mt-2 text-xs"
              >
                {isSubmitting ? 'Saving...' : 'Save Application'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
