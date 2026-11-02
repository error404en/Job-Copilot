'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useMemo, useEffect } from 'react'
import { useApiClient } from '@/lib/useApiClient'
import {
  FileText,
  Upload,
  Trash2,
  AlertTriangle,
  Link as LinkIcon,
  Search,
  Sparkles,
  Copy,
  Check,
  ShieldCheck,
  RefreshCw,
  Star,
  UserCheck,
  X
} from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'

const TYPE_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  genai:     { label: 'GenAI / Machine Learning', color: 'text-[#c3c0ff] border-[#5b5bd6]/35', bg: 'bg-[#5b5bd6]/12' },
  backend:   { label: 'Backend Engineering',      color: 'text-[#45dfa4] border-[#45dfa4]/35', bg: 'bg-[#45dfa4]/10' },
  frontend:  { label: 'Frontend / UI',            color: 'text-[#c3c0ff] border-[#5b5bd6]/35', bg: 'bg-[#5b5bd6]/12' },
  fullstack: { label: 'Full Stack Engineering',   color: 'text-[#45dfa4] border-[#45dfa4]/35', bg: 'bg-[#45dfa4]/10' },
  data:      { label: 'Data Engineering',         color: 'text-[#ffb77e] border-[#ffb77e]/35', bg: 'bg-[#ffb77e]/10' },
  product:   { label: 'Product & Technical Lead', color: 'text-[#ffb77e] border-[#ffb77e]/35', bg: 'bg-[#ffb77e]/10' },
  design:    { label: 'Systems & Design',         color: 'text-[#c3c0ff] border-[#5b5bd6]/35', bg: 'bg-[#5b5bd6]/12' },
  other:     { label: 'General Technical',        color: 'text-[#918f9f] border-[#464553]/40', bg: 'bg-[#282a2e]' },
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
    },
  })

  const [file, setFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [filterType, setFilterType] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [linkResults, setLinkResults] = useState<Record<string, { checked: boolean; broken: any[] }>>({})
  const [checkingLinks, setCheckingLinks] = useState<Record<string, boolean>>({})
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([])
  const [showCompareModal, setShowCompareModal] = useState(false)
  const [primaryResumeId, setPrimaryResumeId] = useState<string | null>(null)
  const [syncSuccessMsg, setSyncSuccessMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedPrimary = localStorage.getItem('jobcopilot_primary_resume_id')
      if (savedPrimary) setPrimaryResumeId(savedPrimary)
    }
  }, [])

  useEffect(() => {
    if (resumes && resumes.length > 0 && !primaryResumeId) {
      setPrimaryResumeId(resumes[0].id)
    }
  }, [resumes, primaryResumeId])

  const handleSetPrimary = (resume: any) => {
    setPrimaryResumeId(resume.id)
    if (typeof window !== 'undefined') {
      localStorage.setItem('jobcopilot_primary_resume_id', resume.id)
      localStorage.setItem('jobcopilot_primary_resume_title', resume.title || 'Primary Resume.pdf')
    }
  }

  const syncProfileMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch('/api/profile/sync-from-resume', { method: 'POST' })
      if (!res.ok) throw new Error('Failed to sync identity from resume')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] })
      setSyncSuccessMsg('Candidate Auto-Fill Identity synced from Primary Resume')
      setTimeout(() => setSyncSuccessMsg(null), 3500)
    },
  })

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
      setErrorMsg(err.message || 'Upload failed')
      setTimeout(() => setErrorMsg(null), 4000)
    },
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
    onError: (err: any) => {
      setErrorMsg(err.message || 'Failed to delete resume')
      setTimeout(() => setErrorMsg(null), 4000)
    },
  })

  const handleUpload = (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return
    setIsUploading(true)
    uploadMutation.mutate(file)
  }

  const handleCheckLinks = async (resume: any) => {
    setCheckingLinks((prev) => ({ ...prev, [resume.id]: true }))
    try {
      const res = await apiFetch(`/api/resumes/${resume.id}/check-links`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setLinkResults((prev) => ({ ...prev, [resume.id]: { checked: true, broken: data.broken_links || [] } }))
      } else {
        setLinkResults((prev) => ({ ...prev, [resume.id]: { checked: true, broken: [] } }))
      }
    } catch {
      setLinkResults((prev) => ({ ...prev, [resume.id]: { checked: true, broken: [] } }))
    } finally {
      setCheckingLinks((prev) => ({ ...prev, [resume.id]: false }))
    }
  }

  const handleCopyTitle = (id: string, text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const toggleCompare = (id: string) => {
    setSelectedForCompare((prev) => {
      if (prev.includes(id)) {
        return prev.filter((x) => x !== id)
      } else {
        if (prev.length >= 3) {
          setErrorMsg('You can compare up to 3 resume variants at a time.')
          setTimeout(() => setErrorMsg(null), 4000)
          return prev
        }
        return [...prev, id]
      }
    })
  }

  const availableTypes: string[] = useMemo(() => {
    if (!resumes) return []
    const types = Array.from(new Set(resumes.map((r: any) => r.target_type as string)))
    return types.filter(Boolean) as string[]
  }, [resumes])

  const filteredResumes = useMemo(() => {
    if (!resumes) return []
    return resumes.filter((r: any) => {
      const matchesType = filterType === 'all' || r.target_type === filterType
      const matchesSearch =
        !searchQuery ||
        r.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.skills_summary?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.specialization?.toLowerCase().includes(searchQuery.toLowerCase())
      return matchesType && matchesSearch
    })
  }, [resumes, filterType, searchQuery])

  const compareResumesList = useMemo(() => {
    if (!resumes) return []
    return resumes.filter((r: any) => selectedForCompare.includes(r.id))
  }, [resumes, selectedForCompare])

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6 pb-16 font-sans">
      <PageHeader
        suite="Resume Vault & Auto-Fill Identity"
        title="Resume Vault"
        subtitle="Manage your PDF resume variants, select your Primary Resume for job match scoring, and sync extracted identity tokens to the Auto-Fill Kit."
        icon={FileText}
        badge={`${resumes?.length ?? 0} Variants`}
        badgeColor="emerald"
        actions={
          <div className="flex items-center gap-2.5 flex-wrap">
            {selectedForCompare.length > 0 && (
              <button
                onClick={() => setShowCompareModal(true)}
                className="bg-[#282a2e] hover:bg-[#32343a] border border-[#5b5bd6]/40 text-[#c3c0ff] px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#5b5bd6]" />
                <span>Compare ({selectedForCompare.length})</span>
              </button>
            )}
            <button
              onClick={() => syncProfileMutation.mutate()}
              disabled={syncProfileMutation.isPending}
              className="bg-[#5b5bd6] hover:bg-[#4f4fc7] text-white px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 disabled:opacity-50"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>{syncProfileMutation.isPending ? 'Syncing Identity...' : 'Sync Identity to Auto-Fill'}</span>
            </button>
          </div>
        }
      />

      {syncSuccessMsg && (
        <div className="bg-[#45dfa4]/10 border border-[#45dfa4]/30 text-[#45dfa4] px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Check className="w-4 h-4" />
            {syncSuccessMsg}
          </span>
          <button onClick={() => setSyncSuccessMsg(null)} className="text-[#45dfa4]/80 hover:text-[#45dfa4]">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-between">
          <span className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            {errorMsg}
          </span>
          <button onClick={() => setErrorMsg(null)} className="text-rose-400/80 hover:text-rose-400">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Upload Dropzone */}
      <div className="bg-[#1a1c20] p-6 rounded-xl border border-[#464553]/35">
        <form onSubmit={handleUpload} className="space-y-4">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-[#918f9f] flex items-center gap-1.5 mb-2.5">
              <Upload className="w-3.5 h-3.5 text-[#5b5bd6]" />
              Upload Resume Variant (PDF)
            </label>
            <div className="relative border border-dashed border-[#464553]/60 hover:border-[#5b5bd6] rounded-xl p-6 transition-all text-center group bg-[#0c0e12]">
              <input
                type="file"
                accept=".pdf"
                id="resumeFileInput"
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              <div className="flex flex-col items-center justify-center space-y-2 pointer-events-none">
                <div className="w-10 h-10 rounded-xl bg-[#1a1c20] border border-[#464553]/40 flex items-center justify-center text-[#918f9f] group-hover:text-[#5b5bd6] transition-all">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs sm:text-sm font-semibold text-[#e2e2e8]">
                    {file ? file.name : 'Drop your PDF resume here or click to browse'}
                  </p>
                  <p className="text-[11px] text-[#918f9f] mt-0.5">
                    {file
                      ? `${(file.size / 1024).toFixed(1)} KB`
                      : 'Automatically extracts skills, specialization track, and portfolio links'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!file || isUploading}
              className="bg-[#5b5bd6] hover:bg-[#4f4fc7] text-white px-5 py-2.5 rounded-xl font-semibold text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isUploading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-white" />
                  <span>Extracting Skills & Parsing...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Parse & Index Resume</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Filter and Search Bar */}
      {!isLoading && resumes && resumes.length > 0 && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#918f9f] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search resumes by title, specialization (e.g. GenAI, Backend, PyTorch), or skills..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#1a1c20] border border-[#464553]/35 rounded-xl pl-9 pr-4 py-2.5 text-xs text-[#e2e2e8] placeholder:text-[#918f9f] focus:outline-none focus:border-[#5b5bd6] transition-all"
            />
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                filterType === 'all'
                  ? 'bg-[#282a2e] text-[#e2e2e8] border-[#5b5bd6]/40'
                  : 'bg-[#1a1c20] text-[#918f9f] border-[#464553]/30 hover:text-[#e2e2e8]'
              }`}
            >
              All Variants ({resumes.length})
            </button>
            {availableTypes.map((type) => {
              const info = getTypeInfo(type)
              const count = resumes.filter((r: any) => r.target_type === type).length
              const isSelected = filterType === type
              return (
                <button
                  key={type}
                  onClick={() => setFilterType(isSelected ? 'all' : type)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border flex items-center gap-1.5 ${
                    isSelected
                      ? `${info.bg} ${info.color}`
                      : 'bg-[#1a1c20] text-[#918f9f] border-[#464553]/30 hover:text-[#e2e2e8]'
                  }`}
                >
                  <span>{info.label}</span>
                  <span className="text-[10px] opacity-75 font-mono">({count})</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Resume Cards Grid */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="space-y-4 animate-pulse">
            <div className="h-36 bg-[#1a1c20] rounded-xl border border-[#464553]/35" />
            <div className="h-36 bg-[#1a1c20] rounded-xl border border-[#464553]/35" />
          </div>
        ) : filteredResumes.length === 0 ? (
          <div className="bg-[#1a1c20] p-12 rounded-xl border border-[#464553]/35 text-center space-y-3">
            <div className="w-11 h-11 rounded-xl bg-[#0c0e12] border border-[#464553]/40 flex items-center justify-center mx-auto text-[#918f9f]">
              <FileText className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-[#e2e2e8]">No resumes found</h3>
            <p className="text-xs text-[#918f9f] max-w-sm mx-auto">
              {resumes?.length === 0
                ? 'Upload your first PDF resume above to start scoring against live job openings.'
                : 'No resume versions match your current query or category filter.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {filteredResumes.map((resume: any) => {
              const info = getTypeInfo(resume.target_type)
              const linkResult = linkResults[resume.id]
              const isCheckingLink = checkingLinks[resume.id]
              const hasBrokenLinks = linkResult?.checked && linkResult.broken.length > 0
              const allGood = linkResult?.checked && linkResult.broken.length === 0
              const isCopied = copiedId === resume.id
              const isSelectedForCompare = selectedForCompare.includes(resume.id)
              const isPrimary = primaryResumeId === resume.id

              return (
                <div
                  key={resume.id}
                  className={`bg-[#1a1c20] p-6 rounded-xl border transition-all space-y-4 ${
                    isPrimary
                      ? 'border-[#45dfa4]/45'
                      : isSelectedForCompare
                      ? 'border-[#5b5bd6]'
                      : hasBrokenLinks
                      ? 'border-rose-500/40'
                      : 'border-[#464553]/35 hover:border-[#464553]/60'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div className="space-y-2 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {isPrimary && (
                          <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-[#45dfa4]/12 text-[#45dfa4] border border-[#45dfa4]/35 flex items-center gap-1">
                            <Star className="w-3 h-3 fill-[#45dfa4]" /> Primary Active
                          </span>
                        )}

                        <span
                          className={`px-2.5 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider border ${info.bg} ${info.color}`}
                        >
                          {info.label}
                        </span>

                        {resume.specialization && (
                          <span className="px-2.5 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider bg-[#282a2e] text-[#e2e2e8] border border-[#464553]/40">
                            {resume.specialization}
                          </span>
                        )}

                        {(resume.jobs_matched_count || 0) > 0 && (
                          <span className="px-2.5 py-0.5 rounded-md text-[10px] font-semibold bg-[#45dfa4]/10 text-[#45dfa4] border border-[#45dfa4]/30 font-mono">
                            {resume.jobs_matched_count} Matched Roles
                          </span>
                        )}

                        {hasBrokenLinks && (
                          <span className="flex items-center gap-1 text-[11px] font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/30 px-2 py-0.5 rounded-md">
                            <AlertTriangle className="w-3 h-3" />
                            {linkResult.broken.length} Broken Link{linkResult.broken.length > 1 ? 's' : ''}
                          </span>
                        )}

                        {allGood && (
                          <span className="flex items-center gap-1 text-[11px] font-semibold text-[#45dfa4] bg-[#45dfa4]/10 border border-[#45dfa4]/30 px-2 py-0.5 rounded-md">
                            <ShieldCheck className="w-3 h-3" /> Verified Links OK
                          </span>
                        )}
                      </div>

                      <h3 className="text-base font-bold text-[#e2e2e8] truncate pr-2">{resume.title}</h3>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      {!isPrimary && (
                        <button
                          onClick={() => handleSetPrimary(resume)}
                          className="bg-[#0c0e12] hover:bg-[#282a2e] text-[#918f9f] hover:text-[#e2e2e8] px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border border-[#464553]/40 flex items-center gap-1.5"
                          title="Set as Primary Resume for scoring & Auto-Fill"
                        >
                          <Star className="w-3.5 h-3.5" />
                          <span>Set Primary</span>
                        </button>
                      )}

                      <button
                        onClick={() => toggleCompare(resume.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border flex items-center gap-1.5 ${
                          isSelectedForCompare
                            ? 'bg-[#5b5bd6] text-white border-[#5b5bd6]'
                            : 'bg-[#0c0e12] hover:bg-[#282a2e] text-[#e2e2e8] border-[#464553]/40'
                        }`}
                        title="Add to Variant Comparison matrix"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>{isSelectedForCompare ? 'Selected' : 'Compare'}</span>
                      </button>

                      <button
                        onClick={() => handleCopyTitle(resume.id, resume.title)}
                        className="bg-[#0c0e12] hover:bg-[#282a2e] text-[#e2e2e8] px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border border-[#464553]/40 flex items-center gap-1.5"
                      >
                        {isCopied ? <Check className="w-3.5 h-3.5 text-[#45dfa4]" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{isCopied ? 'Copied' : 'Copy Title'}</span>
                      </button>

                      <button
                        onClick={() => handleCheckLinks(resume)}
                        disabled={isCheckingLink}
                        className="text-xs text-[#e2e2e8] bg-[#0c0e12] hover:bg-[#282a2e] border border-[#464553]/40 px-3 py-1.5 rounded-lg transition-all disabled:opacity-50 flex items-center gap-1.5 font-semibold"
                      >
                        {isCheckingLink ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#5b5bd6]" />
                        ) : (
                          <LinkIcon className="w-3.5 h-3.5 text-[#5b5bd6]" />
                        )}
                        <span>{isCheckingLink ? 'Verifying...' : 'Verify Links'}</span>
                      </button>

                      <button
                        onClick={() => {
                          if (confirm('Permanently delete this resume variant?')) deleteMutation.mutate(resume.id)
                        }}
                        className="p-1.5 text-[#918f9f] hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition-colors"
                        title="Delete resume"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Key Skills Chips */}
                  {resume.key_skills && resume.key_skills.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {resume.key_skills.map((skill: string, i: number) => (
                        <span
                          key={i}
                          className="px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-[#0c0e12] border border-[#464553]/35 text-[#e2e2e8]"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Broken link alert box */}
                  {hasBrokenLinks && (
                    <div className="p-3.5 bg-rose-500/10 rounded-xl border border-rose-500/30 space-y-2">
                      <p className="text-xs font-bold text-rose-400 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Broken URLs Found — Fix in your PDF before submitting:
                      </p>
                      <ul className="space-y-1 text-[11px] text-rose-300 font-mono">
                        {linkResult.broken.map((b: any, i: number) => (
                          <li key={i} className="flex items-center gap-2">
                            <span className="truncate">{b.url}</span>
                            <span className="text-rose-400/80 ml-auto shrink-0">({b.error})</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Differentiators & Summary */}
                  <div className="pt-3 border-t border-[#464553]/25 space-y-2">
                    {resume.unique_differentiators && resume.unique_differentiators.length > 0 && (
                      <div className="flex items-center gap-2 flex-wrap text-xs">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-[#918f9f]">
                          Core Strengths:
                        </span>
                        {resume.unique_differentiators.map((diff: string, i: number) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#5b5bd6]/12 border border-[#5b5bd6]/30 text-[11px] font-medium text-[#c3c0ff]"
                          >
                            {diff}
                          </span>
                        ))}
                      </div>
                    )}

                    <p className="text-xs text-[#918f9f] leading-relaxed line-clamp-2">
                      {resume.skills_summary || 'No skills summary extracted yet.'}
                    </p>
                  </div>

                  <div className="pt-2.5 border-t border-[#464553]/20 flex items-center justify-between text-[11px] text-[#918f9f]">
                    <span>
                      Uploaded{' '}
                      {new Date(resume.created_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                    <span className="text-[#918f9f] font-medium">Mapped to {info.label} requisitions</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Comparison Matrix Modal */}
      {showCompareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-[#1a1c20] border border-[#464553]/45 rounded-2xl max-w-4xl w-full p-6 space-y-6 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-[#464553]/35 pb-4">
              <div>
                <h3 className="text-lg font-bold text-[#e2e2e8] flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-[#5b5bd6]" />
                  Resume Variant Comparison Matrix
                </h3>
                <p className="text-xs text-[#918f9f] mt-1">
                  Side-by-side comparison of your selected resume variants and domain focus.
                </p>
              </div>
              <button
                onClick={() => setShowCompareModal(false)}
                className="text-[#918f9f] hover:text-[#e2e2e8] p-2 rounded-lg hover:bg-[#282a2e] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {compareResumesList.map((r: any) => (
                <div
                  key={r.id}
                  className="bg-[#0c0e12] border border-[#464553]/35 p-5 rounded-xl space-y-4 flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <span className="px-2.5 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider bg-[#5b5bd6]/15 text-[#c3c0ff] border border-[#5b5bd6]/30">
                      {r.specialization || r.target_type}
                    </span>
                    <h4 className="text-sm font-bold text-[#e2e2e8]">{r.title}</h4>

                    <div className="space-y-1.5 pt-2 border-t border-[#464553]/25">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-[#918f9f] block">
                        Core Tech Stack
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {r.key_skills?.map((s: string, idx: number) => (
                          <span
                            key={idx}
                            className="text-[10px] font-medium bg-[#1a1c20] border border-[#464553]/35 px-1.5 py-0.5 rounded text-[#e2e2e8]"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1.5 pt-2 border-t border-[#464553]/25">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-[#918f9f] block">
                        Differential Edge
                      </span>
                      <p className="text-[11px] text-[#c3c0ff] leading-relaxed">
                        {r.unique_differentiators?.[0] || 'Targeted domain focus for this specialized role family.'}
                      </p>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-[#464553]/25 flex items-center justify-between text-xs">
                    <span className="text-[#918f9f]">Matched Roles:</span>
                    <span className="font-bold text-[#45dfa4] font-mono">{r.jobs_matched_count || 0} Openings</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setShowCompareModal(false)}
                className="bg-[#282a2e] hover:bg-[#33353a] text-[#e2e2e8] px-5 py-2 rounded-xl text-xs font-semibold transition-all"
              >
                Close Comparison
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
