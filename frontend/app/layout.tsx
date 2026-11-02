import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import { Navigation } from "@/components/ui/Navigation";
import { SWRegister } from "@/components/SWRegister";

const jakartaHeading = Plus_Jakarta_Sans({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const interSans = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "JobCopilot — AI Job Analysis & Application Engine",
  description: "Analyze job descriptions, score your fit, and generate human-sounding cover letters — all locally.",
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${jakartaHeading.variable} ${interSans.variable} ${jetbrainsMono.variable} antialiased bg-[#0c0e12] text-[#e2e2e8] min-h-screen selection:bg-[#5b5bd6]/30 overflow-x-hidden`}
      >
        <ClerkProvider>
          <Providers>
            <div className="min-h-screen flex flex-col lg:flex-row bg-[#0c0e12]">
              <Navigation />
              <main className="flex-1 lg:pl-[232px] min-w-0 w-full">
                <div className="max-w-[1480px] mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6 animate-in fade-in duration-300">
                  {children}
                </div>
              </main>
            </div>
            <SWRegister />
          </Providers>
        </ClerkProvider>
      </body>
    </html>
  );
}
