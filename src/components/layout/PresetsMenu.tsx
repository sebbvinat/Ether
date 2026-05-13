"use client";

import { useRef, useState } from "react";
import {
  Download,
  Upload,
  Settings2,
  FolderOpen,
  Book,
  Layers,
} from "lucide-react";
import { useChartStore } from "@/lib/store/chart-store";
import { WorkspacesDialog } from "@/components/layout/WorkspacesDialog";
import { JournalDialog } from "@/components/journal/JournalDialog";
import { ObjectTreeDialog } from "@/components/layout/ObjectTreeDialog";
import { cn } from "@/lib/utils";

export function PresetsMenu() {
  const [open, setOpen] = useState(false);
  const [wsOpen, setWsOpen] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const syncCharts = useChartStore((s) => s.syncCharts);
  const setSyncCharts = useChartStore((s) => s.setSyncCharts);
  const binanceMarket = useChartStore((s) => s.binanceMarket);
  const setBinanceMarket = useChartStore((s) => s.setBinanceMarket);

  function exportPreset() {
    const state = useChartStore.getState();
    const payload = {
      version: 2,
      exportedAt: new Date().toISOString(),
      data: {
        symbol: state.symbol,
        timeframe: state.timeframe,
        layout: state.layout,
        slots: state.slots,
        activeSlotId: state.activeSlotId,
        indicators: state.indicators,
        hidden: state.hidden,
        config: state.config,
        chartStyle: state.chartStyle,
        logScale: state.logScale,
        watchlists: state.watchlists,
        activeWatchlistId: state.activeWatchlistId,
        watchlist: state.watchlist,
        yahooSymbols: state.yahooSymbols,
        drawings: state.drawings,
        priceLines: state.priceLines,
        syncCharts: state.syncCharts,
        compares: state.compares,
        workspaces: state.workspaces,
        journal: state.journal,
        binanceMarket: state.binanceMarket,
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ether-preset-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setOpen(false);
  }

  function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!parsed || typeof parsed !== "object" || !parsed.data) {
          window.alert("Archivo inválido");
          return;
        }
        if (
          !window.confirm(
            "Esto reemplaza tu configuración actual. ¿Continuar?",
          )
        ) {
          return;
        }
        useChartStore.setState(parsed.data, false);
        window.location.reload();
      } catch (err) {
        window.alert(`Error: ${(err as Error).message}`);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Configuración"
        title="Workspaces / Journal / Capas / Configuración"
        className="flex h-8 w-8 items-center justify-center rounded text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
      >
        <Settings2 className="h-4 w-4" />
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json"
        onChange={onImportFile}
        className="hidden"
      />
      {open && (
        <>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10"
          />
          <div className="absolute right-0 top-full z-20 mt-1 w-60 rounded border border-tv-border bg-tv-panel p-1 shadow-lg">
            <Item
              icon={<FolderOpen className="h-3.5 w-3.5" />}
              label="Workspaces / Plantillas"
              onClick={() => {
                setOpen(false);
                setWsOpen(true);
              }}
            />
            <Item
              icon={<Layers className="h-3.5 w-3.5" />}
              label="Capas (objetos del chart)"
              onClick={() => {
                setOpen(false);
                setLayersOpen(true);
              }}
            />
            <Item
              icon={<Book className="h-3.5 w-3.5" />}
              label="Trading Journal"
              onClick={() => {
                setOpen(false);
                setJournalOpen(true);
              }}
            />
            <div className="my-1 border-t border-tv-border" />
            <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-tv-text-muted">
              Binance market
            </div>
            <div className="flex gap-1 px-1 pb-1">
              <button
                onClick={() => {
                  setBinanceMarket("spot");
                  setOpen(false);
                  // refresh charts to use new endpoint
                  window.location.reload();
                }}
                className={cn(
                  "flex-1 rounded py-1 text-[11px]",
                  binanceMarket === "spot"
                    ? "bg-tv-blue/15 text-tv-blue"
                    : "text-tv-text-muted hover:bg-tv-panel-hover",
                )}
              >
                Spot
              </button>
              <button
                onClick={() => {
                  setBinanceMarket("perp");
                  setOpen(false);
                  window.location.reload();
                }}
                className={cn(
                  "flex-1 rounded py-1 text-[11px]",
                  binanceMarket === "perp"
                    ? "bg-tv-blue/15 text-tv-blue"
                    : "text-tv-text-muted hover:bg-tv-panel-hover",
                )}
              >
                Perpetual
              </button>
            </div>
            <div className="my-1 border-t border-tv-border" />
            <Item
              icon={<Download className="h-3.5 w-3.5" />}
              label="Exportar preset (.json)"
              onClick={exportPreset}
            />
            <Item
              icon={<Upload className="h-3.5 w-3.5" />}
              label="Importar preset"
              onClick={() => fileRef.current?.click()}
            />
            <div className="my-1 border-t border-tv-border" />
            <button
              onClick={() => {
                setSyncCharts(!syncCharts);
                setOpen(false);
              }}
              className={cn(
                "w-full rounded px-2 py-1.5 text-left text-xs",
                syncCharts
                  ? "bg-tv-blue/15 text-tv-blue"
                  : "text-tv-text hover:bg-tv-panel-hover",
              )}
            >
              Sync zoom entre slots {syncCharts ? "✓" : ""}
            </button>
          </div>
        </>
      )}
      <WorkspacesDialog open={wsOpen} onOpenChange={setWsOpen} />
      <JournalDialog open={journalOpen} onOpenChange={setJournalOpen} />
      <ObjectTreeDialog open={layersOpen} onOpenChange={setLayersOpen} />
    </div>
  );
}

function Item({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-tv-text hover:bg-tv-panel-hover"
    >
      {icon}
      {label}
    </button>
  );
}
