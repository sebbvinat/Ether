"use client";

import { useChartStore } from "@/lib/store/chart-store";
import type { Timeframe } from "@/lib/binance/types";
import { cn } from "@/lib/utils";

const TIMEFRAMES: Timeframe[] = ["1m", "5m", "15m", "1h", "4h", "1d", "1w"];

interface Props {
  slotId?: string;
  compact?: boolean;
}

export function TimeframeSelector({ slotId, compact }: Props = {}) {
  const slots = useChartStore((s) => s.slots);
  const activeSlotId = useChartStore((s) => s.activeSlotId);
  const tfGlobal = useChartStore((s) => s.timeframe);
  const setTf = useChartStore((s) => s.setTimeframe);

  const targetId = slotId ?? activeSlotId;
  const tf =
    slotId !== undefined
      ? slots.find((s) => s.id === slotId)?.timeframe ?? tfGlobal
      : tfGlobal;

  return (
    <div
      className={cn(
        "flex items-center gap-0.5 rounded bg-tv-bg",
        compact ? "p-0" : "p-0.5",
      )}
    >
      {TIMEFRAMES.map((t) => (
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
  );
}
