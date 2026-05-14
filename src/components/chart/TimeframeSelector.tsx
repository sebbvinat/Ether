"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useChartStore } from "@/lib/store/chart-store";
import type { Timeframe } from "@/lib/binance/types";
import { cn } from "@/lib/utils";

const TIMEFRAMES: Timeframe[] = [
  "1m",
  "3m",
  "5m",
  "15m",
  "30m",
  "1h",
  "2h",
  "4h",
  "6h",
  "12h",
  "1d",
  "3d",
  "1w",
  "1M",
];

// Quick row on desktop
const QUICK: Timeframe[] = ["1m", "5m", "15m", "1h", "4h", "1d", "1w"];

interface Props {
  slotId?: string;
  compact?: boolean;
}

export function TimeframeSelector({ slotId, compact }: Props = {}) {
  const slots = useChartStore((s) => s.slots);
  const activeSlotId = useChartStore((s) => s.activeSlotId);
  const tfGlobal = useChartStore((s) => s.timeframe);
  const setTf = useChartStore((s) => s.setTimeframe);
  const [open, setOpen] = useState(false);

  const targetId = slotId ?? activeSlotId;
  const tf =
    slotId !== undefined
      ? slots.find((s) => s.id === slotId)?.timeframe ?? tfGlobal
      : tfGlobal;

  return (
    <>
      {/* Mobile: single chip with dropdown */}
      <div className="relative md:hidden">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex h-7 items-center gap-1 rounded bg-tv-bg px-2 text-[11px] font-semibold uppercase text-tv-text hover:bg-tv-panel-hover"
        >
          {tf}
          <ChevronDown className="h-3 w-3 text-tv-text-muted" />
        </button>
        {open && (
          <>
            <button
              type="button"
              aria-label="Cerrar"
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-30"
            />
            <div className="absolute left-0 top-full z-40 mt-1 grid w-44 grid-cols-4 gap-1 rounded border border-tv-border bg-tv-panel p-1.5 shadow-lg">
              {TIMEFRAMES.map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    setTf(t, targetId);
                    setOpen(false);
                  }}
                  className={cn(
                    "rounded py-1 text-[11px] font-medium uppercase",
                    tf === t
                      ? "bg-tv-blue/15 text-tv-blue"
                      : "text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Desktop: quick row */}
      <div
        className={cn(
          "hidden items-center gap-0.5 rounded bg-tv-bg md:flex",
          compact ? "p-0" : "p-0.5",
        )}
      >
        {QUICK.map((t) => (
          <button
            key={t}
            onClick={() => setTf(t, targetId)}
            className={cn(
              "rounded font-medium uppercase transition-colors",
              compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs",
              tf === t
                ? "bg-tv-panel-hover text-tv-text"
                : "text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text",
            )}
          >
            {t}
          </button>
        ))}
      </div>
    </>
  );
}
