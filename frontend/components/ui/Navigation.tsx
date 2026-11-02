"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Briefcase,
  Calendar,
  Inbox,
  CheckSquare,
  FileText,
  Bot,
  Building2,
  Settings,
  Plus,
  RefreshCw,
  Menu,
  X,
} from "lucide-react";
import { Show, SignInButton, UserButton } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { useApiClient } from "@/lib/useApiClient";

const NAV_ITEMS = [
  { href: "/", label: "Jobs Feed", icon: Briefcase },
  { href: "/digest", label: "Daily Digest", icon: Calendar, badge: "New" },
  { href: "/inbox", label: "Lead Inbox (Paste & Upload)", icon: Inbox },
  { href: "/tracker", label: "Application Tracker", icon: CheckSquare },
  { href: "/resumes", label: "Resume Vault", icon: FileText },
  { href: "/coach", label: "AI Career Coach", icon: Bot },
  { href: "/companies", label: "Company ATS Boards", icon: Building2 },
  { href: "/settings", label: "Profile & Extension Settings", icon: Settings },
];

export function Navigation() {
  const pathname = usePathname();
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
          setPrimaryResumeName(primary.title);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [isLoaded, isSignedIn]);

  const isRouteActive = (href: string) => {
    if (href === "/") return pathname === "/" || pathname.startsWith("/jobs");
    return pathname.startsWith(href);
  };

  const sidebarContent = (
    <div className="flex flex-col h-full justify-between py-4 px-3 w-[232px] bg-[#0c0e12] text-[#e2e2e8]">
      {/* Top Brand & Navigation Cluster */}
      <div className="space-y-4">
        {/* Brand Header */}
        <div className="flex items-center justify-between px-2 pt-1 pb-1">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#5b5bd6] via-[#8083ff] to-[#c1c1ff] flex items-center justify-center shadow-lg shadow-[#5b5bd6]/20">
              <Briefcase className="w-4 h-4 text-[#0c0e12] stroke-[2.5]" />
            </div>
            <div className="flex flex-col">
              <span className="text-base font-bold text-[#e2e2e8] leading-tight tracking-tight">
                JobCopilot
              </span>
              <span className="text-[11px] text-[#918f9f] leading-tight">
                Career Assistant
              </span>
            </div>
          </Link>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#282a2e] text-[#c1c1ff] border border-[#464553]/40">
            PRO
          </span>
        </div>

        {/* Quick Paste Leads Action */}
        <Link
          href="/inbox"
          onClick={() => setMobileOpen(false)}
          className="w-full px-3 py-2 rounded-xl bg-[#1a1c20] hover:bg-[#282a2e] border border-[#464553]/40 text-xs font-semibold text-[#e2e2e8] flex items-center justify-center gap-2 transition-colors"
        >
          <Plus className="w-3.5 h-3.5 text-[#c1c1ff]" />
          <span>Paste Leads</span>
        </Link>

        {/* Navigation Links */}
        <nav className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isRouteActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`rounded-xl px-3 py-2.5 flex items-center justify-between gap-2.5 text-xs transition-all duration-150 ${
                  active
                    ? "bg-[#282a2e]/80 text-[#e2e2e8] font-semibold border border-[#464553]/40 shadow-sm"
                    : "text-[#c7c4d6]/80 hover:bg-[#1a1c20] hover:text-[#e2e2e8] font-medium"
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      active ? "text-[#c1c1ff]" : "text-[#918f9f]"
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                </div>
                {item.badge && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#1e2024] text-[#45dfa4] font-medium border border-[#464553]/30 shrink-0">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Bottom Profile & Extension Indicator Section */}
      <div className="space-y-2.5 pt-3 border-t border-[#464553]/30">
        {/* Active Resume Mini-Card */}
        <Link
          href="/resumes"
          onClick={() => setMobileOpen(false)}
          className="p-2.5 rounded-xl bg-[#1a1c20] border border-[#464553]/35 flex flex-col gap-1.5 transition hover:border-[#464553]/70 block"
        >
          <div className="flex items-center justify-between text-[#e2e2e8]">
            <div className="flex items-center gap-2 overflow-hidden">
              <FileText className="w-3.5 h-3.5 text-[#c1c1ff] shrink-0" />
              <span className="text-xs font-semibold truncate text-[#e2e2e8]">
                {primaryResumeName}
              </span>
            </div>
            <RefreshCw className="w-3 h-3 text-[#918f9f] shrink-0" />
          </div>
          <div className="flex items-center justify-between text-[11px] text-[#918f9f]">
            <span className="text-[#45dfa4] font-medium flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#45dfa4]" />
              Parsed &amp; Ready
            </span>
            <span className="text-[#c7c4d6]">Primary</span>
          </div>
        </Link>

        {/* Extension Status Pill */}
        <a
          href="/JobCopilot_Extension.zip"
          download="JobCopilot_Extension.zip"
          className="px-2.5 py-2 rounded-xl bg-[#1a1c20]/70 hover:bg-[#1a1c20] border border-[#464553]/25 flex items-center gap-2.5 transition"
          title="Download JobCopilot Chrome Extension (.zip)"
        >
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#45dfa4] opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#45dfa4]" />
          </span>
          <div className="truncate">
            <p className="text-[11px] font-medium text-[#e2e2e8] leading-tight truncate">
              Extension Active v2.4
            </p>
            <p className="text-[10px] text-[#918f9f] truncate">
              Greenhouse, Lever, Workday
            </p>
          </div>
        </a>

        {/* User Account Row */}
        <div className="pt-1 px-1 flex items-center justify-between">
          <Show when="signed-out">
            <SignInButton mode="modal">
              <button className="w-full py-2 rounded-xl bg-[#5b5bd6] hover:brightness-110 text-white text-xs font-semibold cursor-pointer transition">
                Sign In
              </button>
            </SignInButton>
          </Show>
          <Show when="signed-in">
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2.5">
                <UserButton
                  appearance={{
                    elements: {
                      avatarBox: "w-7 h-7 rounded-full border border-[#464553]/50",
                    },
                  }}
                />
                <div className="leading-tight">
                  <div className="text-xs font-semibold text-[#e2e2e8]">Candidate</div>
                  <div className="text-[10px] text-[#45dfa4]">Profile Synced</div>
                </div>
              </div>
              <Link
                href="/settings"
                className="p-1.5 rounded-lg text-[#918f9f] hover:text-[#e2e2e8] hover:bg-[#1a1c20] transition"
                title="Settings"
              >
                <Settings className="w-4 h-4" />
              </Link>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Fixed Left Sidebar */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-[232px] flex-col bg-[#0c0e12] border-r border-[#464553]/30 z-30 select-none">
        {sidebarContent}
      </aside>

      {/* Mobile Top Header */}
      <div className="lg:hidden sticky top-0 z-30 h-14 bg-[#0c0e12]/95 backdrop-blur-md border-b border-[#464553]/30 px-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#5b5bd6] flex items-center justify-center">
            <Briefcase className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-bold text-sm text-[#e2e2e8]">JobCopilot</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href="/inbox"
            className="px-2.5 py-1.5 rounded-lg bg-[#1a1c20] border border-[#464553]/40 text-xs font-medium text-[#e2e2e8]"
          >
            + Paste Leads
          </Link>
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="p-2 rounded-lg bg-[#1a1c20] text-[#e2e2e8] border border-[#464553]/40"
          >
            {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Mobile Slide-Over Sidebar */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative z-50 w-[232px] h-full bg-[#0c0e12] border-r border-[#464553]/40">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}
