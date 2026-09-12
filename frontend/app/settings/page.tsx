'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { useApiClient } from '@/lib/useApiClient'



export default function SettingsPage() {
  const queryClient = useQueryClient()
  const { fetch: apiFetch, isLoaded, isSignedIn } = useApiClient()
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] })
      alert('Settings saved!')
    }
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    mutation.mutate({
      ...formData,
      target_roles: formData.target_roles.split(',').map(r => r.trim()).filter(Boolean)
    })
  }

  if (isLoading) return <div>Loading settings...</div>

  return (
    <div className="max-w-2xl mx-auto bg-zinc-900/40 p-8 rounded-2xl shadow-sm border border-zinc-800/50 backdrop-blur-sm">
      <h1 className="text-2xl font-bold mb-6 text-white tracking-tight">Profile Settings</h1>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-semibold text-zinc-400 mb-2 uppercase tracking-wide">Base Location</label>
          <input 
            type="text" 
            className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all" 
            value={formData.base_location}
            onChange={(e) => setFormData({...formData, base_location: e.target.value})}
          />
          <p className="text-xs text-zinc-500 mt-2 font-medium">Used to determine if relocation is required.</p>
        </div>

        <div className="bg-zinc-950/50 p-4 rounded-xl border border-zinc-800/50">
          <label className="flex items-center gap-3 text-sm font-semibold text-white cursor-pointer">
            <input 
              type="checkbox" 
              className="w-5 h-5 rounded border-zinc-700 text-blue-600 focus:ring-blue-500/50 bg-zinc-900 cursor-pointer"
              checked={formData.remote_ok}
              onChange={(e) => setFormData({...formData, remote_ok: e.target.checked})}
            />
            Remote Work OK
          </label>
        </div>

        <div>
          <label className="block text-sm font-semibold text-zinc-400 mb-2 uppercase tracking-wide">Pay Floor (INR/year)</label>
          <input 
            type="number" 
            className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all font-mono" 
            value={formData.pay_floor_ncr_remote}
            onChange={(e) => setFormData({...formData, pay_floor_ncr_remote: parseInt(e.target.value) || 0})}
          />
          <p className="text-xs text-zinc-500 mt-2 font-medium">Jobs below this threshold will automatically get a 'Skip' verdict.</p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-zinc-400 mb-2 uppercase tracking-wide">Target Roles (comma separated)</label>
          <textarea 
            className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all" 
            rows={3}
            value={formData.target_roles}
            onChange={(e) => setFormData({...formData, target_roles: e.target.value})}
          />
        </div>

        <div className="border-t border-zinc-800 pt-8 mt-8">
          <h2 className="text-xl font-bold text-white mb-6">Auto-Apply Module</h2>
          
          <div className="bg-amber-500/10 border border-amber-500/20 p-5 rounded-xl mb-6">
            <h3 className="text-amber-400 font-bold mb-2 uppercase text-xs tracking-wider">⚠️ Risk Disclosure</h3>
            <p className="text-amber-300/80 text-sm leading-relaxed">
              Many ATS platforms prohibit automated form submission. This module will fill out the forms for you on Greenhouse and Lever, but it will <strong>never automatically click the Submit button</strong>. A human click is always required.
            </p>
          </div>

          <div className="bg-zinc-950/50 p-5 rounded-xl border border-zinc-800/50 mb-8">
            <label className="flex items-center gap-3 text-sm font-semibold text-white cursor-pointer">
              <input 
                type="checkbox" 
                className="w-5 h-5 rounded border-zinc-700 text-blue-600 focus:ring-blue-500/50 bg-zinc-900 cursor-pointer"
                checked={formData.auto_apply_enabled}
                onChange={(e) => setFormData({...formData, auto_apply_enabled: e.target.checked})}
              />
              Enable Auto-Apply (Extension Feature)
            </label>
          </div>

          {formData.auto_apply_enabled && (
            <div className="grid grid-cols-2 gap-6 mb-8">
              <div>
                <label className="block text-sm font-semibold text-zinc-400 mb-2 uppercase tracking-wide">First Name</label>
                <input type="text" className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-lg p-3" value={formData.first_name} onChange={(e) => setFormData({...formData, first_name: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-zinc-400 mb-2 uppercase tracking-wide">Last Name</label>
                <input type="text" className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-lg p-3" value={formData.last_name} onChange={(e) => setFormData({...formData, last_name: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-zinc-400 mb-2 uppercase tracking-wide">Email</label>
                <input type="email" className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-lg p-3" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-zinc-400 mb-2 uppercase tracking-wide">Phone</label>
                <input type="text" className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-lg p-3" value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-zinc-400 mb-2 uppercase tracking-wide">LinkedIn URL</label>
                <input type="url" className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-lg p-3" value={formData.linkedin_url} onChange={(e) => setFormData({...formData, linkedin_url: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-zinc-400 mb-2 uppercase tracking-wide">GitHub URL</label>
                <input type="url" className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-lg p-3" value={formData.github_url} onChange={(e) => setFormData({...formData, github_url: e.target.value})} />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-semibold text-zinc-400 mb-2 uppercase tracking-wide">Portfolio URL</label>
                <input type="url" className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-lg p-3" value={formData.portfolio_url} onChange={(e) => setFormData({...formData, portfolio_url: e.target.value})} />
              </div>
            </div>
          )}
        </div>

        <button 
          type="submit" 
          disabled={mutation.isPending}
          className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-500 transition-colors shadow-[0_0_15px_rgba(37,99,235,0.2)]"
        >
          {mutation.isPending ? 'Saving...' : 'Save Settings'}
        </button>
      </form>
    </div>
  )
}
