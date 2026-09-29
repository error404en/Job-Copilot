'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useApiClient } from '@/lib/useApiClient'
import { 
  Sparkles, 
  FileText, 
  Mail, 
  Copy, 
  Check, 
  Download, 
  AlertTriangle, 
  ChevronRight, 
  RefreshCw, 
  Sliders, 
  Flame, 
  ExternalLink,
  Plus
} from 'lucide-react'

interface TailoringStudioProps {
  jobId: string
  missingKeywords: string[]
  companyName?: string
  roleTitle?: string
  initialPrompt?: string
}

const TONE_PRESETS = [
  { id: 'metrics', label: '📊 Metrics & High Impact', prompt: 'Emphasize quantifiable metrics, latency reductions, and business impact.' },
  { id: 'architecture', label: '⚙️ Systems Architecture', prompt: 'Highlight distributed system design, clean abstractions, and scalability.' },
  { id: 'stack', label: '🛠️ Deep Tech Stack', prompt: 'Focus heavily on hands-on backend APIs, concurrency, and database tuning.' },
  { id: 'ownership', label: '🚀 Product Ownership', prompt: 'Showcase autonomous problem solving, cross-functional velocity, and end-to-end shipping.' },
]

export default function TailoringStudio({ 
  jobId, 
  missingKeywords = [], 
  companyName = 'Company', 
  roleTitle = 'Software Engineer',
  initialPrompt = ''
}: TailoringStudioProps) {
  const { fetch: apiFetch } = useApiClient()
  const [activeTab, setActiveTab] = useState<'bullets' | 'cover-letter'>('bullets')
  
  const [bullets, setBullets] = useState<string[] | null>(null)
  const [brokenLinks, setBrokenLinks] = useState<any[] | null>(null)
  const [coverLetter, setCoverLetter] = useState<string | null>(null)
  const [copiedAll, setCopiedAll] = useState(false)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const [docxError, setDocxError] = useState<string | null>(null)
  
  const [onePageOnly, setOnePageOnly] = useState(false)
  const [customInstructions, setCustomInstructions] = useState(initialPrompt)
  const [activePreset, setActivePreset] = useState<string | null>(null)

  const tailorMutation = useMutation({
    mutationFn: async (type: 'resume' | 'cover-letter') => {
      const res = await apiFetch(`/api/jobs/${jobId}/tailor/${type}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          custom_instructions: customInstructions,
          one_page_only: onePageOnly
        })
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: `Failed to generate ${type}` }))
        throw new Error(err.detail || `Failed to generate ${type}`)
      }
      return res.json()
    },
    onSuccess: (data, type) => {
      if (type === 'resume') {
        setBullets(data.bullets)
        setBrokenLinks(data.broken_links || [])
      } else {
        setCoverLetter(data.cover_letter)
      }
    }
  })

  const docxMutation = useMutation({
    mutationFn: async () => {
      setDocxError(null)
      const res = await apiFetch(`/api/jobs/${jobId}/tailor/download-docx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          one_page_only: onePageOnly,
          custom_instructions: customInstructions
        })
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Unknown error' }))
        throw new Error(err.detail || `Server error ${res.status}`)
      }
      const disposition = res.headers.get('Content-Disposition') || ''
      const nameMatch = disposition.match(/filename="?([^"]+)"?/)
      const filename = nameMatch ? nameMatch[1] : `Resume_${companyName.replace(/\s+/g, '_')}.docx`

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    },
    onError: (err: Error) => {
      setDocxError(err.message)
    }
  })

  const handleGenerate = () => {
    tailorMutation.mutate(activeTab === 'bullets' ? 'resume' : 'cover-letter')
  }

  const handleApplyPreset = (preset: typeof TONE_PRESETS[0]) => {
    if (activePreset === preset.id) {
      setActivePreset(null)
      setCustomInstructions(prev => prev.replace(preset.prompt, '').trim())
    } else {
      setActivePreset(preset.id)
      setCustomInstructions(prev => {
        const clean = prev.trim()
        return clean ? `${clean}\n${preset.prompt}` : preset.prompt
      })
    }
  }

  const handleAddKeywordToPrompt = (kw: string) => {
    const keywordInstruction = `Weave in proficiency with ${kw}.`
    if (customInstructions.includes(kw)) {
      setCustomInstructions(prev => 
        prev.replace(keywordInstruction, '').replace(new RegExp(`Weave in.*?${kw}\\.?`, 'gi'), '').trim()
      )
    } else {
      setCustomInstructions(prev => {
        const clean = prev.trim()
        return clean ? `${clean}\n${keywordInstruction}` : keywordInstruction
      })
    }
  }

  const copyToClipboard = (text: string, index?: number) => {
    navigator.clipboard.writeText(text)
    if (typeof index === 'number') {
      setCopiedIndex(index)
      setTimeout(() => setCopiedIndex(null), 2000)
    } else {
      setCopiedAll(true)
      setTimeout(() => setCopiedAll(false), 2000)
    }
  }

  return (
    <div className="bg-zinc-900/60 rounded-2xl border border-zinc-800/80 shadow-[0_8px_30px_rgb(0,0,0,0.16)] backdrop-blur-xl overflow-hidden font-sans">
      
      {/* Studio Header Bar */}
      <div className="p-6 border-b border-zinc-800/80 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gradient-to-r from-zinc-950/80 via-zinc-900/40 to-indigo-950/20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
            <Sparkles className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              Application Tailoring Studio
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Llama 3.3 70B
              </span>
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Targeted resume optimization and cover letter synthesis for <span className="text-zinc-200 font-semibold">{companyName}</span>
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center bg-zinc-950/80 p-1 rounded-xl border border-zinc-800/80 shadow-inner">
          <button
            onClick={() => setActiveTab('bullets')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'bullets'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            Resume Bullets
          </button>
          <button
            onClick={() => setActiveTab('cover-letter')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'cover-letter'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
            }`}
          >
            <Mail className="w-3.5 h-3.5" />
            Targeted Letter
          </button>
        </div>
      </div>

      {/* Main Studio 2-Column Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[500px]">
        
        {/* Left Column: Parameter & Gap Control Panel (4 Cols) */}
        <div className="lg:col-span-5 p-6 border-b lg:border-b-0 lg:border-r border-zinc-800/80 bg-zinc-950/40 flex flex-col justify-between space-y-6">
          <div className="space-y-5">
            
            {/* 1. Missing Keywords Alignment */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5 text-amber-400" />
                  ATS Keyword Optimization
                </label>
                <span className="text-[10px] text-zinc-500 font-medium">Click to include</span>
              </div>

              {missingKeywords.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto custom-scrollbar p-1">
                  {missingKeywords.map((kw: string) => {
                    const isAdded = customInstructions.includes(kw)
                    return (
                      <button
                        key={kw}
                        onClick={() => handleAddKeywordToPrompt(kw)}
                        className={`text-xs px-2.5 py-1 rounded-lg border transition-all flex items-center gap-1 font-medium ${
                          isAdded
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                            : 'bg-amber-500/10 text-amber-300 border-amber-500/20 hover:border-amber-500/40 hover:bg-amber-500/20'
                        }`}
                        title="Click to weave into prompt instructions"
                      >
                        {isAdded ? <Check className="w-3 h-3 text-emerald-400" /> : <Plus className="w-3 h-3 text-amber-400" />}
                        {kw}
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Your base resume already encompasses all required keywords for this job!</span>
                </div>
              )}
            </div>

            {/* 2. Tone & Impact Presets */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5 mb-2">
                <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                Strategic Emphasis Presets
              </label>
              <div className="grid grid-cols-2 gap-2">
                {TONE_PRESETS.map((p) => {
                  const isSelected = activePreset === p.id
                  return (
                    <button
                      key={p.id}
                      onClick={() => handleApplyPreset(p)}
                      className={`text-left p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                        isSelected 
                          ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-200 shadow-sm'
                          : 'bg-zinc-900/70 border-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                      }`}
                    >
                      {p.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 3. Custom Directives Textarea */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                  Custom AI Directives
                </label>
                {customInstructions && (
                  <button 
                    onClick={() => setCustomInstructions('')} 
                    className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>
              <textarea
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                placeholder="e.g. Highlight distributed caching, emphasize Rubrik infrastructure stack, focus on Python & Java projects..."
                rows={3}
                className="w-full bg-zinc-900/90 border border-zinc-800/80 rounded-xl p-3 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30 transition-all custom-scrollbar resize-none"
              />
            </div>

            {/* 4. Formatting Toggles */}
            <div className="p-3 bg-zinc-900/50 rounded-xl border border-zinc-800/70 flex items-center justify-between">
              <label htmlFor="onePageOnlyStudio" className="text-xs text-zinc-300 font-medium cursor-pointer flex flex-col">
                <span className="font-semibold text-white">Strict 1-Page Layout</span>
                <span className="text-[11px] text-zinc-500">Concise bullet density tuned for ATS single-page screeners</span>
              </label>
              <input
                type="checkbox"
                id="onePageOnlyStudio"
                checked={onePageOnly}
                onChange={(e) => setOnePageOnly(e.target.checked)}
                className="w-4 h-4 rounded bg-zinc-950 border-zinc-700 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
            </div>
          </div>

          {/* Action Trigger Box */}
          <div className="space-y-3 pt-2">
            <button
              onClick={handleGenerate}
              disabled={tailorMutation.isPending}
              className="w-full bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white py-3 rounded-xl font-bold text-sm transition-all shadow-[0_0_20px_rgba(79,70,229,0.3)] hover:shadow-[0_0_25px_rgba(79,70,229,0.45)] disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.99]"
            >
              {tailorMutation.isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                  <span>Synthesizing Tailored {activeTab === 'bullets' ? 'Bullets' : 'Letter'}...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-indigo-200" />
                  <span>Generate Tailored {activeTab === 'bullets' ? 'Bullets' : 'Cover Letter'}</span>
                </>
              )}
            </button>

            {/* One-click Full Tailored Resume DOCX */}
            <button
              onClick={() => docxMutation.mutate()}
              disabled={docxMutation.isPending}
              className="w-full bg-zinc-800/80 hover:bg-zinc-800 text-zinc-200 hover:text-white py-2.5 rounded-xl font-semibold text-xs transition-all border border-zinc-700/80 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {docxMutation.isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                  <span>Assembling Tailored Resume (.docx)...</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Download Tailored Resume (.docx)</span>
                </>
              )}
            </button>

            {docxError && (
              <div className="bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs p-3 rounded-xl flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{docxError}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Live Workspace Canvas (7 Cols) */}
        <div className="lg:col-span-7 p-6 bg-zinc-950/20 flex flex-col justify-between">
          
          {tailorMutation.isPending ? (
            /* Loading Shimmer State */
            <div className="h-full flex flex-col justify-center items-center py-16 space-y-4">
              <div className="relative">
                <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                  <Sparkles className="w-6 h-6 text-indigo-400 animate-pulse" />
                </div>
                <div className="absolute -inset-1 rounded-2xl border-2 border-indigo-500/30 border-t-indigo-500 animate-spin"></div>
              </div>
              <div className="text-center">
                <h4 className="text-sm font-bold text-white">Synthesizing with Groq Llama 3.3 70B</h4>
                <p className="text-xs text-zinc-500 mt-1 max-w-sm">
                  Analyzing job requisition requirements and aligning experience bullets for maximum ATS match score...
                </p>
              </div>
            </div>
          ) : activeTab === 'bullets' && bullets && bullets.length > 0 ? (
            /* Generated Bullets Canvas */
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400" />
                    Tailored Resume Bullets ({bullets.length})
                  </h3>
                  <p className="text-[11px] text-zinc-500 mt-0.5">Optimized for ATS parsers and technical hiring managers</p>
                </div>
                <button
                  onClick={() => copyToClipboard(bullets.map(b => `• ${b}`).join('\n'))}
                  className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 border border-zinc-700/80 active:scale-95"
                >
                  {copiedAll ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-zinc-400" />}
                  {copiedAll ? 'Copied All' : 'Copy All'}
                </button>
              </div>

              {/* Broken Links Alert */}
              {brokenLinks && brokenLinks.length > 0 && (
                <div className="bg-rose-500/10 border border-rose-500/20 p-3.5 rounded-xl">
                  <h5 className="text-xs font-bold text-rose-400 flex items-center gap-1.5 mb-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Broken Hyperlinks Detected in Resume
                  </h5>
                  <ul className="text-[11px] text-rose-300/80 space-y-1 list-disc list-inside">
                    {brokenLinks.map((l: any, i: number) => (
                      <li key={i}>
                        <span className="font-mono text-rose-200">{l.url}</span>
                        <span className="opacity-70 ml-1">({l.error})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Interactive Bullet List */}
              <div className="space-y-2.5 max-h-[460px] overflow-y-auto custom-scrollbar pr-1">
                {bullets.map((bullet, idx) => {
                  const isCopied = copiedIndex === idx
                  return (
                    <div 
                      key={idx} 
                      className="group bg-zinc-900/80 hover:bg-zinc-900 border border-zinc-800/80 hover:border-zinc-700 p-4 rounded-xl text-xs text-zinc-200 leading-relaxed transition-all relative flex items-start gap-3 shadow-sm"
                    >
                      <span className="text-[10px] font-bold text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20 shrink-0 mt-0.5">
                        #{idx + 1}
                      </span>
                      <p className="flex-1 pr-6 font-normal text-zinc-300">{bullet}</p>
                      <button
                        onClick={() => copyToClipboard(bullet, idx)}
                        className={`absolute top-3 right-3 p-1.5 rounded-lg transition-all ${
                          isCopied 
                            ? 'bg-emerald-500/20 text-emerald-300' 
                            : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 opacity-0 group-hover:opacity-100'
                        }`}
                        title="Copy bullet"
                      >
                        {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : activeTab === 'cover-letter' && coverLetter ? (
            /* Generated Cover Letter Canvas */
            <div className="space-y-4 flex flex-col h-full">
              <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Mail className="w-4 h-4 text-indigo-400" />
                    Targeted Cover Letter for {companyName}
                  </h3>
                  <p className="text-[11px] text-zinc-500 mt-0.5">
                    {coverLetter.trim().split(/\s+/).length} words • Approx 1 min read
                  </p>
                </div>
                <button
                  onClick={() => copyToClipboard(coverLetter)}
                  className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 border border-zinc-700/80 active:scale-95"
                >
                  {copiedAll ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-zinc-400" />}
                  {copiedAll ? 'Copied' : 'Copy Letter'}
                </button>
              </div>

              <textarea
                value={coverLetter}
                onChange={(e) => setCoverLetter(e.target.value)}
                className="flex-1 w-full bg-zinc-900/80 border border-zinc-800/80 p-4 rounded-xl text-xs text-zinc-300 leading-relaxed custom-scrollbar resize-none focus:outline-none focus:border-indigo-500/50 min-h-[360px]"
              />
            </div>
          ) : (
            /* Interactive Blueprint State (No Empty Black Pit!) */
            <div className="h-full flex flex-col justify-center items-center p-6 text-center space-y-5 my-auto">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-300 shadow-[0_0_20px_rgba(99,102,241,0.15)]">
                <Sparkles className="w-6 h-6" />
              </div>

              <div className="max-w-md space-y-2">
                <h3 className="text-base font-bold text-white tracking-tight">
                  Ready to Tailor for {roleTitle}
                </h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Our LLM engine will analyze your candidate profile, integrate verified {companyName} technical requirements, and formulate targeted STAR-method bullets.
                </p>
              </div>

              {/* Blueprint Preview Skeleton Cards */}
              <div className="w-full max-w-md space-y-2.5 text-left opacity-60 pointer-events-none select-none">
                <div className="p-3 bg-zinc-900/60 rounded-xl border border-dashed border-zinc-800 text-[11px] text-zinc-400 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span>Architected distributed data pipelines with Python & SQL, cutting job latency by 35%...</span>
                </div>
                <div className="p-3 bg-zinc-900/60 rounded-xl border border-dashed border-zinc-800 text-[11px] text-zinc-400 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                  <span>Spearheaded microservice resilience testing to guarantee 99.9% uptime targets...</span>
                </div>
              </div>

              <button
                onClick={handleGenerate}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl font-bold text-xs transition-all shadow-md flex items-center gap-2 active:scale-95"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Synthesize {activeTab === 'bullets' ? 'Resume Bullets' : 'Cover Letter'} Now</span>
              </button>
            </div>
          )}

          {/* Quick Footer Metric */}
          <div className="border-t border-zinc-800/60 pt-3 mt-4 flex items-center justify-between text-[11px] text-zinc-500">
            <span>Powered by Groq Hardware Accelerators</span>
            <span className="text-zinc-400">Strict ATS Anti-Hallucination Guardrails Active</span>
          </div>

        </div>

      </div>

    </div>
  )
}
