'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import {
  FileText,
  Upload,
  Trash2,
  Check,
  RefreshCw,
  Star,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  X,
  Search,
  ArrowUpRight,
} from 'lucide-react'
import { useApiClient } from '@/lib/useApiClient'

export default function ResumesPage() {
  const queryClient = useQueryClient()
  const { fetch: apiFetch, isLoaded, isSignedIn } = useApiClient()

  const [primaryResumeId, setPrimaryResumeId] = useState<string | null>(null)
  const [selectedResumeId, setSelectedResumeId] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [syncSuccessMsg, setSyncSuccessMsg] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Fetch resumes from backend
  const { data: resumes, isLoading } = useQuery({
    queryKey: ['resumes'],
    enabled: isLoaded && !!isSignedIn,
    queryFn: async () => {
      const res = await apiFetch('/api/resumes')
      if (!res.ok) throw new Error('Failed to fetch resumes')
      return res.json()
    },
  })

  // Load / initialize primary resume from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('jobcopilot_primary_resume_id')
      if (saved) {
        setPrimaryResumeId(saved)
        setSelectedResumeId(saved)
      }
    }
  }, [])

  useEffect(() => {
    if (resumes && resumes.length > 0 && !primaryResumeId) {
      setPrimaryResumeId(resumes[0].id)
      setSelectedResumeId(resumes[0].id)
    }
  }, [resumes, primaryResumeId])

  const handleSetPrimary = (resume: any) => {
    setPrimaryResumeId(resume.id)
    setSelectedResumeId(resume.id)
    if (typeof window !== 'undefined') {
      localStorage.setItem('jobcopilot_primary_resume_id', resume.id)
      localStorage.setItem('jobcopilot_primary_resume_title', resume.title || 'Primary Resume.pdf')
    }
  }

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('title', file.name)
      const res = await apiFetch('/api/resumes/upload', {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) throw new Error('Failed to upload resume')
      return res.json()
    },
    onSuccess: (newResume) => {
      setIsUploading(false)
      queryClient.invalidateQueries({ queryKey: ['resumes'] })
      if (!primaryResumeId) {
        handleSetPrimary(newResume)
      }
    },
    onError: (err: any) => {
      setIsUploading(false)
      setUploadError(err.message || 'Upload failed')
    },
  })

  // Sync profile from primary resume mutation
  const syncProfileMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch('/api/profile/sync-from-resume', { method: 'POST' })
      if (!res.ok) throw new Error('Failed to sync profile from resume')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] })
      setSyncSuccessMsg('Candidate Auto-Fill profile synced from Primary Resume.')
      setTimeout(() => setSyncSuccessMsg(null), 3500)
    },
  })

  // Delete resume mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/api/resumes/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete resume')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resumes'] })
    },
  })

  // Document list
  const docList = useMemo(() => {
    if (isSignedIn && resumes && Array.isArray(resumes) && resumes.length > 0) {
      return resumes.map((r: any) => {
        const isPrimary = r.id === primaryResumeId
        return {
          id: r.id,
          name: r.title || 'Primary_Resume.pdf',
          tag: isPrimary ? 'Primary' : 'Variant',
          tagBg: isPrimary ? '#2F3DFF' : 'rgba(255,255,255,0.1)',
          tagFg: isPrimary ? '#FFFFFF' : '#D8D4CA',
          meta: isPrimary ? 'Parsed and ready · Used for every fit score' : (r.specialization || 'Tailored track'),
          border: isPrimary ? 'rgba(140,151,255,0.6)' : 'rgba(255,255,255,0.1)',
          raw: r,
        }
      })
    }

    // Sample documents when logged out
    return [
      {
        id: 'r1',
        name: 'Primary_Resume.pdf',
        tag: 'Primary',
        tagBg: '#2F3DFF',
        tagFg: '#FFFFFF',
        meta: 'Parsed and ready · Used for every fit score',
        border: 'rgba(140,151,255,0.6)',
        raw: null,
      },
      {
        id: 'r2',
        name: 'Backend_Focus.pdf',
        tag: 'Variant',
        tagBg: 'rgba(255,255,255,0.1)',
        tagFg: '#D8D4CA',
        meta: 'Tailored for backend and distributed systems',
        border: 'rgba(255,255,255,0.1)',
        raw: null,
      },
      {
        id: 'r3',
        name: 'AI_Engineer_Focus.pdf',
        tag: 'Variant',
        tagBg: 'rgba(255,255,255,0.1)',
        tagFg: '#D8D4CA',
        meta: 'Tailored for AI and LLM pipeline engineering',
        border: 'rgba(255,255,255,0.1)',
        raw: null,
      },
    ]
  }, [isSignedIn, resumes, primaryResumeId])

  // Active selected resume
  const activeDoc = useMemo(() => {
    return docList.find((d) => d.id === selectedResumeId) || docList[0]
  }, [docList, selectedResumeId])

  // Extracted skills
  const skills = useMemo(() => {
    const rawSkills = activeDoc.raw?.key_skills
    if (Array.isArray(rawSkills) && rawSkills.length > 0) {
      return rawSkills
    }
    const title = (activeDoc.name || activeDoc.raw?.title || '').toLowerCase()
    if (title.includes('sales')) {
      return ['Technical Sales', 'Solution Architecture', 'Product Demos', 'FastAPI', 'AI Integration', 'Client Discovery', 'API Design', 'Client POCs']
    }
    if (title.includes('full stack') || title.includes('full-stack') || title.includes('ui')) {
      return ['React', 'Next.js', 'TypeScript', 'Tailwind CSS', 'FastAPI', 'PostgreSQL', 'D3.js', 'Vercel']
    }
    if (title.includes('distributed') || title.includes('cloud')) {
      return ['Distributed Systems', 'Docker', 'PostgreSQL', 'Kafka', 'Microservices', 'Python', 'FastAPI', 'Cloud Scale']
    }
    if (title.includes('backend')) {
      return ['FastAPI', 'Python', 'PostgreSQL', 'REST APIs', 'Microservices', 'Docker', 'Qdrant', 'Supabase']
    }
    if (title.includes('applied ai') || title.includes('specialist')) {
      return ['Applied AI', 'PyTorch', 'Transformers', 'Model Fine-Tuning', 'Python', 'FastAPI', 'Evaluation', 'Groq']
    }
    if (title.includes('ai') || title.includes('generative')) {
      return ['Generative AI', 'RAG', 'LangChain', 'Qdrant', 'PyTorch', 'Prompt Engineering', 'OpenAI GPT-4o', 'Llama 4']
    }
    return ['Python', 'FastAPI', 'React', 'TypeScript', 'PostgreSQL', 'Docker', 'REST APIs', 'Git']
  }, [activeDoc])

  // Extracted projects
  const projects = useMemo(() => {
    const rawProjects = activeDoc.raw?.parsed_projects
    if (Array.isArray(rawProjects) && rawProjects.length > 0) {
      return rawProjects
    }
    const title = (activeDoc.name || activeDoc.raw?.title || '').toLowerCase()
    if (title.includes('sales')) {
      return [
        {
          name: 'Technical Solution Demonstrations',
          line: 'Designed end-to-end client demonstrations for AI pipelines, explaining system architecture and quantifiable ROI.',
          url: 'https://github.com/error404en',
        },
        {
          name: 'ATS Integration Architecture',
          line: 'Authored technical specifications and API bridge workflows for enterprise Greenhouse, Lever, and Workday systems.',
          url: 'https://github.com/error404en/Job-Copilot',
        },
        {
          name: 'Customer Discovery Prototypes',
          line: 'Built rapid proof-of-concept prototypes translating customer workflow requirements into verified technical delivery.',
          url: 'https://github.com/error404en/LitLensAI',
        },
      ]
    }
    if (title.includes('full stack') || title.includes('full-stack') || title.includes('ui')) {
      return [
        {
          name: 'JobCopilot Platform',
          line: 'Full-stack application with Next.js, React, TypeScript, FastAPI backend, Supabase Postgres, and live Vercel deployment.',
          url: 'https://github.com/error404en/Job-Copilot',
        },
        {
          name: 'LitLens AI Academic Portal',
          line: 'Interactive RAG platform with custom UI, inline citation grounding, hybrid RetrievalCache (<50ms), and Inngest background workers.',
          url: 'https://github.com/error404en/LitLensAI',
        },
        {
          name: 'Story-SLM Generative Studio',
          line: 'Full-stack generative studio with Next.js dynamic theme engine, real-time D3.js token visualizer, and FastAPI inference service.',
          url: 'https://github.com/error404en/SLM-Creative-Story-',
        },
      ]
    }
    if (title.includes('distributed') || title.includes('cloud')) {
      return [
        {
          name: 'JobCopilot Requisition Engine',
          line: 'High-throughput asynchronous scraping fleet, multi-provider LLM fallback chain, and PostgreSQL job ingestion pipelines.',
          url: 'https://github.com/error404en/Job-Copilot',
        },
        {
          name: 'Distributed Document RAG Microservices',
          line: 'Multi-node vector search architecture over 300+ technical documents with PyMuPDF/OCR ingestion and sub-100ms latency.',
          url: 'https://github.com/error404en',
        },
        {
          name: 'Two-Tier Retrieval Cache Layer',
          line: 'Engineered Redis and memory caching layer reducing repeat model inference and vector lookups by 72%.',
          url: 'https://github.com/error404en/LitLensAI',
        },
      ]
    }
    if (title.includes('backend')) {
      return [
        {
          name: 'Enterprise Document RAG Pipeline',
          line: 'FastAPI microservices over 300+ technical documents with PyMuPDF/OCR ingestion and <150ms vector search latency.',
          url: 'https://github.com/error404en',
        },
        {
          name: 'JobCopilot Requisition Engine',
          line: 'Multi-tier ATS scraping fleet, 6-model LLM fallback chain, and asynchronous PostgreSQL job ingestion pipelines.',
          url: 'https://github.com/error404en/Job-Copilot',
        },
        {
          name: 'LitLens Cache Architecture',
          line: 'Engineered two-layer RetrievalCache and PromptCache architecture cutting repeat query latency to under 50ms.',
          url: 'https://github.com/error404en/LitLensAI',
        },
      ]
    }
    if (title.includes('applied ai') || title.includes('specialist')) {
      return [
        {
          name: 'Story-SLM Evaluation & Benchmarking',
          line: 'Compact language model evaluation harness measuring retrieval recall, token latency, and perplexity across datasets.',
          url: 'https://github.com/error404en/SLM-Creative-Story-',
        },
        {
          name: 'LitLens AI Citation Grounding',
          line: 'Engineered 1000-char semantic chunking with Qdrant vector retrieval and two-pass hallucination safeguards.',
          url: 'https://github.com/error404en/LitLensAI',
        },
        {
          name: 'EchoSight 2.0 Multimodal Assistant',
          line: 'Sub-2s vision assistant combining Llama 4 Scout Vision, Groq Whisper, and offline float16 YOLOv8n object detection.',
          url: 'https://github.com/error404en/echosight2.0',
        },
      ]
    }
    return [
      {
        name: 'Story-SLM Transformer',
        line: 'Trained a 29M-parameter GPT transformer from scratch in PyTorch with custom BPE tokenizer on TinyStories dataset.',
        url: 'https://github.com/error404en/SLM-Creative-Story-',
      },
      {
        name: 'EchoSight 2.0 Multimodal Assistant',
        line: 'Sub-2s vision assistant combining Llama 4 Scout Vision, Groq Whisper, and offline float16 YOLOv8n object detection.',
        url: 'https://github.com/error404en/echosight2.0',
      },
      {
        name: 'LitLens AI Citation Grounding',
        line: 'Engineered 1000-char semantic chunking with Qdrant vector retrieval and two-pass hallucination safeguards.',
        url: 'https://github.com/error404en/LitLensAI',
      },
    ]
  }, [activeDoc])

  return (
    <div className="min-h-screen bg-[#050507] text-[#F3EFE7] font-sans">
      <main className="max-w-[1360px] mx-auto px-4 sm:px-8 py-10 flex flex-col gap-9">
        {/* Header */}
        <header className="flex flex-wrap gap-5 items-end justify-between">
          <div className="flex flex-col gap-2.5">
            <span className="font-mono text-xs uppercase tracking-wider text-[#8C97FF]">/ Resume vault</span>
            <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl leading-[1.04]">
              Versions that <i className="italic text-[#A9A59C]">stay organised.</i>
            </h1>
          </div>

          <div className="flex items-center gap-2.5">
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  setIsUploading(true)
                  uploadMutation.mutate(e.target.files[0])
                }
              }}
              accept=".pdf,.docx"
              className="hidden"
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="pill pill-c flex items-center gap-2 h-11 cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>{isUploading ? 'Uploading...' : 'Upload a resume'}</span>
            </button>
          </div>
        </header>

        {/* Sync message */}
        {syncSuccessMsg && (
          <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{syncSuccessMsg}</span>
          </div>
        )}

        {/* 2-Column Responsive Workspace */}
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          {/* Left Column: Your Resumes */}
          <section aria-label="Your resumes" className="w-full lg:flex-[1.1] min-w-0 flex flex-col gap-3.5">
            <span className="font-mono text-xs uppercase tracking-wider text-[#A8A59D] px-1">
              Your resume files ({docList.length})
            </span>

            <div className="flex flex-col gap-3">
              {docList.map((d) => {
                const isSelected = activeDoc.id === d.id
                const isPrimary = d.tag === 'Primary'

                return (
                  <div
                    key={d.id}
                    onClick={() => setSelectedResumeId(d.id)}
                    className={`glass doc p-5 rounded-2xl flex items-center gap-4 cursor-pointer transition border ${
                      isSelected
                        ? 'border-[#8C97FF] bg-white/[0.05] shadow-[0_0_20px_rgba(140,151,255,0.1)]'
                        : 'border-white/10 hover:border-white/20'
                    }`}
                  >
                    {/* Mini PDF icon */}
                    <div
                      className="shrink-0 w-11 h-14 rounded-lg bg-[#F3EFE7] flex flex-col justify-between p-2"
                      aria-hidden="true"
                    >
                      <div className="h-1 bg-[#0A0A0C] w-3/5 rounded-full" />
                      <div className="h-0.5 bg-[#9A9890] w-full rounded-full" />
                      <div className="h-0.5 bg-[#9A9890] w-full rounded-full" />
                      <div className="h-0.5 bg-[#9A9890] w-4/5 rounded-full" />
                    </div>

                    {/* Metadata */}
                    <div className="flex-1 min-w-0 flex flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-semibold text-[#F3EFE7] truncate">{d.name}</span>
                        <span
                          className="font-mono text-[10px] px-2.5 py-0.5 rounded-full"
                          style={{ background: d.tagBg, color: d.tagFg }}
                        >
                          {d.tag}
                        </span>
                      </div>
                      <span className="text-xs text-[#A8A59D] truncate">{d.meta}</span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {!isPrimary && (
                        <button
                          onClick={() => handleSetPrimary(d.raw || d)}
                          className="h-8 px-3 rounded-full text-xs font-mono uppercase tracking-wider bg-white/5 border border-white/15 text-[#C9C6BE] hover:text-[#F3EFE7] hover:bg-white/10 transition cursor-pointer"
                          title="Set as Primary Resume"
                        >
                          Make primary
                        </button>
                      )}
                      {d.raw?.id && (
                        <button
                          onClick={() => {
                            if (confirm(`Delete ${d.name}?`)) {
                              deleteMutation.mutate(d.raw.id)
                            }
                          }}
                          className="w-8 h-8 rounded-full flex items-center justify-center text-[#A8A59D] hover:text-rose-400 hover:bg-white/10 transition cursor-pointer"
                          title="Delete Resume"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Drop PDF box */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border border-dashed border-white/25 hover:border-[#8C97FF] rounded-2xl p-6 text-center text-xs text-[#A8A59D] cursor-pointer transition"
            >
              Drop a PDF here to add a role-specific version.
            </div>
          </section>

          {/* Right Column: Parsed Profile Inspector */}
          <aside
            aria-label="Parsed profile"
            className="glass w-full lg:flex-[1.2] min-w-0 p-7 sm:p-8 flex flex-col gap-6 rounded-2xl sticky top-20 shadow-xl"
          >
            <div className="flex justify-between items-center gap-3 pb-3 border-b border-white/10">
              <div className="flex flex-col gap-0.5">
                <span className="font-mono text-xs uppercase tracking-wider text-[#8C97FF]">What JobCopilot read</span>
                <span className="text-sm font-semibold text-[#F3EFE7] truncate max-w-sm">{activeDoc.name}</span>
              </div>
              <span className="inline-flex items-center gap-2 text-xs text-[#A7F3D0]">
                <span className="w-2 h-2 rounded-full bg-[#5EEAA8]" />
                <span>Parsed and ready</span>
              </span>
            </div>

            {/* Skills (Clickable chips to search feed) */}
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] uppercase tracking-wider text-[#A8A59D]">
                  Extracted Skills (Click to filter feed)
                </span>
                <span className="text-[10px] font-mono text-[#8C97FF]">{skills.length} skills</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {skills.map((s: string, idx: number) => (
                  <Link
                    key={idx}
                    href={`/?q=${encodeURIComponent(s)}`}
                    className="text-xs px-3 py-1 rounded-full bg-[#8C97FF]/10 hover:bg-[#8C97FF]/25 border border-[#8C97FF]/35 text-[#C9CCFF] hover:text-white font-mono transition cursor-pointer flex items-center gap-1 group"
                    title={`Search jobs matching ${s}`}
                  >
                    <span>{s}</span>
                    <Search className="w-2.5 h-2.5 opacity-60 group-hover:opacity-100" />
                  </Link>
                ))}
              </div>
            </div>

            {/* Projects (Clickable to view details / github) */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] uppercase tracking-wider text-[#A8A59D]">Projects detected</span>
                <span className="text-[10px] font-mono text-zinc-500">Verified from resume</span>
              </div>
              <div className="flex flex-col divide-y divide-white/10">
                {projects.map((p: any, idx: number) => (
                  <div
                    key={idx}
                    onClick={() => p.url && window.open(p.url, '_blank')}
                    className="pt-3 pb-3 flex flex-col gap-1 hover:bg-white/[0.04] cursor-pointer -mx-2 px-2 rounded-lg transition group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-serif text-xl sm:text-2xl text-[#F3EFE7] group-hover:text-[#8C97FF] transition leading-tight">{p.name}</span>
                      {p.url && (
                        <a
                          href={p.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs text-[#8C97FF] hover:underline flex items-center gap-1 font-mono"
                        >
                          <span>Repository</span>
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                    <span className="text-xs sm:text-sm text-[#A8A59D] leading-relaxed">{p.line}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Tip Box */}
            <div className="bg-[#FFC861]/[0.08] border border-[#FFC861]/35 rounded-2xl p-4 flex gap-3 items-start">
              <span className="font-mono text-[11px] uppercase tracking-wider text-[#FFC861] shrink-0 pt-0.5">Tip</span>
              <span className="text-xs text-[#FFE2A8] leading-relaxed">
                Add measurable results to your project bullets (e.g. &apos;reduced latency by 40%&apos;). They raise your fit score on most requisitions.
              </span>
            </div>

            {/* Sync Action */}
            <button
              onClick={() => syncProfileMutation.mutate()}
              disabled={syncProfileMutation.isPending}
              className="pill pill-c w-full text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncProfileMutation.isPending ? 'animate-spin' : ''}`} />
              <span>Sync Auto-Fill Identity from this Resume</span>
            </button>
          </aside>
        </div>
      </main>
    </div>
  )
}
