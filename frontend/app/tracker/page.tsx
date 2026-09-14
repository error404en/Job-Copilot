'use client'

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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2 flex items-center gap-2">
            <span>📋</span> Application Tracker
          </h1>
          <p className="text-zinc-400 text-sm">
            Manage your applications across stages, track interviews, and filter by place.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/companies"
            className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-zinc-800 transition-colors flex items-center gap-2"
          >
            <span>🏢</span> Browse Companies
          </Link>
          <button
            onClick={() => setIsModalOpen(true)}
            className="bg-blue-600 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-500 transition-colors shadow-sm"
          >
            + Track New Application
          </button>
        </div>
      </div>

      {/* Quick Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-zinc-900/50 p-4 rounded-xl border border-zinc-800 backdrop-blur-sm">
          <div className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">Total Tracked</div>
          <div className="text-2xl font-black text-white mt-1">{stats.total}</div>
        </div>
        <div className="bg-zinc-900/50 p-4 rounded-xl border border-zinc-800 backdrop-blur-sm">
          <div className="text-xs text-blue-400 uppercase tracking-wider font-semibold">Wishlist</div>
          <div className="text-2xl font-black text-blue-400 mt-1">{stats.saved}</div>
        </div>
        <div className="bg-zinc-900/50 p-4 rounded-xl border border-zinc-800 backdrop-blur-sm">
          <div className="text-xs text-purple-400 uppercase tracking-wider font-semibold">Applied</div>
          <div className="text-2xl font-black text-purple-400 mt-1">{stats.applied}</div>
        </div>
        <div className="bg-zinc-900/50 p-4 rounded-xl border border-zinc-800 backdrop-blur-sm">
          <div className="text-xs text-amber-400 uppercase tracking-wider font-semibold">Interviewing</div>
          <div className="text-2xl font-black text-amber-400 mt-1">{stats.interview}</div>
        </div>
        <div className="bg-zinc-900/50 p-4 rounded-xl border border-zinc-800 backdrop-blur-sm">
          <div className="text-xs text-green-400 uppercase tracking-wider font-semibold">Offers</div>
          <div className="text-2xl font-black text-green-400 mt-1">{stats.offer}</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-zinc-900/60 p-4 rounded-xl border border-zinc-800/80 backdrop-blur-md flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Location / Place Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">Place:</span>
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">📍 All Locations</option>
              <option value="bengaluru">Bengaluru / Bangalore</option>
              <option value="mumbai">Mumbai</option>
              <option value="pune">Pune</option>
              <option value="hyderabad">Hyderabad</option>
              <option value="delhi">Delhi / NCR / Noida</option>
              <option value="chennai">Chennai</option>
              <option value="pan india">Pan India</option>
              <option value="remote">Remote</option>
              {availableLocations.map((loc) => {
                const lower = loc.toLowerCase()
                if (['bengaluru', 'bangalore', 'mumbai', 'pune', 'hyderabad', 'delhi', 'chennai', 'remote', 'pan india'].some(p => lower.includes(p))) {
                  return null
                }
                return <option key={loc} value={loc}>{loc}</option>
              })}
            </select>
          </div>

          {locationFilter !== 'all' && (
            <button
              onClick={() => setLocationFilter('all')}
              className="text-xs text-blue-400 hover:underline"
            >
              Reset place
            </button>
          )}
        </div>

        {/* Search & View Switcher */}
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <span className="absolute left-3 top-2 text-zinc-500 text-xs">🔍</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search company, role, notes..."
              className="w-full bg-zinc-950 border border-zinc-800 text-white pl-8 pr-3 py-1.5 rounded-lg text-xs placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="flex bg-zinc-950 p-1 rounded-lg border border-zinc-800">
            <button
              onClick={() => setViewMode('kanban')}
              className={`px-3 py-1 text-xs font-semibold rounded ${viewMode === 'kanban' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              Columns
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1 text-xs font-semibold rounded ${viewMode === 'list' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              List
            </button>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="p-12 text-center text-zinc-500 animate-pulse">Loading tracked applications...</div>
      )}

      {/* KANBAN PIPELINE VIEW */}
      {viewMode === 'kanban' && !isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 items-start">
          {STATUS_COLUMNS.map((col) => {
            const colApps = filteredApplications.filter((a: any) => a.status === col.id)
            return (
              <div key={col.id} className="bg-zinc-900/40 rounded-xl border border-zinc-800 p-3 space-y-3 min-h-[400px]">
                {/* Column Header */}
                <div className="flex items-center justify-between pb-2 border-b border-zinc-800/80 px-1">
                  <div className="flex items-center gap-1.5 font-bold text-sm text-zinc-200">
                    <span>{col.icon}</span>
                    <span>{col.label}</span>
                  </div>
                  <span className="text-xs bg-zinc-800 text-zinc-400 font-mono px-2 py-0.5 rounded-full font-bold">
                    {colApps.length}
                  </span>
                </div>

                {/* Cards in this Column */}
                <div className="space-y-2.5">
                  {colApps.length === 0 ? (
                    <div className="text-center py-8 text-xs text-zinc-600 border border-dashed border-zinc-800/60 rounded-lg">
                      No applications
                    </div>
                  ) : (
                    colApps.map((app: any) => {
                      const job = app.jobs || {}
                      const analysis = job.job_analyses && job.job_analyses[0]
                      return (
                        <div
                          key={app.id}
                          className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 hover:border-zinc-700 shadow-sm space-y-3 transition-all group"
                        >
                          <div>
                            <div className="flex items-start justify-between gap-2">
                              <h3 className="font-bold text-white text-sm leading-snug">
                                {job.id && job.source !== 'manual_tracker' ? (
                                  <Link href={`/jobs/${job.id}`} className="hover:text-blue-400 hover:underline">
                                    {job.role_title || 'Role Title'}
                                  </Link>
                                ) : (
                                  job.role_title || 'Role Title'
                                )}
                              </h3>
                              {analysis && (
                                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${
                                  analysis.match_score >= 80 ? 'text-green-400 bg-green-500/10' : 'text-amber-400 bg-amber-500/10'
                                }`}>
                                  {analysis.match_score}%
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-zinc-400 font-medium mt-1">
                              {job.company || 'Company'}
                            </div>
                          </div>

                          <div className="text-[11px] text-zinc-500 space-y-1">
                            <div className="flex items-center gap-1">
                              <span>📍</span>
                              <span className="truncate">{job.location || 'Location Unclear'}</span>
                            </div>
                            {app.applied_at && (
                              <div className="text-zinc-600">
                                Applied: {new Date(app.applied_at).toLocaleDateString()}
                              </div>
                            )}
                            {app.notes && (
                              <div className="text-zinc-400 bg-zinc-900/80 p-1.5 rounded text-[11px] border border-zinc-800/50 mt-1 line-clamp-2">
                                💬 {app.notes}
                              </div>
                            )}
                          </div>

                          {/* Quick Status Shift Dropdown & Actions */}
                          <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between gap-1 text-[11px]">
                            <select
                              value={app.status}
                              onChange={(e) => updateStatusMutation.mutate({ id: app.id, status: e.target.value })}
                              className="bg-zinc-900 text-zinc-300 border border-zinc-800 rounded px-1.5 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500"
                            >
                              <option value="saved">📌 Wishlist</option>
                              <option value="applied">📨 Applied</option>
                              <option value="interview">📞 Interview</option>
                              <option value="offer">🎯 Offer</option>
                              <option value="rejected">❌ Inactive</option>
                            </select>

                            <div className="flex items-center gap-1.5">
                              {job.url && job.url !== 'Screenshot Upload' && (
                                <a
                                  href={job.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-zinc-400 hover:text-white px-1.5 py-0.5 bg-zinc-900 rounded border border-zinc-800 hover:bg-zinc-800"
                                  title="Open Job URL"
                                >
                                  ↗
                                </a>
                              )}
                              <button
                                onClick={() => deleteAppMutation.mutate(app.id)}
                                className="text-zinc-600 hover:text-red-400 p-1 transition-colors"
                                title="Remove from Tracker"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* TABLE / LIST VIEW */}
      {viewMode === 'list' && !isLoading && (
        <div className="bg-zinc-900/40 rounded-xl border border-zinc-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-400 uppercase tracking-wider text-[10px] bg-zinc-950/50">
                  <th className="py-3 px-4">Role Title</th>
                  <th className="py-3 px-4">Company</th>
                  <th className="py-3 px-4">Place / Location</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Applied Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                {filteredApplications.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-zinc-500">
                      No applications match your filter.
                    </td>
                  </tr>
                ) : (
                  filteredApplications.map((app: any) => {
                    const job = app.jobs || {}
                    return (
                      <tr key={app.id} className="hover:bg-zinc-900/30">
                        <td className="py-3 px-4 font-semibold text-white">
                          {job.id && job.source !== 'manual_tracker' ? (
                            <Link href={`/jobs/${job.id}`} className="hover:text-blue-400 hover:underline">
                              {job.role_title || 'Untitled Role'}
                            </Link>
                          ) : (
                            job.role_title || 'Untitled Role'
                          )}
                        </td>
                        <td className="py-3 px-4 text-zinc-300">{job.company || '—'}</td>
                        <td className="py-3 px-4 text-zinc-400">{job.location || 'Location Unclear'}</td>
                        <td className="py-3 px-4">
                          <select
                            value={app.status}
                            onChange={(e) => updateStatusMutation.mutate({ id: app.id, status: e.target.value })}
                            className="bg-zinc-950 border border-zinc-800 text-zinc-200 rounded px-2 py-1 text-xs focus:outline-none"
                          >
                            <option value="saved">📌 Wishlist</option>
                            <option value="applied">📨 Applied</option>
                            <option value="interview">📞 Interview</option>
                            <option value="offer">🎯 Offer</option>
                            <option value="rejected">❌ Inactive</option>
                          </select>
                        </td>
                        <td className="py-3 px-4 text-zinc-500 font-mono">
                          {app.applied_at ? new Date(app.applied_at).toLocaleDateString() : '—'}
                        </td>
                        <td className="py-3 px-4 text-right space-x-2">
                          {job.url && job.url !== 'Screenshot Upload' && (
                            <a
                              href={job.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-400 hover:underline inline-block"
                            >
                              Apply ↗
                            </a>
                          )}
                          <button
                            onClick={() => deleteAppMutation.mutate(app.id)}
                            className="text-zinc-500 hover:text-red-400 font-bold"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Custom Application Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h2 className="text-xl font-bold text-white">Track New Job Application</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-zinc-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleCreateApplication} className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">Company *</label>
                  <input
                    type="text"
                    required
                    value={newCompany}
                    onChange={(e) => setNewCompany(e.target.value)}
                    placeholder="e.g. Barclays, HSBC, Google"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-white focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">Role Title *</label>
                  <input
                    type="text"
                    required
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    placeholder="e.g. Analyst, Associate, SDE"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-white focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">Location / Place</label>
                  <input
                    type="text"
                    value={newLocation}
                    onChange={(e) => setNewLocation(e.target.value)}
                    placeholder="e.g. Bengaluru, Mumbai, Remote"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-white focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">Expected / Offered CTC</label>
                  <input
                    type="text"
                    value={newSalary}
                    onChange={(e) => setNewSalary(e.target.value)}
                    placeholder="e.g. ₹19.66L CTC"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-white focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">Application Status</label>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-white focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="saved">📌 Wishlist / Saved</option>
                    <option value="applied">📨 Applied</option>
                    <option value="interview">📞 Interviewing</option>
                    <option value="offer">🎯 Offered</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">Application URL</label>
                  <input
                    type="url"
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-white focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1">Notes / Referral Info</label>
                <textarea
                  rows={2}
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="e.g. Applied via referral, follow up next Tuesday..."
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-white focus:ring-1 focus:ring-blue-500 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-zinc-400 hover:text-white bg-zinc-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !newCompany || !newRole}
                  className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-lg text-xs font-bold disabled:opacity-50"
                >
                  {isSubmitting ? 'Adding...' : 'Add to Tracker'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
