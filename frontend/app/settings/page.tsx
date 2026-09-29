'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { useApiClient } from '@/lib/useApiClient'
import { 
  Settings, 
  MapPin, 
  Banknote, 
  Briefcase, 
  Globe, 
  Bot, 
  ShieldAlert, 
  Check, 
  Save, 
  User, 
  Mail, 
  Phone, 
  Link2,
  ExternalLink,
  Sparkles
} from 'lucide-react'

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
    }
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
    }
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    mutation.mutate({
      ...formData,
      target_roles: formData.target_roles.split(',').map(r => r.trim()).filter(Boolean)
    })
  }

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto py-12 space-y-4 animate-pulse font-sans">
        <div className="h-8 bg-zinc-800 rounded-xl w-1/3"></div>
        <div className="h-64 bg-zinc-900/60 rounded-3xl border border-zinc-800/60"></div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-16 font-sans">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 border-b border-zinc-800/80 pb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white shadow-[0_0_20px_rgba(99,102,241,0.3)] border border-indigo-400/20">
              <Settings className="w-5 h-5" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Candidate Profile & Preferences
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-zinc-400 max-w-xl leading-relaxed">
            Configure your geographic constraints, compensation baselines, and auto-apply identity tokens for live ATS scoring.
          </p>
        </div>

        {saveSuccess && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 animate-in fade-in duration-300">
            <Check className="w-4 h-4 text-emerald-400" />
            <span>Settings Saved!</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        
        {/* Section 1: Location & Compensation Thresholds */}
        <div className="bg-zinc-900/60 p-6 sm:p-8 rounded-3xl border border-zinc-800/80 shadow-xl backdrop-blur-xl space-y-6">
          <div className="flex items-center gap-2 border-b border-zinc-800/80 pb-3">
            <MapPin className="w-4 h-4 text-indigo-400" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
              Target Geography & Compensation Baselines
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wide mb-1.5">
                Primary Base Location
              </label>
              <input 
                type="text" 
                className="w-full bg-zinc-950/80 border border-zinc-800 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30 transition-all" 
                placeholder="e.g. Noida, Delhi NCR or Bangalore"
                value={formData.base_location}
                onChange={(e) => setFormData({...formData, base_location: e.target.value})}
              />
              <p className="text-[11px] text-zinc-500 mt-1">Used to evaluate relocation necessity for onsite requisitions.</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wide mb-1.5">
                Annual Pay Floor (INR / Year)
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-zinc-500">₹</span>
                <input 
                  type="number" 
                  step={50000}
                  className="w-full bg-zinc-950/80 border border-zinc-800 rounded-xl pl-8 pr-3 py-3 text-xs text-white font-mono focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30 transition-all" 
                  value={formData.pay_floor_ncr_remote}
                  onChange={(e) => setFormData({...formData, pay_floor_ncr_remote: parseInt(e.target.value) || 0})}
                />
              </div>
              <p className="text-[11px] text-zinc-500 mt-1">Requisitions strictly below this threshold receive an automatic Skip verdict.</p>
            </div>
          </div>

          {/* Remote Toggle */}
          <div className="p-4 bg-zinc-950/60 rounded-2xl border border-zinc-800/80 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-white block">Remote Positions Accepted</span>
              <span className="text-[11px] text-zinc-500">Match against pan-India and global remote engineering roles</span>
            </div>
            <input 
              type="checkbox" 
              className="w-4 h-4 rounded bg-zinc-900 border-zinc-700 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              checked={formData.remote_ok}
              onChange={(e) => setFormData({...formData, remote_ok: e.target.checked})}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wide mb-1.5">
              Target Role Titles (Comma Separated)
            </label>
            <textarea 
              className="w-full bg-zinc-950/80 border border-zinc-800 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30 transition-all" 
              rows={2}
              placeholder="e.g. Software Engineer, Backend Developer, Full Stack Developer, Systems Engineer"
              value={formData.target_roles}
              onChange={(e) => setFormData({...formData, target_roles: e.target.value})}
            />
            <p className="text-[11px] text-zinc-500 mt-1">Our ingestion worker prioritizes notifications matching these career targets.</p>
          </div>
        </div>

        {/* Section 2: Candidate Identity & Profiles */}
        <div className="bg-zinc-900/60 p-6 sm:p-8 rounded-3xl border border-zinc-800/80 shadow-xl backdrop-blur-xl space-y-6">
          <div className="flex items-center gap-2 border-b border-zinc-800/80 pb-3">
            <User className="w-4 h-4 text-indigo-400" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
              Candidate Identity & Profile Links
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wide mb-1">First Name</label>
              <input type="text" className="w-full bg-zinc-950/80 border border-zinc-800 rounded-xl p-2.5 text-xs text-white" value={formData.first_name} onChange={(e) => setFormData({...formData, first_name: e.target.value})} />
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wide mb-1">Last Name</label>
              <input type="text" className="w-full bg-zinc-950/80 border border-zinc-800 rounded-xl p-2.5 text-xs text-white" value={formData.last_name} onChange={(e) => setFormData({...formData, last_name: e.target.value})} />
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wide mb-1">Email</label>
              <input type="email" className="w-full bg-zinc-950/80 border border-zinc-800 rounded-xl p-2.5 text-xs text-white" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} />
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wide mb-1">Phone</label>
              <input type="text" className="w-full bg-zinc-950/80 border border-zinc-800 rounded-xl p-2.5 text-xs text-white" value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} />
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wide mb-1">LinkedIn URL</label>
              <input type="url" className="w-full bg-zinc-950/80 border border-zinc-800 rounded-xl p-2.5 text-xs text-white" value={formData.linkedin_url} onChange={(e) => setFormData({...formData, linkedin_url: e.target.value})} />
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wide mb-1">GitHub URL</label>
              <input type="url" className="w-full bg-zinc-950/80 border border-zinc-800 rounded-xl p-2.5 text-xs text-white" value={formData.github_url} onChange={(e) => setFormData({...formData, github_url: e.target.value})} />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wide mb-1">Portfolio / Personal Site</label>
              <input type="url" className="w-full bg-zinc-950/80 border border-zinc-800 rounded-xl p-2.5 text-xs text-white" value={formData.portfolio_url} onChange={(e) => setFormData({...formData, portfolio_url: e.target.value})} />
            </div>
          </div>
        </div>

        {/* Section 3: Hermes Auto-Apply Module */}
        <div className="bg-zinc-900/60 p-6 sm:p-8 rounded-3xl border border-zinc-800/80 shadow-xl backdrop-blur-xl space-y-6">
          <div className="flex items-center gap-2 border-b border-zinc-800/80 pb-3">
            <Bot className="w-4 h-4 text-purple-400" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
              Hermes Autonomous Browser Extension Settings
            </h2>
          </div>

          <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-2xl flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="text-xs font-bold text-amber-300 uppercase tracking-wider">Human-In-The-Loop Safety Guardrail</h3>
              <p className="text-[11px] text-amber-200/80 leading-relaxed">
                Hermes pre-fills complex Greenhouse, Lever, and Ashby requisition fields using your candidate profile tokens, but will <strong>never automatically press the final Submit button</strong> without your manual visual confirmation.
              </p>
            </div>
          </div>

          <div className="p-4 bg-zinc-950/60 rounded-2xl border border-zinc-800/80 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-white block">Enable Autonomous Form Filling</span>
              <span className="text-[11px] text-zinc-500">Allow Chrome Extension HUD to pre-populate ATS inputs</span>
            </div>
            <input 
              type="checkbox" 
              className="w-4 h-4 rounded bg-zinc-900 border-zinc-700 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              checked={formData.auto_apply_enabled}
              onChange={(e) => setFormData({...formData, auto_apply_enabled: e.target.checked})}
            />
          </div>
        </div>

        {/* Save Bar */}
        <div className="flex justify-end pt-2">
          <button 
            type="submit" 
            disabled={mutation.isPending}
            className="bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white px-8 py-3 rounded-2xl font-bold text-xs transition-all shadow-[0_0_20px_rgba(79,70,229,0.3)] hover:shadow-[0_0_25px_rgba(79,70,229,0.45)] disabled:opacity-50 flex items-center gap-2 active:scale-95"
          >
            {mutation.isPending ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Persisting Changes...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4 text-indigo-200" />
                <span>Save Candidate Preferences</span>
              </>
            )}
          </button>
        </div>

      </form>

    </div>
  )
}
