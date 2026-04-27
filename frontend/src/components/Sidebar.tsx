"use client";

import { useState } from "react";
import { LayoutDashboard, PanelLeftClose, PanelLeftOpen } from "lucide-react";

const navItems = [
  { label: "Overview", href: "#overview", icon: LayoutDashboard, active: true },
];

export default function Sidebar() {
  const [drawerOpen, setDrawerOpen] = useState(true);

  return (
    <div
      className={`relative hidden shrink-0 overflow-visible transition-[width] duration-300 ease-out lg:block ${
        drawerOpen ? "w-[300px]" : "w-0"
      }`}
    >
      <button
        type="button"
        onClick={() => setDrawerOpen((current) => !current)}
        className={`absolute top-5 z-30 flex h-10 w-10 items-center justify-center rounded-xl border border-[#4a3d30] bg-[#251d16] text-[#f7efe2] shadow-[0_10px_20px_rgba(22,17,12,0.18)] transition-all duration-300 hover:bg-[#31261d] ${
          drawerOpen ? "right-[-20px]" : "right-[-52px]"
        }`}
        aria-label={drawerOpen ? "Hide sidebar" : "Show sidebar"}
        aria-expanded={drawerOpen}
      >
        {drawerOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
      </button>

      <aside
        className={`h-screen overflow-hidden border-r border-[#3d3225] bg-[#1d1712] text-[#f7efe2] transition-all duration-300 ease-out ${
          drawerOpen ? "w-[300px] opacity-100" : "w-0 opacity-0"
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="border-b border-[#3d3225] px-6 py-6">
            <div className="pr-10">
              <div className="text-xs font-semibold uppercase tracking-[0.32em] text-[#d1b17d]">
                HOM
              </div>
              <div className="mt-2 text-2xl font-semibold tracking-tight text-white">LeadOps</div>
              <div className="mt-2 text-sm text-[#cdbda4]">
                Looker-style reporting shell for GHL lead performance.
              </div>
            </div>
          </div>

          <nav className="flex-1 space-y-1 px-2 py-4">
            {navItems.map((item) => {
              const Icon = item.icon;

              return (
                <a
                  key={item.label}
                  href={item.href}
                  className={`flex items-center gap-4 rounded-2xl px-4 py-4 text-[15px] font-semibold transition-colors ${
                    item.active
                      ? "bg-[#3a3120] text-white"
                      : "text-[#f2eadf] hover:bg-[#2a221a]"
                  }`}
                >
                  <Icon size={20} className={item.active ? "text-[#f6ecdc]" : "text-[#d8c9b2]"} />
                  <span>{item.label}</span>
                </a>
              );
            })}
          </nav>

          <div className="px-4 pb-6">
            <div className="rounded-2xl border border-[#4a3d30] bg-[#251d16] px-4 py-4 text-sm text-[#d6c7b2]">
              All cards are fed by the same GHL lead, status, and activity metrics shown in the dashboard.
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
