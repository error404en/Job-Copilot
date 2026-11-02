"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Inbox,
  Upload,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  ArrowUpRight,
  Building2,
  MapPin,
  ShieldCheck,
  ExternalLink,
  Trash2,
  BookmarkCheck,
  Search,
  Link2,
  GraduationCap,
  Briefcase,
  Banknote,
  X,
} from "lucide-react";
import { useApiClient } from "@/lib/useApiClient";
import { PageHeader } from "@/components/ui/PageHeader";

export default function InboxPage() {
  const { fetch: apiFetch, isLoaded, isSignedIn } = useApiClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [opportunities, setOpportunities] = useState<any[]>([]);
  const [textInput, setTextInput] = useState("");
  const [fileInput, setFileInput] = useState<File | null>(null);
  const [activeTab, setActiveTab] = useState<"text" | "file">("text");
  const [progressSourceId, setProgressSourceId] = useState<string | null>(null);
  const [progressData, setProgressData] = useState<any>(null);
  const [triageFilter, setTriageFilter] = useState<
    "high_fit" | "stretch" | "promoted" | "off_target" | "all"
  >("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [optimizing, setOptimizing] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [copilotMessage, setCopilotMessage] = useState<string | null>(null);

  const deriveCopilotFit = (
    opp: any
  ): { fit: "high_fit" | "stretch" | "off_target"; score: number; reason: string } => {
    const meta = opp.extraction_metadata || {};
    if (meta.copilot_fit && typeof meta.copilot_score === "number") {
      return {
        fit: meta.copilot_fit,
        score: meta.copilot_score,
        reason: meta.copilot_reason || "",
      };
    }
    const roleLower = (opp.role_title || "").toLowerCase();
    const qualLower = (meta.qualification || "").toLowerCase();
    const offTargetPatterns = [
      "talent acquisition",
      "recruiter",
      "human resources",
      "hr intern",
      "resource management",
      "marketing intern",
      "social media",
      "service desk",
      "voice process",
      "bpo",
      "copywriter",
      "sales executive",
    ];
    if (
      opp.status === "ineligible" ||
      opp.verification_status === "promo_funnel" ||
      offTargetPatterns.some((p) => roleLower.includes(p)) ||
      ((qualLower.includes("commerce") ||
        qualLower.includes("finance") ||
        qualLower.includes("mba")) &&
        !roleLower.includes("tech") &&
        !roleLower.includes("data") &&
        !roleLower.includes("software"))
    ) {
      return {
        fit: "off_target",
        score: 24,
        reason: "Off-target domain (HR / Recruiting / Marketing / Non-Tech)",
      };
    }
    const highFitPatterns = [
      "software",
      "sde",
      "developer",
      "data engineer",
      "data analyst",
      "data scien",
      "ai",
      "ml",
      "machine learning",
      "genai",
      "backend",
      "frontend",
      "full stack",
      "technology consulting",
      "btsa",
      "qa",
      "testing",
      "automation",
      "android",
      "ios",
      "cloud",
      "devops",
    ];
    if (highFitPatterns.some((p) => roleLower.includes(p))) {
      return {
        fit: "high_fit",
        score: 88,
        reason: "Direct alignment with your technical engineering & data profile",
      };
    }
    return {
      fit: "stretch",
      score: 64,
      reason: "General graduate / rotational program — review eligibility criteria",
    };
  };

  const responseError = async (res: Response, fallback: string) => {
    try {
      const data = await res.json();
      return data.detail || fallback;
    } catch {
      return fallback;
    }
  };

  const fetchOpportunities = async () => {
    try {
      const res = await apiFetch("/api/inbox/opportunities");
      if (!res.ok) throw new Error(await responseError(res, "Failed to load opportunities"));
      const data = await res.json();
      setOpportunities(data.opportunities || []);
    } catch (e) {
      console.error(e);
    }
  };

  const checkProgress = async (sourceId: string) => {
    try {
      const res = await apiFetch(`/api/inbox/sources/${sourceId}/progress`);
      if (res.ok) {
        const data = await res.json();
        setProgressData(data);
        if (data.status === "completed" || data.status === "failed") {
          setProgressSourceId(null);
          if (data.status === "failed") {
            setError("Batch parsing failed.");
          }
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    fetchOpportunities();
    const pollMs = progressSourceId ? 2500 : 5000;
    const interval = setInterval(() => {
      fetchOpportunities();
      if (progressSourceId) {
        checkProgress(progressSourceId);
      }
    }, pollMs);
    return () => clearInterval(interval);
  }, [isLoaded, isSignedIn, progressSourceId]);

  const handleCopilotOptimize = async () => {
    setOptimizing(true);
    setError(null);
    setCopilotMessage(null);
    try {
      const res = await apiFetch("/api/inbox/copilot-optimize", { method: "POST" });
      if (!res.ok) throw new Error(await responseError(res, "Copilot optimization failed"));
      const data = await res.json();
      setCopilotMessage(data.message || "Copilot optimized your leads.");
      setTriageFilter("high_fit");
      await fetchOpportunities();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Copilot optimization failed");
    } finally {
      setOptimizing(false);
    }
  };

  const handleCleanupRejected = async () => {
    setCleaning(true);
    setError(null);
    try {
      const res = await apiFetch("/api/inbox/cleanup", { method: "DELETE" });
      if (!res.ok) throw new Error(await responseError(res, "Cleanup failed"));
      const data = await res.json();
      setCopilotMessage(data.message || "Purged rejected leads.");
      await fetchOpportunities();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cleanup failed");
    } finally {
      setCleaning(false);
    }
  };

  const handleTextSubmit = async () => {
    if (!textInput.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/inbox/text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: textInput, source_type: "text" }),
      });
      if (!res.ok) throw new Error(await responseError(res, "Failed to extract opportunities"));
      const data = await res.json();
      if (data.source_id) {
        setProgressSourceId(data.source_id);
        setProgressData({ status: "processing", extracted_total: 0 });
      }
      setTextInput("");
      await fetchOpportunities();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to extract opportunities");
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async () => {
    if (!fileInput) return;
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", fileInput);
      const ext = fileInput.name.split(".").pop()?.toLowerCase();
      let sType = "image";
      if (["pdf", "docx", "xlsx", "csv"].includes(ext!)) sType = ext!;
      if (["txt", "zip"].includes(ext!)) sType = "whatsapp_export";
      formData.append("source_type", sType);

      const res = await apiFetch("/api/inbox/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error(await responseError(res, "Failed to upload opportunities"));

      const data = await res.json();
      if (sType === "whatsapp_export" && data.source_id) {
        setProgressSourceId(data.source_id);
        setProgressData({ status: "processing", extracted_total: 0 });
      }
      setFileInput(null);
      await fetchOpportunities();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to upload opportunities");
    } finally {
      setLoading(false);
    }
  };

  const handleOpportunityAction = async (
    opportunityId: string,
    action: "reject" | "save" | "save_later"
  ) => {
    setActioningId(opportunityId);
    setError(null);
    try {
      const apiAction = action === "save_later" ? "save" : action;
      const res = await apiFetch(`/api/inbox/opportunities/${opportunityId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: apiAction }),
      });
      if (!res.ok) throw new Error(await responseError(res, `Failed to ${action} opportunity`));

      const data = await res.json();
      if (action === "save_later" && data.job_id && !data.is_duplicate) {
        await apiFetch("/api/applications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ job_id: data.job_id, status: "saved" }),
        });
      }
      await fetchOpportunities();
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to ${action} opportunity`);
    } finally {
      setActioningId(null);
    }
  };

  const fillSamplePost = (type: "stripe" | "zomato" | "broadcast") => {
    if (type === "stripe") {
      setTextInput(
        `Hiring Alert at Stripe!\nWe are looking for a GenAI Software Engineer to join our team in Bangalore (Remote/Hybrid).\nStack: Python, PyTorch, LangChain, RAG architectures, FastAPI.\nSeniority: 0-2 yrs experience.\nOfficial Application Link: https://boards.greenhouse.io/stripe/jobs/4251203002`
      );
    } else if (type === "zomato") {
      setTextInput(
        `Urgent opening for Backend Engineer at Zomato. Gurgaon / Remote. Looking for candidates skilled in Python, FastAPI, Microservices, and Redis. Pay: ₹18-24 LPA. Referral link: https://jobs.smartrecruiters.com/Zomato1/7439999`
      );
    } else {
      setTextInput(
        `🔗Company : HackerRank\nRole : Software Development Engineer Intern\nQualification : Bachelor's degree\nPassing Year : 2028 | 2027\nLocation : Bengaluru, India\nSalary : 50,000 - 70,000/Month(Stipend)\n📌Link : https://thejobcompany.co.in/frontend/job_details?job_id=6561\n\n🔗Company : Primetrace Technologies\nRole : Android - SDE 1\nQualification : Any body with skills\nPassing Year : Experience(1-3 yrs)\nLocation : Bengaluru, India\nSalary : 12 - 20 LPA (Expected)\n📌Link : https://thejobcompany.co.in/frontend/job_details?job_id=6545`
      );
    }
  };

  const activeTotalCount = opportunities.filter((o) => o.status !== "ineligible").length;
  const highFitCount = opportunities.filter(
    (o) => deriveCopilotFit(o).fit === "high_fit" && o.status !== "ineligible"
  ).length;
  const stretchCount = opportunities.filter(
    (o) => deriveCopilotFit(o).fit === "stretch" && o.status !== "ineligible"
  ).length;
  const promotedCount = opportunities.filter((o) => Boolean(o.job_id)).length;
  const offTargetCount = opportunities.filter(
    (o) => deriveCopilotFit(o).fit === "off_target" || o.status === "ineligible"
  ).length;

  const filteredOpportunities = opportunities.filter((opp) => {
    const cFit = deriveCopilotFit(opp).fit;
    if (triageFilter === "high_fit" && (cFit !== "high_fit" || opp.status === "ineligible"))
      return false;
    if (triageFilter === "stretch" && (cFit !== "stretch" || opp.status === "ineligible"))
      return false;
    if (triageFilter === "promoted" && !opp.job_id) return false;
    if (triageFilter === "off_target" && cFit !== "off_target" && opp.status !== "ineligible")
      return false;
    if (triageFilter === "all" && opp.status === "ineligible") return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const hay = `${opp.role_title || ""} ${opp.company || ""} ${opp.location || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6 pb-16">
      {/* Header */}
      <PageHeader
        title="Opportunity Ingestion & Lead Triage"
        subtitle="Parse unstructured WhatsApp/Telegram broadcasts, auto-extract roles, unwrap community redirect links, and promote High-Fit matches into your Jobs Feed."
        icon={Inbox}
        badge={`${opportunities.length} Processed · ${activeTotalCount} Active`}
        badgeColor="indigo"
        actions={
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={handleCleanupRejected}
              disabled={cleaning || offTargetCount === 0}
              className="px-3.5 py-2 rounded-xl text-xs font-medium text-[#c7c4d6] bg-[#1a1c20] hover:bg-[#282a2e] border border-[#464553]/40 transition disabled:opacity-40 flex items-center gap-1.5 cursor-pointer"
            >
              {cleaning ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5 text-[#ffb4ab]" />
              )}
              <span>Purge Rejected</span>
            </button>

            <button
              type="button"
              onClick={handleCopilotOptimize}
              disabled={optimizing || opportunities.length === 0}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-[#edeaff] bg-[#5b5bd6] hover:brightness-110 shadow-lg shadow-[#5b5bd6]/25 transition disabled:opacity-40 flex items-center gap-2 cursor-pointer"
            >
              {optimizing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              <span>{optimizing ? "Optimizing..." : "Copilot Auto-Optimize Leads"}</span>
            </button>
          </div>
        }
      />

      {copilotMessage && (
        <div className="rounded-xl border border-[#45dfa4]/35 bg-[#45dfa4]/10 px-4 py-3 text-xs text-[#e2e2e8] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-[#45dfa4] shrink-0" />
            <span className="font-medium">{copilotMessage}</span>
          </div>
          <button
            onClick={() => setCopilotMessage(null)}
            className="text-[#918f9f] hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-[#ffb4ab]/35 bg-[#ffb4ab]/10 px-4 py-3 text-xs text-[#ffb4ab] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 12-Column Split Workbench */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN (5 cols): Ingestion Studio */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-[#1a1c20] p-5 rounded-2xl border border-[#464553]/35 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-[#e2e2e8]">Ingestion Studio</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#45dfa4]/10 text-[#45dfa4] border border-[#45dfa4]/25">
                  ATS Extractor
                </span>
              </div>
            </div>

            {/* 2 Input Mode Tabs: Text / Links vs File / OCR / .zip */}
            <div className="grid grid-cols-2 p-1 rounded-xl bg-[#0c0e12] border border-[#464553]/35 text-xs font-medium">
              <button
                type="button"
                onClick={() => setActiveTab("text")}
                className={`py-2 rounded-lg transition cursor-pointer ${
                  activeTab === "text"
                    ? "bg-[#282a2e] text-[#e2e2e8] font-semibold shadow-sm"
                    : "text-[#918f9f] hover:text-[#e2e2e8]"
                }`}
              >
                Text / Links
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("file")}
                className={`py-2 rounded-lg transition cursor-pointer ${
                  activeTab === "file"
                    ? "bg-[#282a2e] text-[#e2e2e8] font-semibold shadow-sm"
                    : "text-[#918f9f] hover:text-[#e2e2e8]"
                }`}
              >
                File / OCR / .zip
              </button>
            </div>

            {activeTab === "text" ? (
              <div className="space-y-3.5">
                <div className="rounded-xl bg-[#0c0e12] border border-[#464553]/40 overflow-hidden">
                  <div className="px-3.5 py-2 border-b border-[#464553]/25 flex items-center justify-between text-[11px] text-[#918f9f]">
                    <span>Messy Forward or Unfiltered Broadcast</span>
                    <span className="font-mono">{textInput.length} chars</span>
                  </div>
                  <textarea
                    placeholder="Paste WhatsApp job broadcasts, Telegram forwards, LinkedIn posts, or career links..."
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    className="w-full min-h-[200px] bg-transparent p-3.5 text-xs text-[#e2e2e8] placeholder:text-[#918f9f]/60 focus:outline-none leading-relaxed resize-none font-mono"
                  />
                </div>

                {/* Preset Sample Helpers */}
                <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                  <span className="text-[#918f9f] mr-1">Load Preset:</span>
                  <button
                    type="button"
                    onClick={() => fillSamplePost("stripe")}
                    className="px-2.5 py-1 rounded-lg bg-[#0c0e12] hover:bg-[#282a2e] text-[#c7c4d6] border border-[#464553]/35 transition cursor-pointer"
                  >
                    Stripe GenAI Sample
                  </button>
                  <button
                    type="button"
                    onClick={() => fillSamplePost("zomato")}
                    className="px-2.5 py-1 rounded-lg bg-[#0c0e12] hover:bg-[#282a2e] text-[#c7c4d6] border border-[#464553]/35 transition cursor-pointer"
                  >
                    Zomato Backend Sample
                  </button>
                  <button
                    type="button"
                    onClick={() => fillSamplePost("broadcast")}
                    className="px-2.5 py-1 rounded-lg bg-[#0c0e12] hover:bg-[#282a2e] text-[#c7c4d6] border border-[#464553]/35 transition cursor-pointer"
                  >
                    Multi-Lead Broadcast
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleTextSubmit}
                  disabled={loading || !textInput.trim()}
                  className="w-full py-2.5 rounded-xl bg-[#5b5bd6] hover:brightness-110 text-[#edeaff] font-semibold text-xs shadow-lg shadow-[#5b5bd6]/25 transition disabled:opacity-40 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Parsing &amp; Unwrapping Links...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Parse &amp; Extract Leads</span>
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="space-y-3.5">
                <div className="relative border-2 border-dashed border-[#464553]/50 hover:border-[#5b5bd6] rounded-xl p-8 transition text-center bg-[#0c0e12]">
                  <input
                    type="file"
                    accept=".pdf,.docx,.xlsx,.csv,.txt,.zip,image/*"
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    onChange={(e) => setFileInput(e.target.files?.[0] || null)}
                  />
                  <div className="flex flex-col items-center justify-center space-y-2 pointer-events-none">
                    <div className="w-10 h-10 rounded-xl bg-[#1a1c20] border border-[#464553]/40 flex items-center justify-center text-[#c1c1ff]">
                      <Upload className="w-5 h-5" />
                    </div>
                    <p className="text-xs font-semibold text-[#e2e2e8]">
                      {fileInput
                        ? fileInput.name
                        : "Drop PDF, DOCX, CSV, Screenshot OCR, or WhatsApp export .zip"}
                    </p>
                    <p className="text-[11px] text-[#918f9f]">
                      Automatic OCR &amp; multi-message batch extraction
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleFileUpload}
                  disabled={loading || !fileInput}
                  className="w-full py-2.5 rounded-xl bg-[#5b5bd6] hover:brightness-110 text-[#edeaff] font-semibold text-xs shadow-lg shadow-[#5b5bd6]/25 transition disabled:opacity-40 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Extracting via OCR...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      <span>Upload &amp; Extract</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Live Batch Processing Telemetry Card */}
            <div className="p-4 rounded-xl bg-[#0c0e12] border border-[#464553]/35 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#e2e2e8] flex items-center gap-2">
                  {progressData?.status === "processing" ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#c1c1ff]" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#45dfa4]" />
                  )}
                  <span>Live Batch Processing</span>
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#45dfa4]/10 text-[#45dfa4] border border-[#45dfa4]/25">
                  {progressData?.status === "processing" ? "Running" : "Ready"}
                </span>
              </div>

              <div className="w-full h-1.5 rounded-full bg-[#282a2e] overflow-hidden">
                <div className="h-full bg-[#45dfa4] rounded-full w-full" />
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-lg bg-[#1a1c20] border border-[#464553]/30 flex items-center justify-between">
                  <span className="text-[#c7c4d6]">Verified ATS</span>
                  <span className="font-bold text-[#45dfa4] font-mono">
                    {progressData?.verified ??
                      opportunities.filter(
                        (o) => o.status === "verified" || o.verification_status === "verified"
                      ).length}
                  </span>
                </div>
                <div className="p-2.5 rounded-lg bg-[#1a1c20] border border-[#464553]/30 flex items-center justify-between">
                  <span className="text-[#c7c4d6]">High-Fit</span>
                  <span className="font-bold text-[#c1c1ff] font-mono">{highFitCount}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-[#1a1c20] border border-[#464553]/30 flex items-center justify-between">
                  <span className="text-[#c7c4d6]">Stretch</span>
                  <span className="font-bold text-[#ffb77e] font-mono">{stretchCount}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-[#1a1c20] border border-[#464553]/30 flex items-center justify-between">
                  <span className="text-[#c7c4d6]">Off-Target</span>
                  <span className="font-bold text-[#918f9f] font-mono">{offTargetCount}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN (7 cols): Triage Swimlanes & Lead Cards */}
        <div className="lg:col-span-7 space-y-4">
          {/* 5 Triage Filter Tabs */}
          <div className="p-1.5 rounded-2xl bg-[#1a1c20] border border-[#464553]/35 flex flex-wrap items-center gap-1.5 text-xs">
            {[
              { id: "all", label: `All Active (${activeTotalCount})`, dot: null },
              { id: "high_fit", label: `High-Fit Target (${highFitCount})`, dot: "bg-[#45dfa4]" },
              { id: "stretch", label: `Stretch (${stretchCount})`, dot: "bg-[#ffb77e]" },
              { id: "promoted", label: `In Live Feed (${promotedCount})`, dot: "bg-[#c1c1ff]" },
              {
                id: "off_target",
                label: `Off-Target / Rejected (${offTargetCount})`,
                dot: "bg-[#918f9f]",
              },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTriageFilter(tab.id as any)}
                className={`px-3 py-1.5 rounded-xl font-medium transition flex items-center gap-1.5 cursor-pointer ${
                  triageFilter === tab.id
                    ? "bg-[#282a2e] text-[#e2e2e8] font-semibold shadow-sm border border-[#464553]/40"
                    : "text-[#918f9f] hover:text-[#e2e2e8]"
                }`}
              >
                {tab.dot && <span className={`w-1.5 h-1.5 rounded-full ${tab.dot}`} />}
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Search Bar within Extracted Leads */}
          <div className="relative">
            <Search className="w-4 h-4 text-[#918f9f] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter extracted leads by role, company, or location..."
              className="w-full bg-[#1a1c20] border border-[#464553]/35 rounded-xl pl-10 pr-4 py-2 text-xs text-[#e2e2e8] placeholder:text-[#918f9f] focus:outline-none focus:border-[#5b5bd6]"
            />
          </div>

          {/* Lead Cards Stream */}
          {filteredOpportunities.length === 0 ? (
            <div className="bg-[#1a1c20] p-12 rounded-2xl border border-[#464553]/35 text-center space-y-2">
              <div className="w-10 h-10 rounded-xl bg-[#0c0e12] border border-[#464553]/40 flex items-center justify-center mx-auto text-[#918f9f]">
                <Inbox className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-semibold text-[#e2e2e8]">No leads in this filter</h3>
              <p className="text-xs text-[#918f9f] max-w-sm mx-auto">
                Paste a community broadcast or click one of the preset buttons on the left to extract and triage opportunities.
              </p>
            </div>
          ) : (
            <div className="space-y-4 max-h-[820px] overflow-y-auto pr-1">
              {filteredOpportunities.map((opp) => {
                const isActioning = actioningId === opp.id;
                const isVerified =
                  opp.status === "verified" || opp.verification_status === "verified";
                const isPromo = opp.verification_status === "promo_funnel";
                const copilotInfo = deriveCopilotFit(opp);
                const initial = (opp.company || "C").trim().charAt(0).toUpperCase();

                return (
                  <div
                    key={opp.id}
                    className="bg-[#1a1c20] p-5 rounded-2xl border border-[#464553]/35 hover:border-[#464553]/75 transition space-y-3.5"
                  >
                    {/* Top Status Pills + Company Monogram */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1.5 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {isVerified ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#45dfa4]/10 text-[#45dfa4] border border-[#45dfa4]/30 flex items-center gap-1">
                              <ShieldCheck className="w-3 h-3" />
                              Official ATS
                            </span>
                          ) : isPromo ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#ffb4ab]/15 text-[#ffb4ab] border border-[#ffb4ab]/30 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" />
                              Promo Funnel Flagged
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#282a2e] text-[#c7c4d6] border border-[#464553]/40">
                              Community Lead
                            </span>
                          )}

                          {copilotInfo.fit === "high_fit" ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#45dfa4]/15 text-[#45dfa4] border border-[#45dfa4]/35">
                              High-Fit · {copilotInfo.score}%
                            </span>
                          ) : copilotInfo.fit === "stretch" ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#ffb77e]/15 text-[#ffb77e] border border-[#ffb77e]/35">
                              Stretch · {copilotInfo.score}%
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#ffb4ab]/10 text-[#ffb4ab] border border-[#ffb4ab]/30">
                              Off-Target · {copilotInfo.score}%
                            </span>
                          )}

                          {opp.job_id && (
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#5b5bd6]/20 text-[#c1c1ff] border border-[#5b5bd6]/40">
                              In Live Feed
                            </span>
                          )}
                        </div>

                        <h4 className="font-bold text-base sm:text-lg text-[#e2e2e8] pt-0.5">
                          {opp.role_title || "Unspecified Role"}
                        </h4>

                        <p className="text-xs text-[#c7c4d6] font-medium">
                          {opp.company || "Unknown Company"}
                        </p>
                      </div>

                      <div className="w-10 h-10 rounded-xl bg-[#282a2e] border border-[#464553]/45 flex items-center justify-center font-bold text-sm text-[#e2e2e8] shrink-0">
                        {initial}
                      </div>
                    </div>

                    {/* Structured Metadata Pills */}
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {opp.location && (
                        <span className="px-2.5 py-1 rounded-lg bg-[#0c0e12] border border-[#464553]/35 text-[#c7c4d6] flex items-center gap-1.5">
                          <MapPin className="w-3 h-3 text-[#918f9f]" />
                          {opp.location}
                        </span>
                      )}
                      {opp.extraction_metadata?.experience_req && (
                        <span className="px-2.5 py-1 rounded-lg bg-[#0c0e12] border border-[#464553]/35 text-[#c7c4d6] flex items-center gap-1.5">
                          <GraduationCap className="w-3.5 h-3.5 text-[#918f9f]" />
                          {opp.extraction_metadata.experience_req}
                        </span>
                      )}
                      {opp.extraction_metadata?.salary && (
                        <span className="px-2.5 py-1 rounded-lg bg-[#45dfa4]/10 border border-[#45dfa4]/30 text-[#45dfa4] font-semibold flex items-center gap-1.5">
                          <Banknote className="w-3.5 h-3.5" />
                          {opp.extraction_metadata.salary}
                        </span>
                      )}
                      {opp.extraction_metadata?.qualification && (
                        <span className="px-2.5 py-1 rounded-lg bg-[#0c0e12] border border-[#464553]/35 text-[#c7c4d6] flex items-center gap-1.5">
                          <Briefcase className="w-3 h-3 text-[#918f9f]" />
                          Eligibility: {opp.extraction_metadata.qualification}
                        </span>
                      )}
                    </div>

                    {/* Tech Stack Overlap Pills */}
                    {opp.extraction_metadata?.skills &&
                      opp.extraction_metadata.skills.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap text-xs">
                          <span className="text-[11px] text-[#918f9f] mr-1">Stack Overlap:</span>
                          {opp.extraction_metadata.skills
                            .slice(0, 6)
                            .map((skill: string, idx: number) => (
                              <span
                                key={idx}
                                className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#0c0e12] border border-[#464553]/40 text-[#e2e2e8]"
                              >
                                {skill}
                              </span>
                            ))}
                        </div>
                      )}

                    {/* Direct Unwrapped ATS Bar */}
                    {(opp.verified_official_url || opp.original_submitted_url) && (
                      <div className="p-2.5 rounded-xl bg-[#0c0e12] border border-[#464553]/35 flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2 min-w-0 truncate">
                          <Link2 className="w-3.5 h-3.5 text-[#45dfa4] shrink-0" />
                          <span className="text-[#918f9f] shrink-0">Direct ATS:</span>
                          <a
                            href={opp.verified_official_url || opp.original_submitted_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[#e2e2e8] hover:text-[#c1c1ff] truncate underline font-mono text-[11px]"
                          >
                            {opp.verified_official_url || opp.original_submitted_url}
                          </a>
                        </div>
                        {opp.verified_official_url && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#45dfa4]/15 text-[#45dfa4] shrink-0">
                            ✓ Unwrapped
                          </span>
                        )}
                      </div>
                    )}

                    {/* "Why it fits" Callout Box */}
                    {(opp.relevance_explanation || copilotInfo.reason) && (
                      <div className="p-3 rounded-xl bg-[#45dfa4]/[0.07] border border-[#45dfa4]/25 text-xs text-[#45dfa4] flex items-start gap-2">
                        <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>
                          <strong>Why it fits: </strong>
                          {opp.relevance_explanation || copilotInfo.reason}
                        </span>
                      </div>
                    )}

                    {/* Bottom Action Footer */}
                    <div className="pt-3 border-t border-[#464553]/30 flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => handleOpportunityAction(opp.id, "reject")}
                        disabled={isActioning}
                        className="px-3 py-1.5 rounded-xl text-xs font-medium text-[#918f9f] hover:text-[#ffb4ab] hover:bg-[#ffb4ab]/10 transition disabled:opacity-50 cursor-pointer"
                      >
                        ✕ Reject
                      </button>

                      <div className="flex items-center gap-2">
                        {opp.job_id ? (
                          <>
                            <Link
                              href={`/jobs/${opp.job_id}?tab=coach`}
                              className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-[#e2e2e8] bg-[#282a2e] hover:bg-[#333539] border border-[#464553]/40 transition flex items-center gap-1.5"
                            >
                              <Sparkles className="w-3.5 h-3.5 text-[#c1c1ff]" />
                              <span>Coach Prep</span>
                            </Link>
                            <Link
                              href={`/jobs/${opp.job_id}`}
                              className="px-4 py-1.5 rounded-xl text-xs font-semibold text-[#edeaff] bg-[#5b5bd6] hover:brightness-110 transition flex items-center gap-1.5 shadow-md shadow-[#5b5bd6]/25"
                            >
                              <span>Open in Studio</span>
                              <ArrowUpRight className="w-3.5 h-3.5" />
                            </Link>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => handleOpportunityAction(opp.id, "save_later")}
                              disabled={isActioning || opp.status === "ineligible"}
                              className="px-3.5 py-1.5 rounded-xl text-xs font-medium text-[#c7c4d6] bg-[#0c0e12] hover:bg-[#282a2e] border border-[#464553]/40 transition disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                            >
                              <BookmarkCheck className="w-3.5 h-3.5" />
                              <span>Save for Later</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleOpportunityAction(opp.id, "save")}
                              disabled={isActioning || opp.status === "ineligible"}
                              className="px-4 py-1.5 rounded-xl text-xs font-semibold text-[#edeaff] bg-[#5b5bd6] hover:brightness-110 shadow-md shadow-[#5b5bd6]/25 transition disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                            >
                              {isActioning ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <ArrowUpRight className="w-3.5 h-3.5" />
                              )}
                              <span>Apply Now</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
