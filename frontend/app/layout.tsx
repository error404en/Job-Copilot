import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Inter, JetBrains_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import { AppShell } from "@/components/AppShell";
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

const instrumentSerif = Instrument_Serif({
  variable: "--font-serif-display",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "JobCopilot — AI Job Analysis & Application Engine",
  description: "Analyze job descriptions, score your fit, and generate human-sounding cover letters — all locally.",
  manifest: "/manifest.webmanifest",
  applicationName: "JobCopilot",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "JobCopilot",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/icon-192.png",
  },
};

export const viewport = {
  themeColor: "#050507",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark bg-[#050507]" style={{ colorScheme: "dark", backgroundColor: "#050507" }}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className={`${jakartaHeading.variable} ${interSans.variable} ${jetbrainsMono.variable} ${instrumentSerif.variable} antialiased bg-[#050507] text-[#F3EFE7] min-h-screen selection:bg-[#2F3DFF]/30 overflow-x-hidden font-sans`}
      >
        <ClerkProvider>
          <Providers>
            <AppShell>{children}</AppShell>
            <SWRegister />
          </Providers>
        </ClerkProvider>
      </body>
    </html>
  );
}
