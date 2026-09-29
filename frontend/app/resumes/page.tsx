'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useMemo } from 'react'
import { useApiClient } from '@/lib/useApiClient'
import { 
  FileText, 
  Upload, 
  Trash2, 
  CheckCircle2, 
  AlertTriangle, 
  Link as LinkIcon, 
  Search, 
  Sparkles, 
  Copy, 
  Check, 
  ExternalLink,
  ShieldCheck,
  RefreshCw
} from 'lucide-react'

const TYPE_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  genai:      { label: 'GenAI / Machine Learning', color: 'text-purple-300 border-purple-500/30', bg: 'bg-purple-500/10' },
  backend:    { label: 'Backend Engineering',      color: 'text-blue-300 border-blue-500/30',   bg: 'bg-blue-500/10' },
  frontend:   { label: 'Frontend / UI',            color: 'text-cyan-300 border-cyan-500/30',   bg: 'bg-cyan-500/10' },
  fullstack:  { label: 'Full Stack Engineering',   color: 'text-teal-300 border-teal-500/30',   bg: 'bg-teal-500/10' },
  data:       { label: 'Data Engineering',         color: 'text-amber-300 border-amber-500/30', bg: 'bg-amber-500/10' },
  product:    { label: 'Product & Technical Lead',  color: 'text-pink-300 border-pink-500/30',   bg: 'bg-pink-500/10' },
  design:     { label: 'Systems & Design',         color: 'text-rose-300 border-rose-500/30',   bg: 'bg-rose-500/10' },
  other:      { label: 'General Technical',        color: 'text-zinc-300 border-zinc-700/50',   bg: 'bg-zinc-800' },
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
  const [linkResults, setLinkResults] = useState<Record<string, { checked: boolean; broken: any[] }>>({})
  const [checkingLinks, setCheckingLinks] = useState<Record<string, boolean>>({})
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([])
  const [showCompareModal, setShowCompareModal] = useState(false)

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

  const handleCopyTitle = (id: string, text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const toggleCompare = (id: string) => {
    setSelectedForCompare(prev => {
      if (prev.includes(id)) {
        return prev.filter(x => x !== id)
      } else {
        if (prev.length >= 3) {
          alert("You can compare up to 3 resume variants at a time.")
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
      const matchesSearch = !searchQuery || 
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
    <div className="max-w-5xl mx-auto space-y-8 pb-16 font-sans">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 border-b border-zinc-800/80 pb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white shadow-[0_0_20px_rgba(99,102,241,0.3)] border border-indigo-400/20">
              <FileText className="w-5 h-5" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Resume Intelligence Hub
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-zinc-400 max-w-2xl leading-relaxed">
            Multi-resume intelligence engine. Evaluates micro-specializations (e.g., Agentic AI vs RAG vs Model Fine-Tuning) and dynamically selects the highest-scoring version for each job.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {selectedForCompare.length > 0 && (
            <button
              onClick={() => setShowCompareModal(true)}
              className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white px-4 py-2 rounded-2xl text-xs font-bold transition-all shadow-[0_0_15px_rgba(147,51,234,0.3)] flex items-center gap-2 active:scale-95"
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-200" />
              <span>Compare ({selectedForCompare.length}) Variants</span>
            </button>
          )}

          <div className="bg-zinc-900/60 px-4 py-2 rounded-2xl border border-zinc-800/80 text-right">
            <span className="text-2xl font-black text-white">{resumes?.length ?? 0}</span>
            <p className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Active Versions</p>
          </div>
        </div>
      </div>

      {/* Upload Dropzone */}
      <div className="bg-zinc-900/50 p-6 sm:p-8 rounded-3xl shadow-xl border border-zinc-800/80 backdrop-blur-xl">
        <form onSubmit={handleUpload} className="space-y-4">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5 mb-2">
              <Upload className="w-3.5 h-3.5 text-indigo-400" />
              Upload New Resume Variant (PDF)
            </label>
            <div className="relative border-2 border-dashed border-zinc-800 hover:border-indigo-500/60 rounded-2xl p-6 transition-all text-center group bg-zinc-950/40">
              <input
                type="file"
                accept=".pdf"
                id="resumeFileInput"
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              <div className="flex flex-col items-center justify-center space-y-2 pointer-events-none">
                <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 group-hover:text-indigo-400 group-hover:scale-110 transition-all">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs sm:text-sm font-semibold text-zinc-200">
                    {file ? file.name : 'Drop your PDF here or click to browse'}
                  </p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">
                    {file ? `${(file.size / 1024).toFixed(1)} KB` : 'Our LLM parser automatically extracts skills, sub-specializations, and core pillars'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!file || isUploading}
              className="bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white px-6 py-2.5 rounded-xl font-bold text-xs transition-all shadow-[0_0_20px_rgba(79,70,229,0.3)] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 active:scale-95"
            >
              {isUploading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-white" />
                  <span>Extracting Skills & Parsing...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-indigo-200" />
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
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search resumes by title, specializations (e.g. Agentic, RAG, PyTorch), or frameworks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-900/60 border border-zinc-800/80 rounded-2xl pl-9 pr-4 py-2.5 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30 transition-all"
            />
          </div>

          {/* Type Filter Pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
                filterType === 'all'
                  ? 'bg-zinc-800 text-white border-zinc-700 shadow-sm'
                  : 'bg-zinc-900/60 text-zinc-400 border-zinc-800/80 hover:text-zinc-200'
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
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border flex items-center gap-1.5 ${
                    isSelected
                      ? `${info.bg} ${info.color} shadow-sm font-bold`
                      : 'bg-zinc-900/60 text-zinc-400 border-zinc-800/80 hover:text-zinc-200'
                  }`}
                >
                  <span>{info.label}</span>
                  <span className="text-[10px] opacity-75 font-bold">({count})</span>
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
            <div className="h-36 bg-zinc-900/60 rounded-3xl border border-zinc-800/60"></div>
            <div className="h-36 bg-zinc-900/60 rounded-3xl border border-zinc-800/60"></div>
          </div>
        ) : filteredResumes.length === 0 ? (
          <div className="bg-zinc-900/40 p-12 rounded-3xl border border-zinc-800/60 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-xl mx-auto text-zinc-500">
              📄
            </div>
            <h3 className="text-sm font-bold text-white">No resumes found</h3>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto">
              {resumes?.length === 0 ? 'Upload your first PDF resume above to start scoring against live job openings.' : 'No resume versions match your current query or category filter.'}
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

              return (
                <div
                  key={resume.id}
                  className={`bg-zinc-900/60 p-6 rounded-3xl border transition-all shadow-md space-y-4 ${
                    isSelectedForCompare
                      ? 'border-indigo-500/80 bg-indigo-950/20'
                      : hasBrokenLinks 
                        ? 'border-rose-500/40 bg-rose-950/10' 
                        : 'border-zinc-800/80 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div className="space-y-2 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Domain Track Badge */}
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${info.bg} ${info.color}`}>
                          {info.label}
                        </span>

                        {/* Specialization Badge */}
                        {resume.specialization && (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-500/15 text-purple-300 border border-purple-500/30">
                            {resume.specialization}
                          </span>
                        )}

                        {/* Matched Openings Badge */}
                        {(resume.jobs_matched_count || 0) > 0 && (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                            ⚡ {resume.jobs_matched_count} Matched Openings
                          </span>
                        )}

                        {hasBrokenLinks && (
                          <span className="flex items-center gap-1 text-[11px] font-bold text-rose-400 bg-rose-500/10 border border-rose-500/30 px-2 py-0.5 rounded-full">
                            <AlertTriangle className="w-3 h-3" />
                            {linkResult.broken.length} Broken Link{linkResult.broken.length > 1 ? 's' : ''}
                          </span>
                        )}

                        {allGood && (
                          <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                            <ShieldCheck className="w-3 h-3" /> Verified Links OK
                          </span>
                        )}
                      </div>

                      <h3 className="text-base sm:text-lg font-bold text-white truncate pr-2">
                        {resume.title}
                      </h3>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {/* Compare Checkbox Button */}
                      <button
                        onClick={() => toggleCompare(resume.id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border flex items-center gap-1.5 active:scale-95 ${
                          isSelectedForCompare
                            ? 'bg-indigo-600 text-white border-indigo-500'
                            : 'bg-zinc-800/80 hover:bg-zinc-800 text-zinc-300 border-zinc-700'
                        }`}
                        title="Add to Variant Comparison matrix"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>{isSelectedForCompare ? 'Selected' : 'Compare'}</span>
                      </button>

                      <button
                        onClick={() => handleCopyTitle(resume.id, resume.title)}
                        className="bg-zinc-800/80 hover:bg-zinc-800 text-zinc-300 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border border-zinc-700 flex items-center gap-1.5 active:scale-95"
                        title="Copy resume title for portal submission"
                      >
                        {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{isCopied ? 'Copied' : 'Copy Title'}</span>
                      </button>

                      <button
                        onClick={() => handleCheckLinks(resume)}
                        disabled={isCheckingLink}
                        className="text-xs text-zinc-300 hover:text-white bg-zinc-800/80 hover:bg-zinc-800 border border-zinc-700 px-3 py-1.5 rounded-xl transition-all disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {isCheckingLink ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                        ) : (
                          <LinkIcon className="w-3.5 h-3.5 text-indigo-400" />
                        )}
                        <span>{isCheckingLink ? 'Verifying...' : 'Check Links'}</span>
                      </button>

                      <button
                        onClick={() => { if (confirm('Permanently delete this resume variant?')) deleteMutation.mutate(resume.id) }}
                        className="p-1.5 text-zinc-500 hover:text-rose-400 rounded-xl hover:bg-rose-500/10 transition-colors"
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
                        <span key={i} className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-zinc-800/80 border border-zinc-700 text-zinc-300">
                          {skill}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Broken link alert box */}
                  {hasBrokenLinks && (
                    <div className="p-3.5 bg-rose-500/10 rounded-2xl border border-rose-500/30 space-y-2">
                      <p className="text-xs font-bold text-rose-400 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Broken URLs Found — Fix in your document before submitting:
                      </p>
                      <ul className="space-y-1 text-[11px] text-rose-300/80 font-mono">
                        {linkResult.broken.map((b: any, i: number) => (
                          <li key={i} className="flex items-center gap-2">
                            <span className="text-rose-400">✗</span>
                            <span className="truncate">{b.url}</span>
                            <span className="text-rose-400/80 ml-auto shrink-0">({b.error})</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Differentiators & Summary */}
                  <div className="pt-3 border-t border-zinc-800/80 space-y-2">
                    {resume.unique_differentiators && resume.unique_differentiators.length > 0 && (
                      <div className="flex items-center gap-2 flex-wrap text-xs text-indigo-300">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Variant Advantage:</span>
                        {resume.unique_differentiators.map((diff: string, i: number) => (
                          <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-[11px] font-medium text-indigo-200">
                            ★ {diff}
                          </span>
                        ))}
                      </div>
                    )}

                    <p className="text-xs text-zinc-400 leading-relaxed font-normal line-clamp-2">
                      {resume.skills_summary || 'No skills extracted yet.'}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-zinc-800/60 flex items-center justify-between text-[11px] text-zinc-500">
                    <span>Uploaded {new Date(resume.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    <span className="text-zinc-400 font-medium">Mapped to {info.label} requisitions</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Comparison Matrix Modal */}
      {showCompareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="bg-zinc-950 border border-zinc-800 rounded-3xl max-w-4xl w-full p-6 sm:p-8 space-y-6 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
              <div>
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-indigo-400" />
                  Resume Variant Differential Matrix
                </h3>
                <p className="text-xs text-zinc-400 mt-1">
                  Side-by-side analysis of your selected resumes to distinguish focus and selection triggers.
                </p>
              </div>
              <button
                onClick={() => setShowCompareModal(false)}
                className="text-zinc-500 hover:text-white p-2 rounded-xl hover:bg-zinc-900 transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {compareResumesList.map((r: any) => (
                <div key={r.id} className="bg-zinc-900/80 border border-zinc-800 p-5 rounded-2xl space-y-4 flex flex-col justify-between">
                  <div className="space-y-3">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/30">
                      {r.specialization || r.target_type}
                    </span>
                    <h4 className="text-sm font-bold text-white">{r.title}</h4>
                    
                    <div className="space-y-1.5 pt-2 border-t border-zinc-800/80">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block">Core Tech Stack</span>
                      <div className="flex flex-wrap gap-1">
                        {r.key_skills?.map((s: string, idx: number) => (
                          <span key={idx} className="text-[10px] font-semibold bg-zinc-800 border border-zinc-700 px-1.5 py-0.5 rounded text-zinc-300">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1.5 pt-2 border-t border-zinc-800/80">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block">Differential Edge</span>
                      <p className="text-[11px] text-indigo-300 leading-relaxed">
                        {r.unique_differentiators?.[0] || 'Targeted domain focus for this specialized role family.'}
                      </p>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between text-xs">
                    <span className="text-zinc-400">Pipeline Match:</span>
                    <span className="font-bold text-emerald-400">{r.jobs_matched_count || 0} Openings</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setShowCompareModal(false)}
                className="bg-zinc-800 hover:bg-zinc-700 text-white px-5 py-2 rounded-xl text-xs font-bold transition-all"
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
