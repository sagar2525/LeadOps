"use client";

import { Activity, CalendarRange } from "lucide-react";

export default function Topbar() {
  return (
    <header className="sticky top-0 z-20 border-b border-[#3d3225] bg-[#1d1712]/95 backdrop-blur">
      <div className="flex min-h-[78px] items-center justify-between gap-4 px-5 md:px-8 lg:pl-20">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.32em] text-[#c7ab7a]">
            GHL Reporting
          </div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-[#f7efe2]">
            Dashboard Overview
          </div>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <div className="hidden items-center gap-2 rounded-full border border-[#4a3d30] bg-[#251d16] px-4 py-2 text-sm font-medium text-[#eadfcd] md:flex">
            <CalendarRange size={16} />
            <span>Live report window</span>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-[#4a3d30] bg-[#251d16] px-4 py-2 text-sm font-medium text-[#eadfcd]">
            <Activity size={16} className="text-emerald-400" />
            <span>Mongo live sync</span>
          </div>
        </div>
      </div>
    </header>
  );
}
