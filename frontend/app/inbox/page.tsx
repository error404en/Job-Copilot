"use client"

import { useState, useEffect } from "react"
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

export default function InboxPage() {
  const { fetch: apiFetch, isLoaded, isSignedIn } = useApiClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actioningId, setActioningId] = useState<string | null>(null)
  const [opportunities, setOpportunities] = useState<any[]>([])
  const [textInput, setTextInput] = useState("")
  const [fileInput, setFileInput] = useState<File | null>(null)
  const [activeTab, setActiveTab] = useState<"text" | "file">("text")
  
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    fetchOpportunities()
    const interval = setInterval(fetchOpportunities, 5000)
    return () => clearInterval(interval)
  }, [isLoaded, isSignedIn])

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
      const sType = ['pdf', 'docx', 'xlsx', 'csv'].includes(ext!) ? ext : 'image'
      formData.append("source_type", sType!)
      
      const res = await apiFetch("/api/inbox/upload", {
        method: "POST",
        body: formData
      })
      if (!res.ok) throw new Error(await responseError(res, "Failed to upload opportunities"))
      setFileInput(null)
      await fetchOpportunities()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to upload opportunities")
    } finally {
      setLoading(false)
    }
  }

  const handleOpportunityAction = async (opportunityId: string, action: "reject" | "save") => {
    setActioningId(opportunityId)
    setError(null)
    try {
      const res = await apiFetch(`/api/inbox/opportunities/${opportunityId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
      })
      if (!res.ok) throw new Error(await responseError(res, `Failed to ${action} opportunity`))
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
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 border-b border-zinc-800/80 pb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center text-white shadow-[0_0_20px_rgba(244,63,94,0.3)] border border-pink-400/20">
              <Inbox className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                  Opportunity Inbox
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-500/10 text-rose-400 border border-rose-500/30">
                  Lead Ingestion
                </span>
              </div>
            </div>
          </div>
          <p className="text-xs sm:text-sm text-zinc-400 max-w-2xl leading-relaxed">
            Directly ingest unformatted leads from WhatsApp groups, Telegram channels, and LinkedIn posts. Our parser cleans tracking links, detects scam funnels, and extracts structured job records.
          </p>
        </div>

        <div className="bg-zinc-900/60 px-4 py-2 rounded-2xl border border-zinc-800/80 text-right shrink-0">
          <span className="text-2xl font-black text-white">{opportunities.length}</span>
          <p className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Pending Leads</p>
        </div>
      </div>

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
                    accept=".pdf,.docx,.xlsx,.csv,image/*"
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    onChange={(e) => setFileInput(e.target.files?.[0] || null)}
                  />
                  <div className="flex flex-col items-center justify-center space-y-2 pointer-events-none">
                    <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 group-hover:text-indigo-400 group-hover:scale-110 transition-all">
                      <Upload className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs sm:text-sm font-semibold text-zinc-200">
                        {fileInput ? fileInput.name : 'Drop file or screenshot here'}
                      </p>
                      <p className="text-[11px] text-zinc-500 mt-0.5">
                        Supports PDF, DOCX, XLSX, CSV, and PNG/JPEG screenshots
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
          </div>
        </div>

        {/* Right Column: Discovered Opportunities */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800/80">
            <h3 className="font-bold text-base text-white flex items-center gap-2">
              <span>Discovered Opportunities</span>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-zinc-800 text-zinc-300">
                {opportunities.length}
              </span>
            </h3>
            <span className="text-[11px] text-zinc-500">Auto-refreshed live</span>
          </div>

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
              {opportunities.map((opp) => {
                const isActioning = actioningId === opp.id
                const isVerified = opp.status === 'verified' || opp.verification_status === 'verified'
                const isPromo = opp.verification_status === 'promo_funnel'
                const isUnverified = opp.status === 'unverified'

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
                      {opp.extraction_metadata?.experience_req && (
                        <p className="text-xs text-zinc-400">
                          Seniority / Experience: <strong className="text-zinc-200">{opp.extraction_metadata.experience_req}</strong>
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
                          onClick={() => handleOpportunityAction(opp.id, "save")}
                          disabled={isActioning || opp.status === "ineligible"}
                          className="px-4 py-1.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-[0_0_15px_rgba(16,185,129,0.25)] transition-all disabled:opacity-50 flex items-center gap-1.5 active:scale-95"
                        >
                          {isActioning ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <BookmarkCheck className="w-3.5 h-3.5" />
                          )}
                          <span>Promote to Jobs</span>
                        </button>
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
