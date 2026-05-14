"use client";

import { useState } from "react";
import { Camera, Menu, Play, TrendingUp, Zap } from "lucide-react";
import { SymbolSelector } from "@/components/chart/SymbolSelector";
import { TimeframeSelector } from "@/components/chart/TimeframeSelector";
import { IndicatorMenu } from "@/components/chart/IndicatorMenu";
import { ChartStyleSelector } from "@/components/chart/ChartStyleSelector";
import { LayoutPicker } from "@/components/layout/LayoutPicker";
import { Separator } from "@/components/ui/separator";
import { MoreMenu } from "@/components/layout/MoreMenu";
import { useChartStore } from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";

export function Header() {
  const [tradeToast, setTradeToast] = useState(false);
  const setMobileLeftOpen = useChartStore((s) => s.setMobileLeftOpen);
  const mobileLeftOpen = useChartStore((s) => s.mobileLeftOpen);
  const activeSlotId = useChartStore((s) => s.activeSlotId);
  const replay = useChartStore((s) => s.replay);
  const stopReplay = useChartStore((s) => s.stopReplay);

  function onTrade() {
    setTradeToast(true);
    window.setTimeout(() => setTradeToast(false), 2200);
  }

  function onCapture() {
    window.dispatchEvent(
      new CustomEvent("ether:capture", { detail: { slotId: activeSlotId } }),
    );
  }

  function onReplay() {
    if (replay.active) {
      stopReplay();
    } else {
      window.dispatchEvent(
        new CustomEvent("ether:start-replay", {
          detail: { slotId: activeSlotId },
        }),
      );
    }
  }

  return (
    <header className="relative flex h-11 shrink-0 items-center justify-between border-b border-tv-border bg-tv-panel px-2">
      {/* LEFT: brand + symbol + tf + chart style + indicators + layout */}
      <div className="flex min-w-0 items-center gap-1">
        <button
          onClick={() => setMobileLeftOpen(!mobileLeftOpen)}
          aria-label="Herramientas"
          className="flex h-8 w-8 items-center justify-center rounded text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text md:hidden"
        >
          <Menu className="h-4 w-4" />
        </button>
        <div className="hidden items-center gap-1.5 pr-2 sm:flex">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-tv-blue/20">
            <Zap className="h-3.5 w-3.5 text-tv-blue" />
          </div>
          <span className="text-sm font-semibold text-tv-text">Ether</span>
        </div>
        <Separator
          orientation="vertical"
          className="hidden h-5 bg-tv-border sm:block"
        />
        <SymbolSelector />
        <Separator orientation="vertical" className="h-5 bg-tv-border" />
        <TimeframeSelector />

        <Separator orientation="vertical" className="mx-1 h-5 bg-tv-border" />
        <ChartStyleSelector />
        <IndicatorMenu />
        <div className="hidden md:block">
          <LayoutPicker />
        </div>
      </div>

      {/* RIGHT: replay + capture + more + operar */}
      <div className="flex items-center gap-0.5">
        <button
          onClick={onReplay}
          aria-label="Replay"
          title="Replay (barra a barra)"
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded hover:bg-tv-panel-hover hover:text-tv-text",
            replay.active
              ? "bg-tv-yellow/15 text-tv-yellow"
              : "text-tv-text-muted",
          )}
        >
          <Play className="h-4 w-4" />
        </button>
        <button
          onClick={onCapture}
          aria-label="Captura"
          title="Captura PNG"
          className="flex h-8 w-8 items-center justify-center rounded text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
        >
          <Camera className="h-4 w-4" />
        </button>
        <MoreMenu />
        <button
          onClick={onTrade}
          className="ml-1 flex items-center gap-1 rounded bg-tv-blue px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-tv-blue/90 sm:px-3 sm:text-xs"
        >
          <TrendingUp className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
          <span className="hidden sm:inline">Operar</span>
        </button>
      </div>

      {tradeToast && (
        <div className="pointer-events-none absolute right-3 top-12 z-50 rounded border border-tv-border bg-tv-panel px-3 py-2 text-xs text-tv-text shadow-lg">
          Próximamente — conexión a exchange
        </div>
      )}
    </header>
  );
}
