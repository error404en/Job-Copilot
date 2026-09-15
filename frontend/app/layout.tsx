import { ClerkProvider, SignInButton, SignUpButton, Show, UserButton } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import { Navigation } from "@/components/ui/Navigation";

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
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-zinc-950 text-zinc-50 min-h-screen selection:bg-indigo-500/30 overflow-x-hidden`}>
        <ClerkProvider>
          <Providers>
          <Navigation />
          <main className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 mt-2 animate-in fade-in duration-500 w-full overflow-hidden">
          {children}
          </main>
          </Providers>
        </ClerkProvider>
      </body>
    </html>
  );
}