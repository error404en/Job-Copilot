'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import Link from 'next/link'
import {
  Inbox,
  Upload,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  ArrowRight,
  Building2,
  Trash2,
  Check,
  RefreshCcw,
  FileText,
  ExternalLink,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useApiClient } from '@/lib/useApiClient'

export default function LeadInboxPage() {
  const queryClient = useQueryClient()
  const { fetch: apiFetch, isLoaded, isSignedIn } = useApiClient()

  const [textInput, setTextInput] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isParsing, setIsParsing] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Fetch parsed opportunities
  const { data: oppsData, isLoading: isLoadingOpps, refetch } = useQuery({
    queryKey: ['inbox_opportunities'],
    enabled: isLoaded && !!isSignedIn,
    queryFn: async () => {
      const res = await apiFetch("/api/inbox/opportunities")
      if (!res.ok) throw new Error('Failed to load opportunities')
      return res.json()
    },
  })

  // Submit Text Lead
  const handleParseText = async () => {
    if (!textInput.trim()) return
    setIsParsing(true)
    setErrorMessage(null)
    setStatusMessage('Parsing and scoring leads against Primary Resume...')

    try {
      const res = await apiFetch('/api/inbox/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_type: 'text',
          content: textInput.trim(),
        }),
      })

      if (!res.ok) throw new Error('Failed to parse lead content')
      setStatusMessage('Lead queued for AI extraction and fit scoring.')
      setTimeout(() => {
        refetch()
        setIsParsing(false)
        setStatusMessage(null)
      }, 2000)
    } catch (err: any) {
      setErrorMessage(err.message || 'Error parsing lead')
      setIsParsing(false)
    }
  }

  // Submit File Lead
  const handleFileUpload = async (file: File) => {
    setIsParsing(true)
    setErrorMessage(null)
    setStatusMessage(`Uploading and extracting from ${file.name}...`)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('source_type', file.type.startsWith('image/') ? 'image' : 'document')

      const res = await apiFetch('/api/inbox/upload', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) throw new Error('Failed to upload file lead')
      setStatusMessage('File extracted and parsed into structured leads.')
      setSelectedFile(null)
      setTimeout(() => {
        refetch()
        setIsParsing(false)
        setStatusMessage(null)
      }, 2500)
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to upload lead')
      setIsParsing(false)
    }
  }

  // Listen for Ctrl+V paste anywhere on the page to immediately upload screenshot/image
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile()
          if (file) {
            e.preventDefault()
            setSelectedFile(file)
            handleFileUpload(file)
            break
          }
        }
      }
    }

    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [])

  // Save / Promote Opportunity to Main Jobs Feed
  const saveOppMutation = useMutation({
    mutationFn: async (oppId: string) => {
      const res = await apiFetch(`/api/inbox/opportunities/${oppId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save' }),
      })
      if (!res.ok) throw new Error('Failed to save opportunity to feed')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inbox_opportunities'] })
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
  })

  // Reject Opportunity
  const rejectOppMutation = useMutation({
    mutationFn: async (oppId: string) => {
      const res = await apiFetch(`/api/inbox/opportunities/${oppId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject' }),
      })
      if (!res.ok) throw new Error('Failed to archive opportunity')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inbox_opportunities'] })
    },
  })

  // List of parsed leads (fallback to sample parsed leads if none in db yet)
  const opportunities = useMemo(() => {
    const raw = oppsData?.opportunities || []
    if (raw.length > 0) {
      return raw.map((o: any) => {
        const meta = o.extraction_metadata || {}
        const score = typeof meta.copilot_score === 'number' ? meta.copilot_score : 85
        return {
          id: o.id,
          title: o.role_title || 'Software Engineer',
          company: o.company || 'Tech Fleet',
          source: o.source_type || 'Pasted Link',
          score: String(score),
          color: score >= 85 ? '#5EEAA8' : '#8C97FF',
          status: o.job_id ? 'Promoted' : 'Scored',
          statusColor: o.job_id ? '#5EEAA8' : '#8C97FF',
          jobId: o.job_id,
        }
      })
    }

    return [
      {
        id: 'lead-1',
        title: 'Backend Engineer Intern',
        company: 'Northwind Labs',
        source: 'Greenhouse link',
        score: '91',
        color: '#5EEAA8',
        status: 'Scored',
        statusColor: '#5EEAA8',
      },
      {
        id: 'lead-2',
        title: 'AI Engineer Intern',
        company: 'Quillstone',
        source: 'Pasted text',
        score: '88',
        color: '#5EEAA8',
        status: 'Scored',
        statusColor: '#5EEAA8',
      },
      {
        id: 'lead-3',
        title: 'Platform Intern',
        company: 'Cedar Works',
        source: 'Screenshot',
        score: '81',
        color: '#8C97FF',
        status: 'Scored',
        statusColor: '#8C97FF',
      },
    ]
  }, [oppsData])

  return (
    <div className="min-h-screen bg-[#050507] text-[#F3EFE7] font-sans">
      <main className="max-w-[1360px] mx-auto px-4 sm:px-8 py-10 flex flex-col gap-9">
        {/* Header with Switcher */}
        <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-2 border-b border-white/[0.08]">
          <div className="flex flex-col gap-2 max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs uppercase tracking-wider text-[#8C97FF]">/ Lead inbox</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/10 text-[#C9C6BE] border border-white/15">
                Batch Ingest
              </span>
            </div>
            <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl leading-[1.04]">
              Paste it. <i className="italic text-[#A9A59C]">We parse it.</i>
            </h1>
            <p className="text-base sm:text-lg leading-relaxed text-[#B4B1A9]">
              Drop in job links, copied descriptions or press <kbd className="px-1.5 py-0.5 rounded bg-white/10 border border-white/20 text-[#F3EFE7] font-mono text-xs">Ctrl+V</kbd> to paste a screenshot. Each lead becomes a structured, scored role.
            </p>
          </div>

          <div className="flex items-center p-1 rounded-full bg-white/5 border border-white/10 shrink-0">
            <Link
              href="/jobs/new"
              className="px-3.5 py-1.5 rounded-full text-xs font-medium text-[#C9C6BE] hover:text-white transition flex items-center gap-1.5"
              title="Single Requisition Parser & Screenshot OCR Studio"
            >
              <span>Single JD & OCR Studio ↗</span>
            </Link>
            <span className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-[#F3EFE7] text-[#0A0A0C] shadow-sm">
              Batch Lead Inbox
            </span>
          </div>
        </header>

        {/* 2-Column Responsive Workspace */}
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          {/* Left Column: Input Panel */}
          <section className="glass w-full lg:flex-[1.1] min-w-0 p-7 flex flex-col gap-4 rounded-2xl">
            <label htmlFor="leads" className="font-mono text-xs uppercase tracking-wider text-[#A8A59D]">
              Paste links or job text
            </label>

            <textarea
              id="leads"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Paste one or many leads. Include the job title, company name, requirement bullets or direct application link. Separate multiple leads with a blank line."
              className="ta"
              rows={8}
            />

            {/* File Dropzone */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  const f = e.target.files[0]
                  setSelectedFile(f)
                  handleFileUpload(f)
                }
              }}
              accept=".pdf,.png,.jpg,.jpeg,.txt"
              className="hidden"
            />

            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                  const f = e.dataTransfer.files[0]
                  setSelectedFile(f)
                  handleFileUpload(f)
                }
              }}
              className="drop p-7 rounded-2xl border border-dashed border-white/25 hover:border-[#8C97FF] hover:bg-[#8C97FF]/[0.06] text-center cursor-pointer transition flex flex-col items-center gap-1.5"
            >
              <Upload className="w-5 h-5 text-[#8C97FF] mb-1" />
              <div className="text-sm font-medium text-[#F3EFE7]">
                {selectedFile ? selectedFile.name : 'Drop files here, or click to browse'}
              </div>
              <div className="text-xs text-[#A8A59D]">PDF, PNG, JPG or plain text JD snippets</div>
            </div>

            {/* Status & Error Messages */}
            {statusMessage && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{statusMessage}</span>
              </div>
            )}

            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <button
                onClick={handleParseText}
                disabled={isParsing || !textInput.trim()}
                className="pill pill-c flex items-center gap-2"
              >
                {isParsing && <RefreshCcw className="w-3.5 h-3.5 animate-spin" />}
                <span>{isParsing ? 'Parsing and scoring...' : 'Parse leads'}</span>
              </button>

              <button
                onClick={() => {
                  setTextInput('')
                  setSelectedFile(null)
                  setErrorMessage(null)
                  setStatusMessage(null)
                }}
                className="pill pill-g"
              >
                Clear
              </button>
            </div>
          </section>

          {/* Right Column: Parsed Leads List */}
          <section aria-label="Parsed leads" className="w-full lg:flex-[1] min-w-0 flex flex-col gap-3.5">
            <div className="flex justify-between items-baseline px-1">
              <span className="font-mono text-xs uppercase tracking-wider text-[#A8A59D]">
                Parsed leads ({opportunities.length})
              </span>
              <span className="font-serif text-2xl text-[#A9A59C]">{opportunities.length}</span>
            </div>

            <div className="flex flex-col gap-3">
              {opportunities.map((l: any) => (
                <div
                  key={l.id}
                  className="glass p-5 rounded-2xl flex items-center gap-4 border border-white/10 hover:border-white/20 transition"
                >
                  <span
                    className="font-serif text-4xl leading-none shrink-0 w-14 text-center"
                    style={{ color: l.color }}
                  >
                    {l.score}
                  </span>

                  <div className="flex-1 min-w-0 flex flex-col gap-1">
                    <span className="text-base font-semibold text-[#F3EFE7] tracking-tight">{l.title}</span>
                    <span className="text-xs text-[#C9C6BE]">
                      {l.company} · {l.source}
                    </span>

                    <div className="flex items-center gap-2 pt-1.5">
                      <Link
                        href={`/?q=${encodeURIComponent(l.company)}`}
                        className="text-xs font-mono text-[#8C97FF] hover:underline flex items-center gap-1"
                      >
                        <span>View in Jobs Feed</span>
                        <ArrowRight className="w-3 h-3" />
                      </Link>
                    </div>
                  </div>

                  <span
                    className="font-mono text-[11px] px-2.5 py-1 rounded-full shrink-0 border"
                    style={{
                      color: l.statusColor,
                      borderColor: `${l.statusColor}40`,
                      backgroundColor: `${l.statusColor}15`,
                    }}
                  >
                    {l.status}
                  </span>
                </div>
              ))}
            </div>

            {opportunities.length === 0 && (
              <div className="border border-dashed border-white/20 rounded-2xl p-6 text-sm text-[#A8A59D] leading-relaxed">
                Nothing parsed yet. Paste a job link or text snippet on the left and select Parse leads.
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}
