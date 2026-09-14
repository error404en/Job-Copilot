import { ClerkProvider, SignInButton, SignUpButton, Show, UserButton } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import Link from "next/link";

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
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-zinc-950 text-zinc-50 min-h-screen`}>
        <ClerkProvider>
          <Providers>
          <nav className="bg-zinc-900/50 backdrop-blur-md border-b border-zinc-800 px-6 py-4 flex items-center justify-between sticky top-0 z-50">
          <div className="font-bold text-xl tracking-tight text-white flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-sm shadow-[0_0_15px_rgba(37,99,235,0.4)]">🤖</span>
          JobCopilot
          </div>
          <div className="flex items-center gap-6">
            <div className="flex gap-5 text-sm font-medium mr-4">
            <Link href="/" className="text-zinc-400 hover:text-white transition-colors">Dashboard</Link>
            <Link href="/tracker" className="text-zinc-400 hover:text-white transition-colors flex items-center gap-1">
              <span>📋</span> Tracker
            </Link>
            <Link href="/companies" className="text-zinc-400 hover:text-white transition-colors flex items-center gap-1">
              <span>🏢</span> Target Companies
            </Link>
            <Link href="/digest" className="text-zinc-400 hover:text-white transition-colors">Digest</Link>
            <Link href="/jobs/new" className="text-zinc-400 hover:text-white transition-colors">Add Job</Link>
            <Link href="/resumes" className="text-zinc-400 hover:text-white transition-colors">Resumes</Link>
            <Link href="/settings" className="text-zinc-400 hover:text-white transition-colors">Settings</Link>
            </div>
            <div className="flex items-center gap-4">
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
          <main className="max-w-6xl mx-auto p-6 mt-4">
          {children}
          </main>
          </Providers>
        </ClerkProvider>
      </body>
    </html>
  );
}