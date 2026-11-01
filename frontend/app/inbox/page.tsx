"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { 
  Inbox, 
  Upload, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  XCircle, 
  Loader2, 
  Sparkles, 
  ArrowUpRight, 
  Building2, 
  MapPin, 
  ShieldCheck, 
  ExternalLink,
  Trash2,
  BookmarkCheck
} from "lucide-react"
import { useApiClient } from "@/lib/useApiClient"
import { PageHeader } from "@/components/ui/PageHeader"

export default function InboxPage() {
  const { fetch: apiFetch, isLoaded, isSignedIn } = useApiClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actioningId, setActioningId] = useState<string | null>(null)
  const [opportunities, setOpportunities] = useState<any[]>([])
  const [textInput, setTextInput] = useState("")
  const [fileInput, setFileInput] = useState<File | null>(null)
  const [activeTab, setActiveTab] = useState<"text" | "file">("text")
  const [progressSourceId, setProgressSourceId] = useState<string | null>(null)
  const [progressData, setProgressData] = useState<any>(null)
  const [triageFilter, setTriageFilter] = useState<"high_fit" | "stretch" | "promoted" | "off_target" | "all">("all")
  const [optimizing, setOptimizing] = useState(false)
  const [cleaning, setCleaning] = useState(false)
  const [copilotMessage, setCopilotMessage] = useState<string | null>(null)

  const deriveCopilotFit = (opp: any): { fit: "high_fit" | "stretch" | "off_target"; score: number; reason: string } => {
    const meta = opp.extraction_metadata || {}
    if (meta.copilot_fit && typeof meta.copilot_score === "number") {
      return {
        fit: meta.copilot_fit,
        score: meta.copilot_score,
        reason: meta.copilot_reason || ""
      }
    }
    const roleLower = (opp.role_title || "").toLowerCase()
    const qualLower = (meta.qualification || "").toLowerCase()
    const offTargetPatterns = [
      "talent acquisition", "recruiter", "human resources", "hr intern",
      "resource management", "marketing intern", "social media", "service desk",
      "voice process", "bpo", "copywriter", "sales executive"
    ]
    if (
      opp.status === "ineligible" ||
      opp.verification_status === "promo_funnel" ||
      offTargetPatterns.some((p) => roleLower.includes(p)) ||
      ((qualLower.includes("commerce") || qualLower.includes("finance") || qualLower.includes("mba")) && !roleLower.includes("tech") && !roleLower.includes("data") && !roleLower.includes("software"))
    ) {
      return { fit: "off_target", score: 24, reason: "Off-target domain (HR / Recruiting / Marketing / Non-Tech)" }
    }
    const highFitPatterns = [
      "software", "sde", "developer", "data engineer", "data analyst", "data scien",
      "ai", "ml", "machine learning", "genai", "backend", "frontend", "full stack",
      "technology consulting", "btsa", "qa", "testing", "automation", "android", "ios", "cloud", "devops"
    ]
    if (highFitPatterns.some((p) => roleLower.includes(p))) {
      return { fit: "high_fit", score: 86, reason: "Strong technical & domain alignment with your profile" }
    }
    return { fit: "stretch", score: 62, reason: "General graduate / rotational program — review eligibility" }
  }

  const handleCopilotOptimize = async () => {
    setOptimizing(true)
    setError(null)
    setCopilotMessage(null)
    try {
      const res = await apiFetch("/api/inbox/copilot-optimize", { method: "POST" })
      if (!res.ok) throw new Error(await responseError(res, "Copilot optimization failed"))
      const data = await res.json()
      setCopilotMessage(data.message || "Copilot optimized your leads.")
      setTriageFilter("high_fit")
      await fetchOpportunities()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Copilot optimization failed")
    } finally {
      setOptimizing(false)
    }
  }

  const handleCleanupRejected = async () => {
    setCleaning(true)
    setError(null)
    try {
      const res = await apiFetch("/api/inbox/cleanup", { method: "DELETE" })
      if (!res.ok) throw new Error(await responseError(res, "Cleanup failed"))
      const data = await res.json()
      setCopilotMessage(data.message || "Purged rejected leads.")
      await fetchOpportunities()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cleanup failed")
    } finally {
      setCleaning(false)
    }
  }
  
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    fetchOpportunities()
    const pollMs = progressSourceId ? 2500 : 5000
    const interval = setInterval(() => {
      fetchOpportunities()
      if (progressSourceId) {
        checkProgress(progressSourceId)
      }
    }, pollMs)
    return () => clearInterval(interval)
  }, [isLoaded, isSignedIn, progressSourceId])

  const checkProgress = async (sourceId: string) => {
    try {
      const res = await apiFetch(`/api/inbox/sources/${sourceId}/progress`)
      if (res.ok) {
        const data = await res.json()
        setProgressData(data)
        if (data.status === 'completed' || data.status === 'failed') {
          setProgressSourceId(null)
          if (data.status === 'failed') {
            setError("Batch parsing failed.")
          }
        }
      }
    } catch (e) {
      console.error(e)
    }
  }

  const responseError = async (res: Response, fallback: string) => {
    try {
      const data = await res.json()
      return data.detail || fallback
    } catch {
      return fallback
    }
  }

  const fetchOpportunities = async () => {
    try {
      const res = await apiFetch("/api/inbox/opportunities")
      if (!res.ok) throw new Error(await responseError(res, "Failed to load opportunities"))
      const data = await res.json()
      setOpportunities(data.opportunities || [])
    } catch (e) {
      console.error(e)
    }
  }

  const handleTextSubmit = async () => {
    if (!textInput.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch("/api/inbox/text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: textInput, source_type: "text" })
      })
      if (!res.ok) throw new Error(await responseError(res, "Failed to extract opportunities"))
      const data = await res.json()
      if (data.source_id) {
        setProgressSourceId(data.source_id)
        setProgressData({ status: "processing", extracted_total: 0 })
      }
      setTextInput("")
      await fetchOpportunities()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to extract opportunities")
    } finally {
      setLoading(false)
    }
  }
  
  const handleFileUpload = async () => {
    if (!fileInput) return
    setLoading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append("file", fileInput)
      const ext = fileInput.name.split('.').pop()?.toLowerCase()
      let sType = 'image'
      if (['pdf', 'docx', 'xlsx', 'csv'].includes(ext!)) sType = ext!
      if (['txt', 'zip'].includes(ext!)) sType = 'whatsapp_export'
      formData.append("source_type", sType)
      
      const res = await apiFetch("/api/inbox/upload", {
        method: "POST",
        body: formData
      })
      if (!res.ok) throw new Error(await responseError(res, "Failed to upload opportunities"))
      
      const data = await res.json()
      if (sType === 'whatsapp_export' && data.source_id) {
         setProgressSourceId(data.source_id)
         setProgressData({ status: 'processing', extracted_total: 0 })
      }
      setFileInput(null)
      await fetchOpportunities()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to upload opportunities")
    } finally {
      setLoading(false)
    }
  }

  const handleOpportunityAction = async (opportunityId: string, action: "reject" | "save" | "save_later") => {
    setActioningId(opportunityId)
    setError(null)
    try {
      const apiAction = action === "save_later" ? "save" : action
      const res = await apiFetch(`/api/inbox/opportunities/${opportunityId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: apiAction })
      })
      if (!res.ok) throw new Error(await responseError(res, `Failed to ${action} opportunity`))
      
      const data = await res.json()
      if (action === "save_later" && data.job_id && !data.is_duplicate) {
         await apiFetch("/api/applications", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ job_id: data.job_id, status: "saved" })
         })
      }
      await fetchOpportunities()
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to ${action} opportunity`)
    } finally {
      setActioningId(null)
    }
  }

  const fillSamplePost = (type: 'stripe' | 'zomato') => {
    if (type === 'stripe') {
      setTextInput(
        `🚨 Hiring Alert at Stripe!\nWe are looking for a GenAI Software Engineer to join our team in Bangalore (Remote/Hybrid).\nStack: Python, PyTorch, LangChain, RAG architectures, FastAPI.\nSeniority: 0-2 yrs experience.\nOfficial Application Link: https://boards.greenhouse.io/stripe/jobs/4251203002`
      )
    } else {
      setTextInput(
        `Urgent opening for Backend Engineer at Zomato. Gurgaon / Remote. Looking for candidates skilled in Python, FastAPI, Microservices, and Redis. Pay: ₹18-24 LPA. Referral link: https://jobs.smartrecruiters.com/Zomato1/7439999`
      )
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-16 font-sans">
      
      {/* Unified Page Header */}
      <PageHeader
        suite="Ingestion & Extraction Studio"
        title="Opportunity Ingestion"
        subtitle="Directly ingest unformatted leads from WhatsApp groups, Telegram channels, and LinkedIn posts. Copilot unwraps community links, auto-cleans off-target noise, and promotes High-Fit roles into your Live Feed."
        icon={Inbox}
        badge="Copilot Lead Triage"
        badgeColor="rose"
        actions={
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={handleCopilotOptimize}
              disabled={optimizing || opportunities.length === 0}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-indigo-600 via-violet-600 to-teal-600 hover:from-indigo-500 hover:to-teal-500 shadow-[0_0_20px_rgba(99,102,241,0.3)] transition-all disabled:opacity-40 flex items-center gap-1.5 active:scale-95"
              title="Auto-reject off-target roles (HR/Marketing/BCom), deduplicate leads, and promote + score High-Fit tech roles"
            >
              {optimizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              <span>{optimizing ? "Copilot Optimizing..." : "✨ Copilot Auto-Optimize Leads"}</span>
            </button>
            <button
              type="button"
              onClick={handleCleanupRejected}
              disabled={cleaning || !opportunities.some((o) => o.status === "ineligible")}
              className="px-3 py-2 rounded-xl text-xs font-semibold text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 transition-all disabled:opacity-40 flex items-center gap-1.5 active:scale-95"
              title="Permanently remove rejected & off-target leads from your workspace"
            >
              {cleaning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              <span>Purge Rejected</span>
            </button>
            <div className="bg-zinc-900/60 px-4 py-2 rounded-2xl border border-zinc-800/80 text-right shrink-0">
              <span className="text-2xl font-black text-white">{opportunities.filter((o) => o.status !== "ineligible").length}</span>
              <p className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Active Leads</p>
            </div>
          </div>
        }
      />

      {copilotMessage && (
        <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-xs text-emerald-200 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-semibold">{copilotMessage}</span>
          </div>
          <button onClick={() => setCopilotMessage(null)} className="font-bold hover:text-white px-2 py-1 text-sm">×</button>
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-xs text-rose-300 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="font-bold hover:text-white px-2 py-1 text-sm">×</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Form: Ingestion Console */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-zinc-900/60 p-6 rounded-3xl border border-zinc-800/80 backdrop-blur-xl shadow-xl space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Ingest New Lead</h2>
              
              {/* Mode Toggle */}
              <div className="flex bg-zinc-950/80 p-1 rounded-xl border border-zinc-800">
                <button
                  type="button"
                  onClick={() => setActiveTab("text")}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                    activeTab === "text" ? "bg-indigo-600 text-white shadow-sm" : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  Text / Links
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("file")}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                    activeTab === "file" ? "bg-indigo-600 text-white shadow-sm" : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  File / Image
                </button>
              </div>
            </div>

            {/* Quick Sample Helpers */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block">Quick Test Samples:</span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => fillSamplePost('stripe')}
                  className="text-[11px] font-medium bg-zinc-800/80 hover:bg-zinc-800 text-indigo-300 border border-zinc-700 px-2.5 py-1 rounded-xl transition-all flex items-center gap-1 active:scale-95"
                >
                  <Sparkles className="w-3 h-3 text-indigo-400" />
                  Stripe GenAI Lead
                </button>
                <button
                  type="button"
                  onClick={() => fillSamplePost('zomato')}
                  className="text-[11px] font-medium bg-zinc-800/80 hover:bg-zinc-800 text-rose-300 border border-zinc-700 px-2.5 py-1 rounded-xl transition-all flex items-center gap-1 active:scale-95"
                >
                  <Sparkles className="w-3 h-3 text-rose-400" />
                  Zomato Backend Lead
                </button>
              </div>
            </div>

            {activeTab === "text" ? (
              <div className="space-y-4">
                <textarea
                  placeholder="Paste unstructured post, WhatsApp message, Telegram forward, or job requisition text..."
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  className="w-full min-h-[220px] bg-zinc-950/60 border border-zinc-800 rounded-2xl p-4 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30 transition-all leading-relaxed resize-none"
                />

                <button
                  type="button"
                  onClick={handleTextSubmit}
                  disabled={loading || !textInput.trim()}
                  className="w-full bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white py-2.5 rounded-xl font-bold text-xs transition-all shadow-[0_0_20px_rgba(79,70,229,0.3)] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-95"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                      <span>Extracting Structured Opportunity...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 text-indigo-200" />
                      <span>Extract & Verify Opportunities</span>
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="relative border-2 border-dashed border-zinc-800 hover:border-indigo-500/60 rounded-2xl p-8 transition-all text-center group bg-zinc-950/40">
                  <input
                    type="file"
                    accept=".pdf,.docx,.xlsx,.csv,.txt,.zip,image/*"
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    onChange={(e) => setFileInput(e.target.files?.[0] || null)}
                  />
                  <div className="flex flex-col items-center justify-center space-y-2 pointer-events-none">
                    <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 group-hover:text-indigo-400 group-hover:scale-110 transition-all">
                      <Upload className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs sm:text-sm font-semibold text-zinc-200">
                        {fileInput ? fileInput.name : 'Drop file, screenshot, or WhatsApp .zip here'}
                      </p>
                      <p className="text-[11px] text-zinc-500 mt-0.5">
                        Supports PDF, DOCX, XLSX, CSV, WhatsApp Export (.zip/.txt), and images
                      </p>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleFileUpload}
                  disabled={loading || !fileInput}
                  className="w-full bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white py-2.5 rounded-xl font-bold text-xs transition-all shadow-[0_0_20px_rgba(79,70,229,0.3)] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-95"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                      <span>Parsing Document via OCR...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-3.5 h-3.5 text-indigo-200" />
                      <span>Upload & Extract</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {progressData && (
              <div className="bg-zinc-900/80 rounded-xl border border-indigo-500/30 p-4 space-y-3 mt-4 text-xs shadow-inner">
                <div className="flex justify-between items-center text-zinc-300 font-semibold mb-1">
                  <span className="flex items-center gap-2">
                    {progressData.status === 'processing' ? <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" /> : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                    Batch Processing Progress
                  </span>
                  <span className="text-indigo-300">{progressData.extracted_total} Extracted</span>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                   <div className="bg-zinc-800/60 p-2 rounded-lg border border-zinc-700/50 flex flex-col">
                     <span className="text-emerald-400 font-bold">{progressData.verified || 0}</span>
                     <span className="text-zinc-500 text-[10px] uppercase">Verified</span>
                   </div>
                   <div className="bg-zinc-800/60 p-2 rounded-lg border border-zinc-700/50 flex flex-col">
                     <span className="text-amber-400 font-bold">{progressData.needs_check || 0}</span>
                     <span className="text-zinc-500 text-[10px] uppercase">Needs Check</span>
                   </div>
                   <div className="bg-zinc-800/60 p-2 rounded-lg border border-zinc-700/50 flex flex-col">
                     <span className="text-rose-400 font-bold">{progressData.rejected || 0}</span>
                     <span className="text-zinc-500 text-[10px] uppercase">Rejected</span>
                   </div>
                   <div className="bg-zinc-800/60 p-2 rounded-lg border border-zinc-700/50 flex flex-col">
                     <span className="text-zinc-300 font-bold">{progressData.pending || 0}</span>
                     <span className="text-zinc-500 text-[10px] uppercase">Pending Resolvers</span>
                   </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Discovered Opportunities */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800/80">
            <h3 className="font-bold text-base text-white flex items-center gap-2">
              <span>Copilot Lead Triage Queue</span>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-zinc-800 text-zinc-300">
                {opportunities.length}
              </span>
            </h3>
            <span className="text-[11px] text-zinc-500">Auto-refreshed live</span>
          </div>

          {/* Copilot Triage Tabs */}
          {opportunities.length > 0 && (() => {
            const highFitCount = opportunities.filter((o) => deriveCopilotFit(o).fit === "high_fit" && o.status !== "ineligible").length
            const stretchCount = opportunities.filter((o) => deriveCopilotFit(o).fit === "stretch" && o.status !== "ineligible").length
            const promotedCount = opportunities.filter((o) => Boolean(o.job_id)).length
            const offTargetCount = opportunities.filter((o) => deriveCopilotFit(o).fit === "off_target" || o.status === "ineligible").length

            return (
              <div className="flex flex-wrap items-center gap-1.5 bg-zinc-900/70 p-1.5 rounded-2xl border border-zinc-800/80">
                <button
                  type="button"
                  onClick={() => setTriageFilter("all")}
                  className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all ${
                    triageFilter === "all" ? "bg-zinc-800 text-white shadow-sm" : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  All Active ({opportunities.filter((o) => o.status !== "ineligible").length})
                </button>
                <button
                  type="button"
                  onClick={() => setTriageFilter("high_fit")}
                  className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all flex items-center gap-1 ${
                    triageFilter === "high_fit"
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                      : "text-zinc-400 hover:text-emerald-300"
                  }`}
                >
                  🔥 High-Fit Target ({highFitCount})
                </button>
                <button
                  type="button"
                  onClick={() => setTriageFilter("stretch")}
                  className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all flex items-center gap-1 ${
                    triageFilter === "stretch"
                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                      : "text-zinc-400 hover:text-amber-300"
                  }`}
                >
                  ⚡ Stretch ({stretchCount})
                </button>
                <button
                  type="button"
                  onClick={() => setTriageFilter("promoted")}
                  className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all flex items-center gap-1 ${
                    triageFilter === "promoted"
                      ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40"
                      : "text-zinc-400 hover:text-indigo-300"
                  }`}
                >
                  🚀 In Live Feed ({promotedCount})
                </button>
                <button
                  type="button"
                  onClick={() => setTriageFilter("off_target")}
                  className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all flex items-center gap-1 ${
                    triageFilter === "off_target"
                      ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                      : "text-zinc-500 hover:text-rose-300"
                  }`}
                >
                  🧹 Off-Target / Rejected ({offTargetCount})
                </button>
              </div>
            )
          })()}

          {opportunities.length === 0 ? (
            <div className="bg-zinc-900/40 p-12 rounded-3xl border border-zinc-800/60 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-xl mx-auto text-zinc-500">
                📬
              </div>
              <h3 className="text-sm font-bold text-white">Inbox is clear</h3>
              <p className="text-xs text-zinc-500 max-w-sm mx-auto leading-relaxed">
                Paste raw job leads from communities or click one of the quick test sample buttons on the left to extract your first opportunity.
              </p>
            </div>
          ) : (
            <div className="space-y-4 max-h-[780px] overflow-y-auto pr-1">
              {opportunities
                .filter((opp) => {
                  const cFit = deriveCopilotFit(opp).fit
                  if (triageFilter === "high_fit") return cFit === "high_fit" && opp.status !== "ineligible"
                  if (triageFilter === "stretch") return cFit === "stretch" && opp.status !== "ineligible"
                  if (triageFilter === "promoted") return Boolean(opp.job_id)
                  if (triageFilter === "off_target") return cFit === "off_target" || opp.status === "ineligible"
                  return opp.status !== "ineligible"
                })
                .map((opp) => {
                const isActioning = actioningId === opp.id
                const isVerified = opp.status === 'verified' || opp.verification_status === 'verified'
                const isPromo = opp.verification_status === 'promo_funnel'
                const copilotInfo = deriveCopilotFit(opp)

                return (
                  <div key={opp.id} className="bg-zinc-900/60 p-5 rounded-3xl border border-zinc-800/80 shadow-md space-y-3 hover:border-zinc-700 transition-all">
                    
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {isVerified ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                              <ShieldCheck className="w-3 h-3" /> Official ATS
                            </span>
                          ) : isPromo ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-500/15 text-rose-300 border border-rose-500/30 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" /> Promo Funnel Flagged
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" /> Community Lead
                            </span>
                          )}

                          {/* Copilot Fit Badge */}
                          {copilotInfo.fit === "high_fit" ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-200 border border-indigo-500/40">
                              🔥 Copilot High-Fit • {copilotInfo.score}%
                            </span>
                          ) : copilotInfo.fit === "stretch" ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-200 border border-amber-500/30">
                              ⚡ Stretch Fit • {copilotInfo.score}%
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30">
                              🧹 Off-Target Role • {copilotInfo.score}%
                            </span>
                          )}

                          {opp.job_id && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-500/15 text-teal-300 border border-teal-500/30">
                              🚀 In Live Feed
                            </span>
                          )}

                          {opp.extraction_metadata?.work_mode && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-zinc-800 text-zinc-300">
                              {opp.extraction_metadata.work_mode}
                            </span>
                          )}
                        </div>

                        <h4 className="font-bold text-base text-white truncate pr-2 pt-1">
                          {opp.role_title || "Unspecified Role"}
                        </h4>

                        <div className="flex items-center gap-2.5 text-xs text-zinc-400 flex-wrap">
                          <span className="font-semibold text-zinc-200 flex items-center gap-1">
                            <Building2 className="w-3.5 h-3.5 text-indigo-400" />
                            {opp.company || "Unknown Entity"}
                          </span>
                          {opp.location && (
                            <>
                              <span>•</span>
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3.5 h-3.5 text-zinc-500" />
                                {opp.location}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Metadata & Skills */}
                    <div className="space-y-2 pt-1">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400">
                        {opp.extraction_metadata?.experience_req && (
                          <span>
                            Batch / Exp: <strong className="text-zinc-200">{opp.extraction_metadata.experience_req}</strong>
                          </span>
                        )}
                        {opp.extraction_metadata?.salary && (
                          <span>
                            Comp: <strong className="text-emerald-300">{opp.extraction_metadata.salary}</strong>
                          </span>
                        )}
                      </div>
                      {opp.extraction_metadata?.qualification && (
                        <p className="text-[11px] text-zinc-400">
                          Eligibility: <span className="text-zinc-300">{opp.extraction_metadata.qualification}</span>
                        </p>
                      )}

                      {opp.extraction_metadata?.skills && opp.extraction_metadata.skills.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {opp.extraction_metadata.skills.slice(0, 5).map((skill: string, i: number) => (
                            <span key={i} className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-zinc-800/80 border border-zinc-700 text-zinc-300">
                              {skill}
                            </span>
                          ))}
                        </div>
                      )}
                      
                      {(opp.relevance_explanation || copilotInfo.reason) && (
                        <p className="text-[11px] text-zinc-500 italic">
                          💡 {opp.relevance_explanation || copilotInfo.reason}
                        </p>
                      )}
                    </div>

                    {/* Bottom Action Footer */}
                    <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between gap-3">
                      <div className="text-xs text-zinc-500 truncate max-w-[55%]">
                        {opp.verified_official_url ? (
                          <a
                            href={opp.verified_official_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1"
                          >
                            <span>Official ATS Link</span>
                            <ArrowUpRight className="w-3 h-3" />
                          </a>
                        ) : opp.original_submitted_url ? (
                          <span className="text-zinc-400 truncate flex items-center gap-1">
                            <ExternalLink className="w-3 h-3 text-zinc-500" />
                            {new URL(opp.original_submitted_url).hostname}
                          </span>
                        ) : (
                          <span>Unlinked Source</span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {opp.job_id ? (
                          <div className="flex items-center gap-1.5">
                            <Link
                              href={`/jobs/${opp.job_id}`}
                              className="px-3 py-1.5 rounded-xl text-xs font-bold text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 transition-all flex items-center gap-1 shadow-sm"
                            >
                              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                              <span>Match Studio</span>
                            </Link>
                            <Link
                              href={`/jobs/${opp.job_id}?tab=coach`}
                              className="px-3 py-1.5 rounded-xl text-xs font-bold text-purple-300 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 transition-all flex items-center gap-1 shadow-sm"
                            >
                              <span>Coach Prep</span>
                            </Link>
                          </div>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => handleOpportunityAction(opp.id, "reject")}
                              disabled={isActioning}
                              className="px-3 py-1.5 rounded-xl text-xs font-semibold text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 border border-zinc-800 transition-all disabled:opacity-50"
                            >
                              Reject
                            </button>
                            
                            <button
                              type="button"
                              onClick={() => handleOpportunityAction(opp.id, "save_later")}
                              disabled={isActioning || opp.status === "ineligible"}
                              className="px-3 py-1.5 rounded-xl text-xs font-bold text-teal-300 bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/30 transition-all disabled:opacity-50 flex items-center gap-1.5 active:scale-95"
                            >
                              <BookmarkCheck className="w-3.5 h-3.5" />
                              <span>Save for Later</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleOpportunityAction(opp.id, "save")}
                              disabled={isActioning || opp.status === "ineligible"}
                              className="px-4 py-1.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-[0_0_15px_rgba(16,185,129,0.25)] transition-all disabled:opacity-50 flex items-center gap-1.5 active:scale-95"
                            >
                              {isActioning ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Sparkles className="w-3.5 h-3.5" />
                              )}
                              <span>Apply Now</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                  </div>
                )
              })}
            </div>
          )}
        </div>

      </div>

    </div>
  )
}
