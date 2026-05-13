"use client";

import { useState } from "react";
import { Bell, Camera, Menu, List, Play, TrendingUp, Zap } from "lucide-react";
import { SymbolSelector } from "@/components/chart/SymbolSelector";
import { TimeframeSelector } from "@/components/chart/TimeframeSelector";
import { IndicatorMenu } from "@/components/chart/IndicatorMenu";
import { ChartStyleSelector } from "@/components/chart/ChartStyleSelector";
import { LayoutPicker } from "@/components/layout/LayoutPicker";
import { Separator } from "@/components/ui/separator";
import { AlertsDialog } from "@/components/alerts/AlertsDialog";
import { useChartStore } from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";

export function Header() {
  const [tradeToast, setTradeToast] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const setMobileLeftOpen = useChartStore((s) => s.setMobileLeftOpen);
  const setMobileRightOpen = useChartStore((s) => s.setMobileRightOpen);
  const mobileLeftOpen = useChartStore((s) => s.mobileLeftOpen);
  const mobileRightOpen = useChartStore((s) => s.mobileRightOpen);
  const activeSlotId = useChartStore((s) => s.activeSlotId);
  const replay = useChartStore((s) => s.replay);
  const stopReplay = useChartStore((s) => s.stopReplay);

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

  function onTrade() {
    setTradeToast(true);
    window.setTimeout(() => setTradeToast(false), 2200);
  }

  return (
    <header className="relative flex h-12 items-center justify-between border-b border-tv-border bg-tv-panel px-2 sm:px-3">
      <div className="flex min-w-0 items-center gap-1">
        <button
          onClick={() => setMobileLeftOpen(!mobileLeftOpen)}
          aria-label="Tools"
          className="flex h-8 w-8 items-center justify-center rounded text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text md:hidden"
        >
          <Menu className="h-4 w-4" />
        </button>
        <div className="hidden items-center gap-2 pr-2 sm:flex">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-tv-blue/20">
            <Zap className="h-4 w-4 text-tv-blue" />
          </div>
          <span className="text-sm font-semibold text-tv-text">Ether</span>
        </div>
        <Separator
          orientation="vertical"
          className="hidden h-6 bg-tv-border sm:block"
        />
        <SymbolSelector />
        <Separator orientation="vertical" className="h-6 bg-tv-border" />
        <TimeframeSelector />
        <Separator orientation="vertical" className="mx-1 hidden h-6 bg-tv-border md:block" />
        <div className="hidden md:block">
          <ChartStyleSelector />
        </div>
        <Separator orientation="vertical" className="mx-1 hidden h-6 bg-tv-border md:block" />
        <div className="hidden md:block">
          <IndicatorMenu />
        </div>
        <Separator orientation="vertical" className="mx-1 hidden h-6 bg-tv-border md:block" />
        <div className="hidden md:block">
          <LayoutPicker />
        </div>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={onReplay}
          aria-label="Reproducción"
          title="Modo replay (barra a barra)"
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
          onClick={() => setAlertsOpen(true)}
          aria-label="Alertas"
          title="Alertas de precio"
          className="flex h-8 w-8 items-center justify-center rounded text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
        >
          <Bell className="h-4 w-4" />
        </button>

        <button
          onClick={onCapture}
          aria-label="Capturar chart"
          title="Capturar chart como PNG"
          className="flex h-8 w-8 items-center justify-center rounded text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
        >
          <Camera className="h-4 w-4" />
        </button>

        <button
          onClick={() => setMobileRightOpen(!mobileRightOpen)}
          aria-label="Watchlist"
          className="flex h-8 w-8 items-center justify-center rounded text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text md:hidden"
        >
          <List className="h-4 w-4" />
        </button>

        <Separator orientation="vertical" className="mx-1 hidden h-6 bg-tv-border sm:block" />

        <button
          onClick={onTrade}
          className="flex items-center gap-1.5 rounded bg-tv-blue px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-tv-blue/90 sm:px-3"
        >
          <TrendingUp className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Operar</span>
        </button>
      </div>

      {tradeToast && (
        <div className="pointer-events-none absolute right-3 top-12 z-50 mt-1 rounded border border-tv-border bg-tv-panel px-3 py-2 text-xs text-tv-text shadow-lg">
          Próximamente — conexión a exchange
        </div>
      )}
      <AlertsDialog open={alertsOpen} onOpenChange={setAlertsOpen} />
    </header>
  );
}
