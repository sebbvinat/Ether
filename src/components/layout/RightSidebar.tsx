"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Watchlist } from "@/components/watchlist/Watchlist";
import { EconCalendar } from "@/components/econ/EconCalendar";
import { useChartStore } from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";

export function RightSidebar() {
  const open = useChartStore((s) => s.mobileRightOpen);
  const setOpen = useChartStore((s) => s.setMobileRightOpen);
  const [econCollapsed, setEconCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "z-30 flex w-64 flex-col border-l border-tv-border bg-tv-panel",
        "md:static md:translate-x-0",
        "fixed inset-y-0 right-0 transition-transform",
        open ? "translate-x-0" : "translate-x-full md:translate-x-0",
      )}
    >
      <button
        onClick={() => setOpen(false)}
        className="flex h-10 items-center justify-end gap-1 border-b border-tv-border px-3 text-xs text-tv-text-muted hover:text-tv-text md:hidden"
        aria-label="Cerrar"
      >
        Cerrar
        <X className="h-4 w-4" />
      </button>
      <div className="min-h-0 flex-1 overflow-hidden">
        <Watchlist />
      </div>
      <div
        className={cn(
          "shrink-0 border-t border-tv-border",
          econCollapsed ? "" : "max-h-[45%]",
        )}
      >
        <EconCalendar
          collapsed={econCollapsed}
          onToggleCollapsed={() => setEconCollapsed((v) => !v)}
        />
      </div>
    </aside>
  );
}
