"use client";

import { Plus, X } from "lucide-react";
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
  const comparesAll = useChartStore((s) => s.compares);
  const addCompare = useChartStore((s) => s.addCompare);
  const removeCompare = useChartStore((s) => s.removeCompare);

  const gridClass =
    layout === "single"
      ? "grid grid-cols-1 grid-rows-1"
      : layout === "2h"
        ? "grid grid-cols-2 grid-rows-1"
        : layout === "2v"
          ? "grid grid-cols-1 grid-rows-2"
          : "grid grid-cols-2 grid-rows-2";

  function addCompareTo(slotId: string) {
    const sym = window.prompt(
      "Símbolo a comparar (ej BTCUSDT, AAPL, ^GSPC):",
    );
    if (!sym || !sym.trim()) return;
    addCompare(slotId, sym.trim().toUpperCase());
  }

  return (
    <div className={cn("h-full w-full gap-px bg-tv-border", gridClass)}>
      {slots.map((slot) => {
        const isActive = slot.id === activeSlotId;
        const showMiniHeader = layout !== "single";
        const slotCompares = comparesAll[slot.id] ?? [];
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
                {slotCompares.map((c) => (
                  <span
                    key={c}
                    className="group flex items-center gap-1 rounded bg-tv-panel-hover px-1.5 py-0.5 text-[10px] text-tv-text"
                  >
                    {c}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeCompare(slot.id, c);
                      }}
                      className="text-tv-text-muted hover:text-tv-red"
                      aria-label={`Quitar ${c}`}
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    addCompareTo(slot.id);
                  }}
                  title="Agregar compare"
                  className="rounded p-0.5 text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
                >
                  <Plus className="h-3 w-3" />
                </button>
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
