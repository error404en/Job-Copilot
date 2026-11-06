"use client";

import { usePathname } from "next/navigation";
import { Navigation } from "@/components/ui/Navigation";

/** Routes that render full-bleed without the top app nav bar */
const BARE_ROUTES = ["/welcome", "/sign-in", "/sign-up"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const isBare = BARE_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"));

  if (isBare) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-[#050507] text-[#F3EFE7] flex flex-col selection:bg-[#2F3DFF]/30">
      <Navigation />
      <main className="flex-1 w-full min-w-0">
        {children}
      </main>
    </div>
  );
}
