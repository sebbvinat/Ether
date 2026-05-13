"use client";

import { useState } from "react";
import { Camera, TrendingUp, Zap } from "lucide-react";
import { SymbolSelector } from "@/components/chart/SymbolSelector";
import { TimeframeSelector } from "@/components/chart/TimeframeSelector";
import { IndicatorMenu } from "@/components/chart/IndicatorMenu";
import { Separator } from "@/components/ui/separator";

export function Header() {
  const [tradeToast, setTradeToast] = useState(false);

  function onCapture() {
    window.dispatchEvent(new CustomEvent("ether:capture"));
  }

  function onTrade() {
    setTradeToast(true);
    window.setTimeout(() => setTradeToast(false), 2200);
  }

  return (
    <header className="relative flex h-12 items-center justify-between border-b border-tv-border bg-tv-panel px-3">
      <div className="flex items-center gap-1">
        <div className="flex items-center gap-2 pr-2">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-tv-blue/20">
            <Zap className="h-4 w-4 text-tv-blue" />
          </div>
          <span className="text-sm font-semibold text-tv-text">Ether</span>
        </div>
        <Separator orientation="vertical" className="h-6 bg-tv-border" />
        <SymbolSelector />
        <Separator orientation="vertical" className="h-6 bg-tv-border" />
        <TimeframeSelector />
        <Separator orientation="vertical" className="mx-1 h-6 bg-tv-border" />
        <IndicatorMenu />
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={onCapture}
          aria-label="Capturar chart"
          title="Capturar chart como PNG"
          className="flex h-8 w-8 items-center justify-center rounded text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
        >
          <Camera className="h-4 w-4" />
        </button>

        <Separator orientation="vertical" className="mx-1 h-6 bg-tv-border" />

        <button
          onClick={onTrade}
          className="flex items-center gap-1.5 rounded bg-tv-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-tv-blue/90"
        >
          <TrendingUp className="h-3.5 w-3.5" />
          Operar
        </button>
      </div>

      {tradeToast && (
        <div className="pointer-events-none absolute right-3 top-12 z-50 mt-1 rounded border border-tv-border bg-tv-panel px-3 py-2 text-xs text-tv-text shadow-lg">
          Próximamente — conexión a exchange
        </div>
      )}
    </header>
  );
}
