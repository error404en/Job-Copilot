'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  X,
  Zap,
  Copy,
  Check,
  ExternalLink,
  FileText,
  Sparkles,
  User,
  Mail,
  Phone,
  MapPin,
  Link2,
  Download,
  CheckCircle2,
  RefreshCw,
  Terminal
} from 'lucide-react'

interface AutoFillModalProps {
  isOpen: boolean
  onClose: () => void
  data: any
  onSyncFromResume?: () => Promise<void>
  isSyncingResume?: boolean
  onMarkApplied?: () => void
}

export default function AutoFillModal({
  isOpen,
  onClose,
  data,
  onSyncFromResume,
  isSyncingResume = false,
  onMarkApplied
}: AutoFillModalProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'kit' | 'pitch' | 'browser'>('kit')

  if (!isOpen || !data) return null

  const payload = data.autofill || data
  const applyUrl = payload.apply_url || ''
  const company = payload.company || 'Target Company'
  const roleTitle = payload.role_title || 'Software Engineer'

  const copyText = (key: string, value?: string) => {
    if (!value) return
    navigator.clipboard.writeText(value)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  const handleLaunchAndCopyScript = () => {
    if (payload.autofill_script) {
      navigator.clipboard.writeText(payload.autofill_script)
      setCopiedKey('launch_script')
      setTimeout(() => setCopiedKey(null), 3500)
    }
    if (applyUrl) {
      window.open(applyUrl, '_blank', 'noopener,noreferrer')
    }
  }

  const identityFields = [
    { key: 'full_name', label: 'Full Name', value: payload.full_name, icon: User },
    { key: 'email', label: 'Email Address', value: payload.email, icon: Mail },
    { key: 'phone', label: 'Phone Number', value: payload.phone, icon: Phone },
    { key: 'location', label: 'Current Location', value: payload.location, icon: MapPin },
    { key: 'linkedin_url', label: 'LinkedIn URL', value: payload.linkedin_url, icon: Link2 },
    { key: 'github_url', label: 'GitHub URL', value: payload.github_url, icon: Link2 },
    { key: 'portfolio_url', label: 'Portfolio / Website', value: payload.portfolio_url, icon: Link2 },
    { key: 'first_name', label: 'First Name', value: payload.first_name, icon: User },
    { key: 'last_name', label: 'Last Name', value: payload.last_name, icon: User },
  ]

  const missingCoreIdentity = !payload.first_name || !payload.email || !payload.phone

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150 font-sans">
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-800/80 flex items-start justify-between gap-4 bg-zinc-900/40">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md text-[10px] font-medium uppercase tracking-wider bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 flex items-center gap-1">
                <Zap className="w-3 h-3 text-indigo-400" />
                Auto-Fill Kit
              </span>
              {data.mode === 'playwright' && (
                <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-zinc-800 text-zinc-300 border border-zinc-700">
                  Verified
                </span>
              )}
            </div>
            <h2 className="text-base sm:text-lg font-semibold text-zinc-100 truncate">
              {roleTitle} <span className="text-zinc-500 font-normal">at</span> {company}
            </h2>
            <p className="text-xs text-zinc-400">
              Identity tokens, recommended resume, and tailored answers pre-loaded for instant form filling.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Primary Launch Bar */}
        <div className="px-6 py-3 bg-zinc-900/20 border-b border-zinc-800/80 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-indigo-400 shrink-0">
              <FileText className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] uppercase font-medium tracking-wider text-zinc-500">Recommended Resume</div>
              <div className="text-xs font-medium text-zinc-200 truncate">
                {payload.recommended_resume_title || 'Primary Technical Resume'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {applyUrl && (
              <button
                type="button"
                onClick={handleLaunchAndCopyScript}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-3.5 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Open Portal & Copy Auto-Fill</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            )}
            {onMarkApplied && (
              <button
                type="button"
                onClick={onMarkApplied}
                className="bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 font-medium px-3 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Mark Applied</span>
              </button>
            )}
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="px-6 border-b border-zinc-800/80 flex items-center gap-4 bg-zinc-950">
          {[
            { id: 'kit', label: 'Field Values' },
            { id: 'pitch', label: 'Cover Letter & Pitch' },
            { id: 'browser', label: 'Browser Extension & Script' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id as any)}
              className={`py-2.5 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
                activeTab === t.id
                  ? 'border-indigo-500 text-zinc-100'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {copiedKey === 'launch_script' && (
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                Opened portal and copied Auto-Fill script. If using the Chrome Extension, click <strong>Auto-Fill Form</strong> in the bottom-right corner of the portal.
              </span>
            </div>
          )}

          {activeTab === 'kit' && (
            <div className="space-y-4">
              {missingCoreIdentity && (
                <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="text-xs text-amber-200">
                    <strong>Some identity fields are empty.</strong> Auto-populate your Name, Email, Phone, LinkedIn & GitHub directly from your uploaded PDF resume:
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {onSyncFromResume && (
                      <button
                        type="button"
                        onClick={onSyncFromResume}
                        disabled={isSyncingResume}
                        className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isSyncingResume ? 'animate-spin' : ''}`} />
                        <span>{isSyncingResume ? 'Extracting...' : 'Sync from Resume'}</span>
                      </button>
                    )}
                    <Link
                      href="/settings"
                      className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold"
                    >
                      Edit Settings
                    </Link>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {identityFields.map((item) => {
                  const Icon = item.icon
                  const isCopied = copiedKey === item.key
                  return (
                    <div
                      key={item.key}
                      onClick={() => item.value && copyText(item.key, item.value)}
                      className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                        item.value
                          ? 'bg-zinc-950/60 border-zinc-800/80 hover:border-indigo-500/40 cursor-pointer group'
                          : 'bg-zinc-950/30 border-zinc-800/40 opacity-60'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Icon className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                        <div className="min-w-0">
                          <div className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">
                            {item.label}
                          </div>
                          <div className="text-xs font-semibold text-zinc-200 truncate">
                            {item.value || 'Not configured'}
                          </div>
                        </div>
                      </div>
                      {item.value && (
                        <span className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 group-hover:text-white shrink-0">
                          {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>

              {payload.matched_skills && payload.matched_skills.length > 0 && (
                <div className="p-4 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">
                      Matched Technical Keywords (Copy for ATS Skills Box)
                    </span>
                    <button
                      type="button"
                      onClick={() => copyText('skills', payload.matched_skills.join(', '))}
                      className="text-xs font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer"
                    >
                      {copiedKey === 'skills' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedKey === 'skills' ? 'Copied' : 'Copy All'}</span>
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {payload.matched_skills.map((skill: string) => (
                      <span
                        key={skill}
                        onClick={() => copyText(`skill_${skill}`, skill)}
                        className="px-2.5 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-semibold cursor-pointer hover:bg-indigo-500/20"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'pitch' && (
            <div className="space-y-4">
              {/* Short Why Company Pitch */}
              <div className="p-4 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                    &ldquo;Why are you interested in {company}?&rdquo; (Short ATS Question)
                  </span>
                  <button
                    type="button"
                    onClick={() => copyText('why_pitch', payload.why_company_pitch)}
                    className="px-2.5 py-1 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    {copiedKey === 'why_pitch' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedKey === 'why_pitch' ? 'Copied!' : 'Copy Answer'}</span>
                  </button>
                </div>
                <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap">
                  {payload.why_company_pitch}
                </p>
              </div>

              {/* Full Tailored Cover Letter */}
              <div className="p-4 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-emerald-400" />
                    Tailored Cover Letter for {roleTitle}
                  </span>
                  <button
                    type="button"
                    onClick={() => copyText('cover_letter', payload.cover_letter)}
                    className="px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    {copiedKey === 'cover_letter' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedKey === 'cover_letter' ? 'Copied!' : 'Copy Cover Letter'}</span>
                  </button>
                </div>
                <pre className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap font-sans max-h-56 overflow-y-auto pr-2">
                  {payload.cover_letter}
                </pre>
              </div>
            </div>
          )}

          {activeTab === 'browser' && (
            <div className="space-y-4">
              {/* Option 1: Universal Bookmarklet / Console Script */}
              <div className="p-4 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-amber-400" />
                      Option 1: Universal 1-Click Auto-Fill Script (Zero Install)
                    </h4>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      Drag the button below to your browser Bookmarks Bar (or copy the script) to instantly fill Greenhouse, Lever, Workday, Ashby & Keka forms.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  {payload.bookmarklet_url && (
                    <a
                      href={payload.bookmarklet_url}
                      onClick={(e) => e.preventDefault()}
                      draggable
                      className="px-3.5 py-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-indigo-500/40 text-zinc-200 text-xs font-medium flex items-center gap-1.5 cursor-grab active:cursor-grabbing"
                      title="Drag me to your Chrome/Edge Bookmarks Bar, then click me on any job application page"
                    >
                      <Zap className="w-3.5 h-3.5 text-indigo-400" />
                      <span>JobCopilot Auto-Fill (Drag to Bookmarks Bar)</span>
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => copyText('autofill_script', payload.autofill_script)}
                    className="px-3.5 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                  >
                    {copiedKey === 'autofill_script' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Terminal className="w-3.5 h-3.5 text-indigo-400" />}
                    <span>{copiedKey === 'autofill_script' ? 'Copied Auto-Fill JS' : 'Copy Auto-Fill Console JS'}</span>
                  </button>
                </div>
              </div>

              {/* Option 2: Unpacked Chrome Extension */}
              <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/80 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-semibold text-zinc-100 flex items-center gap-1.5">
                      <Download className="w-3.5 h-3.5 text-indigo-400" />
                      Option 2: JobCopilot Chrome Extension (Floating HUD)
                    </h4>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      Automatically injects a floating <strong>JobCopilot Auto-Fill</strong> button on Greenhouse, Lever, Ashby, Workday, SmartRecruiters & Keka pages.
                    </p>
                  </div>
                  <a
                    href="/JobCopilot_Extension.zip"
                    download="JobCopilot_Extension.zip"
                    className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center gap-1.5 shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Extension (.zip)</span>
                  </a>
                </div>
                <ol className="text-[11px] text-zinc-400 list-decimal list-inside space-y-1">
                  <li>Download and unzip <code>JobCopilot_Extension.zip</code>.</li>
                  <li>Open <code>chrome://extensions</code> in Chrome/Edge/Brave and enable <strong>Developer mode</strong>.</li>
                  <li>Click <strong>Load unpacked</strong> and select the unzipped folder.</li>
                </ol>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

