"use client";

import { PriceChart } from "@/components/chart/PriceChart";
import { SymbolSelector } from "@/components/chart/SymbolSelector";
import { TimeframeSelector } from "@/components/chart/TimeframeSelector";
import { useChartStore } from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";

export function ChartGrid() {
  const layout = useChartStore((s) => s.layout);
  const slots = useChartStore((s) => s.slots);
  const activeSlotId = useChartStore((s) => s.activeSlotId);
  const setActiveSlot = useChartStore((s) => s.setActiveSlot);

  const gridClass =
    layout === "single"
      ? "grid grid-cols-1 grid-rows-1"
      : layout === "2h"
        ? "grid grid-cols-2 grid-rows-1"
        : layout === "2v"
          ? "grid grid-cols-1 grid-rows-2"
          : "grid grid-cols-2 grid-rows-2";

  return (
    <div className={cn("h-full w-full gap-px bg-tv-border", gridClass)}>
      {slots.map((slot) => {
        const isActive = slot.id === activeSlotId;
        const showMiniHeader = layout !== "single";
        return (
          <div
            key={slot.id}
            onClick={() => setActiveSlot(slot.id)}
            className={cn(
              "relative flex min-h-0 min-w-0 flex-col bg-tv-bg transition-shadow",
              isActive && layout !== "single"
                ? "shadow-[inset_0_0_0_1px_var(--color-tv-blue)]"
                : "",
            )}
          >
            {showMiniHeader && (
              <div className="flex h-7 shrink-0 items-center gap-1 border-b border-tv-border bg-tv-panel px-1.5">
                <SymbolSelector slotId={slot.id} compact />
                <div className="ml-auto">
                  <TimeframeSelector slotId={slot.id} compact />
                </div>
              </div>
            )}
            <div className="min-h-0 flex-1">
              <PriceChart
                symbol={slot.symbol}
                timeframe={slot.timeframe}
                slotId={slot.id}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
