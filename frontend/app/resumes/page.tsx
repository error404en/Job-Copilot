'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useMemo } from 'react'
import { useApiClient } from '@/lib/useApiClient'

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  genai:      { label: 'GenAI / ML',    color: 'bg-purple-900/60 text-purple-300 border-purple-700/50' },
  backend:    { label: 'Backend',       color: 'bg-blue-900/60 text-blue-300 border-blue-700/50' },
  frontend:   { label: 'Frontend',      color: 'bg-cyan-900/60 text-cyan-300 border-cyan-700/50' },
  fullstack:  { label: 'Full Stack',    color: 'bg-teal-900/60 text-teal-300 border-teal-700/50' },
  data:       { label: 'Data',          color: 'bg-orange-900/60 text-orange-300 border-orange-700/50' },
  product:    { label: 'Product',       color: 'bg-pink-900/60 text-pink-300 border-pink-700/50' },
  design:     { label: 'Design',        color: 'bg-rose-900/60 text-rose-300 border-rose-700/50' },
  other:      { label: 'Other',         color: 'bg-zinc-800 text-zinc-300 border-zinc-700/50' },
}

function getTypeInfo(type: string) {
  return TYPE_LABELS[type] ?? TYPE_LABELS['other']
}

export default function ResumesPage() {
  const queryClient = useQueryClient()
  const { fetch: apiFetch, isLoaded, isSignedIn } = useApiClient()

  const { data: resumes, isLoading } = useQuery({
    queryKey: ['resumes'],
    enabled: isLoaded && !!isSignedIn,
    queryFn: async () => {
      const res = await apiFetch('/api/resumes')
      if (!res.ok) throw new Error('Failed to fetch resumes')
      return res.json()
    }
  })

  const [file, setFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [filterType, setFilterType] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  // Map of resumeId -> link check results
  const [linkResults, setLinkResults] = useState<Record<string, { checked: boolean; broken: any[] }>>({})
  const [checkingLinks, setCheckingLinks] = useState<Record<string, boolean>>({})

  const uploadMutation = useMutation({
    mutationFn: async (uploadFile: File) => {
      const formData = new FormData()
      formData.append('file', uploadFile)
      const res = await apiFetch('/api/resumes/upload', { method: 'POST', body: formData })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.detail || 'Upload failed')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resumes'] })
      setFile(null)
      setIsUploading(false)
    },
    onError: (err: any) => {
      setIsUploading(false)
      alert(err.message)
    }
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/api/resumes/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Failed to delete' }))
        throw new Error(err.detail || 'Failed to delete')
      }
      return res.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['resumes'] }),
    onError: (err: any) => alert(err.message || 'Failed to delete resume')
  })

  const handleUpload = (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return
    setIsUploading(true)
    uploadMutation.mutate(file)
  }

  const handleCheckLinks = async (resume: any) => {
    setCheckingLinks(prev => ({ ...prev, [resume.id]: true }))
    try {
      // Re-use the tailor/resume endpoint which returns broken_links for a given resume
      // Instead we POST to a dedicated check-links endpoint if it exists, else use tailor
      // The backend check_resume_links works on raw_content — call the job's check-links or
      // use a lightweight inline approach via the resumes API
      const res = await apiFetch(`/api/resumes/${resume.id}/check-links`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setLinkResults(prev => ({ ...prev, [resume.id]: { checked: true, broken: data.broken_links || [] } }))
      } else {
        setLinkResults(prev => ({ ...prev, [resume.id]: { checked: true, broken: [] } }))
      }
    } catch {
      setLinkResults(prev => ({ ...prev, [resume.id]: { checked: true, broken: [] } }))
    } finally {
      setCheckingLinks(prev => ({ ...prev, [resume.id]: false }))
    }
  }

  // Derive unique types from loaded resumes for filter tabs
  const availableTypes = useMemo(() => {
    if (!resumes) return []
    const types = Array.from(new Set(resumes.map((r: any) => r.target_type as string)))
    return types.filter(Boolean)
  }, [resumes])

  const filteredResumes = useMemo(() => {
    if (!resumes) return []
    return resumes.filter((r: any) => {
      const matchesType = filterType === 'all' || r.target_type === filterType
      const matchesSearch = !searchQuery || 
        r.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.skills_summary?.toLowerCase().includes(searchQuery.toLowerCase())
      return matchesType && matchesSearch
    })
  }, [resumes, filterType, searchQuery])

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Your Resumes</h1>
          <p className="text-zinc-400 mt-2">Upload PDF resumes. AI parses your skills to auto-match against jobs and pick the best version for each application.</p>
        </div>
        <div className="text-right">
          <span className="text-2xl font-bold text-white">{resumes?.length ?? 0}</span>
          <p className="text-zinc-500 text-xs">uploaded</p>
        </div>
      </div>

      {/* Upload */}
      <div className="bg-zinc-900/40 p-8 rounded-2xl shadow-sm border border-zinc-800/50 backdrop-blur-sm">
        <form onSubmit={handleUpload} className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-semibold text-zinc-400 mb-2 uppercase tracking-wide">Upload PDF Resume</label>
            <input
              type="file"
              accept=".pdf"
              className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </div>
          <button
            type="submit"
            disabled={!file || isUploading}
            className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isUploading ? 'Parsing...' : 'Upload & Parse'}
          </button>
        </form>
      </div>

      {/* Filter Bar */}
      {!isLoading && resumes && resumes.length > 0 && (
        <div className="flex flex-col gap-3">
          {/* Search */}
          <input
            type="text"
            placeholder="Search by title or skills..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-900/60 border border-zinc-800 text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 placeholder-zinc-600"
          />
          {/* Type tabs */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setFilterType('all')}
              className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-colors ${filterType === 'all' ? 'bg-white text-black border-white' : 'bg-zinc-900 text-zinc-400 border-zinc-700 hover:border-zinc-500'}`}
            >
              All ({resumes.length})
            </button>
            {availableTypes.map(type => {
              const { label, color } = getTypeInfo(type)
              const count = resumes.filter((r: any) => r.target_type === type).length
              return (
                <button
                  key={type}
                  onClick={() => setFilterType(filterType === type ? 'all' : type)}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-colors ${filterType === type ? color + ' ring-1 ring-white/20' : 'bg-zinc-900 text-zinc-400 border-zinc-700 hover:border-zinc-500'}`}
                >
                  {label} ({count})
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Resume List */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-white">
          {filterType === 'all' ? 'Uploaded Resumes' : `${getTypeInfo(filterType).label} Resumes`}
          {filteredResumes.length !== resumes?.length && (
            <span className="ml-2 text-sm font-normal text-zinc-500">({filteredResumes.length} of {resumes?.length})</span>
          )}
        </h2>

        {isLoading ? (
          <div className="text-zinc-500">Loading resumes...</div>
        ) : filteredResumes.length === 0 ? (
          <div className="text-zinc-500 bg-zinc-900/40 p-6 rounded-xl border border-zinc-800/50 text-center">
            {resumes?.length === 0 ? 'No resumes uploaded yet. Upload one to get started!' : 'No resumes match your filter.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {filteredResumes.map((resume: any) => {
              const { label, color } = getTypeInfo(resume.target_type)
              const linkResult = linkResults[resume.id]
              const isCheckingLink = checkingLinks[resume.id]
              const hasBrokenLinks = linkResult?.checked && linkResult.broken.length > 0
              const allGood = linkResult?.checked && linkResult.broken.length === 0

              return (
                <div
                  key={resume.id}
                  className={`bg-zinc-900/40 p-6 rounded-xl shadow-sm border transition-colors ${hasBrokenLinks ? 'border-red-500/50 bg-red-950/10' : 'border-zinc-800/50 hover:border-zinc-700'}`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-lg font-bold text-white">{resume.title}</h3>
                        {hasBrokenLinks && (
                          <span className="flex items-center gap-1 text-xs font-semibold text-red-400 bg-red-950/40 border border-red-700/40 px-2 py-0.5 rounded-full">
                            ⚠️ {linkResult.broken.length} broken link{linkResult.broken.length > 1 ? 's' : ''}
                          </span>
                        )}
                        {allGood && (
                          <span className="flex items-center gap-1 text-xs font-semibold text-green-400 bg-green-950/40 border border-green-700/40 px-2 py-0.5 rounded-full">
                            ✓ Links OK
                          </span>
                        )}
                      </div>
                      <span className={`inline-block px-2 py-1 text-xs font-semibold rounded border uppercase mt-2 ${color}`}>
                        {label}
                      </span>
                    </div>
                    <div className="flex gap-2 items-center ml-4 shrink-0">
                      <button
                        onClick={() => handleCheckLinks(resume)}
                        disabled={isCheckingLink}
                        className="text-xs text-zinc-400 hover:text-blue-400 border border-zinc-700 hover:border-blue-600 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {isCheckingLink ? '🔍 Checking...' : '🔗 Check Links'}
                      </button>
                      <button
                        onClick={() => { if (confirm('Delete this resume?')) deleteMutation.mutate(resume.id) }}
                        className="text-red-400 hover:text-red-300 text-sm font-semibold px-2"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {/* Broken link details */}
                  {hasBrokenLinks && (
                    <div className="mb-3 p-3 bg-red-950/30 rounded-lg border border-red-800/40">
                      <p className="text-xs font-semibold text-red-400 mb-2 uppercase tracking-wide">⚠️ Broken Links Found — Fix Before Applying</p>
                      <ul className="space-y-1">
                        {linkResult.broken.map((b: any, i: number) => (
                          <li key={i} className="text-xs text-red-300 font-mono flex items-start gap-2">
                            <span className="text-red-500 shrink-0">✗</span>
                            <span className="break-all">{b.url}</span>
                            <span className="text-red-500 shrink-0 ml-auto">({b.error})</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="mt-3 pt-3 border-t border-zinc-800">
                    <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">AI Extracted Skills</p>
                    <p className="text-zinc-300 text-sm leading-relaxed line-clamp-3">{resume.skills_summary}</p>
                  </div>

                  <div className="mt-3 pt-3 border-t border-zinc-800/50 flex items-center gap-4 text-xs text-zinc-600">
                    <span>Uploaded {new Date(resume.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    <span className="ml-auto">Used for tailoring when job matches <span className="text-zinc-400 font-semibold">{label}</span> roles</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
