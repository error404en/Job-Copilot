'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { useApiClient } from '@/lib/useApiClient'
import {
  Settings,
  MapPin,
  Bot,
  ShieldAlert,
  Check,
  Save,
  User,
  ExternalLink,
  Sparkles,
  Download
} from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'

export default function SettingsPage() {
  const queryClient = useQueryClient()
  const { fetch: apiFetch, isLoaded, isSignedIn } = useApiClient()
  const [saveSuccess, setSaveSuccess] = useState(false)

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile'],
    enabled: isLoaded && !!isSignedIn,
    queryFn: async () => {
      const res = await apiFetch('/api/profile')
      if (!res.ok) throw new Error('Failed to fetch profile')
      return res.json()
    },
  })

  const [formData, setFormData] = useState({
    base_location: '',
    remote_ok: false,
    pay_floor_ncr_remote: 0,
    target_roles: '',
    auto_apply_enabled: false,
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    linkedin_url: '',
    github_url: '',
    portfolio_url: '',
  })

  useEffect(() => {
    if (profile) {
      setFormData({
        base_location: profile.base_location || '',
        remote_ok: profile.remote_ok || false,
        pay_floor_ncr_remote: profile.pay_floor_ncr_remote || 0,
        target_roles: (profile.target_roles || []).join(', '),
        auto_apply_enabled: profile.auto_apply_enabled || false,
        first_name: profile.first_name || '',
        last_name: profile.last_name || '',
        email: profile.email || '',
        phone: profile.phone || '',
        linkedin_url: profile.linkedin_url || '',
        github_url: profile.github_url || '',
        portfolio_url: profile.portfolio_url || '',
      })
    }
  }, [profile])

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiFetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Failed to update profile')
      return res.json()
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['profile'], updated)
      queryClient.invalidateQueries({ queryKey: ['profile'] })
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    },
  })

  const syncResumeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch('/api/profile/sync-from-resume', {
        method: 'POST',
      })
      if (!res.ok) throw new Error('Failed to sync identity from resume')
      return res.json()
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['profile'], updated)
      queryClient.invalidateQueries({ queryKey: ['profile'] })
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    mutation.mutate({
      ...formData,
      target_roles: formData.target_roles
        .split(',')
        .map((r) => r.trim())
        .filter(Boolean),
    })
  }

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 space-y-4 animate-pulse font-sans">
        <div className="h-8 bg-[#1a1c20] rounded-xl w-1/3" />
        <div className="h-64 bg-[#1a1c20] rounded-xl border border-[#464553]/35" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6 pb-16 font-sans">
      <PageHeader
        suite="Profile & Extension Settings"
        title="Candidate Identity & Preferences"
        subtitle="Configure your Auto-Fill identity tokens, location preferences, salary baselines, and Chrome Extension settings."
        icon={Settings}
        badge="Configuration"
        badgeColor="indigo"
        actions={
          saveSuccess ? (
            <div className="bg-[#45dfa4]/10 border border-[#45dfa4]/30 text-[#45dfa4] px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5">
              <Check className="w-4 h-4 text-[#45dfa4]" />
              <span>Settings Saved</span>
            </div>
          ) : undefined
        }
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Candidate Identity & Profiles */}
        <div className="bg-[#1a1c20] p-6 rounded-xl border border-[#464553]/35 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#464553]/30 pb-3.5">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-[#5b5bd6]" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[#e2e2e8]">
                Candidate Auto-Fill Identity
              </h2>
            </div>
            <button
              type="button"
              onClick={() => syncResumeMutation.mutate()}
              disabled={syncResumeMutation.isPending}
              className="px-3 py-1.5 rounded-lg bg-[#5b5bd6]/15 hover:bg-[#5b5bd6]/25 border border-[#5b5bd6]/35 text-[#c3c0ff] text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#5b5bd6]" />
              <span>
                {syncResumeMutation.isPending ? 'Extracting...' : 'Sync from Primary Resume'}
              </span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-[#918f9f] uppercase tracking-wider mb-1.5">
                First Name
              </label>
              <input
                type="text"
                className="w-full bg-[#0c0e12] border border-[#464553]/40 rounded-lg p-2.5 text-xs text-[#e2e2e8] focus:outline-none focus:border-[#5b5bd6]"
                value={formData.first_name}
                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#918f9f] uppercase tracking-wider mb-1.5">
                Last Name
              </label>
              <input
                type="text"
                className="w-full bg-[#0c0e12] border border-[#464553]/40 rounded-lg p-2.5 text-xs text-[#e2e2e8] focus:outline-none focus:border-[#5b5bd6]"
                value={formData.last_name}
                onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#918f9f] uppercase tracking-wider mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                className="w-full bg-[#0c0e12] border border-[#464553]/40 rounded-lg p-2.5 text-xs text-[#e2e2e8] font-mono focus:outline-none focus:border-[#5b5bd6]"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#918f9f] uppercase tracking-wider mb-1.5">
                Phone Number
              </label>
              <input
                type="text"
                className="w-full bg-[#0c0e12] border border-[#464553]/40 rounded-lg p-2.5 text-xs text-[#e2e2e8] font-mono focus:outline-none focus:border-[#5b5bd6]"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#918f9f] uppercase tracking-wider mb-1.5">
                LinkedIn URL
              </label>
              <input
                type="url"
                className="w-full bg-[#0c0e12] border border-[#464553]/40 rounded-lg p-2.5 text-xs text-[#e2e2e8] font-mono focus:outline-none focus:border-[#5b5bd6]"
                value={formData.linkedin_url}
                onChange={(e) => setFormData({ ...formData, linkedin_url: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#918f9f] uppercase tracking-wider mb-1.5">
                GitHub URL
              </label>
              <input
                type="url"
                className="w-full bg-[#0c0e12] border border-[#464553]/40 rounded-lg p-2.5 text-xs text-[#e2e2e8] font-mono focus:outline-none focus:border-[#5b5bd6]"
                value={formData.github_url}
                onChange={(e) => setFormData({ ...formData, github_url: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-semibold text-[#918f9f] uppercase tracking-wider mb-1.5">
                Portfolio / Personal Website
              </label>
              <input
                type="url"
                className="w-full bg-[#0c0e12] border border-[#464553]/40 rounded-lg p-2.5 text-xs text-[#e2e2e8] font-mono focus:outline-none focus:border-[#5b5bd6]"
                value={formData.portfolio_url}
                onChange={(e) => setFormData({ ...formData, portfolio_url: e.target.value })}
              />
            </div>
          </div>
        </div>

        {/* Section 2: Location & Compensation Thresholds */}
        <div className="bg-[#1a1c20] p-6 rounded-xl border border-[#464553]/35 space-y-5">
          <div className="flex items-center gap-2 border-b border-[#464553]/30 pb-3.5">
            <MapPin className="w-4 h-4 text-[#5b5bd6]" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#e2e2e8]">
              Target Geography & Compensation Baselines
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-[#918f9f] uppercase tracking-wider mb-1.5">
                Primary Base Location
              </label>
              <input
                type="text"
                className="w-full bg-[#0c0e12] border border-[#464553]/40 rounded-lg p-2.5 text-xs text-[#e2e2e8] focus:outline-none focus:border-[#5b5bd6]"
                placeholder="e.g. Bengaluru, Noida, or Hybrid"
                value={formData.base_location}
                onChange={(e) => setFormData({ ...formData, base_location: e.target.value })}
              />
              <p className="text-[11px] text-[#918f9f] mt-1">
                Used to evaluate relocation requirements for onsite roles.
              </p>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#918f9f] uppercase tracking-wider mb-1.5">
                Annual Pay Floor (INR / Year)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-[#918f9f]">
                  ₹
                </span>
                <input
                  type="number"
                  step={50000}
                  className="w-full bg-[#0c0e12] border border-[#464553]/40 rounded-lg pl-7 pr-3 py-2.5 text-xs text-[#e2e2e8] font-mono focus:outline-none focus:border-[#5b5bd6]"
                  value={formData.pay_floor_ncr_remote}
                  onChange={(e) =>
                    setFormData({ ...formData, pay_floor_ncr_remote: parseInt(e.target.value) || 0 })
                  }
                />
              </div>
              <p className="text-[11px] text-[#918f9f] mt-1">
                Roles strictly below this floor are flagged during scoring.
              </p>
            </div>
          </div>

          <div className="p-4 bg-[#0c0e12] rounded-xl border border-[#464553]/35 flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-[#e2e2e8] block">Remote Positions Accepted</span>
              <span className="text-[11px] text-[#918f9f]">
                Match against pan-India and global remote engineering roles
              </span>
            </div>
            <input
              type="checkbox"
              className="w-4 h-4 rounded bg-[#1a1c20] border-[#464553] text-[#5b5bd6] focus:ring-[#5b5bd6] cursor-pointer"
              checked={formData.remote_ok}
              onChange={(e) => setFormData({ ...formData, remote_ok: e.target.checked })}
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#918f9f] uppercase tracking-wider mb-1.5">
              Target Role Titles (Comma Separated)
            </label>
            <textarea
              className="w-full bg-[#0c0e12] border border-[#464553]/40 rounded-lg p-3 text-xs text-[#e2e2e8] focus:outline-none focus:border-[#5b5bd6]"
              rows={2}
              placeholder="e.g. Software Engineer, Backend Developer, Full Stack Developer, AI Engineer"
              value={formData.target_roles}
              onChange={(e) => setFormData({ ...formData, target_roles: e.target.value })}
            />
          </div>
        </div>

        {/* Section 3: Hermes Auto-Apply Module */}
        <div className="bg-[#1a1c20] p-6 rounded-xl border border-[#464553]/35 space-y-5">
          <div className="flex items-center gap-2 border-b border-[#464553]/30 pb-3.5">
            <Bot className="w-4 h-4 text-[#45dfa4]" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#e2e2e8]">
              Browser Extension & Auto-Fill Controls
            </h2>
          </div>

          <div className="bg-[#ffb77e]/10 border border-[#ffb77e]/30 p-4 rounded-xl flex items-start gap-3">
            <ShieldAlert className="w-4 h-4 text-[#ffb77e] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="text-xs font-semibold text-[#ffb77e]">
                Human-In-The-Loop Safety Guardrail
              </h3>
              <p className="text-[11px] text-[#e2e2e8]/85 leading-relaxed">
                JobCopilot pre-fills Greenhouse, Lever, Ashby, and Workday fields using your candidate profile tokens,
                but never presses the final Submit button without your manual review.
              </p>
            </div>
          </div>

          <div className="p-4 bg-[#0c0e12] rounded-xl border border-[#464553]/35 flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-[#e2e2e8] block">Enable Autonomous Form Filling</span>
              <span className="text-[11px] text-[#918f9f]">
                Allow Chrome Extension HUD & Auto-Fill Kit to pre-populate ATS inputs
              </span>
            </div>
            <input
              type="checkbox"
              className="w-4 h-4 rounded bg-[#1a1c20] border-[#464553] text-[#5b5bd6] focus:ring-[#5b5bd6] cursor-pointer"
              checked={formData.auto_apply_enabled}
              onChange={(e) => setFormData({ ...formData, auto_apply_enabled: e.target.checked })}
            />
          </div>

          <div className="p-4 bg-[#0c0e12] rounded-xl border border-[#464553]/35 flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="text-xs font-semibold text-[#e2e2e8] block">
                JobCopilot Chrome Extension (v2.4)
              </span>
              <span className="text-[11px] text-[#918f9f]">
                Injects a floating Auto-Fill HUD on Greenhouse, Lever, Ashby, Workday, SmartRecruiters & Keka
              </span>
            </div>
            <a
              href="/JobCopilot_Extension.zip"
              download="JobCopilot_Extension.zip"
              className="px-3.5 py-2 rounded-lg bg-[#5b5bd6] hover:bg-[#4f4fc7] text-white text-xs font-semibold flex items-center gap-1.5 transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Extension (.zip)</span>
              <ExternalLink className="w-3 h-3 opacity-80" />
            </a>
          </div>
        </div>

        {/* Save Bar */}
        <div className="flex justify-end pt-1">
          <button
            type="submit"
            disabled={mutation.isPending}
            className="bg-[#5b5bd6] hover:bg-[#4f4fc7] text-white px-6 py-2.5 rounded-xl font-semibold text-xs transition-all disabled:opacity-50 flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            <span>{mutation.isPending ? 'Saving Preferences...' : 'Save Candidate Preferences'}</span>
          </button>
        </div>
      </form>
    </div>
  )
}
