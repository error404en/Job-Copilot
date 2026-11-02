import React from "react";
import { LucideIcon } from "lucide-react";

interface PageHeaderProps {
  suite?: string;
  title: string;
  subtitle: string;
  icon?: LucideIcon;
  badge?: string;
  badgeColor?: "indigo" | "teal" | "rose" | "purple" | "emerald" | "amber";
  actions?: React.ReactNode;
}

export function PageHeader({
  title,
  subtitle,
  badge,
  badgeColor = "indigo",
  actions,
}: PageHeaderProps) {
  const badgeStyles: Record<string, string> = {
    indigo: "bg-[#1a1c20] text-[#c1c1ff] border-[#5b5bd6]/35",
    teal: "bg-[#1a1c20] text-[#45dfa4] border-[#45dfa4]/30",
    emerald: "bg-[#1a1c20] text-[#45dfa4] border-[#45dfa4]/30",
    rose: "bg-[#1a1c20] text-[#ffb4ab] border-[#ffb4ab]/30",
    purple: "bg-[#1a1c20] text-[#c1c1ff] border-[#5b5bd6]/35",
    amber: "bg-[#1a1c20] text-[#ffb77e] border-[#ffb77e]/30",
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-[#464553]/30">
      <div className="space-y-1 max-w-2xl">
        <div className="flex items-center gap-2.5 flex-wrap">
          <h1 className="text-2xl font-bold tracking-tight text-[#e2e2e8]">
            {title}
          </h1>
          {badge && (
            <span
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${badgeStyles[badgeColor]}`}
            >
              {badge}
            </span>
          )}
        </div>
        <p className="text-xs sm:text-sm text-[#918f9f] leading-relaxed">
          {subtitle}
        </p>
      </div>
      {actions && (
        <div className="shrink-0 flex items-center gap-2.5 flex-wrap">
          {actions}
        </div>
      )}
    </div>
  );
}
