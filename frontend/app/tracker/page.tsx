'use client'
import { ClipboardList, Building2, Plus, Search, MapPin, XCircle, MoreVertical, LayoutGrid, List, CheckCircle2, Star, CalendarClock, Briefcase, Send, Target, Phone, X, Check, ArrowUpRight } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'


import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useApiClient } from '@/lib/useApiClient'

const STATUS_COLUMNS = [
  { id: 'saved', label: 'Wishlist / Saved', icon: '📌', color: 'border-blue-500/30 bg-blue-500/5' },
  { id: 'applied', label: 'Applied', icon: '📨', color: 'border-purple-500/30 bg-purple-500/5' },
  { id: 'interview', label: 'Interviewing', icon: '📞', color: 'border-amber-500/30 bg-amber-500/5' },
  { id: 'offer', label: 'Offer Received 🎉', icon: '🎯', color: 'border-green-500/30 bg-green-500/5' },
  { id: 'rejected', label: 'Rejected / Inactive', icon: '❌', color: 'border-zinc-700 bg-zinc-900/30' },
]

export default function TrackerPage() {
  const queryClient = useQueryClient()
  const { fetch: apiFetch, isLoaded, isSignedIn } = useApiClient()

  const [locationFilter, setLocationFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban')
  
  // Modal state for manual custom application
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [newCompany, setNewCompany] = useState('')
  const [newRole, setNewRole] = useState('')
  const [newLocation, setNewLocation] = useState('')
  const [newSalary, setNewSalary] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [newStatus, setNewStatus] = useState('applied')
  const [newNotes, setNewNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { data: applications, isLoading } = useQuery({
    queryKey: ['applications'],
    enabled: isLoaded && !!isSignedIn,
    queryFn: async () => {
      const res = await apiFetch('/api/applications')
      if (!res.ok) throw new Error('Failed to fetch applications')
      return res.json()
    }
  })

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await apiFetch(`/api/applications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      })
      if (!res.ok) throw new Error('Failed to update status')
      return res.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['applications'] })
  })

  const deleteAppMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/api/applications/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete application')
      return res.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['applications'] })
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
        })
      })
      if (!res.ok) throw new Error('Failed to add application')
      setIsModalOpen(false)
      // Reset form
      setNewCompany('')
      setNewRole('')
      setNewLocation('')
      setNewSalary('')
      setNewUrl('')
      setNewNotes('')
      queryClient.invalidateQueries({ queryKey: ['applications'] })
    } catch (err: any) {
      alert(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Derive unique locations
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

  // Filter applications
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

  // Summary counts
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
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white shadow-[0_0_15px_rgba(99,102,241,0.3)] border border-indigo-400/20">
              <ClipboardList className="w-5 h-5" />
            </div>
            Application Tracker
          </h1>
          <p className="text-zinc-400 text-sm max-w-xl">
            Manage your applications across stages, track interviews, and filter by place.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/companies"
            className="bg-zinc-900 border border-zinc-800/80 text-zinc-300 px-5 py-2.5 rounded-xl text-[13px] font-semibold hover:bg-zinc-800 hover:text-white transition-all flex items-center gap-2 shadow-sm shrink-0"
          >
            <Building2 className="w-4 h-4 text-indigo-400" />
            Browse Companies
          </Link>
          <button
            onClick={() => setIsModalOpen(true)}
            className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-[13px] font-bold hover:bg-indigo-500 transition-all shadow-[0_4px_14px_rgba(79,70,229,0.3)] hover:shadow-[0_6px_20px_rgba(79,70,229,0.4)] flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Track New Application
          </button>
        </div>
      </div>

      {/* Quick Stats Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-zinc-900/50 p-5 rounded-2xl border border-zinc-800/80 backdrop-blur-xl shadow-sm flex flex-col justify-center">
          <div className="text-[11px] text-zinc-500 uppercase tracking-widest font-bold mb-1 flex items-center gap-1.5"><Briefcase className="w-3.5 h-3.5"/> Total Tracked</div>
          <div className="text-3xl font-black text-white">{stats.total}</div>
        </div>
        <div className="bg-blue-900/10 p-5 rounded-2xl border border-blue-800/30 backdrop-blur-xl shadow-sm flex flex-col justify-center">
          <div className="text-[11px] text-blue-400 uppercase tracking-widest font-bold mb-1 flex items-center gap-1.5"><Star className="w-3.5 h-3.5"/> Wishlist</div>
          <div className="text-3xl font-black text-blue-100">{stats.saved}</div>
        </div>
        <div className="bg-purple-900/10 p-5 rounded-2xl border border-purple-800/30 backdrop-blur-xl shadow-sm flex flex-col justify-center">
          <div className="text-[11px] text-purple-400 uppercase tracking-widest font-bold mb-1 flex items-center gap-1.5"><Send className="w-3.5 h-3.5"/> Applied</div>
          <div className="text-3xl font-black text-purple-100">{stats.applied}</div>
        </div>
        <div className="bg-amber-900/10 p-5 rounded-2xl border border-amber-800/30 backdrop-blur-xl shadow-sm flex flex-col justify-center">
          <div className="text-[11px] text-amber-400 uppercase tracking-widest font-bold mb-1 flex items-center gap-1.5"><Phone className="w-3.5 h-3.5"/> Interviewing</div>
          <div className="text-3xl font-black text-amber-100">{stats.interview}</div>
        </div>
        <div className="bg-green-900/10 p-5 rounded-2xl border border-green-800/30 backdrop-blur-xl shadow-sm flex flex-col justify-center">
          <div className="text-[11px] text-green-400 uppercase tracking-widest font-bold mb-1 flex items-center gap-1.5"><Target className="w-3.5 h-3.5"/> Offers</div>
          <div className="text-3xl font-black text-green-100">{stats.offer}</div>
        </div>
      </div>

      {/* Filters & View Toggle */}
      <div className="bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800/80 backdrop-blur-xl flex flex-col md:flex-row gap-4 justify-between items-center shadow-sm">
        <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
          <div className="relative w-full sm:w-80 group">
            <Search className="absolute left-3.5 top-3 w-4 h-4 text-zinc-500 group-focus-within:text-indigo-400 transition-colors" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search companies, roles, notes..."
              className="w-full bg-zinc-950 border border-zinc-800 text-white pl-10 pr-8 py-2.5 rounded-xl text-[13px] placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all shadow-inner"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-zinc-500" />
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-[13px] font-medium appearance-none pr-8 cursor-pointer relative"
              style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2716%27 height=%2716%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%2371717a%27 stroke-width=%272%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27%3E%3Cpolyline points=%276 9 12 15 18 9%27%3E%3C/polyline%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}
            >
              <option value="all">All Locations</option>
              {availableLocations.map((loc) => (
                <option key={loc} value={loc}>{loc}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="bg-zinc-950 border border-zinc-800 p-1 rounded-xl flex">
          <button
            onClick={() => setViewMode('kanban')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${viewMode === 'kanban' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            <LayoutGrid className="w-3.5 h-3.5" /> Board
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${viewMode === 'list' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            <List className="w-3.5 h-3.5" /> List
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="p-16 text-center text-zinc-500 animate-pulse font-medium flex items-center justify-center gap-2">
           Loading tracked applications...
        </div>
      )}

      {/* Main Content Area */}
      {!isLoading && (
        <div className="min-h-[60vh]">
          {viewMode === 'kanban' ? (
            <div className="flex gap-4 overflow-x-auto pb-6 snap-x">
              {STATUS_COLUMNS.map(col => {
                const colApps = filteredApplications.filter((a: any) => a.status === col.id)
                return (
                  <div key={col.id} className="min-w-[320px] max-w-[320px] shrink-0 bg-zinc-900/30 rounded-2xl border border-zinc-800/50 p-4 flex flex-col snap-center">
                    <div className="flex items-center justify-between mb-4 px-2">
                      <div className="flex items-center gap-2">
                        <div className={`text-[13px] font-bold text-zinc-200 tracking-wide`}>{col.label}</div>
                      </div>
                      <span className="bg-zinc-800 text-zinc-400 text-[10px] font-bold px-2 py-0.5 rounded-full">{colApps.length}</span>
                    </div>

                    <div className="space-y-3 overflow-y-auto pr-1 custom-scrollbar flex-1">
                      {colApps.map((app: any) => (
                        <div key={app.id} className={`bg-zinc-950 p-4 rounded-xl border ${col.color} shadow-sm group hover:border-indigo-500/50 transition-colors flex flex-col gap-3 relative`}>
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="font-bold text-white text-[15px] leading-tight mb-1">{app.jobs?.role_title}</div>
                              <div className="text-xs font-medium text-indigo-400 flex items-center gap-1">
                                <Building2 className="w-3.5 h-3.5" /> {app.jobs?.company}
                              </div>
                            </div>
                            {app.job_id && (
                              <Link href={`/jobs/${app.job_id}`} className="text-zinc-500 hover:text-indigo-400 transition-colors">
                                <ArrowUpRight className="w-4 h-4" />
                              </Link>
                            )}
                          </div>

                          <div className="text-[11px] text-zinc-400 flex items-center gap-2 flex-wrap">
                            <span className="flex items-center gap-1 bg-zinc-900 px-2 py-0.5 rounded-md border border-zinc-800/80"><MapPin className="w-3 h-3 text-zinc-500"/> {app.jobs?.location || 'Unclear'}</span>
                            <span className="flex items-center gap-1 bg-zinc-900 px-2 py-0.5 rounded-md border border-zinc-800/80"><CalendarClock className="w-3 h-3 text-zinc-500"/> {new Date(app.created_at).toLocaleDateString()}</span>
                          </div>

                          <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between">
                            <select
                              value={app.status}
                              onChange={(e) => updateStatusMutation.mutate({ id: app.id, status: e.target.value })}
                              className="bg-zinc-900 border border-zinc-800 text-zinc-300 text-[11px] font-bold rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500 appearance-none pr-6 cursor-pointer"
                              style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2712%27 height=%2712%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%2371717a%27 stroke-width=%272%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27%3E%3Cpolyline points=%276 9 12 15 18 9%27%3E%3C/polyline%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center' }}
                            >
                              {STATUS_COLUMNS.map(c => (
                                <option key={c.id} value={c.id}>{c.label}</option>
                              ))}
                            </select>

                            <button
                              onClick={() => {
                                if (confirm('Remove this application from tracker?')) deleteAppMutation.mutate(app.id)
                              }}
                              className="text-zinc-600 hover:text-red-400 p-1 rounded-md transition-colors"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                      {colApps.length === 0 && (
                        <div className="text-center py-8 text-[11px] text-zinc-600 font-medium border border-dashed border-zinc-800/80 rounded-xl bg-zinc-900/20">
                          Empty
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="bg-zinc-900/40 rounded-2xl border border-zinc-800/80 overflow-hidden backdrop-blur-sm shadow-sm">
              <table className="w-full text-left text-[13px]">
                <thead className="bg-zinc-950/80 border-b border-zinc-800">
                  <tr className="text-zinc-400 font-bold uppercase tracking-wider text-[10px]">
                    <th className="p-4 pl-6">Company & Role</th>
                    <th className="p-4">Location</th>
                    <th className="p-4">Applied Date</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right pr-6">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {filteredApplications.map((app: any) => (
                    <tr key={app.id} className="hover:bg-zinc-900/80 transition-colors group">
                      <td className="p-4 pl-6">
                        <div className="font-bold text-white text-[14px]">{app.jobs?.role_title}</div>
                        <div className="text-indigo-400 font-medium text-[12px] flex items-center gap-1 mt-0.5">
                          <Building2 className="w-3.5 h-3.5"/> {app.jobs?.company}
                        </div>
                      </td>
                      <td className="p-4 text-zinc-400">
                        <span className="flex items-center gap-1"><MapPin className="w-3 h-3"/> {app.jobs?.location || 'Unclear'}</span>
                      </td>
                      <td className="p-4 text-zinc-400 font-mono text-xs">
                        {new Date(app.created_at).toLocaleDateString()}
                      </td>
                      <td className="p-4">
                        <select
                          value={app.status}
                          onChange={(e) => updateStatusMutation.mutate({ id: app.id, status: e.target.value })}
                          className={`border text-[11px] font-bold rounded-lg px-2.5 py-1.5 focus:outline-none appearance-none pr-7 cursor-pointer ${STATUS_COLUMNS.find(c => c.id === app.status)?.color}`}
                          style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2712%27 height=%2712%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27currentColor%27 stroke-width=%272%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27%3E%3Cpolyline points=%276 9 12 15 18 9%27%3E%3C/polyline%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}
                        >
                          {STATUS_COLUMNS.map(c => (
                            <option key={c.id} value={c.id}>{c.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="p-4 text-right pr-6 space-x-2">
                        {app.job_id && (
                          <Link href={`/jobs/${app.job_id}`} className="inline-flex p-1.5 bg-zinc-900 text-zinc-400 hover:text-indigo-400 rounded-md transition-colors border border-zinc-800">
                            <ArrowUpRight className="w-4 h-4" />
                          </Link>
                        )}
                        <button
                          onClick={() => {
                            if (confirm('Remove application?')) deleteAppMutation.mutate(app.id)
                          }}
                          className="inline-flex p-1.5 bg-zinc-900 text-zinc-500 hover:text-red-400 rounded-md transition-colors border border-zinc-800"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredApplications.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-12 text-center text-zinc-500">
                        <ClipboardList className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
                        No applications found in the tracker.
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
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-zinc-800 w-full max-w-md rounded-2xl shadow-2xl p-6 relative animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute right-4 top-4 text-zinc-500 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <Plus className="w-5 h-5 text-indigo-500" />
              Manual Entry
            </h2>
            <form onSubmit={handleCreateApplication} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wide mb-1.5">Company *</label>
                  <input
                    type="text"
                    required
                    value={newCompany}
                    onChange={(e) => setNewCompany(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-[13px] text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all shadow-inner"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wide mb-1.5">Role Title *</label>
                  <input
                    type="text"
                    required
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-[13px] text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all shadow-inner"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wide mb-1.5">Location</label>
                  <input
                    type="text"
                    value={newLocation}
                    onChange={(e) => setNewLocation(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-[13px] text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all shadow-inner"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wide mb-1.5">Status</label>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-[13px] text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all shadow-inner appearance-none"
                  >
                    {STATUS_COLUMNS.map(c => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wide mb-1.5">Notes</label>
                <textarea
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-[13px] text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all shadow-inner min-h-[80px]"
                />
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-indigo-600 text-white font-bold py-2.5 rounded-xl hover:bg-indigo-500 transition-all disabled:opacity-50 mt-2 shadow-[0_4px_14px_rgba(79,70,229,0.3)]"
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