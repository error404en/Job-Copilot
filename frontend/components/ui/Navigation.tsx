'use client'

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, BrainCircuit, Kanban, Building2, Flame, PlusCircle, FileText, Settings, Bot } from "lucide-react";
import { SignInButton, SignUpButton, UserButton, Show } from "@clerk/nextjs";

export function Navigation() {
  const pathname = usePathname();

  const navLinks = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/coach', label: 'Coach', icon: BrainCircuit, color: 'indigo' },
    { href: '/tracker', label: 'Tracker', icon: Kanban },
    { href: '/companies', label: 'Target Companies', icon: Building2 },
    { href: '/digest', label: 'Digest', icon: Flame },
    { href: '/resumes', label: 'Resumes', icon: FileText },
  ];

  return (
    <nav className="bg-zinc-950/70 backdrop-blur-xl border-b border-zinc-800/80 px-4 sm:px-6 py-3 flex items-center justify-between sticky top-0 z-50 shadow-sm transition-all w-full">
      <div className="font-bold text-lg tracking-tight text-white flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white shadow-[0_0_15px_rgba(99,102,241,0.4)] border border-indigo-400/20 shrink-0">
          <Bot className="w-5 h-5" />
        </div>
        <span className="bg-clip-text text-transparent bg-gradient-to-r from-zinc-100 to-zinc-400 hidden sm:block">JobCopilot</span>
      </div>
      
      <div className="flex items-center gap-4 sm:gap-8 overflow-x-auto no-scrollbar mask-edges">
        <div className="flex items-center gap-4 sm:gap-6 text-[13px] font-semibold px-2">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const isActive = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));
            
            if (link.color === 'indigo') {
               return (
                <Link key={link.href} href={link.href} className={`flex items-center gap-1.5 group transition-colors shrink-0 ${isActive ? 'text-indigo-300' : 'text-indigo-400 hover:text-indigo-300'}`}>
                  <Icon className={`w-4 h-4 transition-all ${isActive ? 'drop-shadow-[0_0_8px_rgba(129,140,248,0.8)]' : 'group-hover:drop-shadow-[0_0_8px_rgba(129,140,248,0.5)]'}`} /> 
                  <span className={`${isActive ? 'block' : 'hidden lg:block'} sm:block`}>{link.label}</span>
                </Link>
               )
            }

            return (
              <Link key={link.href} href={link.href} className={`flex items-center gap-1.5 group transition-colors shrink-0 ${isActive ? 'text-zinc-100' : 'text-zinc-400 hover:text-zinc-100'}`}>
                <Icon className={`w-4 h-4 transition-colors ${isActive ? 'text-zinc-100' : 'text-zinc-500 group-hover:text-zinc-100'}`} /> 
                <span className={`${isActive ? 'block' : 'hidden lg:block'} sm:block`}>{link.label}</span>
              </Link>
            )
          })}
        </div>
      </div>
      
      <div className="flex items-center gap-3 sm:gap-4 shrink-0 pl-2">
        <Link href="/jobs/new" className="hidden sm:flex items-center gap-1.5 text-[13px] font-bold bg-white text-zinc-950 px-3.5 py-1.5 rounded-full hover:bg-zinc-200 transition-transform active:scale-95 shadow-sm">
          <PlusCircle className="w-4 h-4" /> Add Job
        </Link>
        <Link href="/settings" className={`transition-colors hidden sm:block ${pathname === '/settings' ? 'text-zinc-100' : 'text-zinc-500 hover:text-zinc-100'}`}>
          <Settings className="w-5 h-5" />
        </Link>
        <div className="h-5 w-[1px] bg-zinc-800 mx-1 hidden sm:block"></div>
        <Show when="signed-out">
          <SignInButton />
          <SignUpButton />
        </Show>
        <Show when="signed-in">
          <UserButton />
        </Show>
      </div>
    </nav>
  )
}
