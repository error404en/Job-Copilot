'use client'

import React from 'react'
import Link from 'next/link'
import { LucideIcon } from 'lucide-react'

interface StatItem {
  label: string
  value: string | number
  color?: string
}

interface PageHeaderProps {
  suite: string
  title: string
  subtitle: string
  icon: LucideIcon
  badge?: string
  badgeColor?: 'indigo' | 'emerald' | 'amber' | 'purple' | 'rose' | 'sky' | 'zinc'
  actions?: React.ReactNode
  stats?: StatItem[]
  backHref?: string
  backLabel?: string
}

export function PageHeader({
  suite,
  title,
  subtitle,
  icon: Icon,
  badge,
  badgeColor = 'indigo',
  actions,
  stats,
}: PageHeaderProps) {
  const badgeStyles = {
    indigo: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30',
    emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    purple: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
    rose: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
    sky: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
    zinc: 'bg-zinc-800 text-zinc-300 border-zinc-700/60',
  }[badgeColor]

  const iconGradients = {
    indigo: 'from-indigo-500 to-violet-600 shadow-[0_0_20px_rgba(99,102,241,0.25)] border-indigo-400/20',
    emerald: 'from-emerald-500 to-teal-600 shadow-[0_0_20px_rgba(16,185,129,0.25)] border-emerald-400/20',
    amber: 'from-amber-500 to-orange-600 shadow-[0_0_20px_rgba(245,158,11,0.25)] border-amber-400/20',
    purple: 'from-purple-500 to-pink-600 shadow-[0_0_20px_rgba(168,85,247,0.25)] border-purple-400/20',
    rose: 'from-rose-500 to-pink-600 shadow-[0_0_20px_rgba(244,63,94,0.25)] border-rose-400/20',
    sky: 'from-sky-500 to-blue-600 shadow-[0_0_20px_rgba(14,165,233,0.25)] border-sky-400/20',
    zinc: 'from-zinc-700 to-zinc-800 shadow-[0_0_20px_rgba(113,113,122,0.25)] border-zinc-600/20',
  }[badgeColor]

  return (
    <div className="border-b border-zinc-800/80 pb-6 mb-8 w-full font-sans transition-all">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-5">
        
        {/* Left Side: Brand Context, Icon, Title, and Subtitle */}
        <div className="space-y-2.5 max-w-3xl">
          {/* Suite Meta Badge */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black tracking-widest uppercase text-zinc-500">
              JobCopilot OS
            </span>
            <span className="text-zinc-600 text-xs">•</span>
            <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
              {suite}
            </span>
          </div>

          <div className="flex items-center gap-3.5">
            <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${iconGradients} flex items-center justify-center text-white border shrink-0`}>
              <Icon className="w-5 h-5" />
            </div>

            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                  {title}
                </h1>
                {badge && (
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${badgeStyles}`}>
                    {badge}
                  </span>
                )}
              </div>
            </div>
          </div>

          <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed pt-0.5">
            {subtitle}
          </p>
        </div>

        {/* Right Side: Quick Stats or Action Buttons */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto shrink-0">
          {stats && stats.length > 0 && (
            <div className="flex items-center gap-2 bg-zinc-900/50 p-1.5 rounded-2xl border border-zinc-800/80 backdrop-blur-xl">
              {stats.map((s, idx) => (
                <div key={idx} className="px-3.5 py-1 text-center">
                  <div className={`text-lg sm:text-xl font-black ${s.color || 'text-white'}`}>
                    {s.value}
                  </div>
                  <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">
                    {s.label}
                  </div>
                </div>
              ))}
            </div>
          )}

          {actions && (
            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
              {actions}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
