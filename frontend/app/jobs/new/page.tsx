'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
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

  // ATS Fetch State
  const [atsSystem, setAtsSystem] = useState('greenhouse')
  const [companyToken, setCompanyToken] = useState('')
  const [targetKeywords, setTargetKeywords] = useState('')
  const [atsSubscribe, setAtsSubscribe] = useState(false)
  const [atsResults, setAtsResults] = useState<any>(null)

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

  // Screenshot Upload State
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)

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
    setAtsResults(null)
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
    try {
      if (url.includes('linkedin.com') || url.includes('indeed.com')) {
        alert("🔒 Bot Protection Detected: LinkedIn and Indeed strictly block automated scraping. Please use the JobCopilot Chrome Extension to capture this job, or copy-paste the text manually.")
        setIsUrlFetching(false)
        return
      }
      
      const res = await apiFetch(`/api/jobs/scrape-url?url=${encodeURIComponent(url)}`, {
        method: 'POST',
      })
      const data = await res.json()
      
      if (!res.ok) {
        alert(`Failed to scrape: ${data.detail || 'Site blocked request'}\nPlease use the Chrome Extension instead.`)
      } else {
        setRawJd(data.raw_jd)
        alert('✅ Job successfully fetched and auto-filled!')
      }
    } catch (err) {
      console.error(err)
      alert("Network error. The site might be blocking cross-origin requests. Use the Chrome Extension.")
    } finally {
      setIsUrlFetching(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      
      {error && (
        <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-4 rounded-xl text-sm">
          {error}
        </div>
      )}

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
          className={`flex-1 py-3 px-4 rounded-lg font-bold text-sm transition-all ${activeTab === 'screenshot' ? 'bg-blue-600 text-white shadow-lg' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`}
        >
          Upload Screenshot
        </button>
        <button 
          onClick={() => setActiveTab('ats')}
          className={`flex-1 py-3 px-4 rounded-lg font-bold text-sm transition-all ${activeTab === 'ats' ? 'bg-blue-600 text-white shadow-lg' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`}
        >
          Company ATS Search
        </button>
        <button 
          onClick={() => setActiveTab('deep-dive')}
          className={`flex-1 py-3 px-4 rounded-lg font-bold text-sm transition-all ${activeTab === 'deep-dive' ? 'bg-purple-600 text-white shadow-lg' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`}
        >
          Company Deep Dive
        </button>
      </div>

      <div className="bg-zinc-900/40 p-8 rounded-2xl shadow-sm border border-zinc-800/50 backdrop-blur-sm">
        
        {activeTab === 'manual' && (
          <form onSubmit={handleManualSubmit} className="space-y-6">
            <h1 className="text-2xl font-bold mb-6 text-white tracking-tight">Analyze a Single Job</h1>
            
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-semibold text-zinc-400 mb-2 uppercase tracking-wide">Source</label>
                <select 
                  className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
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
                  placeholder="e.g. Google, Amazon"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-1 gap-6">
              <div>
                <label className="block text-sm font-semibold text-zinc-400 mb-2 uppercase tracking-wide">Job URL</label>
                <div className="flex gap-2">
                  <input 
                    type="url" 
                    className="flex-1 bg-zinc-950 border border-zinc-800 text-white rounded-lg p-3 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://..."
                  />
                  <button type="button" onClick={handleUrlFetch} className="bg-zinc-800 text-white px-4 rounded-lg font-bold hover:bg-zinc-700 transition-colors text-sm">
                    Fetch
                  </button>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-zinc-400 mb-2 uppercase tracking-wide">Job Description Text</label>
              <textarea 
                className="w-full bg-zinc-950 border border-zinc-800 text-zinc-300 rounded-lg p-4 font-mono text-sm leading-relaxed placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all" 
                rows={12}
                required
                value={rawJd}
                onChange={(e) => setRawJd(e.target.value)}
                placeholder="Paste the full job description here..."
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

        {activeTab === 'screenshot' && (
          <form onSubmit={handleScreenshotSubmit} className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold mb-2 text-white tracking-tight">Screenshot Analysis</h1>
              <p className="text-zinc-400 text-sm mb-3">Upload a screenshot of a job posting (e.g. from Instagram or mobile apps) to instantly extract and analyze it.</p>
              <div className="flex items-center gap-2 text-xs text-amber-400/80 bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2">
                <span>⚡</span>
                <span>Uses Gemini Vision (free tier: ~20 images/day). If you hit a rate limit, wait a few minutes or paste the text manually.</span>
              </div>
            </div>
            
            <div className="border-2 border-dashed border-zinc-700 bg-zinc-950/50 rounded-xl p-8 text-center hover:border-blue-500/50 transition-colors cursor-pointer">
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
                <span className="text-4xl mb-4">📸</span>
                <span className="text-white font-bold mb-1">
                  {selectedFile ? selectedFile.name : "Click to select a screenshot"}
                </span>
                <span className="text-zinc-500 text-sm">PNG, JPG up to 10MB</span>
              </label>
            </div>

            <button 
              type="submit" 
              disabled={isUploading || !selectedFile}
              className="w-full bg-blue-600 text-white px-6 py-4 rounded-xl font-bold hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(37,99,235,0.2)] text-lg flex items-center justify-center gap-2"
            >
              {isUploading ? (
                <>
                  <span className="animate-spin text-lg leading-none">⚙️</span>
                  Extracting text and analyzing...
                </>
              ) : (
                'Analyze Screenshot'
              )}
            </button>
          </form>
        )}

        {activeTab === 'ats' && (
          <form onSubmit={handleAtsSubmit} className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold mb-2 text-white tracking-tight">Bulk ATS Search</h1>
              <p className="text-zinc-400 text-sm">Automatically scrape a company's career page for open roles.</p>
              <div className="mt-3 p-3 bg-blue-900/20 border border-blue-800/50 rounded-lg text-blue-200 text-xs leading-relaxed">
                <strong className="text-blue-400 uppercase tracking-wider block mb-1">Supported Platforms</strong>
                Greenhouse, Lever, Ashby, and SmartRecruiters provide open APIs allowing safe bulk-fetching. For Workday, Taleo, or iCIMS, use the "Generic Fallback" and paste the full careers page URL, or use the manual tab.
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

        {activeTab === 'deep-dive' && (
          <div className="space-y-6">
            <form onSubmit={handleDeepDiveSubmit} className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold mb-2 text-white tracking-tight">Company Deep Dive</h1>
                <p className="text-zinc-400 text-sm">Research a company and auto-discover matching open roles from their careers page.</p>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-zinc-400 mb-2 uppercase tracking-wide">Company Name</label>
                  <input 
                    type="text" 
                    className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-lg p-3 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all"
                    value={deepDiveCompany}
                    onChange={(e) => setDeepDiveCompany(e.target.value)}
                    placeholder="e.g. Stripe, Airbnb"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-zinc-400 mb-2 uppercase tracking-wide">Target Keywords (Optional)</label>
                  <input 
                    type="text" 
                    className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-lg p-3 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all"
                    value={deepDiveKeywords}
                    onChange={(e) => setDeepDiveKeywords(e.target.value)}
                    placeholder="e.g. engineer, developer"
                  />
                </div>
              </div>
              <button 
                type="submit" 
                disabled={researchMutation.isPending || !deepDiveCompany}
                className="w-full bg-purple-600 text-white px-6 py-4 rounded-xl font-bold hover:bg-purple-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(147,51,234,0.2)] text-lg"
              >
                {researchMutation.isPending ? 'Researching Company & Discovering Jobs...' : 'Deep Dive & Find Jobs'}
              </button>
            </form>

            {researchData && (
              <div className="mt-12 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="bg-zinc-950/50 p-8 rounded-2xl border border-zinc-800/50 shadow-sm backdrop-blur-sm">
                  <h2 className="text-xl font-bold text-white tracking-tight mb-6 flex items-center gap-2">
                    <span>🏢</span> Intelligence Report
                  </h2>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div>
                        <strong className="text-zinc-500 uppercase tracking-widest text-xs block mb-1">Work Culture</strong>
                        <p className="text-zinc-300 text-sm leading-relaxed">{researchData.company_info.work_culture}</p>
                      </div>
                      <div>
                        <strong className="text-zinc-500 uppercase tracking-widest text-xs block mb-1">Work/Life Balance</strong>
                        <p className="text-zinc-300 text-sm leading-relaxed">{researchData.company_info.work_life_balance}</p>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <strong className="text-zinc-500 uppercase tracking-widest text-xs block mb-1">Compensation Estimates</strong>
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
                
                <div>
                  <h2 className="text-xl font-bold text-white tracking-tight mb-2 flex items-center gap-2">
                    <span>🎯</span> Auto-Discovered Roles
                  </h2>
                  {/* Show where jobs came from */}
                  {researchData.jobs && researchData.jobs.length > 0 && (
                    <div className="mb-4 text-xs text-zinc-500 flex items-center gap-2">
                      {researchData.ats_info ? (
                        <span className="bg-zinc-800 px-2 py-1 rounded capitalize">
                          Source: {researchData.ats_info.system} ATS ({researchData.ats_info.token})
                        </span>
                      ) : researchData.careers_url ? (
                        <span className="bg-zinc-800 px-2 py-1 rounded flex items-center gap-1">
                          Source: Careers page scrape —{' '}
                          <a href={researchData.careers_url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline truncate max-w-[260px]">
                            {researchData.careers_url}
                          </a>
                        </span>
                      ) : null}
                    </div>
                  )}
                  {researchData.jobs && researchData.jobs.length > 0 ? (
                    <div className="grid gap-4">
                      {researchData.jobs.map((j: any, i: number) => (
                        <div key={i} className="bg-zinc-950 p-5 rounded-xl border border-zinc-800 flex justify-between items-center group hover:border-zinc-700 transition-colors">
                          <div>
                            <h3 className="font-bold text-white text-lg">{j.role_title}</h3>
                            <div className="text-sm text-zinc-500 mt-1 flex gap-3">
                              <span>📍 {j.location || "Location Unknown"}</span>
                              <span className="text-zinc-700">|</span>
                              <span className="capitalize">
                                {j.source === 'careers_page' ? '🌐 Careers Page' : `${j.source} ATS`}
                              </span>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            {j.url && (
                              <a href={j.url} target="_blank" rel="noopener noreferrer" className="bg-zinc-800/50 text-zinc-400 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-zinc-700 hover:text-white transition-colors flex items-center justify-center">
                                View Job ↗
                              </a>
                            )}
                            <button 
                              onClick={() => {
                                parseMutation.mutate({ raw_jd: j.raw_jd, source: j.source, url: j.url, company_name: deepDiveCompany })
                              }}
                              className="bg-zinc-800 text-zinc-300 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-white hover:text-zinc-950 transition-colors group-hover:bg-purple-600 group-hover:text-white"
                            >
                              1-Click Analyze
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 bg-zinc-950/50 rounded-xl border border-zinc-800/50">
                      <p className="text-zinc-400">No matching jobs discovered.</p>
                      <p className="text-zinc-600 text-sm mt-2">We searched known ATS platforms (Greenhouse, Lever, Ashby) and the company's careers page. Try the Company ATS Search tab if you have their token.</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
