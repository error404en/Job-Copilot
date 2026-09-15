import { ClerkProvider, SignInButton, SignUpButton, Show, UserButton } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import Link from "next/link";
import { LayoutDashboard, BrainCircuit, Kanban, Building2, Flame, PlusCircle, FileText, Settings, Bot } from "lucide-react";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "JobCopilot — AI Job Analysis & Application Engine",
  description: "Analyze job descriptions, score your fit, and generate human-sounding cover letters — all locally.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-zinc-950 text-zinc-50 min-h-screen selection:bg-indigo-500/30`}>
        <ClerkProvider>
          <Providers>
          <nav className="bg-zinc-950/70 backdrop-blur-xl border-b border-zinc-800/80 px-6 py-3 flex items-center justify-between sticky top-0 z-50 shadow-sm transition-all">
            <div className="font-bold text-lg tracking-tight text-white flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white shadow-[0_0_15px_rgba(99,102,241,0.4)] border border-indigo-400/20">
                <Bot className="w-5 h-5" />
              </div>
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-zinc-100 to-zinc-400">JobCopilot</span>
            </div>
            
            <div className="flex items-center gap-8">
              <div className="hidden lg:flex items-center gap-6 text-[13px] font-semibold text-zinc-400">
                <Link href="/" className="hover:text-zinc-100 transition-colors flex items-center gap-1.5 group">
                  <LayoutDashboard className="w-4 h-4 text-zinc-500 group-hover:text-zinc-100 transition-colors" /> Dashboard
                </Link>
                <Link href="/coach" className="text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1.5 group">
                  <BrainCircuit className="w-4 h-4 group-hover:drop-shadow-[0_0_8px_rgba(129,140,248,0.5)] transition-all" /> Coach
                </Link>
                <Link href="/tracker" className="hover:text-zinc-100 transition-colors flex items-center gap-1.5 group">
                  <Kanban className="w-4 h-4 text-zinc-500 group-hover:text-zinc-100 transition-colors" /> Tracker
                </Link>
                <Link href="/companies" className="hover:text-zinc-100 transition-colors flex items-center gap-1.5 group">
                  <Building2 className="w-4 h-4 text-zinc-500 group-hover:text-zinc-100 transition-colors" /> Target Companies
                </Link>
                <Link href="/digest" className="hover:text-zinc-100 transition-colors flex items-center gap-1.5 group">
                  <Flame className="w-4 h-4 text-zinc-500 group-hover:text-zinc-100 transition-colors" /> Digest
                </Link>
                <Link href="/resumes" className="hover:text-zinc-100 transition-colors flex items-center gap-1.5 group">
                  <FileText className="w-4 h-4 text-zinc-500 group-hover:text-zinc-100 transition-colors" /> Resumes
                </Link>
              </div>
              
              <div className="flex items-center gap-4">
                <Link href="/jobs/new" className="hidden sm:flex items-center gap-1.5 text-[13px] font-bold bg-white text-zinc-950 px-3.5 py-1.5 rounded-full hover:bg-zinc-200 transition-transform active:scale-95 shadow-sm">
                  <PlusCircle className="w-4 h-4" /> Add Job
                </Link>
                <Link href="/settings" className="text-zinc-500 hover:text-zinc-100 transition-colors">
                  <Settings className="w-5 h-5" />
                </Link>
                <div className="h-5 w-[1px] bg-zinc-800 mx-1"></div>
                <Show when="signed-out">
                  <SignInButton />
                  <SignUpButton />
                </Show>
                <Show when="signed-in">
                  <UserButton />
                </Show>
              </div>
            </div>
          </nav>
          <main className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 mt-2 animate-in fade-in duration-500">
          {children}
          </main>
          </Providers>
        </ClerkProvider>
      </body>
    </html>
  );
}