'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Download,
  Check,
  RefreshCw,
  ExternalLink,
  Sparkles,
  Bot,
  Zap,
  Phone,
  Link2,
  Mail,
  User,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react'
import { useApiClient } from '@/lib/useApiClient'

export default function SettingsPage() {
  const queryClient = useQueryClient()
  const { fetch: apiFetch, isLoaded, isSignedIn } = useApiClient()

  const [saveSuccess, setSaveSuccess] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const [selectedVoice, setSelectedVoice] = useState<'Warm' | 'Direct' | 'Formal'>('Warm')
  const [toggleAutofill, setToggleAutofill] = useState(true)
  const [toggleScoreBadge, setToggleScoreBadge] = useState(true)
  const [toggleAutoSubmit, setToggleAutoSubmit] = useState(false)

  // Candidate Form Data
  const [firstName, setFirstName] = useState('Alex')
  const [lastName, setLastName] = useState('Morgan')
  const [email, setEmail] = useState('alex.morgan@example.com')
  const [phone, setPhone] = useState('+1 (555) 019-2834')
  const [linkedinUrl, setLinkedinUrl] = useState('https://linkedin.com/in/alex-morgan')
  const [githubUrl, setGithubUrl] = useState('https://github.com/alex-morgan')
  const [portfolioUrl, setPortfolioUrl] = useState('https://alexmorgan.dev')
  const [targetRoles, setTargetRoles] = useState('Backend Engineer, SDE, Full-stack, AI / ML')
  const [preferredLocations, setPreferredLocations] = useState('Remote, Bengaluru, Delhi / NCR, Noida')
  const [expectedCtc, setExpectedCtc] = useState('₹6.0L+ baseline floor')
  const [workAuth, setWorkAuth] = useState('Authorized to work (No sponsorship required)')
  const [noticePeriod, setNoticePeriod] = useState('Immediate / 2027 Graduate')

  // Fetch candidate profile from DB
  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile'],
    enabled: isLoaded && !!isSignedIn,
    queryFn: async () => {
      const res = await apiFetch('/api/profile')
      if (!res.ok) throw new Error('Failed to fetch profile')
      return res.json()
    },
  })

  // Populate data: when signed in, load real profile; when logged out, use sample persona
  useEffect(() => {
    if (isSignedIn && profile) {
      if (profile.first_name) setFirstName(profile.first_name)
      if (profile.last_name) setLastName(profile.last_name)
      if (profile.email) setEmail(profile.email)
      if (profile.phone) setPhone(profile.phone)
      if (profile.linkedin_url) setLinkedinUrl(profile.linkedin_url)
      if (profile.github_url) setGithubUrl(profile.github_url)
      if (profile.portfolio_url) setPortfolioUrl(profile.portfolio_url)
      if (profile.target_roles && Array.isArray(profile.target_roles)) {
        setTargetRoles(profile.target_roles.join(', '))
      }
      if (profile.base_location) {
        setPreferredLocations(`${profile.base_location}${profile.remote_ok ? ', Remote' : ''}`)
      }
      if (profile.pay_floor_ncr_remote) {
        const floorL = (profile.pay_floor_ncr_remote / 100000).toFixed(1).replace(/\.0$/, '')
        setExpectedCtc(`₹${floorL}L+ baseline floor`)
      }
      if (profile.graduation_date) {
        setNoticePeriod(`${profile.graduation_date} (Graduation / Early-Career)`)
      }
    } else if (!isSignedIn) {
      // Generic sample data when not signed in
      setFirstName('Alex')
      setLastName('Morgan')
      setEmail('alex.morgan@example.com')
      setPhone('+1 (555) 019-2834')
      setLinkedinUrl('https://linkedin.com/in/alex-morgan')
      setGithubUrl('https://github.com/alex-morgan')
      setPortfolioUrl('https://alexmorgan.dev')
      setTargetRoles('Backend Engineer, SDE, Full-stack, AI / ML')
      setPreferredLocations('Remote, Bengaluru, Delhi / NCR')
      setExpectedCtc('₹6.0L+ baseline floor')
      setWorkAuth('Authorized to work (No sponsorship required)')
      setNoticePeriod('Immediate / 2027 Graduate')
    }
  }, [isSignedIn, profile])

  // Save profile mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        linkedin_url: linkedinUrl.trim(),
        github_url: githubUrl.trim(),
        portfolio_url: portfolioUrl.trim(),
        target_roles: targetRoles.split(',').map((r) => r.trim()).filter(Boolean),
        base_location: preferredLocations.split(',')[0]?.trim() || 'Noida, Delhi NCR',
        remote_ok: preferredLocations.toLowerCase().includes('remote'),
        pay_floor_ncr_remote: 600000,
        auto_apply_enabled: true,
      }

      const res = await apiFetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Failed to update preferences')
      return res.json()
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['profile'], updated)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3500)
    },
  })

  // Sync profile from latest resume
  const syncFromResumeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch('/api/profile/sync-from-resume', { method: 'POST' })
      if (!res.ok) throw new Error('Failed to sync profile from resume')
      return res.json()
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['profile'], updated)
      setSyncMsg('Auto-Apply fields synced from your primary resume.')
      setTimeout(() => setSyncMsg(null), 3500)
    },
  })

  const voices = ['Warm', 'Direct', 'Formal'] as const

  return (
    <div className="min-h-screen bg-[#050507] text-[#F3EFE7] font-sans">
      <main className="max-w-[1360px] mx-auto px-4 sm:px-8 py-10 flex flex-col gap-9">
        {/* Header */}
        <header className="flex flex-col gap-2.5 max-w-2xl">
          <span className="font-mono text-xs uppercase tracking-wider text-[#8C97FF]">
            / Settings & Auto-Apply Profile
          </span>
          <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl leading-[1.04]">
            Candidate & <i className="italic text-[#A9A59C]">auto-apply settings.</i>
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400">
            Configure your auto-apply fields, contact identity, baseline compensation, and ATS extension behaviors.
          </p>
        </header>

        {/* 2-Column Responsive Workspace */}
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          {/* Left Column: Auto-Apply Fields & Candidate Identity */}
          <section
            aria-label="Profile"
            className="glass w-full lg:flex-[1.3] min-w-0 p-7 sm:p-8 flex flex-col gap-6 rounded-2xl shadow-xl"
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex flex-col gap-0.5">
                <span className="font-mono text-xs uppercase tracking-wider text-[#8C97FF]">
                  Candidate Auto-Apply Profile
                </span>
                <span className="text-xs text-[#A8A59D]">
                  These fields power 1-Click Auto-Fill across Greenhouse, Lever, and Workday forms.
                </span>
              </div>
              {isSignedIn && (
                <button
                  type="button"
                  onClick={() => syncFromResumeMutation.mutate()}
                  disabled={syncFromResumeMutation.isPending}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-mono bg-white/5 border border-white/15 text-[#C9C6BE] hover:text-white hover:bg-white/10 transition cursor-pointer"
                  title="Extract from uploaded resume"
                >
                  <RefreshCw className={`w-3 h-3 ${syncFromResumeMutation.isPending ? 'animate-spin' : ''}`} />
                  <span>Sync from Resume</span>
                </button>
              )}
            </div>

            {/* Sync feedback */}
            {syncMsg && (
              <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{syncMsg}</span>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault()
                saveMutation.mutate()
              }}
              className="flex flex-col gap-4"
            >
              {/* Name Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="fn" className="text-xs font-medium text-[#C9C6BE]">
                    First name
                  </label>
                  <input
                    id="fn"
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="First name"
                    className="fld"
                    required
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="ln" className="text-xs font-medium text-[#C9C6BE]">
                    Last name
                  </label>
                  <input
                    id="ln"
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Last name"
                    className="fld"
                    required
                  />
                </div>
              </div>

              {/* Email & Phone Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="em" className="text-xs font-medium text-[#C9C6BE]">
                    Email address
                  </label>
                  <input
                    id="em"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="fld"
                    required
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="ph" className="text-xs font-medium text-[#C9C6BE]">
                    Phone number
                  </label>
                  <input
                    id="ph"
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 9876543210"
                    className="fld"
                    required
                  />
                </div>
              </div>

              {/* URLs Row (LinkedIn, GitHub, Portfolio) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="li" className="text-xs font-medium text-[#C9C6BE]">
                    LinkedIn URL
                  </label>
                  <input
                    id="li"
                    type="url"
                    value={linkedinUrl}
                    onChange={(e) => setLinkedinUrl(e.target.value)}
                    placeholder="https://linkedin.com/in/..."
                    className="fld text-xs"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="gh" className="text-xs font-medium text-[#C9C6BE]">
                    GitHub URL
                  </label>
                  <input
                    id="gh"
                    type="url"
                    value={githubUrl}
                    onChange={(e) => setGithubUrl(e.target.value)}
                    placeholder="https://github.com/..."
                    className="fld text-xs"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="pf" className="text-xs font-medium text-[#C9C6BE]">
                    Portfolio Website
                  </label>
                  <input
                    id="pf"
                    type="url"
                    value={portfolioUrl}
                    onChange={(e) => setPortfolioUrl(e.target.value)}
                    placeholder="https://..."
                    className="fld text-xs"
                  />
                </div>
              </div>

              {/* Target Roles */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="rl" className="text-xs font-medium text-[#C9C6BE]">
                  Target roles (comma-separated)
                </label>
                <input
                  id="rl"
                  type="text"
                  value={targetRoles}
                  onChange={(e) => setTargetRoles(e.target.value)}
                  placeholder="Backend Engineer, SDE, Full-stack, AI / ML"
                  className="fld"
                />
              </div>

              {/* Locations & Compensation Floor */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="lc" className="text-xs font-medium text-[#C9C6BE]">
                    Preferred locations
                  </label>
                  <input
                    id="lc"
                    type="text"
                    value={preferredLocations}
                    onChange={(e) => setPreferredLocations(e.target.value)}
                    placeholder="Remote, Bengaluru, Delhi / NCR, Noida"
                    className="fld"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="ctc" className="text-xs font-medium text-[#C9C6BE]">
                    Baseline CTC Floor (Lower-bound threshold)
                  </label>
                  <input
                    id="ctc"
                    type="text"
                    value={expectedCtc}
                    onChange={(e) => setExpectedCtc(e.target.value)}
                    placeholder="₹6.0L+ baseline floor"
                    className="fld"
                  />
                </div>
              </div>

              {/* Work Auth & Notice Period */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="wa" className="text-xs font-medium text-[#C9C6BE]">
                    Work Authorization / Sponsorship
                  </label>
                  <input
                    id="wa"
                    type="text"
                    value={workAuth}
                    onChange={(e) => setWorkAuth(e.target.value)}
                    placeholder="Authorized to work (No sponsorship required)"
                    className="fld text-xs"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="np" className="text-xs font-medium text-[#C9C6BE]">
                    Notice Period / Grad Year
                  </label>
                  <input
                    id="np"
                    type="text"
                    value={noticePeriod}
                    onChange={(e) => setNoticePeriod(e.target.value)}
                    placeholder="Immediate / 2027 Graduate"
                    className="fld text-xs"
                  />
                </div>
              </div>

              {/* Cover Letter Voice */}
              <div className="flex flex-col gap-2 pt-1">
                <span className="text-xs font-medium text-[#C9C6BE]">Tailored pitch & cover letter tone</span>
                <div className="flex flex-wrap gap-2">
                  {voices.map((v) => {
                    const active = selectedVoice === v
                    return (
                      <button
                        type="button"
                        key={v}
                        onClick={() => setSelectedVoice(v)}
                        className={`h-9 px-4 rounded-full text-xs font-medium transition cursor-pointer border ${
                          active
                            ? 'bg-[#F3EFE7] text-[#0A0A0C] border-[#F3EFE7]'
                            : 'bg-white/[0.06] text-[#C9C6BE] border-white/[0.14] hover:bg-white/[0.1]'
                        }`}
                      >
                        {v}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Feedback messages */}
              {saveSuccess && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                  <Check className="w-4 h-4 shrink-0" />
                  <span>Candidate profile and auto-apply settings saved successfully.</span>
                </div>
              )}

              {/* Save Button */}
              <button
                type="submit"
                disabled={saveMutation.isPending}
                className="pill pill-c self-start mt-2 flex items-center gap-2 cursor-pointer shadow-md"
              >
                {saveMutation.isPending && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>Save Auto-Apply Profile</span>
              </button>
            </form>
          </section>

          {/* Right Column: Chrome Extension */}
          <aside
            aria-label="Extension"
            className="w-full lg:flex-[1] min-w-0 flex flex-col gap-4 sticky top-20"
          >
            {/* Download Card with Gradient Border */}
            <div className="relative rounded-3xl p-[2px] bg-gradient-to-br from-[#5B6BFF] via-white/10 to-white/5 shadow-xl">
              <div className="bg-[#0A0B0F] rounded-[22px] p-7 flex flex-col gap-4">
                <div className="flex justify-between items-center gap-3">
                  <span className="font-mono text-xs uppercase tracking-wider text-[#8C97FF]">
                    Chrome extension
                  </span>
                  <span className="inline-flex items-center gap-2 text-xs text-[#A7F3D0]">
                    <span className="w-2 h-2 rounded-full bg-[#5EEAA8]" />
                    <span>Active · v2.4</span>
                  </span>
                </div>

                <div className="font-serif text-3xl leading-snug text-[#F3EFE7]">
                  Fills applications on <i className="italic text-[#A9A59C]">Greenhouse, Lever and Workday.</i>
                </div>

                <a
                  href="https://job-copilot-gold.vercel.app/JobCopilot_Extension.zip"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pill pill-c self-start flex items-center gap-2 mt-1 text-xs cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download the extension</span>
                  <span aria-hidden="true">→</span>
                </a>
              </div>
            </div>

            {/* Extension Behaviors */}
            <div className="glass p-6 rounded-2xl flex flex-col gap-1 shadow-lg">
              <span className="font-mono text-xs uppercase tracking-wider text-[#A8A59D] pb-2">
                Extension behaviour
              </span>

              {/* Toggle 1: Autofill */}
              <div className="flex justify-between items-center gap-4 py-3 border-t border-white/[0.08]">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-[#F3EFE7]">Autofill application forms</span>
                  <span className="text-xs text-[#A8A59D]">Uses your primary resume and profile.</span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={toggleAutofill}
                  onClick={() => setToggleAutofill((prev) => !prev)}
                  className={`w-12 h-7 rounded-full p-0.5 transition cursor-pointer relative shrink-0 ${
                    toggleAutofill ? 'bg-[#2F3DFF]' : 'bg-white/20'
                  }`}
                >
                  <span
                    className={`block w-6 h-6 rounded-full bg-white transition-transform ${
                      toggleAutofill ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Toggle 2: Show fit score */}
              <div className="flex justify-between items-center gap-4 py-3 border-t border-white/[0.08]">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-[#F3EFE7]">Show fit score on job pages</span>
                  <span className="text-xs text-[#A8A59D]">Adds a score badge to postings you open.</span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={toggleScoreBadge}
                  onClick={() => setToggleScoreBadge((prev) => !prev)}
                  className={`w-12 h-7 rounded-full p-0.5 transition cursor-pointer relative shrink-0 ${
                    toggleScoreBadge ? 'bg-[#2F3DFF]' : 'bg-white/20'
                  }`}
                >
                  <span
                    className={`block w-6 h-6 rounded-full bg-white transition-transform ${
                      toggleScoreBadge ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Toggle 3: Submit without confirmation */}
              <div className="flex justify-between items-center gap-4 py-3 border-t border-white/[0.08]">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-[#F3EFE7]">Submit without confirmation</span>
                  <span className="text-xs text-[#A8A59D]">Off by default. You review every application first.</span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={toggleAutoSubmit}
                  onClick={() => setToggleAutoSubmit((prev) => !prev)}
                  className={`w-12 h-7 rounded-full p-0.5 transition cursor-pointer relative shrink-0 ${
                    toggleAutoSubmit ? 'bg-[#2F3DFF]' : 'bg-white/20'
                  }`}
                >
                  <span
                    className={`block w-6 h-6 rounded-full bg-white transition-transform ${
                      toggleAutoSubmit ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  )
}
