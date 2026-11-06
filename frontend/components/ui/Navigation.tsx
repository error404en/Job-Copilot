"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { Menu, X, Sparkles } from "lucide-react";
import { SignInButton, UserButton } from "@clerk/nextjs";
import { useApiClient } from "@/lib/useApiClient";

interface NavItem {
  href: string;
  label: string;
  isNew?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Jobs Feed" },
  { href: "/digest", label: "Daily Digest", isNew: true },
  { href: "/inbox", label: "Lead Inbox" },
  { href: "/tracker", label: "Tracker" },
  { href: "/resumes", label: "Resume Vault" },
  { href: "/coach", label: "AI Career Coach" },
  { href: "/companies", label: "Company ATS Boards" },
  { href: "/settings", label: "Settings" },
];

export function Navigation() {
  const pathname = usePathname() || "/";
  const { fetch: apiFetch, isLoaded, isSignedIn } = useApiClient();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [primaryResumeName, setPrimaryResumeName] = useState<string>("Primary_Resume.pdf");

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let mounted = true;
    apiFetch("/api/resumes")
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => {
        if (!mounted || !Array.isArray(list) || list.length === 0) return;
        const primary = list.find((item: any) => item.is_primary) || list[0];
        if (primary?.title) {
          const raw = primary.title.trim();
          const cleanName = raw.includes(" - ") ? raw.split(" - ")[0] + "_Resume.pdf" : raw.endsWith(".pdf") ? raw : `${raw}.pdf`;
          setPrimaryResumeName(cleanName);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [isLoaded, isSignedIn, apiFetch]);

  const isRouteActive = (href: string) => {
    if (href === "/") {
      return pathname === "/" || pathname.startsWith("/jobs");
    }
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <header className="sticky top-0 z-50 w-full bg-[#050507]/90 backdrop-blur-md border-b border-white/10 px-4 sm:px-8 py-3.5 flex items-center justify-between gap-4">
      {/* Brand logo */}
      <div className="flex items-center gap-6 shrink-0">
        <Link href="/" className="flex items-center gap-2.5 text-[#F3EFE7] hover:opacity-90 transition-opacity">
          <svg
            aria-hidden="true"
            fill="none"
            height="24"
            viewBox="0 0 24 24"
            stroke="#F3EFE7"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            width="24"
          >
            <path d="M3 20 12 3l9 17" />
            <path d="M7.5 14h9" />
          </svg>
          <span className="text-[17px] font-semibold tracking-tight">JobCopilot</span>
        </Link>

        {/* Quick link to Landing */}
        <Link
          href="/welcome"
          className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono text-zinc-400 border border-white/10 hover:border-white/20 hover:text-white transition"
        >
          <Sparkles className="w-3 h-3 text-[#8C97FF]" />
          <span>Landing</span>
        </Link>
      </div>

      {/* Desktop Navigation pill track */}
      <nav aria-label="App Navigation" className="nvwrap hidden lg:flex items-center gap-1 overflow-x-auto">
        {NAV_ITEMS.map((item) => {
          const active = isRouteActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nv ${active ? "nvon" : ""}`}
            >
              <span>{item.label}</span>
              {item.isNew && (
                <span className="font-mono text-[9px] uppercase tracking-wider bg-[#2F3DFF] text-white px-1.5 py-0.5 rounded font-semibold">
                  New
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Right controls cluster */}
      <div className="flex items-center gap-2.5 shrink-0">
        <Link
          href="/resumes"
          className="hidden sm:inline-flex items-center gap-2 text-xs text-[#C9C6BE] border border-white/10 rounded-full px-3 py-1.5 hover:border-white/20 hover:text-white transition truncate max-w-[170px]"
        >
          <span className="w-2 h-2 rounded-full bg-[#5EEAA8] shrink-0" />
          <span className="truncate">{primaryResumeName}</span>
        </Link>

        <Link
          href="/settings"
          className="hidden xl:inline-flex items-center gap-2 text-xs text-[#C9C6BE] border border-white/10 rounded-full px-3 py-1.5 hover:border-white/20 hover:text-white transition"
        >
          <span className="w-2 h-2 rounded-full bg-[#5EEAA8] shrink-0" />
          <span>Extension v2.4</span>
        </Link>

        <Link
          href="/jobs/new"
          className="inline-flex items-center justify-center h-9 px-4 rounded-full bg-[#2F3DFF] text-white text-xs font-semibold hover:bg-[#3D4CFF] transition-all hover:scale-[1.02]"
          title="Paste a job description, link, or screenshot (Ctrl+V) from LinkedIn, Glassdoor, or ATS"
        >
          + Paste leads
        </Link>

        {/* User Auth */}
        <div className="flex items-center ml-1">
          {isSignedIn ? (
            <UserButton />
          ) : (
            <SignInButton mode="modal">
              <button
                type="button"
                className="text-xs font-medium text-[#C9C6BE] hover:text-white px-3 py-1.5 rounded-full border border-white/10 hover:border-white/20 transition"
              >
                Sign In
              </button>
            </SignInButton>
          )}
        </div>

        {/* Mobile menu hamburger toggle */}
        <button
          type="button"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="lg:hidden p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5"
          aria-label="Toggle navigation menu"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-x-0 top-[65px] bg-[#0A0B0F]/95 backdrop-blur-xl border-b border-white/10 p-5 space-y-2 shadow-2xl z-50 animate-in fade-in slide-in-from-top-2">
          {NAV_ITEMS.map((item) => {
            const active = isRouteActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center justify-between p-3 rounded-xl text-sm transition ${
                  active ? "bg-[#F3EFE7] text-[#0A0A0C] font-semibold" : "text-[#C9C6BE] hover:bg-white/5 hover:text-white"
                }`}
              >
                <span>{item.label}</span>
                {item.isNew && (
                  <span className="font-mono text-[9px] bg-[#2F3DFF] text-white px-2 py-0.5 rounded font-semibold">
                    New
                  </span>
                )}
              </Link>
            );
          })}

          <div className="pt-3 border-t border-white/10 flex items-center justify-between text-xs text-zinc-400">
            <Link href="/resumes" onClick={() => setMobileOpen(false)} className="hover:text-white">
              {primaryResumeName}
            </Link>
            <Link href="/welcome" onClick={() => setMobileOpen(false)} className="text-[#8C97FF] hover:underline">
              View Landing Page →
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
