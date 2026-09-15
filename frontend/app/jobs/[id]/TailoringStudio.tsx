'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useApiClient } from '@/lib/useApiClient'

interface TailoringStudioProps {
  jobId: string
  missingKeywords: string[]
}

export default function TailoringStudio({ jobId, missingKeywords }: TailoringStudioProps) {
  const { fetch: apiFetch } = useApiClient()
  const [activeTab, setActiveTab] = useState<'bullets' | 'cover-letter'>('bullets')
  
  const [bullets, setBullets] = useState<string[] | null>(null)
  const [brokenLinks, setBrokenLinks] = useState<any[] | null>(null)
  const [coverLetter, setCoverLetter] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [docxError, setDocxError] = useState<string | null>(null)
  
  const [onePageOnly, setOnePageOnly] = useState(false)
  const [customInstructions, setCustomInstructions] = useState("")

  const tailorMutation = useMutation({
    mutationFn: async (type: 'resume' | 'cover-letter') => {
      const res = await apiFetch(`/api/jobs/${jobId}/tailor/${type}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}) // Let backend determine best resume
      })
      if (!res.ok) throw new Error(`Failed to generate ${type}`)
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
      // Extract filename from Content-Disposition header
      const disposition = res.headers.get('Content-Disposition') || ''
      const nameMatch = disposition.match(/filename="?([^"]+)"?/)
      const filename = nameMatch ? nameMatch[1] : 'Tailored_Resume.docx'

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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }


  return (
    <div className="bg-zinc-900/40 p-1 rounded-2xl border border-zinc-800/50 shadow-2xl backdrop-blur-md overflow-hidden mt-8">
      {/* Premium Header */}
      <div className="bg-gradient-to-r from-blue-900/40 to-purple-900/20 p-6 border-b border-zinc-800/50 flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-3 tracking-tight">
            <span className="text-3xl">✨</span> Tailoring Studio
          </h2>
          <p className="text-zinc-400 text-sm mt-1">Powered by Llama 3.3 70B via Groq</p>
        </div>
        <div className="flex bg-zinc-950/50 p-1 rounded-lg border border-zinc-800">
          <button
            onClick={() => setActiveTab('bullets')}
            className={`px-4 py-2 rounded-md text-sm font-semibold transition-all ${
              activeTab === 'bullets' ? 'bg-blue-600 text-white shadow-lg' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
          >
            Resume Bullets
          </button>
          <button
            onClick={() => setActiveTab('cover-letter')}
            className={`px-4 py-2 rounded-md text-sm font-semibold transition-all ${
              activeTab === 'cover-letter' ? 'bg-blue-600 text-white shadow-lg' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
          >
            Cover Letter
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 min-h-[400px]">
        {/* Left Panel: The Gap */}
        <div className="border-r border-zinc-800/50 p-6 bg-zinc-950/30">
          <h3 className="font-bold text-white mb-4 flex items-center gap-2">
            <span className="text-amber-500">🎯</span> Missing Keywords
          </h3>
          <p className="text-xs text-zinc-500 mb-4 leading-relaxed">
            These keywords are present in the Job Description but missing from your current profile. We will weave them into your tailored content.
          </p>
          
          {missingKeywords.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {missingKeywords.map((kw: string) => (
                <span key={kw} className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-3 py-1 rounded-full text-xs font-medium">
                  {kw}
                </span>
              ))}
            </div>
          ) : (
            <div className="bg-green-500/10 text-green-400 border border-green-500/20 p-4 rounded-xl text-sm font-medium text-center">
              Your base resume already contains all key requirements!
            </div>
          )}

          <div className="mt-8 space-y-3">
            <button
              onClick={handleGenerate}
              disabled={tailorMutation.isPending}
              className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-500 transition-all shadow-lg shadow-blue-900/20 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {tailorMutation.isPending ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Generating...
                </>
              ) : (
                `Generate ${activeTab === 'bullets' ? 'Bullets' : 'Letter'}`
              )}
            </button>

            {/* Download Tailored .docx Resume */}
            <div className="border-t border-zinc-800/60 pt-4 space-y-3">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="onePageOnly"
                  checked={onePageOnly}
                  onChange={(e) => setOnePageOnly(e.target.checked)}
                  className="rounded bg-zinc-900 border-zinc-700 text-emerald-600 focus:ring-emerald-600"
                />
                <label htmlFor="onePageOnly" className="text-sm text-zinc-300 cursor-pointer font-medium">
                  Strictly 1-Page Resume
                </label>
              </div>
              <div>
                <textarea
                  placeholder="Additional custom instructions (e.g., focus on frontend, keep project X)..."
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  className="w-full bg-zinc-900/50 border border-zinc-700/50 rounded-lg p-2 text-sm text-zinc-300 placeholder:text-zinc-600 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all custom-scrollbar resize-y min-h-[60px]"
                />
              </div>
              <button
                onClick={() => docxMutation.mutate()}
                disabled={docxMutation.isPending}
                className="w-full bg-gradient-to-r from-emerald-700 to-teal-700 hover:from-emerald-600 hover:to-teal-600 text-white py-3 rounded-xl font-bold transition-all shadow-lg shadow-emerald-900/20 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {docxMutation.isPending ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Building Resume...
                  </>
                ) : (
                  <>
                    <span>📄</span>
                    Download Tailored Resume (.docx)
                  </>
                )}
              </button>
              <p className="text-xs text-zinc-600 mt-2 text-center">
                Full ATS-optimised resume, reworded for this role
              </p>
              {docxError && (
                <div className="mt-2 bg-red-500/10 border border-red-500/20 text-red-400 text-xs p-3 rounded-lg leading-relaxed">
                  {docxError}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Panel: The Fix */}
        <div className="md:col-span-2 p-6 bg-zinc-950/10 relative">
          {tailorMutation.isPending ? (
            <div className="h-full flex flex-col space-y-4 animate-pulse pt-4">
              <div className="h-4 bg-zinc-800/60 rounded w-3/4"></div>
              <div className="h-4 bg-zinc-800/60 rounded w-full"></div>
              <div className="h-4 bg-zinc-800/60 rounded w-5/6"></div>
              <div className="h-4 bg-zinc-800/60 rounded w-full mt-4"></div>
              <div className="h-4 bg-zinc-800/60 rounded w-4/5"></div>
            </div>
          ) : activeTab === 'bullets' && bullets ? (
            <div className="space-y-4 animate-in fade-in duration-500">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-white">Suggested Resume Bullets</h3>
                <button
                  onClick={() => copyToClipboard(bullets.map((b: string) => `• ${b}`).join('\n'))}
                  className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded-lg transition-colors font-semibold"
                >
                  {copied ? 'Copied!' : 'Copy All'}
                </button>
              </div>
              
              {brokenLinks && brokenLinks.length > 0 && (
                <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl mb-4">
                  <h4 className="text-red-400 font-bold text-sm flex items-center gap-2 mb-2">
                    <span>⚠️</span> Broken Links Detected in Base Resume
                  </h4>
                  <ul className="text-red-300/80 text-xs space-y-1 list-disc list-inside">
                    {brokenLinks.map((link: any, idx: number) => (
                      <li key={idx}>
                        <a href={link.url} target="_blank" rel="noreferrer" className="underline hover:text-red-300">{link.url}</a> 
                        <span className="opacity-75 ml-2">({link.error})</span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-red-400/60 text-xs mt-2 mt-2">Please fix these links in your resume to ensure recruiters can view your work.</p>
                </div>
              )}

              <ul className="space-y-3">
                {bullets.map((bullet: string, i: number) => (
                  <li key={i} className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl text-zinc-300 text-sm leading-relaxed flex items-start gap-3 group hover:border-zinc-700 transition-colors">
                    <span className="text-blue-500 mt-0.5">•</span>
                    <span>{bullet}</span>
                    <button 
                      onClick={() => copyToClipboard(bullet)}
                      className="ml-auto opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-white transition-all p-1"
                      title="Copy this bullet"
                    >
                      📋
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : activeTab === 'cover-letter' && coverLetter ? (
            <div className="h-full flex flex-col animate-in fade-in duration-500">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-white">Targeted Cover Letter</h3>
                <button
                  onClick={() => copyToClipboard(coverLetter)}
                  className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded-lg transition-colors font-semibold"
                >
                  {copied ? 'Copied!' : 'Copy Letter'}
                </button>
              </div>
              <div className="flex-1 bg-zinc-900 border border-zinc-800 p-6 rounded-xl text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap overflow-y-auto custom-scrollbar">
                {coverLetter}
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-zinc-600 space-y-4">
              <div className="text-5xl opacity-50">✨</div>
              <p className="text-sm font-medium">Click generate to let AI tailor your application.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
