'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useApiClient } from '@/lib/useApiClient'

export default function AddJobPage() {
  const router = useRouter()
  const { fetch: apiFetch, isLoaded, isSignedIn } = useApiClient()
  const [activeTab, setActiveTab] = useState<'manual' | 'ats' | 'screenshot' | 'deep-dive'>('manual')
  const [error, setError] = useState<string | null>(null)
  
  // Manual Paste State
  const [rawJd, setRawJd] = useState('')
  const [source, setSource] = useState('manual')
  const [url, setUrl] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [isUrlFetching, setIsUrlFetching] = useState(false)
  const [promoWarning, setPromoWarning] = useState<string | null>(null)

  // ATS Fetch State
  const [atsSystem, setAtsSystem] = useState('greenhouse')
  const [companyToken, setCompanyToken] = useState('')
  const [targetKeywords, setTargetKeywords] = useState('')
  const [atsSubscribe, setAtsSubscribe] = useState(false)

  const { data: subscriptions, refetch: refetchSubscriptions } = useQuery({
    queryKey: ['ats_subscriptions'],
    enabled: isLoaded && !!isSignedIn,
    queryFn: async () => {
      const res = await apiFetch('/api/jobs/subscriptions/list')
      if (!res.ok) throw new Error('Failed to fetch subscriptions')
      return res.json()
    }
  })

  const deleteSubMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/api/jobs/subscriptions/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete subscription')
      return res.json()
    },
    onSuccess: () => refetchSubscriptions(),
    onError: (err: any) => setError(err.message)
  })

  // Deep Dive State
  const [deepDiveCompany, setDeepDiveCompany] = useState('')
  const [deepDiveKeywords, setDeepDiveKeywords] = useState('')
  const [researchData, setResearchData] = useState<any>(null)
  const [deepDiveLocFilter, setDeepDiveLocFilter] = useState('all')
  const [deepDiveExpFilter, setDeepDiveExpFilter] = useState('all')
  const [trackedJobs, setTrackedJobs] = useState<Record<string, boolean>>({})
  const [roleScores, setRoleScores] = useState<Record<number, any>>({})
  const [scoringRoleIdx, setScoringRoleIdx] = useState<number | null>(null)

  // Screenshot Upload & Clipboard Paste State
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const [pastedFromClipboard, setPastedFromClipboard] = useState(false)

  // Auto-detect URL query params (e.g. from Target Companies directory)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const tab = params.get('tab')
      const company = params.get('company')
      if (tab === 'deep-dive' || tab === 'screenshot' || tab === 'manual' || tab === 'ats') {
        setActiveTab(tab)
      }
      if (company) {
        setDeepDiveCompany(company)
        if (tab === 'deep-dive') {
          researchMutation.mutate({ company_name: company })
        }
      }
    }
  }, [])

  // Listen for Ctrl+V paste anywhere on the page
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
            setActiveTab('screenshot')
            setPastedFromClipboard(true)
            setError(null)
            break
          }
        }
      }
    }

    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [])

  // Generate object preview URL for selected file
  useEffect(() => {
    if (selectedFile) {
      const preview = URL.createObjectURL(selectedFile)
      setImagePreviewUrl(preview)
      return () => URL.revokeObjectURL(preview)
    } else {
      setImagePreviewUrl(null)
      setPastedFromClipboard(false)
    }
  }, [selectedFile])

  const handleClipboardRead = async () => {
    try {
      if (!navigator.clipboard || !navigator.clipboard.read) {
        alert("Direct clipboard read is restricted by browser security. Please press Ctrl+V directly to paste your copied screenshot!")
        return
      }
      const items = await navigator.clipboard.read()
      for (const item of items) {
        const imageType = item.types.find(t => t.startsWith('image/'))
        if (imageType) {
          const blob = await item.getType(imageType)
          const file = new File([blob], `screenshot_${Date.now()}.png`, { type: imageType })
          setSelectedFile(file)
          setActiveTab('screenshot')
          setPastedFromClipboard(true)
          return
        }
      }
      alert("No image found in clipboard! Copy a screenshot first (e.g. Win+Shift+S), then press Ctrl+V or click this button.")
    } catch {
      alert("To paste, simply press Ctrl+V anywhere on this page!")
    }
  }

  const parseMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiFetch('/api/jobs/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Failed to parse job')
      return res.json()
    },
    onSuccess: (data) => {
      if (data.job_id) {
        router.push(`/jobs/${data.job_id}`)
      }
    },
    onError: (err: any) => setError(err.message)
  })

  const atsMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiFetch('/api/jobs/fetch-ats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Failed to fetch ATS jobs')
      return res.json()
    },
    onSuccess: () => {
      alert('Started fetching jobs in the background! They will appear on your dashboard shortly.')
      router.push('/')
    },
    onError: (err: any) => setError(err.message)
  })
  
  const researchMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiFetch('/api/research/company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      if (!res.ok) throw new Error('Research failed')
      return res.json()
    },
    onSuccess: (data) => setResearchData(data),
    onError: (err: any) => setError(err.message)
  })

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!rawJd) return
    parseMutation.mutate({ raw_jd: rawJd, source, url: url || undefined, company_name: companyName || undefined })
  }

  const handleAtsSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!companyToken) return
    const keywordsArray = targetKeywords ? targetKeywords.split(',').map(k => k.trim()) : undefined
    atsMutation.mutate({ 
      company_tokens: [companyToken.trim()], 
      system: atsSystem, 
      target_keywords: keywordsArray,
      subscribe: atsSubscribe
    })
  }

  const handleDeepDiveSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setResearchData(null)
    researchMutation.mutate({ company_name: deepDiveCompany, target_keywords: deepDiveKeywords || undefined })
  }

  const handleScreenshotSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!selectedFile) return
    
    setIsUploading(true)
    const formData = new FormData()
    formData.append('file', selectedFile)
    
    try {
      const res = await apiFetch('/api/jobs/parse-image', {
        method: 'POST',
        body: formData
      })
      const data = await res.json()
      
      if (res.status === 429) {
        setError(`⚠️ Rate limit reached: ${data.detail}`)
        return
      }
      if (!res.ok) throw new Error(data.detail || 'Failed to process image')
      
      if (data.job_id) {
        router.push(`/jobs/${data.job_id}`)
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsUploading(false)
    }
  }

  // Auto-identify source based on URL
  useEffect(() => {
    if (!url) return
    const lowerUrl = url.toLowerCase()
    if (lowerUrl.includes('linkedin.com')) setSource('linkedin')
    else if (lowerUrl.includes('indeed.com')) setSource('indeed')
    else if (lowerUrl.includes('glassdoor.com')) setSource('glassdoor')
    else if (lowerUrl.includes('naukri.com')) setSource('naukri')
    else if (lowerUrl.includes('wellfound.com') || lowerUrl.includes('angel.co')) setSource('wellfound')
    else if (lowerUrl.includes('ycombinator.com')) setSource('ycombinator')
    else setSource('other')
  }, [url])

  const handleUrlFetch = async () => {
    if (!url) {
      alert("Please enter a URL first")
      return
    }
    setIsUrlFetching(true)
    setPromoWarning(null)
    try {
      const res = await apiFetch(`/api/jobs/scrape-url?url=${encodeURIComponent(url)}`, {
        method: 'POST',
      })
      const data = await res.json()
      
      if (!res.ok) {
        alert(`Failed to scrape: ${data.detail || 'Site blocked request'}\nPlease paste the text or screenshot manually.`)
      } else {
        if (data.is_promo) {
          setPromoWarning(`⚠️ Creator Link Warning: This link was detected as an influencer course/bootcamp (${data.promo_name || 'ProPeers/Course'}). It is not an official company job posting. We recommend using Company Deep Dive or Target Companies to find the official careers page!`)
        }
        setRawJd(data.raw_jd)
        if (data.resolved_url && data.resolved_url !== url) {
          setUrl(data.resolved_url)
        }
      }
    } catch (err) {
      console.error(err)
      alert("Network error. Please paste the job description text or screenshot directly.")
    } finally {
      setIsUrlFetching(false)
    }
  }

  const handleTrackDiscoveredJob = async (job: any, idx: number) => {
    try {
      const res = await apiFetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: deepDiveCompany,
          role_title: job.role_title,
          location: job.location,
          url: job.url,
          status: 'saved',
          notes: `Added from Company Deep Dive (${job.source})`
        })
      })
      if (res.ok) {
        setTrackedJobs(prev => ({ ...prev, [idx]: true }))
      }
    } catch (err) {
      console.error(err)
    }
  }

  const handleScoreRole = async (job: any, idx: number) => {
    setScoringRoleIdx(idx)
    try {
      const res = await apiFetch('/api/jobs/quick-score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: deepDiveCompany,
          role_title: job.role_title,
          location: job.location,
          url: job.url,
          raw_jd: job.raw_jd,
          seniority_required: job.seniority_required || '0-2yr',
          experience_level: job.experience_level,
          required_skills: job.required_skills
        })
      })
      if (!res.ok) throw new Error('Failed to score role')
      const data = await res.json()
      setRoleScores(prev => ({ ...prev, [idx]: data }))
    } catch (err: any) {
      alert(err.message || 'Error scoring role.')
    } finally {
      setScoringRoleIdx(null)
    }
  }

  // Filter deep dive jobs by location and experience level
  const filteredDeepDiveJobs = (researchData?.jobs || []).filter((j: any) => {
    if (deepDiveLocFilter !== 'all' && !(j.location || '').toLowerCase().includes(deepDiveLocFilter.toLowerCase())) {
      return false
    }
    if (deepDiveExpFilter !== 'all') {
      const exp = (j.experience_level || '').toLowerCase()
      const sen = (j.seniority_required || '').toLowerCase()
      const title = (j.role_title || '').toLowerCase()
      if (deepDiveExpFilter === 'fresher') {
        const isFresher = exp.includes('0-2') || exp.includes('fresher') || exp.includes('entry') || exp.includes('0-1') || sen === '0-2yr' || sen === 'entry' || title.includes('analyst') || title.includes('graduate') || title.includes('trainee')
        if (!isFresher) return false
      } else if (deepDiveExpFilter === 'mid') {
        const isMid = exp.includes('2-5') || exp.includes('mid') || sen === '2-5yr' || title.includes('associate')
        if (!isMid) return false
      } else if (deepDiveExpFilter === 'senior') {
        const isSenior = exp.includes('5+') || exp.includes('senior') || exp.includes('lead') || sen === 'senior' || title.includes('senior') || title.includes('lead')
        if (!isSenior) return false
      }
    }
    return true
  })

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      
      {error && (
        <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-4 rounded-xl text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-300 hover:text-white font-bold ml-4">✕</button>
        </div>
      )}

      {/* Global Quick Paste Banner */}
      <div className="bg-gradient-to-r from-blue-900/30 via-purple-900/20 to-zinc-900/40 border border-blue-500/30 rounded-xl p-3 px-4 flex items-center justify-between text-xs text-zinc-300 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <span className="text-base">📋</span>
          <span><strong>Quick Paste Ready:</strong> Copied a screenshot from LinkedIn or Snipping Tool? Press <kbd className="bg-zinc-800 border border-zinc-700 px-1.5 py-0.5 rounded text-white font-mono font-bold">Ctrl+V</kbd> anywhere on this page to instantly load and analyze it!</span>
        </div>
        <button 
          onClick={handleClipboardRead}
          className="bg-blue-600/80 hover:bg-blue-600 text-white font-semibold px-3 py-1 rounded-lg transition-colors shrink-0 ml-3"
        >
          Paste from Clipboard
        </button>
      </div>

      {/* Tabs */}
      <div className="flex space-x-2 bg-zinc-900/50 p-2 rounded-xl backdrop-blur-sm border border-zinc-800/50">
        <button 
          onClick={() => setActiveTab('manual')}
          className={`flex-1 py-3 px-4 rounded-lg font-bold text-sm transition-all ${activeTab === 'manual' ? 'bg-blue-600 text-white shadow-lg' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`}
        >
          Paste Job / URL
        </button>
        <button 
          onClick={() => setActiveTab('screenshot')}
          className={`flex-1 py-3 px-4 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-1.5 ${activeTab === 'screenshot' ? 'bg-blue-600 text-white shadow-lg' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`}
        >
          <span>📸</span> Screenshot
          {selectedFile && <span className="w-2 h-2 rounded-full bg-green-400 ml-1"></span>}
        </button>
        <button 
          onClick={() => setActiveTab('deep-dive')}
          className={`flex-1 py-3 px-4 rounded-lg font-bold text-sm transition-all ${activeTab === 'deep-dive' ? 'bg-purple-600 text-white shadow-lg' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`}
        >
          Company Deep Dive
        </button>
        <button 
          onClick={() => setActiveTab('ats')}
          className={`flex-1 py-3 px-4 rounded-lg font-bold text-sm transition-all ${activeTab === 'ats' ? 'bg-blue-600 text-white shadow-lg' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`}
        >
          ATS Search
        </button>
      </div>

      <div className="bg-zinc-900/40 p-8 rounded-2xl shadow-sm border border-zinc-800/50 backdrop-blur-sm">
        
        {/* TAB 1: MANUAL PASTE / URL */}
        {activeTab === 'manual' && (
          <form onSubmit={handleManualSubmit} className="space-y-6">
            <h1 className="text-2xl font-bold mb-6 text-white tracking-tight">Analyze a Single Job</h1>
            
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-semibold text-zinc-400 mb-2 uppercase tracking-wide">Source</label>
                <select 
                  className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                >
                  <option value="manual">Manual Paste</option>
                  <option value="linkedin">LinkedIn</option>
                  <option value="indeed">Indeed</option>
                  <option value="glassdoor">Glassdoor</option>
                  <option value="naukri">Naukri</option>
                  <option value="wellfound">Wellfound</option>
                  <option value="ycombinator">Y Combinator</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-zinc-400 mb-2 uppercase tracking-wide">Company Name (Optional)</label>
                <input 
                  type="text" 
                  className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-lg p-3 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g. Barclays, Google, HSBC"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-1 gap-6">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-semibold text-zinc-400 uppercase tracking-wide">Job or Creator Apply URL</label>
                  <span className="text-xs text-zinc-500">Auto-resolves shortened lnkd.in links</span>
                </div>
                <div className="flex gap-2">
                  <input 
                    type="url" 
                    className="flex-1 bg-zinc-950 border border-zinc-800 text-white rounded-lg p-3 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://lnkd.in/... or company careers URL"
                  />
                  <button 
                    type="button" 
                    onClick={handleUrlFetch} 
                    disabled={isUrlFetching}
                    className="bg-zinc-800 text-white px-5 rounded-lg font-bold hover:bg-zinc-700 transition-colors text-sm disabled:opacity-50"
                  >
                    {isUrlFetching ? 'Resolving...' : 'Fetch'}
                  </button>
                </div>
              </div>
            </div>

            {promoWarning && (
              <div className="bg-amber-500/10 border border-amber-500/40 text-amber-300 p-4 rounded-xl text-sm space-y-2">
                <div className="font-semibold flex items-center gap-2">
                  <span>⚠️</span> Influencer / Course Link Detected
                </div>
                <p className="text-xs text-amber-200/90 leading-relaxed">{promoWarning}</p>
                <button 
                  type="button" 
                  onClick={() => {
                    setActiveTab('deep-dive')
                    if (companyName) setDeepDiveCompany(companyName)
                  }}
                  className="text-xs font-bold text-white bg-amber-600 hover:bg-amber-500 px-3 py-1.5 rounded transition-colors inline-block"
                >
                  Use Company Deep Dive for Official Openings →
                </button>
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-zinc-400 mb-2 uppercase tracking-wide">Job Description Text</label>
              <textarea 
                className="w-full bg-zinc-950 border border-zinc-800 text-zinc-300 rounded-lg p-4 font-mono text-sm leading-relaxed placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all" 
                rows={10}
                required
                value={rawJd}
                onChange={(e) => setRawJd(e.target.value)}
                placeholder="Paste the full job description or creator hiring alert text here..."
              />
            </div>

            <button 
              type="submit" 
              disabled={parseMutation.isPending || !rawJd}
              className="w-full bg-blue-600 text-white px-6 py-4 rounded-xl font-bold hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(37,99,235,0.2)] text-lg"
            >
              {parseMutation.isPending ? 'Analyzing with AI...' : 'Analyze Job Fit'}
            </button>
          </form>
        )}

        {/* TAB 2: SCREENSHOT (CLIPBOARD PASTE + DRAG/DROP + FILE PICKER) */}
        {activeTab === 'screenshot' && (
          <form onSubmit={handleScreenshotSubmit} className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h1 className="text-2xl font-bold text-white tracking-tight">Screenshot Analysis</h1>
                <span className="text-xs bg-blue-500/20 text-blue-400 px-2.5 py-1 rounded-full border border-blue-500/30 font-medium">
                  Ctrl+V Supported
                </span>
              </div>
              <p className="text-zinc-400 text-sm mb-3">
                Paste any copied screenshot directly (<kbd className="bg-zinc-800 border border-zinc-700 px-1 py-0.5 rounded text-white font-mono text-xs">Ctrl+V</kbd>), drag & drop, or browse your files. Works on LinkedIn infographics, hiring alerts, and compensation tables!
              </p>
            </div>

            {/* Paste Notification Banner */}
            {pastedFromClipboard && (
              <div className="bg-green-500/10 border border-green-500/30 text-green-300 p-3 rounded-xl text-sm flex items-center justify-between animate-in fade-in duration-300">
                <div className="flex items-center gap-2">
                  <span>✅</span>
                  <span><strong>Screenshot Pasted from Clipboard!</strong> Ready for AI vision extraction.</span>
                </div>
                <button 
                  type="button" 
                  onClick={() => { setSelectedFile(null); setPastedFromClipboard(false); }}
                  className="text-xs text-zinc-400 hover:text-white"
                >
                  Clear
                </button>
              </div>
            )}

            {/* Live Image Preview OR Dropzone */}
            {imagePreviewUrl ? (
              <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-6 text-center space-y-4">
                <div className="relative inline-block max-w-full">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img 
                    src={imagePreviewUrl} 
                    alt="Screenshot Preview" 
                    className="max-h-80 mx-auto rounded-xl object-contain shadow-2xl border border-zinc-800"
                  />
                  <button
                    type="button"
                    onClick={() => { setSelectedFile(null); setImagePreviewUrl(null); }}
                    className="absolute top-2 right-2 bg-zinc-900/90 text-white rounded-full p-2 hover:bg-red-600 transition-colors shadow-lg text-xs"
                    title="Remove Screenshot"
                  >
                    ✕
                  </button>
                </div>
                <div className="text-xs text-zinc-400 flex items-center justify-center gap-4">
                  <span>📁 {selectedFile?.name || 'clipboard_screenshot.png'}</span>
                  <span>•</span>
                  <span>{selectedFile ? (selectedFile.size / 1024).toFixed(1) + ' KB' : ''}</span>
                  <span>•</span>
                  <button 
                    type="button"
                    onClick={() => { setSelectedFile(null); setImagePreviewUrl(null); }}
                    className="text-blue-400 hover:underline"
                  >
                    Replace Image
                  </button>
                </div>
              </div>
            ) : (
              <div 
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setIsDragOver(false)
                  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    const f = e.dataTransfer.files[0]
                    if (f.type.startsWith('image/')) {
                      setSelectedFile(f)
                    } else {
                      setError('Please drop an image file (PNG, JPG).')
                    }
                  }
                }}
                className={`border-2 border-dashed rounded-2xl p-10 text-center transition-all cursor-pointer ${
                  isDragOver ? 'border-blue-500 bg-blue-500/10' : 'border-zinc-700 bg-zinc-950/50 hover:border-blue-500/50'
                }`}
              >
                <input 
                  type="file" 
                  accept="image/png, image/jpeg, image/jpg"
                  className="hidden" 
                  id="file-upload"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      setSelectedFile(e.target.files[0])
                    }
                  }}
                />
                <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center">
                  <span className="text-5xl mb-4">📋</span>
                  <span className="text-white text-lg font-bold mb-1">
                    Press <kbd className="bg-zinc-800 border border-zinc-700 px-2 py-0.5 rounded text-white font-mono">Ctrl+V</kbd> to Paste Screenshot
                  </span>
                  <span className="text-zinc-400 text-sm mt-1 mb-4">
                    Or drag and drop an image file here, or click to browse
                  </span>
                  <button 
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleClipboardRead(); }}
                    className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold px-4 py-2 rounded-lg transition-colors border border-zinc-700"
                  >
                    Click to Paste from Clipboard
                  </button>
                  <span className="text-zinc-600 text-xs mt-3">Supports PNG, JPG, WebP up to 10MB</span>
                </label>
              </div>
            )}

            <button 
              type="submit" 
              disabled={isUploading || !selectedFile}
              className="w-full bg-blue-600 text-white px-6 py-4 rounded-xl font-bold hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(37,99,235,0.2)] text-lg flex items-center justify-center gap-2"
            >
              {isUploading ? (
                <>
                  <span className="animate-spin text-lg leading-none">⚙️</span>
                  Extracting Text & Analyzing Job Fit...
                </>
              ) : (
                'Analyze Screenshot'
              )}
            </button>
          </form>
        )}

        {/* TAB 3: COMPANY DEEP DIVE */}
        {activeTab === 'deep-dive' && (
          <div className="space-y-6">
            <form onSubmit={handleDeepDiveSubmit} className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold mb-2 text-white tracking-tight">Company Deep Dive & Live Roles</h1>
                <p className="text-zinc-400 text-sm">
                  Research enterprise culture, verified salary brackets (Analyst/Associate/SDE), and discover live openings across official career portals.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-zinc-400 mb-2 uppercase tracking-wide">Company Name</label>
                  <input 
                    type="text" 
                    className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-lg p-3 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all"
                    value={deepDiveCompany}
                    onChange={(e) => setDeepDiveCompany(e.target.value)}
                    placeholder="e.g. Barclays, HSBC, Google, HCLTech"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-zinc-400 mb-2 uppercase tracking-wide">Target Role Keywords (Optional)</label>
                  <input 
                    type="text" 
                    className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-lg p-3 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all"
                    value={deepDiveKeywords}
                    onChange={(e) => setDeepDiveKeywords(e.target.value)}
                    placeholder="e.g. Analyst, Associate, Engineer"
                  />
                </div>
              </div>
              <button 
                type="submit" 
                disabled={researchMutation.isPending || !deepDiveCompany}
                className="w-full bg-purple-600 text-white px-6 py-4 rounded-xl font-bold hover:bg-purple-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(147,51,234,0.2)] text-lg flex items-center justify-center gap-2"
              >
                {researchMutation.isPending ? (
                  <>
                    <span className="animate-spin text-lg leading-none">⚙️</span>
                    Discovering Live Roles & Intelligence for {deepDiveCompany}...
                  </>
                ) : (
                  `Deep Dive ${deepDiveCompany || 'Company'} & Find Roles`
                )}
              </button>
            </form>

            {researchData && (
              <div className="mt-12 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                
                {/* Verified Compensation Table if available */}
                {researchData.company_info?.compensation_levels && researchData.company_info.compensation_levels.length > 0 && (
                  <div className="bg-zinc-950/80 p-6 rounded-2xl border border-zinc-800 shadow-sm">
                    <h2 className="text-lg font-bold text-white tracking-tight mb-4 flex items-center gap-2">
                      <span>💰</span> Verified Compensation Breakdown
                    </h2>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-zinc-800 text-zinc-400 text-xs uppercase tracking-wider">
                            <th className="py-3 px-4 font-semibold">Level / Role</th>
                            <th className="py-3 px-4 font-semibold">Base Pay</th>
                            <th className="py-3 px-4 font-semibold">Bonus</th>
                            <th className="py-3 px-4 font-semibold">Stock</th>
                            <th className="py-3 px-4 font-semibold text-right text-purple-400">Total CTC</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                          {researchData.company_info.compensation_levels.map((lvl: any, i: number) => (
                            <tr key={i} className="hover:bg-zinc-900/40">
                              <td className="py-3 px-4 font-medium text-white">{lvl.level_name}</td>
                              <td className="py-3 px-4 font-mono">{lvl.base_pay}</td>
                              <td className="py-3 px-4 font-mono text-zinc-400">{lvl.bonus || '—'}</td>
                              <td className="py-3 px-4 font-mono text-zinc-400">{lvl.stock || '—'}</td>
                              <td className="py-3 px-4 font-mono font-bold text-right text-green-400">{lvl.total_comp}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Intelligence Report */}
                <div className="bg-zinc-950/50 p-8 rounded-2xl border border-zinc-800/50 shadow-sm backdrop-blur-sm">
                  <h2 className="text-xl font-bold text-white tracking-tight mb-6 flex items-center gap-2">
                    <span>🏢</span> Company Intelligence Report
                  </h2>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div>
                        <strong className="text-zinc-500 uppercase tracking-widest text-xs block mb-1">Work Culture</strong>
                        <p className="text-zinc-300 text-sm leading-relaxed">{researchData.company_info.work_culture}</p>
                      </div>
                      <div>
                        <strong className="text-zinc-500 uppercase tracking-widest text-xs block mb-1">Work / Life Balance</strong>
                        <p className="text-zinc-300 text-sm leading-relaxed">{researchData.company_info.work_life_balance}</p>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <strong className="text-zinc-500 uppercase tracking-widest text-xs block mb-1">Compensation Overview</strong>
                        <p className="text-zinc-300 text-sm leading-relaxed">{researchData.company_info.compensation_estimates}</p>
                      </div>
                      <div>
                        <strong className="text-zinc-500 uppercase tracking-widest text-xs block mb-1">Perks & Benefits</strong>
                        <p className="text-zinc-300 text-sm leading-relaxed">{researchData.company_info.perks}</p>
                      </div>
                      <div>
                        <strong className="text-zinc-500 uppercase tracking-widest text-xs block mb-1">Bonds / Contracts</strong>
                        <p className="text-zinc-300 text-sm leading-relaxed">{researchData.company_info.bonds_or_contracts}</p>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Auto-Discovered Roles with Location Filter */}
                <div>
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                    <div>
                      <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                        <span>🎯</span> Open Roles Discovered ({filteredDeepDiveJobs.length})
                      </h2>
                      {researchData.careers_url && (
                        <a 
                          href={researchData.careers_url} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="text-xs text-blue-400 hover:underline inline-block mt-1"
                        >
                          Official Careers Portal: {researchData.careers_url} ↗
                        </a>
                      )}
                    </div>

                    {/* Place and Experience Filter Dropdowns */}
                    <div className="flex flex-wrap items-center gap-3">
                      {/* Location Filter */}
                      <div className="flex items-center gap-1.5">
                        <label className="text-xs text-zinc-400 font-semibold uppercase">Place:</label>
                        <select
                          value={deepDiveLocFilter}
                          onChange={(e) => setDeepDiveLocFilter(e.target.value)}
                          className="bg-zinc-950 border border-zinc-800 text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-purple-500"
                        >
                          <option value="all">All Locations</option>
                          <option value="bengaluru">Bengaluru / Bangalore</option>
                          <option value="mumbai">Mumbai</option>
                          <option value="pune">Pune</option>
                          <option value="hyderabad">Hyderabad</option>
                          <option value="delhi">Delhi / NCR</option>
                          <option value="chennai">Chennai</option>
                          <option value="remote">Remote</option>
                        </select>
                      </div>

                      {/* Experience Filter */}
                      <div className="flex items-center gap-1.5">
                        <label className="text-xs text-zinc-400 font-semibold uppercase">Experience:</label>
                        <select
                          value={deepDiveExpFilter}
                          onChange={(e) => setDeepDiveExpFilter(e.target.value)}
                          className="bg-zinc-950 border border-zinc-800 text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-purple-500"
                        >
                          <option value="all">All Experience Levels</option>
                          <option value="fresher">🎓 Freshers / 0-2 Yrs (Entry Level)</option>
                          <option value="mid">💼 2-5 Yrs (Mid-Level)</option>
                          <option value="senior">⭐ 5+ Yrs (Senior & Lead)</option>
                        </select>
                      </div>

                      {(deepDiveLocFilter !== 'all' || deepDiveExpFilter !== 'all') && (
                        <button
                          onClick={() => {
                            setDeepDiveLocFilter('all')
                            setDeepDiveExpFilter('all')
                          }}
                          className="text-xs text-purple-400 hover:underline"
                        >
                          Reset filters
                        </button>
                      )}
                    </div>
                  </div>

                  {filteredDeepDiveJobs && filteredDeepDiveJobs.length > 0 ? (
                    <div className="grid gap-4">
                      {filteredDeepDiveJobs.map((j: any, i: number) => {
                        const isTracked = trackedJobs[i]
                        const score = roleScores[i]
                        const isScoringThis = scoringRoleIdx === i

                        return (
                          <div key={i} className="bg-zinc-950 p-5 rounded-xl border border-zinc-800 space-y-4 hover:border-zinc-700 transition-all">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <h3 className="font-bold text-white text-lg">{j.role_title}</h3>
                                  {j.experience_level && (
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                      j.experience_level.includes('0-2') || j.experience_level.includes('Freshers')
                                        ? 'bg-green-500/10 text-green-400 border-green-500/20'
                                        : j.experience_level.includes('5+')
                                        ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                                        : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                    }`}>
                                      {j.experience_level}
                                    </span>
                                  )}
                                  {j.compensation_range && (
                                    <span className="text-[10px] text-green-400 font-mono bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                                      💰 {j.compensation_range}
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-zinc-400 mt-1.5 flex flex-wrap items-center gap-2">
                                  <span>📍 {j.location || "India"}</span>
                                  <span className="text-zinc-700">•</span>
                                  <span className="capitalize text-zinc-500">
                                    {j.source === 'live_search' 
                                      ? '🌐 Live Job Portal' 
                                      : j.source === 'careers_page' 
                                      ? '🏢 Official Careers' 
                                      : j.source === 'official_portal' 
                                      ? '🏢 Official Verified Opening' 
                                      : `${j.source} ATS`}
                                  </span>
                                  {j.required_skills && j.required_skills.length > 0 && (
                                    <>
                                      <span className="text-zinc-700">•</span>
                                      <span className="text-zinc-500">Skills: {j.required_skills.slice(0, 4).join(', ')}</span>
                                    </>
                                  )}
                                </div>
                              </div>

                              {/* Top Fit Score Badge if scored */}
                              {score && (
                                <div className="flex items-center gap-3 shrink-0">
                                  <span className={`px-2.5 py-1 rounded-lg text-xs font-black uppercase tracking-wider ${
                                    score.verdict === 'apply'
                                      ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                                      : score.verdict === 'stretch'
                                      ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                                      : 'bg-red-500/20 text-red-400 border border-red-500/30'
                                  }`}>
                                    {score.verdict === 'apply' ? '✅ APPLY' : score.verdict === 'stretch' ? '🟣 STRETCH' : '⚠️ SKIP'}
                                  </span>
                                  <div className="text-right">
                                    <div className={`text-2xl font-black ${
                                      score.match_score >= 80 ? 'text-green-400' : score.match_score >= 50 ? 'text-amber-400' : 'text-zinc-500'
                                    }`}>
                                      {score.match_score}
                                    </div>
                                    <div className="text-[9px] text-zinc-500 uppercase font-bold tracking-widest">Fit Score</div>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Inline Scoring Report if evaluated */}
                            {score && (
                              <div className="bg-zinc-900/60 p-3.5 rounded-xl border border-zinc-800/80 text-xs space-y-2 animate-in fade-in duration-300">
                                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                                  <span className="text-zinc-300 font-medium">
                                    🎯 <strong>Experience Fit:</strong> {score.seniority_fit === 'good_fit' || score.seniority_fit === 'ideal' ? 'Direct Match for your background' : score.seniority_fit}
                                  </span>
                                  {score.matched_keywords && score.matched_keywords.length > 0 && (
                                    <span className="text-green-400">
                                      Matched: {score.matched_keywords.slice(0, 4).join(', ')}
                                    </span>
                                  )}
                                </div>
                                {score.reasoning && (
                                  <p className="text-zinc-400 text-xs leading-relaxed">
                                    {score.reasoning}
                                  </p>
                                )}
                                {score.job_id && (
                                  <div className="pt-1 flex justify-end">
                                    <Link href={`/jobs/${score.job_id}`} className="text-purple-400 hover:text-purple-300 font-semibold hover:underline">
                                      View Deep Breakdown & Cover Letter →
                                    </Link>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Action Buttons */}
                            <div className="pt-2 border-t border-zinc-900 flex flex-wrap items-center justify-between gap-2 text-xs">
                              {/* Direct Apply Option */}
                              {(j.url || researchData.careers_url) && (
                                <a 
                                  href={j.url || researchData.careers_url} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  className="bg-white text-zinc-950 font-bold px-3.5 py-1.5 rounded-lg text-xs hover:bg-zinc-200 transition-colors flex items-center gap-1.5 shadow-sm"
                                >
                                  <span>🚀</span>
                                  <span>Apply Now ↗</span>
                                </a>
                              )}

                              <div className="flex items-center gap-2 ml-auto">
                                {/* Score Fit (Apply or Skip) */}
                                <button 
                                  type="button"
                                  onClick={() => handleScoreRole(j, i)}
                                  disabled={isScoringThis}
                                  className="bg-purple-950/60 hover:bg-purple-900 text-purple-300 border border-purple-500/30 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 disabled:opacity-50"
                                  title="Scores this role against your resume and tells whether to apply or skip"
                                >
                                  <span>{isScoringThis ? '⚙️' : '📊'}</span>
                                  <span>{isScoringThis ? 'Scoring...' : (score ? 'Re-Score' : 'Score Fit (Apply/Skip)')}</span>
                                </button>

                                {/* Track Button */}
                                <button 
                                  type="button"
                                  onClick={() => handleTrackDiscoveredJob(j, i)}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 ${
                                    isTracked ? 'bg-green-600/20 text-green-400 border border-green-500/30' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                                  }`}
                                >
                                  {isTracked ? '✓ In Tracker' : '+ Track'}
                                </button>

                                {/* Full Analysis */}
                                <button 
                                  onClick={() => {
                                    parseMutation.mutate({ raw_jd: j.raw_jd, source: j.source, url: j.url, company_name: deepDiveCompany })
                                  }}
                                  className="bg-purple-600 hover:bg-purple-500 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors shadow-sm"
                                >
                                  Full Analysis
                                </button>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-12 bg-zinc-950/50 rounded-xl border border-zinc-800/50">
                      <p className="text-zinc-400">No jobs matching your filters.</p>
                      <button 
                        onClick={() => {
                          setDeepDiveLocFilter('all')
                          setDeepDiveExpFilter('all')
                        }} 
                        className="mt-2 text-xs text-purple-400 hover:underline"
                      >
                        Reset filters
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: BULK ATS SEARCH */}
        {activeTab === 'ats' && (
          <form onSubmit={handleAtsSubmit} className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold mb-2 text-white tracking-tight">Bulk ATS Search</h1>
              <p className="text-zinc-400 text-sm">Automatically scrape a company's career page for open roles.</p>
              <div className="mt-3 p-3 bg-blue-900/20 border border-blue-800/50 rounded-lg text-blue-200 text-xs leading-relaxed">
                <strong className="text-blue-400 uppercase tracking-wider block mb-1">Supported Platforms</strong>
                Greenhouse, Lever, Ashby, and SmartRecruiters provide open APIs allowing safe bulk-fetching. For Workday, Taleo, or iCIMS, use Company Deep Dive.
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-semibold text-zinc-400 mb-2 uppercase tracking-wide">ATS System</label>
                <select 
                  className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                  value={atsSystem}
                  onChange={(e) => setAtsSystem(e.target.value)}
                >
                  <option value="greenhouse">Greenhouse</option>
                  <option value="lever">Lever</option>
                  <option value="ashby">Ashby</option>
                  <option value="smartrecruiters">SmartRecruiters</option>
                  <option value="generic">Generic Fallback (Workday/Taleo)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-zinc-400 mb-2 uppercase tracking-wide">
                  {atsSystem === 'generic' ? 'Full URL' : 'Company Token'}
                </label>
                <input 
                  type="text" 
                  className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-lg p-3 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                  value={companyToken}
                  onChange={(e) => setCompanyToken(e.target.value)}
                  placeholder={atsSystem === 'generic' ? "https://company.wd1.myworkdayjobs.com/..." : "e.g. 'stripe' for Lever, 'airbnb' for Greenhouse"}
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-zinc-400 mb-2 uppercase tracking-wide">Target Keywords (Optional, Comma separated)</label>
              <input 
                type="text" 
                className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-lg p-3 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                value={targetKeywords}
                onChange={(e) => setTargetKeywords(e.target.value)}
                placeholder="e.g. engineer, developer, backend"
              />
            </div>

            <div className="flex items-center gap-3 bg-zinc-900/50 p-4 rounded-xl border border-zinc-800">
              <input 
                type="checkbox" 
                id="atsSubscribe"
                checked={atsSubscribe}
                onChange={(e) => setAtsSubscribe(e.target.checked)}
                className="w-5 h-5 bg-zinc-950 border-zinc-700 rounded focus:ring-blue-500"
              />
              <label htmlFor="atsSubscribe" className="text-sm font-medium text-zinc-300 cursor-pointer">
                Subscribe to updates (automatically fetch new roles for these keywords every 12 hours)
              </label>
            </div>

            <button 
              type="submit" 
              disabled={atsMutation.isPending || !companyToken}
              className="w-full bg-blue-600 text-white px-6 py-4 rounded-xl font-bold hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(37,99,235,0.2)] text-lg"
            >
              {atsMutation.isPending ? 'Starting Scrape...' : 'Scrape Company Jobs'}
            </button>
          </form>
        )}

        {activeTab === 'ats' && subscriptions && subscriptions.length > 0 && (
          <div className="mt-12 space-y-4">
            <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <span>🔄</span> Active Auto-Scrape Subscriptions
            </h2>
            <div className="grid gap-3">
              {subscriptions.map((sub: any) => (
                <div key={sub.id} className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 flex justify-between items-center group">
                  <div>
                    <h3 className="font-bold text-white text-lg">{sub.company_token} <span className="text-zinc-500 text-sm font-normal ml-2 capitalize">({sub.ats_system})</span></h3>
                    <div className="text-sm text-zinc-400 mt-1">
                      Keywords: {sub.target_keywords ? <span className="text-blue-400">{sub.target_keywords}</span> : 'All Jobs'}
                    </div>
                  </div>
                  <button 
                    onClick={() => deleteSubMutation.mutate(sub.id)}
                    disabled={deleteSubMutation.isPending}
                    className="text-red-400 hover:text-red-300 font-semibold text-sm px-3 py-1.5 bg-red-500/10 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                  >
                    Unsubscribe
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
