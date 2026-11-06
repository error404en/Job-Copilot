'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useApiClient } from '@/lib/useApiClient'
import { PlusCircle, Sparkles, Copy, FileText, Upload } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'

const STORAGE_KEY_JOBS_NEW = 'apply_tool_jobs_new_state'
const STORAGE_KEY_DEEP_DIVE_CACHE = 'apply_tool_deep_dive_cache'

export default function AddJobPage() {
  const router = useRouter()
  const { fetch: apiFetch, isLoaded, isSignedIn } = useApiClient()
  const [activeTab, setActiveTab] = useState<'manual' | 'ats' | 'screenshot' | 'deep-dive'>('manual')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null)
  
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
  const [deepDiveLocFilter, setDeepDiveLocFilter] = useState('india_remote_reloc')
  const [deepDiveExpFilter, setDeepDiveExpFilter] = useState('fresher')
  const [deepDiveSalaryFilter, setDeepDiveSalaryFilter] = useState('all')
  const [trackedJobs, setTrackedJobs] = useState<Record<string, boolean>>({})
  const [roleScores, setRoleScores] = useState<Record<number, any>>({})
  const [scoringRoleIdx, setScoringRoleIdx] = useState<number | null>(null)
  const [analyzingRoleIdx, setAnalyzingRoleIdx] = useState<number | null>(null)

  // Screenshot Upload & Clipboard Paste State
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const [pastedFromClipboard, setPastedFromClipboard] = useState(false)

  const isHydratedRef = useRef(false)

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
      setNotice({ message: 'Started fetching ATS jobs in background. Redirecting to dashboard...', type: 'success' })
      setTimeout(() => router.push('/'), 1200)
    },
    onError: (err: any) => setError(err.message)
  })
  
  const discoverAtsMutation = useMutation({
    mutationFn: async (companyName: string) => {
      const res = await apiFetch('/api/research/discover-ats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_name: companyName })
      })
      if (!res.ok) throw new Error('Failed to discover ATS')
      return res.json()
    },
    onSuccess: (data) => {
      if (data.ats_info) {
        setAtsSystem(data.ats_info.system)
        setCompanyToken(data.ats_info.token)
        setNotice({ message: `Detected ${data.ats_info.system.toUpperCase()} ATS board!`, type: 'success' })
        setTimeout(() => setNotice(null), 4000)
      } else {
        setNotice({ message: "Could not auto-detect ATS. You can enter the board token manually or use Company Deep Dive.", type: 'info' })
        setTimeout(() => setNotice(null), 5000)
      }
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
    onSuccess: (data) => {
      setResearchData(data)
      if (typeof window !== 'undefined' && deepDiveCompany) {
        try {
          const cacheRaw = sessionStorage.getItem(STORAGE_KEY_DEEP_DIVE_CACHE)
          const cache = cacheRaw ? JSON.parse(cacheRaw) : {}
          cache[deepDiveCompany.toLowerCase().trim()] = {
            researchData: data,
            roleScores: {},
            trackedJobs: {},
            timestamp: Date.now()
          }
          sessionStorage.setItem(STORAGE_KEY_DEEP_DIVE_CACHE, JSON.stringify(cache))
        } catch {}
      }
    },
    onError: (err: any) => setError(err.message)
  })

  // Hydrate state from URL query params and sessionStorage on mount and popstate (Back/Forward)
  useEffect(() => {
    const hydrate = () => {
      if (typeof window === 'undefined') return
      const params = new URLSearchParams(window.location.search)
      const urlTab = params.get('tab') as any
      const urlCompany = params.get('company')
      const urlLoc = params.get('loc')
      const urlExp = params.get('exp')
      const urlSal = params.get('sal')

      let saved: any = null
      try {
        const raw = sessionStorage.getItem(STORAGE_KEY_JOBS_NEW)
        if (raw) saved = JSON.parse(raw)
      } catch {}

      // Tab restoration
      const targetTab = (urlTab && ['manual', 'screenshot', 'deep-dive', 'ats'].includes(urlTab))
        ? urlTab
        : (saved?.activeTab || 'manual')
      setActiveTab(targetTab)

      // Company restoration
      const targetCompany = urlCompany || saved?.deepDiveCompany || ''
      if (targetCompany) setDeepDiveCompany(targetCompany)
      if (saved?.deepDiveKeywords) setDeepDiveKeywords(saved.deepDiveKeywords)

      // Filter restoration
      const targetLoc = urlLoc || saved?.deepDiveLocFilter || 'india_remote_reloc'
      const targetExp = urlExp || saved?.deepDiveExpFilter || 'fresher'
      const targetSal = urlSal || saved?.deepDiveSalaryFilter || 'all'
      setDeepDiveLocFilter(targetLoc)
      setDeepDiveExpFilter(targetExp)
      setDeepDiveSalaryFilter(targetSal)

      // Restore research data & scores
      let loadedData = null
      let loadedScores = {}
      let loadedTracked = {}

      if (saved?.deepDiveCompany && targetCompany && saved.deepDiveCompany.toLowerCase().trim() === targetCompany.toLowerCase().trim() && saved.researchData) {
        loadedData = saved.researchData
        loadedScores = saved.roleScores || {}
        loadedTracked = saved.trackedJobs || {}
      } else if (targetCompany) {
        try {
          const cacheRaw = sessionStorage.getItem(STORAGE_KEY_DEEP_DIVE_CACHE)
          if (cacheRaw) {
            const cache = JSON.parse(cacheRaw)
            const companyCache = cache[targetCompany.toLowerCase().trim()]
            if (companyCache?.researchData) {
              loadedData = companyCache.researchData
              loadedScores = companyCache.roleScores || {}
              loadedTracked = companyCache.trackedJobs || {}
            }
          }
        } catch {}
      }

      if (loadedData) {
        setResearchData(loadedData)
        setRoleScores(loadedScores)
        setTrackedJobs(loadedTracked)
      } else if (targetCompany && targetTab === 'deep-dive') {
        researchMutation.mutate({ company_name: targetCompany })
      }

      // Restore manual form fields if saved
      if (saved?.rawJd) setRawJd(saved.rawJd)
      if (saved?.source) setSource(saved.source)
      if (saved?.url) setUrl(saved.url)
      if (saved?.companyName) setCompanyName(saved.companyName)

      // Restore ATS form fields if saved
      if (saved?.atsSystem) setAtsSystem(saved.atsSystem)
      if (saved?.companyToken) setCompanyToken(saved.companyToken)
      if (saved?.targetKeywords) setTargetKeywords(saved.targetKeywords)
      if (saved?.atsSubscribe !== undefined) setAtsSubscribe(saved.atsSubscribe)

      isHydratedRef.current = true
    }

    hydrate()

    const handlePopState = () => {
      hydrate()
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  // Sync state to URL and sessionStorage so browser Back button & page refresh never lose selections
  useEffect(() => {
    if (!isHydratedRef.current || typeof window === 'undefined') return

    const params = new URLSearchParams()
    if (activeTab !== 'manual') params.set('tab', activeTab)
    if (activeTab === 'deep-dive') {
      if (deepDiveCompany.trim()) params.set('company', deepDiveCompany.trim())
      if (deepDiveLocFilter !== 'india_remote_reloc') params.set('loc', deepDiveLocFilter)
      if (deepDiveExpFilter !== 'fresher') params.set('exp', deepDiveExpFilter)
      if (deepDiveSalaryFilter !== 'all') params.set('sal', deepDiveSalaryFilter)
    }

    const q = params.toString()
    const newUrl = q ? `/jobs/new?${q}` : '/jobs/new'
    window.history.replaceState(null, '', newUrl)

    try {
      const stateToSave = {
        activeTab,
        deepDiveCompany,
        deepDiveKeywords,
        deepDiveLocFilter,
        deepDiveExpFilter,
        deepDiveSalaryFilter,
        researchData,
        roleScores,
        trackedJobs,
        rawJd,
        source,
        url,
        companyName,
        atsSystem,
        companyToken,
        targetKeywords,
        atsSubscribe
      }
      sessionStorage.setItem(STORAGE_KEY_JOBS_NEW, JSON.stringify(stateToSave))

      if (deepDiveCompany && researchData) {
        const cacheRaw = sessionStorage.getItem(STORAGE_KEY_DEEP_DIVE_CACHE)
        const cache = cacheRaw ? JSON.parse(cacheRaw) : {}
        cache[deepDiveCompany.toLowerCase().trim()] = {
          researchData,
          roleScores,
          trackedJobs,
          timestamp: Date.now()
        }
        sessionStorage.setItem(STORAGE_KEY_DEEP_DIVE_CACHE, JSON.stringify(cache))
      }
    } catch (e) {
      console.warn('Failed saving to sessionStorage:', e)
    }
  }, [
    activeTab,
    deepDiveCompany,
    deepDiveKeywords,
    deepDiveLocFilter,
    deepDiveExpFilter,
    deepDiveSalaryFilter,
    researchData,
    roleScores,
    trackedJobs,
    rawJd,
    source,
    url,
    companyName,
    atsSystem,
    companyToken,
    targetKeywords,
    atsSubscribe
  ])

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
        setNotice({ message: "Direct clipboard read is restricted by your browser. Please press Ctrl+V directly to paste your screenshot!", type: 'info' })
        setTimeout(() => setNotice(null), 5000)
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
          setNotice({ message: "Screenshot detected from clipboard and loaded!", type: 'success' })
          setTimeout(() => setNotice(null), 3000)
          return
        }
      }
      setNotice({ message: "No image found in clipboard! Copy a screenshot first (Win+Shift+S), then press Ctrl+V.", type: 'info' })
      setTimeout(() => setNotice(null), 5000)
    } catch {
      setNotice({ message: "To paste a screenshot, simply press Ctrl+V anywhere on this page!", type: 'info' })
      setTimeout(() => setNotice(null), 4000)
    }
  }

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
    setRoleScores({})
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
    else if (lowerUrl.includes('instahyre.com')) setSource('instahyre')
    else if (lowerUrl.includes('himalayas.app')) setSource('himalayas')
    else if (lowerUrl.includes('remote.co')) setSource('remote.co')
    else if (lowerUrl.includes('ycombinator.com')) setSource('ycombinator')
    else setSource('other')
  }, [url])

  const handleUrlFetch = async () => {
    if (!url) {
      setNotice({ message: "Please enter a job requisition URL first.", type: 'info' })
      setTimeout(() => setNotice(null), 3500)
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
        setError(`Failed to scrape: ${data.detail || 'Site blocked request'}. Please paste the text or screenshot manually.`)
      } else {
        if (data.is_promo) {
          setPromoWarning(`⚠️ Creator Link Warning: This link was detected as an influencer course/bootcamp (${data.promo_name || 'ProPeers/Course'}). It is not an official company job posting. We recommend using Company Deep Dive or Target Companies to find the official careers page!`)
        }
        setRawJd(data.raw_jd)
        if (data.company_name && data.company_name !== 'Company' && !companyName) {
          setCompanyName(data.company_name)
        }
        if (data.resolved_url && data.resolved_url !== url) {
          setUrl(data.resolved_url)
        }
        setNotice({ message: "Requisition text scraped and loaded successfully!", type: 'success' })
        setTimeout(() => setNotice(null), 3000)
      }
    } catch (err) {
      console.error(err)
      setError("Network error while scraping. Please paste the job description text or screenshot directly.")
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
        setTrackedJobs(prev => {
          const next = { ...prev, [idx]: true }
          if (typeof window !== 'undefined') {
            try {
              const raw = sessionStorage.getItem(STORAGE_KEY_JOBS_NEW)
              const saved = raw ? JSON.parse(raw) : {}
              saved.trackedJobs = next
              sessionStorage.setItem(STORAGE_KEY_JOBS_NEW, JSON.stringify(saved))
            } catch {}
          }
          return next
        })
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
      setRoleScores(prev => {
        const next = { ...prev, [idx]: data }
        if (typeof window !== 'undefined') {
          try {
            const raw = sessionStorage.getItem(STORAGE_KEY_JOBS_NEW)
            const saved = raw ? JSON.parse(raw) : {}
            saved.roleScores = next
            sessionStorage.setItem(STORAGE_KEY_JOBS_NEW, JSON.stringify(saved))

            if (deepDiveCompany) {
              const cacheRaw = sessionStorage.getItem(STORAGE_KEY_DEEP_DIVE_CACHE)
              const cache = cacheRaw ? JSON.parse(cacheRaw) : {}
              if (cache[deepDiveCompany.toLowerCase().trim()]) {
                cache[deepDiveCompany.toLowerCase().trim()].roleScores = next
                sessionStorage.setItem(STORAGE_KEY_DEEP_DIVE_CACHE, JSON.stringify(cache))
              }
            }
          } catch {}
        }
        return next
      })
    } catch (err: any) {
      setError(err.message || 'Error scoring role.')
    } finally {
      setScoringRoleIdx(null)
    }
  }

  const handleFullAnalysis = async (job: any, idx: number) => {
    // If this role was already scored and has a valid job_id, directly navigate
    const existingJobId = roleScores[idx]?.job_id
    if (existingJobId) {
      router.push(`/jobs/${existingJobId}`)
      return
    }

    setAnalyzingRoleIdx(idx)
    try {
      const res = await apiFetch('/api/jobs/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          raw_jd: job.raw_jd,
          source: job.source || 'deep_dive_role',
          source_type: 'deep_dive',
          url: job.url,
          company_name: deepDiveCompany,
          role_title: job.role_title
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Failed to start full analysis')
      if (data.job_id) {
        setRoleScores(prev => {
          const next = {
            ...prev,
            [idx]: { ...(prev[idx] || {}), job_id: data.job_id }
          }
          if (typeof window !== 'undefined') {
            try {
              const raw = sessionStorage.getItem(STORAGE_KEY_JOBS_NEW)
              const saved = raw ? JSON.parse(raw) : {}
              saved.roleScores = next
              sessionStorage.setItem(STORAGE_KEY_JOBS_NEW, JSON.stringify(saved))

              if (deepDiveCompany) {
                const cacheRaw = sessionStorage.getItem(STORAGE_KEY_DEEP_DIVE_CACHE)
                const cache = cacheRaw ? JSON.parse(cacheRaw) : {}
                if (cache[deepDiveCompany.toLowerCase().trim()]) {
                  cache[deepDiveCompany.toLowerCase().trim()].roleScores = next
                  sessionStorage.setItem(STORAGE_KEY_DEEP_DIVE_CACHE, JSON.stringify(cache))
                }
              }
            } catch {}
          }
          return next
        })
        router.push(`/jobs/${data.job_id}`)
      } else {
        setNotice({ message: 'Job analysis queued. Navigating to dashboard...', type: 'success' })
        setTimeout(() => router.push('/'), 1200)
      }
    } catch (err: any) {
      setError(`Error starting analysis: ${err.message}`)
    } finally {
      setAnalyzingRoleIdx(null)
    }
  }

  // Filter deep dive jobs by location, experience, and salary
  const filteredDeepDiveJobs = (researchData?.jobs || []).filter((j: any) => {
    // 0. Filter out bogus titles and invalid links
    const INVALID_TITLES = new Set(['not specified', 'unspecified role', 'unknown role', 'park', 'find a park', ''])
    const titleLower = (j.role_title || '').trim().toLowerCase()
    if (!titleLower || INVALID_TITLES.has(titleLower)) return false
    const urlLower = (j.url || '').toLowerCase()
    if (urlLower.includes('wikipedia.org') || urlLower.includes('netflix.com') || urlLower.includes('sohu.com') || urlLower.includes('zhihu.com') || urlLower.includes('baidu.com') || urlLower.includes('nps.gov')) return false

    // 1. Location filtering
    if (deepDiveLocFilter !== 'all') {
      const loc = (j.location || '').toLowerCase()
      const indianCities = ['india', 'bengaluru', 'bangalore', 'mumbai', 'pune', 'hyderabad', 'delhi', 'ncr', 'gurugram', 'noida', 'chennai', 'remote', 'work from home', 'anywhere']
      const isIndiaOrRemote = indianCities.some(city => loc.includes(city)) || j.is_india_or_remote || !loc
      const hasRelocation = Boolean(j.covers_relocation)

      if (deepDiveLocFilter === 'india_remote_reloc') {
        if (!isIndiaOrRemote && !hasRelocation) return false
      } else if (deepDiveLocFilter === 'relocation') {
        if (!hasRelocation) return false
      } else if (deepDiveLocFilter === 'india') {
        if (!indianCities.some(city => loc.includes(city))) return false
      } else {
        if (!loc.includes(deepDiveLocFilter.toLowerCase())) return false
      }
    }

    // 2. Experience filtering
    if (deepDiveExpFilter !== 'all') {
      const exp = (j.experience_level || '').toLowerCase()
      const sen = (j.seniority_required || '').toLowerCase()
      const title = (j.role_title || '').toLowerCase()
      if (deepDiveExpFilter === 'fresher') {
        const isFresher = j.is_fresher_role || exp.includes('0-2') || exp.includes('fresher') || exp.includes('entry') || exp.includes('0-1') || sen === '0-2yr' || sen === 'entry' || title.includes('analyst') || title.includes('associate') || title.includes('graduate') || title.includes('trainee') || title.includes('intern')
        const isSenior = title.includes('senior') || title.includes('sr.') || title.includes('lead') || title.includes('principal') || title.includes('staff') || title.includes('director') || title.includes('manager') || exp.includes('5+')
        if (!isFresher || isSenior) return false
      } else if (deepDiveExpFilter === 'mid') {
        const isMid = exp.includes('2-5') || exp.includes('mid') || sen === '2-5yr' || title.includes('associate')
        if (!isMid) return false
      } else if (deepDiveExpFilter === 'senior') {
        const isSenior = exp.includes('5+') || exp.includes('senior') || exp.includes('lead') || sen === 'senior' || title.includes('senior') || title.includes('lead')
        if (!isSenior) return false
      }
    }

    // 3. Salary filtering
    if (deepDiveSalaryFilter !== 'all') {
      const comp = (j.compensation_range || j.raw_jd || '').toLowerCase();
      // Simple heuristic: look for high numbers in CTC string
      if (deepDiveSalaryFilter === 'high') {
         if (!comp.includes('₹15') && !comp.includes('₹16') && !comp.includes('₹17') && !comp.includes('₹18') && !comp.includes('₹19') && !comp.includes('₹2') && !comp.includes('₹3') && !comp.includes('₹4') && !comp.includes('₹5') && !comp.includes('₹6') && !comp.includes('₹7') && !comp.includes('₹8') && !comp.includes('₹9')) return false;
      } else if (deepDiveSalaryFilter === 'top') {
         if (!comp.includes('₹3') && !comp.includes('₹4') && !comp.includes('₹5') && !comp.includes('₹6') && !comp.includes('₹7') && !comp.includes('₹8') && !comp.includes('₹9')) return false;
      }
    }

    return true
  })

  return (
    <div className="min-h-screen bg-[#050507] text-[#F3EFE7] font-sans pb-20">
      <main className="max-w-5xl mx-auto px-4 sm:px-8 py-10 flex flex-col gap-6">
        {/* Header */}
        <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-2 border-b border-white/[0.08]">
          <div className="flex flex-col gap-2 max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs uppercase tracking-wider text-[#8C97FF]">/ Requisition Studio</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#8C97FF]/15 text-[#8C97FF] border border-[#8C97FF]/30 font-semibold">
                Live Ingestion & OCR
              </span>
            </div>
            <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl leading-[1.04]">
              Paste & Ingest <i className="italic text-[#A9A59C]">Requisitions</i>
            </h1>
            <p className="text-base sm:text-lg leading-relaxed text-[#B4B1A9]">
              Paste a link, full description, or screenshot (<kbd className="px-1.5 py-0.5 rounded bg-white/10 border border-white/20 text-[#F3EFE7] font-mono text-xs">Ctrl+V</kbd>) from LinkedIn, Glassdoor, or any ATS board.
            </p>
          </div>

          <div className="flex items-center p-1 rounded-full bg-white/5 border border-white/10 shrink-0">
            <span className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-[#F3EFE7] text-[#0A0A0C] shadow-sm">
              Single JD & OCR Studio
            </span>
            <Link
              href="/inbox"
              className="px-3.5 py-1.5 rounded-full text-xs font-medium text-[#C9C6BE] hover:text-white transition flex items-center gap-1.5"
              title="Batch Lead Inbox"
            >
              <span>Batch Lead Inbox ↗</span>
            </Link>
          </div>
        </header>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/40 text-rose-300 p-4 rounded-xl text-xs flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-rose-300 hover:text-white font-bold ml-4 cursor-pointer">✕</button>
          </div>
        )}

        {notice && (
          <div
            className={`p-4 rounded-xl text-xs flex items-center justify-between border ${
              notice.type === 'success'
                ? 'bg-[#5EEAA8]/10 border-[#5EEAA8]/30 text-[#5EEAA8]'
                : notice.type === 'error'
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                : 'bg-[#8C97FF]/15 border-[#8C97FF]/35 text-[#C9CCFF]'
            }`}
          >
            <span>{notice.message}</span>
            <button onClick={() => setNotice(null)} className="opacity-75 hover:opacity-100 font-bold ml-4 cursor-pointer">✕</button>
          </div>
        )}

        {/* Global Quick Paste Banner */}
        <div className="glass p-4 rounded-2xl flex flex-wrap items-center justify-between gap-3 border border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[#8C97FF] shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="text-xs text-[#C9C6BE]">
              <span className="font-semibold text-[#F3EFE7]">Instant Screenshot OCR Ready:</span> Copied a hiring alert, JD screenshot, or email snippet? Press{' '}
              <kbd className="px-1.5 py-0.5 rounded bg-white/10 border border-white/20 text-[#F3EFE7] font-mono text-[11px] font-bold">Ctrl+V</kbd>{' '}
              anywhere on this screen to instantly load and parse it.
            </div>
          </div>
          <button 
            type="button"
            onClick={handleClipboardRead}
            className="h-8 px-3.5 rounded-full bg-white/10 hover:bg-white/15 text-xs font-semibold text-[#F3EFE7] border border-white/20 transition flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <span>Paste from Clipboard</span>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap items-center gap-2">
          <button 
            onClick={() => setActiveTab('manual')}
            className={`h-9 px-4 rounded-full text-xs sm:text-sm font-medium transition cursor-pointer border ${
              activeTab === 'manual'
                ? 'bg-[#F3EFE7] text-[#0A0A0C] border-[#F3EFE7] shadow-sm font-semibold'
                : 'bg-white/[0.05] text-[#C9C6BE] border-white/[0.12] hover:bg-white/[0.1]'
            }`}
          >
            Paste Job / URL
          </button>
          <button 
            onClick={() => setActiveTab('screenshot')}
            className={`h-9 px-4 rounded-full text-xs sm:text-sm font-medium transition cursor-pointer border flex items-center gap-1.5 ${
              activeTab === 'screenshot'
                ? 'bg-[#F3EFE7] text-[#0A0A0C] border-[#F3EFE7] shadow-sm font-semibold'
                : 'bg-white/[0.05] text-[#C9C6BE] border-white/[0.12] hover:bg-white/[0.1]'
            }`}
          >
            <span>Screenshot OCR</span>
            {selectedFile && <span className="w-2 h-2 rounded-full bg-[#5EEAA8]"></span>}
          </button>
          <button 
            onClick={() => setActiveTab('deep-dive')}
            className={`h-9 px-4 rounded-full text-xs sm:text-sm font-medium transition cursor-pointer border ${
              activeTab === 'deep-dive'
                ? 'bg-[#F3EFE7] text-[#0A0A0C] border-[#F3EFE7] shadow-sm font-semibold'
                : 'bg-white/[0.05] text-[#C9C6BE] border-white/[0.12] hover:bg-white/[0.1]'
            }`}
          >
            Company Deep Dive
          </button>
          <button 
            onClick={() => setActiveTab('ats')}
            className={`h-9 px-4 rounded-full text-xs sm:text-sm font-medium transition cursor-pointer border ${
              activeTab === 'ats'
                ? 'bg-[#F3EFE7] text-[#0A0A0C] border-[#F3EFE7] shadow-sm font-semibold'
                : 'bg-white/[0.05] text-[#C9C6BE] border-white/[0.12] hover:bg-white/[0.1]'
            }`}
          >
            ATS Board Sync
          </button>
        </div>

        <div className="glass p-6 sm:p-8 rounded-2xl border border-white/10 flex flex-col gap-6">
          
          {/* TAB 1: MANUAL PASTE / URL */}
          {activeTab === 'manual' && (
            <form onSubmit={handleManualSubmit} className="space-y-6">
              <div>
                <h2 className="font-serif text-2xl sm:text-3xl text-[#F3EFE7] mb-1">Analyze a Single Job</h2>
                <p className="text-xs text-[#A8A59D]">Provide an official application link or paste the raw description text.</p>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-[#A8A59D] mb-2">Source Portal</label>
                  <select 
                    className="w-full bg-black/40 border border-white/15 text-[#F3EFE7] rounded-xl p-3 text-sm focus:outline-none focus:border-[#8C97FF] transition-all cursor-pointer"
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                  >
                    <option value="manual" className="bg-[#0A0B0F]">Manual Paste</option>
                    <option value="linkedin" className="bg-[#0A0B0F]">LinkedIn</option>
                    <option value="indeed" className="bg-[#0A0B0F]">Indeed</option>
                    <option value="glassdoor" className="bg-[#0A0B0F]">Glassdoor</option>
                    <option value="naukri" className="bg-[#0A0B0F]">Naukri</option>
                    <option value="wellfound" className="bg-[#0A0B0F]">Wellfound</option>
                    <option value="instahyre" className="bg-[#0A0B0F]">Instahyre</option>
                    <option value="himalayas" className="bg-[#0A0B0F]">Himalayas</option>
                    <option value="remote.co" className="bg-[#0A0B0F]">Remote.co</option>
                    <option value="ycombinator" className="bg-[#0A0B0F]">Y Combinator</option>
                    <option value="other" className="bg-[#0A0B0F]">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-[#A8A59D] mb-2">Company Name (Optional)</label>
                  <input 
                    type="text" 
                    className="w-full bg-black/40 border border-white/15 text-[#F3EFE7] rounded-xl p-3 placeholder-[#6A6863] text-sm focus:outline-none focus:border-[#8C97FF] transition-all"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="e.g. Barclays, Google, HSBC"
                  />
                </div>
              </div>
              
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-xs font-mono uppercase tracking-wider text-[#A8A59D]">Job or Careers Apply URL</label>
                  <span className="text-[11px] text-[#A8A59D]">Auto-resolves shortened lnkd.in links</span>
                </div>
                <div className="flex gap-2">
                  <input 
                    type="url" 
                    className="flex-1 bg-black/40 border border-white/15 text-[#F3EFE7] rounded-xl p-3 placeholder-[#6A6863] text-sm focus:outline-none focus:border-[#8C97FF] transition-all"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://lnkd.in/... or company careers URL"
                  />
                  <button 
                    type="button" 
                    onClick={handleUrlFetch} 
                    disabled={isUrlFetching}
                    className="h-11 px-5 rounded-xl font-medium bg-white/10 hover:bg-white/15 text-white transition text-xs font-mono uppercase tracking-wider disabled:opacity-50 cursor-pointer"
                  >
                    {isUrlFetching ? 'Resolving...' : 'Fetch & Scrape'}
                  </button>
                </div>
              </div>

              {promoWarning && (
                <div className="bg-amber-500/10 border border-amber-500/40 text-amber-300 p-4 rounded-xl text-xs space-y-2">
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
                    className="text-xs font-bold text-white bg-amber-600 hover:bg-amber-500 px-3 py-1.5 rounded transition-colors inline-block cursor-pointer"
                  >
                    Use Company Deep Dive for Official Openings →
                  </button>
                </div>
              )}

              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-[#A8A59D] mb-2">Job Description Text</label>
                <textarea 
                  className="w-full bg-black/40 border border-white/15 text-[#F3EFE7] rounded-xl p-4 font-mono text-xs leading-relaxed placeholder-[#6A6863] focus:outline-none focus:border-[#8C97FF] transition-all" 
                  rows={9}
                  required
                  value={rawJd}
                  onChange={(e) => setRawJd(e.target.value)}
                  placeholder="Paste the full job description or hiring alert text here..."
                />
              </div>

              <button 
                type="submit" 
                disabled={parseMutation.isPending || !rawJd}
                className="w-full h-12 rounded-full bg-[#F3EFE7] text-[#0A0A0C] hover:bg-white font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                {parseMutation.isPending ? 'Analyzing with AI Fit Engine...' : 'Analyze Job Fit'}
              </button>
            </form>
          )}

          {/* TAB 2: SCREENSHOT (CLIPBOARD PASTE + DRAG/DROP + FILE PICKER) */}
          {activeTab === 'screenshot' && (
            <form onSubmit={handleScreenshotSubmit} className="space-y-6">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <h2 className="font-serif text-2xl sm:text-3xl text-[#F3EFE7]">Screenshot OCR Analysis</h2>
                  <span className="text-[11px] font-mono uppercase tracking-wider bg-white/5 text-[#A8A59D] px-2.5 py-1 rounded-full border border-white/10 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#5EEAA8]"></span>
                    Ctrl+V Supported
                  </span>
                </div>
                <p className="text-xs text-[#A8A59D]">
                  Paste any copied screenshot directly (<kbd className="bg-white/10 border border-white/20 px-1.5 py-0.5 rounded text-[#F3EFE7] font-mono text-[10px]">Ctrl+V</kbd>), drag & drop, or browse image files. Perfect for LinkedIn infographics, hiring alerts, and role specs.
                </p>
              </div>

              {/* Paste Notification Banner */}
              {pastedFromClipboard && (
                <div className="bg-[#5EEAA8]/10 border border-[#5EEAA8]/30 text-[#5EEAA8] p-3 rounded-xl text-xs flex items-center justify-between animate-in fade-in duration-300">
                  <div className="flex items-center gap-2">
                    <span>✅</span>
                    <span><strong>Screenshot Pasted from Clipboard!</strong> Ready for AI vision extraction.</span>
                  </div>
                  <button 
                    type="button" 
                    onClick={() => { setSelectedFile(null); setPastedFromClipboard(false); }}
                    className="text-xs text-[#A8A59D] hover:text-white cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
              )}

              {/* Live Image Preview OR Dropzone */}
              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-[#A8A59D] mb-2">
                  Dropzone / Clipboard
                </label>
                {imagePreviewUrl ? (
                  <div className="bg-black/40 border border-white/15 rounded-2xl p-6 text-center space-y-4">
                    <div className="relative inline-block max-w-full">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img 
                        src={imagePreviewUrl} 
                        alt="Screenshot Preview" 
                        className="max-h-80 mx-auto rounded-xl object-contain shadow-2xl border border-white/10"
                      />
                      <button
                        type="button"
                        onClick={() => { setSelectedFile(null); setImagePreviewUrl(null); }}
                        className="absolute top-2 right-2 bg-black/80 hover:bg-rose-500/80 text-white rounded-full p-2 transition-colors shadow-lg text-xs cursor-pointer border border-white/20"
                        title="Remove Screenshot"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="text-xs text-[#A8A59D] flex items-center justify-center gap-3 font-mono">
                      <span>📁 {selectedFile?.name || 'clipboard_screenshot.png'}</span>
                      <span className="text-white/20">•</span>
                      <span>{selectedFile ? (selectedFile.size / 1024).toFixed(1) + ' KB' : ''}</span>
                      <span className="text-white/20">•</span>
                      <button 
                        type="button"
                        onClick={() => { setSelectedFile(null); setImagePreviewUrl(null); }}
                        className="text-[#8C97FF] hover:underline cursor-pointer"
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
                        setError('Please drop an image file (PNG, JPG, WebP).')
                      }
                    }
                  }}
                  className={`border border-dashed rounded-2xl p-10 text-center transition-all cursor-pointer ${
                    isDragOver ? 'border-[#8C97FF] bg-[#8C97FF]/10' : 'border-white/15 bg-black/40 hover:border-white/30'
                  }`}
                >
                  <input 
                    type="file" 
                    accept="image/png, image/jpeg, image/jpg, image/webp"
                    className="hidden" 
                    id="file-upload"
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        setSelectedFile(e.target.files[0])
                      }
                    }}
                  />
                  <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center">
                    <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white mb-3">
                      <Upload className="w-5 h-5 text-[#A8A59D]" />
                    </div>
                    <span className="text-[#F3EFE7] text-sm font-semibold mb-1">
                      Press <kbd className="bg-white/10 border border-white/20 px-1.5 py-0.5 rounded text-[#F3EFE7] font-mono text-xs">Ctrl+V</kbd> to Paste Screenshot
                    </span>
                    <span className="text-[#A8A59D] text-xs mt-1 mb-4">
                      or drag and drop an image file here, or click to browse
                    </span>
                    <button 
                      type="button" 
                      onClick={(e) => { e.stopPropagation(); handleClipboardRead(); }}
                      className="h-9 px-4 rounded-full bg-white/10 hover:bg-white/15 text-[#F3EFE7] text-xs font-mono uppercase tracking-wider transition border border-white/15 cursor-pointer flex items-center gap-2"
                    >
                      <Copy className="w-3.5 h-3.5 text-[#A8A59D]" />
                      Paste from Clipboard
                    </button>
                    <span className="text-[#6A6863] text-[11px] mt-4 font-mono">Supports PNG, JPG, WebP up to 10MB</span>
                  </label>
                </div>
              )}
              </div>

              <button 
                type="submit" 
                disabled={isUploading || !selectedFile}
                className="w-full h-12 rounded-full bg-[#F3EFE7] text-[#0A0A0C] hover:bg-white font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                {isUploading ? (
                  <>
                    <span className="animate-spin text-base leading-none">⚙️</span>
                    <span>Extracting Text & Analyzing Job Fit...</span>
                  </>
                ) : (
                  'Analyze Screenshot Fit'
                )}
              </button>
            </form>
          )}

        {/* TAB 3: COMPANY DEEP DIVE */}
        {activeTab === 'deep-dive' && (
          <div className="space-y-6">
            <form onSubmit={handleDeepDiveSubmit} className="space-y-6">
              <div>
                <h2 className="font-serif text-2xl sm:text-3xl text-[#F3EFE7] mb-1">Company Deep Dive & Live Roles</h2>
                <p className="text-xs text-[#A8A59D]">
                  Research enterprise culture, verified salary brackets (Analyst/Associate/SDE), and discover live openings across official career portals.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-[#A8A59D] mb-2">Company Name</label>
                  <input 
                    type="text" 
                    className="w-full bg-black/40 border border-white/15 text-[#F3EFE7] rounded-xl p-3 placeholder-[#6A6863] text-sm focus:outline-none focus:border-[#8C97FF] transition-all"
                    value={deepDiveCompany}
                    onChange={(e) => setDeepDiveCompany(e.target.value)}
                    placeholder="e.g. Barclays, Google, HSBC, Microsoft"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-[#A8A59D] mb-2">Target Role Keywords (Optional)</label>
                  <input 
                    type="text" 
                    className="w-full bg-black/40 border border-white/15 text-[#F3EFE7] rounded-xl p-3 placeholder-[#6A6863] text-sm focus:outline-none focus:border-[#8C97FF] transition-all"
                    value={deepDiveKeywords}
                    onChange={(e) => setDeepDiveKeywords(e.target.value)}
                    placeholder="e.g. Analyst, Associate, Engineer, SDE"
                  />
                </div>
              </div>
              <button 
                type="submit" 
                disabled={researchMutation.isPending || !deepDiveCompany}
                className="w-full h-12 rounded-full bg-[#F3EFE7] text-[#0A0A0C] hover:bg-white font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                {researchMutation.isPending ? (
                  <>
                    <span className="animate-spin text-base leading-none">⚙️</span>
                    <span>Discovering Live Roles & Intelligence for {deepDiveCompany}...</span>
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
                  <div className="bg-black/40 p-6 rounded-2xl border border-white/15 shadow-sm">
                    <h3 className="font-mono text-xs uppercase tracking-wider text-[#A8A59D] mb-4 flex items-center gap-2">
                      <span className="text-[#5EEAA8]">💰</span> Verified Compensation Breakdown
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-white/10 text-[#A8A59D] text-xs font-mono uppercase tracking-wider">
                            <th className="py-3 px-4 font-semibold">Level / Role</th>
                            <th className="py-3 px-4 font-semibold">Base Pay</th>
                            <th className="py-3 px-4 font-semibold">Bonus</th>
                            <th className="py-3 px-4 font-semibold">Stock</th>
                            <th className="py-3 px-4 font-semibold text-right text-[#5EEAA8]">Total CTC</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 text-[#F3EFE7]">
                          {researchData.company_info.compensation_levels.map((lvl: any, i: number) => (
                            <tr key={i} className="hover:bg-white/[0.02]">
                              <td className="py-3 px-4 font-medium text-[#F3EFE7]">{lvl.level_name}</td>
                              <td className="py-3 px-4 font-mono">{lvl.base_pay}</td>
                              <td className="py-3 px-4 font-mono text-[#A8A59D]">{lvl.bonus || '—'}</td>
                              <td className="py-3 px-4 font-mono text-[#A8A59D]">{lvl.stock || '—'}</td>
                              <td className="py-3 px-4 font-mono font-bold text-right text-[#5EEAA8]">{lvl.total_comp}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Intelligence Report */}
                <div className="bg-black/40 p-6 sm:p-8 rounded-2xl border border-white/15 shadow-sm backdrop-blur-sm">
                  <h3 className="font-mono text-xs uppercase tracking-wider text-[#A8A59D] mb-6 flex items-center gap-2">
                    <span className="text-[#8C97FF]">🏢</span> Company Intelligence Report
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div>
                        <strong className="text-[#A8A59D] font-mono uppercase tracking-widest text-[11px] block mb-1">Work Culture</strong>
                        <p className="text-[#F3EFE7] text-xs leading-relaxed">{researchData.company_info.work_culture}</p>
                      </div>
                      <div>
                        <strong className="text-[#A8A59D] font-mono uppercase tracking-widest text-[11px] block mb-1">Work / Life Balance</strong>
                        <p className="text-[#F3EFE7] text-xs leading-relaxed">{researchData.company_info.work_life_balance}</p>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <strong className="text-[#A8A59D] font-mono uppercase tracking-widest text-[11px] block mb-1">Compensation Overview</strong>
                        <p className="text-[#F3EFE7] text-xs leading-relaxed">{researchData.company_info.compensation_estimates}</p>
                      </div>
                      <div>
                        <strong className="text-[#A8A59D] font-mono uppercase tracking-widest text-[11px] block mb-1">Perks & Benefits</strong>
                        <p className="text-[#F3EFE7] text-xs leading-relaxed">{researchData.company_info.perks}</p>
                      </div>
                      <div>
                        <strong className="text-[#A8A59D] font-mono uppercase tracking-widest text-[11px] block mb-1">Bonds / Contracts</strong>
                        <p className="text-[#F3EFE7] text-xs leading-relaxed">{researchData.company_info.bonds_or_contracts}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Tech Stack if available */}
                {researchData.company_info?.tech_stack && researchData.company_info.tech_stack.length > 0 && (
                  <div className="bg-black/40 p-6 rounded-2xl border border-white/15 shadow-sm space-y-3">
                    <h3 className="text-xs font-mono uppercase tracking-wider text-[#A8A59D] flex items-center gap-2">
                      <span className="text-[#8C97FF]">⚡</span> Verified Engineering & Production Tech Stack
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {researchData.company_info.tech_stack.map((tech: string, idx: number) => (
                        <span
                          key={idx}
                          className="px-3 py-1 rounded-lg text-xs font-mono bg-white/5 text-[#F3EFE7] border border-white/10"
                        >
                          {tech}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Interview Process if available */}
                {researchData.company_info?.interview_process && (
                  <div className="bg-black/40 p-6 rounded-2xl border border-white/15 shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-mono uppercase tracking-wider text-[#A8A59D] flex items-center gap-2">
                        <span>🎯</span> Interview Process & Assessment Bar
                      </h3>
                      {researchData.company_info.interview_process.difficulty && (
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-amber-500/10 text-amber-300 border border-amber-500/30">
                          Bar: {researchData.company_info.interview_process.difficulty}
                        </span>
                      )}
                    </div>
                    {researchData.company_info.interview_process.rounds && (
                      <div className="space-y-2">
                        {researchData.company_info.interview_process.rounds.map((round: string, idx: number) => (
                          <div key={idx} className="flex items-start gap-2.5 text-xs text-[#F3EFE7]">
                            <span className="w-5 h-5 rounded-full bg-white/10 text-white font-mono text-[11px] flex items-center justify-center shrink-0">
                              {idx + 1}
                            </span>
                            <span>{round}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {researchData.company_info.interview_process.tips && (
                      <div className="p-3 bg-white/5 rounded-xl border border-white/10 text-xs text-[#F3EFE7]">
                        <strong className="text-[#A8A59D] font-mono uppercase text-[11px] mr-1">Pro-Tip:</strong> {researchData.company_info.interview_process.tips}
                      </div>
                    )}
                  </div>
                )}
                
                {/* Auto-Discovered Roles with Location Filter */}
                <div>
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                    <div>
                      <h3 className="font-serif text-2xl text-[#F3EFE7] flex items-center gap-2">
                        <span>🎯</span> Open Roles Discovered ({filteredDeepDiveJobs.length})
                      </h3>
                      {researchData.careers_url ? (
                        <a 
                          href={researchData.careers_url} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="text-xs text-[#8C97FF] hover:underline font-mono inline-block mt-1"
                        >
                          Official Careers Portal: {researchData.careers_url} ↗
                        </a>
                      ) : (
                        <p className="text-xs text-[#A8A59D] mt-1">
                          No verified official careers page found for this company — we only show links on the company&apos;s own domain or its ATS.
                        </p>
                      )}
                    </div>

                    {/* Place and Experience Filter Dropdowns */}
                    <div className="flex flex-wrap items-center gap-3">
                      {/* Location Filter */}
                      <div className="flex items-center gap-1.5">
                        <label className="text-[11px] text-[#A8A59D] font-mono uppercase">Place:</label>
                        <select
                          value={deepDiveLocFilter}
                          onChange={(e) => setDeepDiveLocFilter(e.target.value)}
                          className="bg-black/40 border border-white/15 text-[#F3EFE7] text-xs rounded-xl px-3 py-1.5 focus:outline-none focus:border-[#8C97FF]"
                        >
                          <option value="india_remote_reloc" className="bg-[#0A0A0C] text-[#F3EFE7]">🇮🇳 India, Remote & Abroad with Relocation (Fresher Focus)</option>
                          <option value="india" className="bg-[#0A0A0C] text-[#F3EFE7]">🇮🇳 India (Any)</option>
                          <option value="bengaluru" className="bg-[#0A0A0C] text-[#F3EFE7]">Bengaluru / Bangalore</option>
                          <option value="mumbai" className="bg-[#0A0A0C] text-[#F3EFE7]">Mumbai</option>
                          <option value="pune" className="bg-[#0A0A0C] text-[#F3EFE7]">Pune</option>
                          <option value="hyderabad" className="bg-[#0A0A0C] text-[#F3EFE7]">Hyderabad</option>
                          <option value="delhi" className="bg-[#0A0A0C] text-[#F3EFE7]">Delhi / NCR</option>
                          <option value="chennai" className="bg-[#0A0A0C] text-[#F3EFE7]">Chennai</option>
                          <option value="remote" className="bg-[#0A0A0C] text-[#F3EFE7]">Remote Only</option>
                          <option value="relocation" className="bg-[#0A0A0C] text-[#F3EFE7]">✈️ Abroad with Relocation Covered</option>
                          <option value="all" className="bg-[#0A0A0C] text-[#F3EFE7]">🌍 All Locations (Including Unsponsored Abroad)</option>
                        </select>
                      </div>

                      {/* Experience Filter */}
                      <div className="flex items-center gap-1.5">
                        <label className="text-[11px] text-[#A8A59D] font-mono uppercase">Experience:</label>
                        <select
                          value={deepDiveExpFilter}
                          onChange={(e) => setDeepDiveExpFilter(e.target.value)}
                          className="bg-black/40 border border-white/15 text-[#F3EFE7] text-xs rounded-xl px-3 py-1.5 focus:outline-none focus:border-[#8C97FF]"
                        >
                          <option value="fresher" className="bg-[#0A0A0C] text-[#F3EFE7]">🎓 Freshers / 0-2 Yrs (Entry Level & Interns)</option>
                          <option value="all" className="bg-[#0A0A0C] text-[#F3EFE7]">All Experience Levels</option>
                          <option value="mid" className="bg-[#0A0A0C] text-[#F3EFE7]">💼 2-5 Yrs (Mid-Level)</option>
                          <option value="senior" className="bg-[#0A0A0C] text-[#F3EFE7]">⭐ 5+ Yrs (Senior & Lead)</option>
                        </select>
                      </div>

                      {/* Salary Filter */}
                      <div className="flex items-center gap-1.5">
                        <label className="text-[11px] text-[#A8A59D] font-mono uppercase">Salary:</label>
                        <select
                          value={deepDiveSalaryFilter}
                          onChange={(e) => setDeepDiveSalaryFilter(e.target.value)}
                          className="bg-black/40 border border-white/15 text-[#F3EFE7] text-xs rounded-xl px-3 py-1.5 focus:outline-none focus:border-[#8C97FF]"
                        >
                          <option value="all" className="bg-[#0A0A0C] text-[#F3EFE7]">All Salaries</option>
                          <option value="high" className="bg-[#0A0A0C] text-[#F3EFE7]">₹15.0L+ CTC</option>
                          <option value="top" className="bg-[#0A0A0C] text-[#F3EFE7]">₹30.0L+ CTC</option>
                        </select>
                      </div>

                      {(deepDiveLocFilter !== 'india_remote_reloc' || deepDiveExpFilter !== 'fresher' || deepDiveSalaryFilter !== 'all') && (
                        <button
                          onClick={() => {
                            setDeepDiveLocFilter('india_remote_reloc')
                            setDeepDiveExpFilter('fresher')
                            setDeepDiveSalaryFilter('all')
                          }}
                          className="text-xs text-[#8C97FF] hover:underline font-mono"
                        >
                          Reset to Fresher Filters
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
                        const isAnalyzingThis = analyzingRoleIdx === i

                        return (
                          <div key={i} className="bg-black/40 p-5 rounded-2xl border border-white/15 space-y-4 hover:border-white/30 transition-all duration-300">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <h3 
                                    onClick={() => handleFullAnalysis(j, i)}
                                    className="font-serif text-lg text-[#F3EFE7] hover:text-[#8C97FF] cursor-pointer transition-colors flex items-center gap-1.5"
                                    title="Click to view full analysis and tailored materials"
                                  >
                                    <span>{j.role_title}</span>
                                    <span className="text-xs text-[#A8A59D] hover:text-white">↗</span>
                                  </h3>
                                  {j.experience_level && (
                                    <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full border ${
                                      j.experience_level.includes('0-2') || j.experience_level.includes('Freshers')
                                        ? 'bg-[#5EEAA8]/10 text-[#5EEAA8] border-[#5EEAA8]/25'
                                        : j.experience_level.includes('5+')
                                        ? 'bg-[#8C97FF]/10 text-[#8C97FF] border-[#8C97FF]/25'
                                        : 'bg-white/10 text-white/90 border-white/15'
                                    }`}>
                                      {j.experience_level}
                                    </span>
                                  )}
                                  {j.covers_relocation && (
                                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border bg-[#8C97FF]/10 text-[#8C97FF] border-[#8C97FF]/25 flex items-center gap-1">
                                      <span>✈️</span> Relocation Covered
                                    </span>
                                  )}
                                  {j.is_fresher_role && !j.experience_level?.includes('0-2') && (
                                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border bg-[#5EEAA8]/10 text-[#5EEAA8] border-[#5EEAA8]/25 flex items-center gap-1">
                                      <span>🎓</span> Fresher Friendly
                                    </span>
                                  )}
                                  {j.is_abroad && !j.covers_relocation && (
                                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border bg-white/5 text-[#A8A59D] border-white/10 flex items-center gap-1">
                                      <span>⚠️</span> Overseas (No Relocation)
                                    </span>
                                  )}
                                  {j.compensation_range && (
                                    <span className="text-[10px] text-[#5EEAA8] font-mono bg-white/5 px-2.5 py-0.5 rounded-full border border-white/10">
                                      💰 {j.compensation_range}
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-[#A8A59D] font-mono mt-1.5 flex flex-wrap items-center gap-2">
                                  <span>📍 {j.location || "India"}</span>
                                  <span className="text-white/20">•</span>
                                  <span className="capitalize text-[#A8A59D]">
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
                                      <span className="text-white/20">•</span>
                                      <span className="text-[#6A6863]">Skills: {j.required_skills.slice(0, 4).join(', ')}</span>
                                    </>
                                  )}
                                </div>
                              </div>

                              {/* Top Fit Score Badge if scored */}
                              {score && (
                                <div className="flex items-center gap-3 shrink-0">
                                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-mono uppercase tracking-wider ${
                                    score.verdict === 'apply'
                                      ? 'bg-[#5EEAA8]/15 text-[#5EEAA8] border border-[#5EEAA8]/30'
                                      : score.verdict === 'stretch'
                                      ? 'bg-[#8C97FF]/15 text-[#8C97FF] border border-[#8C97FF]/30'
                                      : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                                  }`}>
                                    {score.verdict === 'apply' ? '✓ APPLY' : score.verdict === 'stretch' ? '⚡ STRETCH' : '✕ SKIP'}
                                  </span>
                                  <div className="text-right">
                                    <div className={`text-2xl font-serif font-bold ${
                                      score.match_score >= 80 ? 'text-[#5EEAA8]' : score.match_score >= 50 ? 'text-amber-400' : 'text-[#6A6863]'
                                    }`}>
                                      {score.match_score}
                                    </div>
                                    <div className="text-[9px] text-[#A8A59D] uppercase font-mono tracking-widest">Fit Score</div>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Inline Scoring Report if evaluated */}
                            {score && (
                              <div className="bg-black/60 p-4 rounded-xl border border-white/10 text-xs space-y-2 animate-in fade-in duration-300">
                                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
                                  <span className="text-[#F3EFE7]">
                                    🎯 <strong>Experience Fit:</strong> {score.seniority_fit === 'good_fit' || score.seniority_fit === 'ideal' ? 'Direct Match for your background' : score.seniority_fit}
                                  </span>
                                  {score.matched_keywords && score.matched_keywords.length > 0 && (
                                    <span className="text-[#5EEAA8]">
                                      Matched: {score.matched_keywords.slice(0, 4).join(', ')}
                                    </span>
                                  )}
                                </div>
                                {score.reasoning && (
                                  <p className="text-[#A8A59D] text-xs leading-relaxed">
                                    {score.reasoning}
                                  </p>
                                )}
                                <div className="pt-1 flex justify-end font-mono">
                                  {score.job_id ? (
                                    <Link href={`/jobs/${score.job_id}`} className="text-[#8C97FF] hover:text-white font-medium hover:underline flex items-center gap-1">
                                      <span>View Deep Breakdown & Cover Letter</span>
                                      <span>→</span>
                                    </Link>
                                  ) : (
                                    <button 
                                      type="button"
                                      onClick={() => handleFullAnalysis(j, i)}
                                      disabled={isAnalyzingThis}
                                      className="text-[#8C97FF] hover:text-white font-medium hover:underline flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                                    >
                                      <span>{isAnalyzingThis ? '⚙️ Opening Analysis...' : 'View Deep Breakdown & Cover Letter →'}</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Action Buttons */}
                            <div className="pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs">
                              {/* Direct Apply Option */}
                              {(j.url || researchData.careers_url) && (
                                <a 
                                  href={j.url || researchData.careers_url} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  className="bg-[#F3EFE7] text-[#0A0A0C] font-semibold px-3.5 py-1.5 rounded-full text-xs hover:bg-white transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                                  title="Open official job application in a new tab"
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
                                  className="bg-white/10 hover:bg-white/15 text-[#F3EFE7] border border-white/15 px-3 py-1.5 rounded-full text-xs font-mono uppercase tracking-wider transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                                  title="Scores this role against your resume and tells whether to apply or skip"
                                >
                                  <span>{isScoringThis ? '⚙️' : '📊'}</span>
                                  <span>{isScoringThis ? 'Scoring...' : (score ? 'Re-Score' : 'Score Fit')}</span>
                                </button>

                                {/* Track Button */}
                                <button 
                                  type="button" 
                                  onClick={() => handleTrackDiscoveredJob(j, i)}
                                  className={`px-3 py-1.5 rounded-full text-xs font-mono uppercase tracking-wider transition-all flex items-center gap-1 cursor-pointer ${
                                    isTracked ? 'bg-[#5EEAA8]/15 text-[#5EEAA8] border border-[#5EEAA8]/30' : 'bg-white/5 hover:bg-white/10 text-[#A8A59D] border border-white/10'
                                  }`}
                                >
                                  {isTracked ? '✓ In Tracker' : '+ Track'}
                                </button>

                                {/* Full Analysis */}
                                <button 
                                  type="button" 
                                  onClick={() => handleFullAnalysis(j, i)}
                                  disabled={isAnalyzingThis}
                                  className="bg-white/10 hover:bg-white/15 text-[#F3EFE7] border border-white/15 px-3.5 py-1.5 rounded-full text-xs font-mono uppercase tracking-wider transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                                  title="Analyze full JD, view match score breakdown, and generate tailored cover letter"
                                >
                                  {isAnalyzingThis ? (
                                    <>
                                      <span className="animate-spin text-[10px]">⚙️</span>
                                      <span>Analyzing...</span>
                                    </>
                                  ) : (
                                    <>
                                      <span>Full Analysis</span>
                                      <span>→</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-12 bg-black/40 rounded-2xl border border-white/15">
                      <p className="text-[#A8A59D] text-sm">No jobs matching your filters.</p>
                      <button 
                        onClick={() => {
                          setDeepDiveLocFilter('all')
                          setDeepDiveExpFilter('all')
                        }} 
                        className="mt-2 text-xs text-[#8C97FF] hover:underline font-mono"
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
              <h2 className="font-serif text-2xl sm:text-3xl text-[#F3EFE7] mb-1">Bulk ATS Sync & Search</h2>
              <p className="text-xs text-[#A8A59D]">Automatically scrape a company&apos;s career page for open roles.</p>
              <div className="mt-3 p-3 bg-white/5 border border-white/10 rounded-xl text-xs text-[#A8A59D] leading-relaxed">
                <strong className="text-[#F3EFE7] font-mono uppercase tracking-wider text-[11px] block mb-1">Supported Platforms</strong>
                Greenhouse, Lever, Ashby, and SmartRecruiters provide open APIs allowing safe bulk-fetching. For Workday, Taleo, or iCIMS, use Company Deep Dive.
              </div>
            </div>
            
            <div className="bg-black/40 p-5 rounded-2xl border border-white/15 mb-6">
              <label className="block text-xs font-mono uppercase tracking-wider text-[#A8A59D] mb-2">Auto-Detect ATS (Magic ✨)</label>
              <div className="flex gap-3">
                <input 
                  type="text"
                  placeholder="Enter Company Name (e.g. Stripe, Figma, Airbnb)"
                  className="flex-1 bg-black/40 border border-white/15 text-[#F3EFE7] rounded-xl p-3 placeholder-[#6A6863] text-sm focus:outline-none focus:border-[#8C97FF] transition-all"
                  id="autoDetectInput"
                />
                <button
                  type="button"
                  onClick={() => {
                    const input = document.getElementById('autoDetectInput') as HTMLInputElement;
                    if (input && input.value) {
                      discoverAtsMutation.mutate(input.value);
                    }
                  }}
                  disabled={discoverAtsMutation.isPending}
                  className="h-11 px-5 rounded-xl font-medium bg-white/10 hover:bg-white/15 text-white transition text-xs font-mono uppercase tracking-wider flex items-center justify-center cursor-pointer border border-white/10 shrink-0"
                >
                  {discoverAtsMutation.isPending ? 'Detecting...' : 'Detect'}
                </button>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-[#A8A59D] mb-2">ATS System</label>
                <select 
                  className="w-full bg-black/40 border border-white/15 text-[#F3EFE7] rounded-xl p-3 text-sm focus:outline-none focus:border-[#8C97FF] transition-all"
                  value={atsSystem}
                  onChange={(e) => setAtsSystem(e.target.value)}
                >
                  <option value="greenhouse" className="bg-[#0A0A0C] text-[#F3EFE7]">Greenhouse</option>
                  <option value="lever" className="bg-[#0A0A0C] text-[#F3EFE7]">Lever</option>
                  <option value="ashby" className="bg-[#0A0A0C] text-[#F3EFE7]">Ashby</option>
                  <option value="smartrecruiters" className="bg-[#0A0A0C] text-[#F3EFE7]">SmartRecruiters</option>
                  <option value="generic" className="bg-[#0A0A0C] text-[#F3EFE7]">Generic Fallback (Workday/Taleo)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-[#A8A59D] mb-2">
                  {atsSystem === 'generic' ? 'Full URL' : 'Company Token'}
                </label>
                <input 
                  type="text" 
                  className="w-full bg-black/40 border border-white/15 text-[#F3EFE7] rounded-xl p-3 placeholder-[#6A6863] text-sm focus:outline-none focus:border-[#8C97FF] transition-all"
                  value={companyToken}
                  onChange={(e) => setCompanyToken(e.target.value)}
                  placeholder={atsSystem === 'generic' ? "https://company.wd1.myworkdayjobs.com/..." : "e.g. 'stripe' for Lever, 'airbnb' for Greenhouse"}
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-[#A8A59D] mb-2">Target Keywords (Optional, Comma separated)</label>
              <input 
                type="text" 
                className="w-full bg-black/40 border border-white/15 text-[#F3EFE7] rounded-xl p-3 placeholder-[#6A6863] text-sm focus:outline-none focus:border-[#8C97FF] transition-all"
                value={targetKeywords}
                onChange={(e) => setTargetKeywords(e.target.value)}
                placeholder="e.g. engineer, developer, backend, frontend"
              />
            </div>

            <div className="flex items-center gap-3 bg-black/40 p-4 rounded-xl border border-white/15">
              <input 
                type="checkbox" 
                id="atsSubscribe"
                checked={atsSubscribe}
                onChange={(e) => setAtsSubscribe(e.target.checked)}
                className="w-4 h-4 bg-black/60 border border-white/20 rounded accent-[#8C97FF] cursor-pointer"
              />
              <label htmlFor="atsSubscribe" className="text-xs font-medium text-[#A8A59D] cursor-pointer">
                Subscribe to updates (automatically fetch new roles for these keywords every 12 hours)
              </label>
            </div>

            <button 
              type="submit" 
              disabled={atsMutation.isPending || !companyToken}
              className="w-full h-12 rounded-full bg-[#F3EFE7] text-[#0A0A0C] hover:bg-white font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              {atsMutation.isPending ? (
                <>
                  <span className="animate-spin text-base leading-none">⚙️</span>
                  <span>Starting Scrape...</span>
                </>
              ) : (
                'Scrape Company Jobs'
              )}
            </button>
          </form>
        )}

        {activeTab === 'ats' && subscriptions && subscriptions.length > 0 && (
          <div className="mt-12 space-y-4">
            <h3 className="font-serif text-2xl text-[#F3EFE7] flex items-center gap-2">
              <span>🔄</span> Active Auto-Scrape Subscriptions
            </h3>
            <div className="grid gap-3">
              {subscriptions.map((sub: any) => (
                <div key={sub.id} className="bg-black/40 p-4 rounded-xl border border-white/15 flex justify-between items-center group">
                  <div>
                    <h4 className="font-semibold text-[#F3EFE7] text-base">{sub.company_token} <span className="text-[#A8A59D] text-xs font-mono ml-2 capitalize">({sub.ats_system})</span></h4>
                    <div className="text-xs text-[#A8A59D] font-mono mt-1">
                      Keywords: {sub.target_keywords ? <span className="text-[#8C97FF]">{sub.target_keywords}</span> : 'All Jobs'}
                    </div>
                  </div>
                  <button 
                    onClick={() => deleteSubMutation.mutate(sub.id)}
                    disabled={deleteSubMutation.isPending}
                    className="text-rose-400 hover:text-rose-300 font-mono uppercase tracking-wider text-xs px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-full transition-all disabled:opacity-50 cursor-pointer"
                  >
                    Unsubscribe
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        </div>
      </main>
    </div>
  )
}
