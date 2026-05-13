"use client";

import { useState } from "react";
import { LayoutGrid, ChevronDown } from "lucide-react";
import { useChartStore, type LayoutType } from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";

interface LayoutOption {
  key: LayoutType;
  label: string;
  icon: React.ReactNode;
}

const OPTIONS: LayoutOption[] = [
  {
    key: "single",
    label: "1 chart",
    icon: (
      <svg viewBox="0 0 16 16" className="h-4 w-4">
        <rect
          x="2"
          y="2"
          width="12"
          height="12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          rx="1"
        />
      </svg>
    ),
  },
  {
    key: "2h",
    label: "2 vertical (split horiz)",
    icon: (
      <svg viewBox="0 0 16 16" className="h-4 w-4">
        <rect
          x="2"
          y="2"
          width="5.5"
          height="12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          rx="1"
        />
        <rect
          x="8.5"
          y="2"
          width="5.5"
          height="12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          rx="1"
        />
      </svg>
    ),
  },
  {
    key: "2v",
    label: "2 apilados",
    icon: (
      <svg viewBox="0 0 16 16" className="h-4 w-4">
        <rect
          x="2"
          y="2"
          width="12"
          height="5.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          rx="1"
        />
        <rect
          x="2"
          y="8.5"
          width="12"
          height="5.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          rx="1"
        />
      </svg>
    ),
  },
  {
    key: "grid4",
    label: "4 charts",
    icon: (
      <svg viewBox="0 0 16 16" className="h-4 w-4">
        <rect
          x="2"
          y="2"
          width="5.5"
          height="5.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          rx="1"
        />
        <rect
          x="8.5"
          y="2"
          width="5.5"
          height="5.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          rx="1"
        />
        <rect
          x="2"
          y="8.5"
          width="5.5"
          height="5.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          rx="1"
        />
        <rect
          x="8.5"
          y="8.5"
          width="5.5"
          height="5.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          rx="1"
        />
      </svg>
    ),
  },
];

export function LayoutPicker() {
  const layout = useChartStore((s) => s.layout);
  const setLayout = useChartStore((s) => s.setLayout);
  const [open, setOpen] = useState(false);

  const current = OPTIONS.find((o) => o.key === layout) ?? OPTIONS[0];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Layout"
        title="Layout de charts"
        className="flex h-8 items-center gap-1 rounded px-1.5 text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
      >
        <LayoutGrid className="h-4 w-4" />
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Cerrar menu"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10"
          />
          <div className="absolute right-0 top-full z-20 mt-1 grid w-44 grid-cols-4 gap-1 rounded border border-tv-border bg-tv-panel p-1.5 shadow-lg">
            {OPTIONS.map((o) => (
              <button
                key={o.key}
                onClick={() => {
                  setLayout(o.key);
                  setOpen(false);
                }}
                title={o.label}
                className={cn(
                  "flex aspect-square items-center justify-center rounded transition-colors",
                  o.key === current.key
                    ? "bg-tv-blue/15 text-tv-blue"
                    : "text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text",
                )}
              >
                {o.icon}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
