'use client'

import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  LayoutDashboard, 
  BrainCircuit, 
  Kanban, 
  Building2, 
  Flame, 
  PlusCircle, 
  FileText, 
  Settings, 
  Bot,
  Inbox,
  Sparkles
} from "lucide-react";
import { SignInButton, SignUpButton, UserButton, Show } from "@clerk/nextjs";

export function Navigation() {
  const pathname = usePathname();

  const navLinks = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/coach', label: 'Coach', icon: BrainCircuit, badge: 'AI' },
    { href: '/tracker', label: 'Tracker', icon: Kanban },
    { href: '/companies', label: 'Companies', icon: Building2 },
    { href: '/digest', label: 'Digest', icon: Flame },
    { href: '/inbox', label: 'Inbox', icon: Inbox },
    { href: '/resumes', label: 'Resumes', icon: FileText },
  ];

  return (
    <nav className="bg-zinc-950/80 backdrop-blur-2xl border-b border-zinc-800/80 px-4 sm:px-6 py-2.5 flex items-center justify-between sticky top-0 z-50 shadow-[0_4px_20px_rgba(0,0,0,0.3)] transition-all w-full font-sans">
      
      {/* Brand Identity */}
      <Link href="/" className="font-extrabold text-base sm:text-lg tracking-tight text-white flex items-center gap-2.5 group">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-[0_0_15px_rgba(99,102,241,0.35)] border border-indigo-400/30 shrink-0 group-hover:scale-105 transition-transform">
          <Bot className="w-4 h-4" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-white via-zinc-100 to-zinc-400 hidden sm:block">
            JobCopilot
          </span>
          <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 hidden md:block">
            PRO
          </span>
        </div>
      </Link>
      
      {/* Center Nav Links */}
      <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto no-scrollbar py-0.5 px-2 bg-zinc-900/40 p-1 rounded-2xl border border-zinc-800/60">
        {navLinks.map((link) => {
          const Icon = link.icon;
          const isActive = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));
          
          return (
            <Link 
              key={link.href} 
              href={link.href} 
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 relative ${
                isActive 
                  ? 'bg-zinc-800 text-white shadow-sm border border-zinc-700/80 font-bold' 
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40 border border-transparent'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 transition-colors ${
                isActive 
                  ? (link.label === 'Coach' ? 'text-indigo-400' : link.label === 'Digest' ? 'text-amber-400' : 'text-white') 
                  : 'text-zinc-500 group-hover:text-zinc-300'
              }`} /> 
              <span>{link.label}</span>

              {link.badge && (
                <span className={`text-[9px] font-black px-1.5 py-0.2 rounded-full ${
                  isActive 
                    ? 'bg-indigo-500 text-white' 
                    : 'bg-indigo-500/20 text-indigo-300'
                }`}>
                  {link.badge}
                </span>
              )}

              {isActive && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-3 h-0.5 bg-indigo-500 rounded-full"></span>
              )}
            </Link>
          )
        })}
      </div>
      
      {/* Right Controls & Profile */}
      <div className="flex items-center gap-2.5 sm:gap-3.5 shrink-0 pl-2">
        <Link 
          href="/jobs/new" 
          className="hidden sm:flex items-center gap-1.5 text-xs font-bold bg-white hover:bg-zinc-200 text-zinc-950 px-3.5 py-1.5 rounded-xl transition-all active:scale-95 shadow-sm"
        >
          <PlusCircle className="w-3.5 h-3.5" /> 
          <span>Add Job</span>
        </Link>

        <Link 
          href="/settings" 
          className={`p-1.5 rounded-xl transition-colors hidden sm:flex items-center justify-center border ${
            pathname === '/settings' 
              ? 'bg-zinc-800 text-white border-zinc-700' 
              : 'text-zinc-400 hover:text-white hover:bg-zinc-900 border-transparent'
          }`}
          title="Profile & Settings"
        >
          <Settings className="w-4 h-4" />
        </Link>

        <div className="h-4 w-[1px] bg-zinc-800 mx-0.5 hidden sm:block"></div>
        
        <Show when="signed-out">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <SignInButton />
            <SignUpButton />
          </div>
        </Show>
        <Show when="signed-in">
          <div className="flex items-center">
            <UserButton />
          </div>
        </Show>
      </div>

    </nav>
  )
}
