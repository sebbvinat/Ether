"use client";

import { useRef, useState } from "react";
import { Download, Upload, Settings2 } from "lucide-react";
import { useChartStore } from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";

export function PresetsMenu() {
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const syncCharts = useChartStore((s) => s.syncCharts);
  const setSyncCharts = useChartStore((s) => s.setSyncCharts);

  function exportPreset() {
    const state = useChartStore.getState();
    const payload = {
      version: 1,
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
            "Esto reemplaza tu configuración actual (símbolos, layouts, drawings, etc). ¿Continuar?",
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
        title="Importar / Exportar preset"
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
          <div className="absolute right-0 top-full z-20 mt-1 w-52 rounded border border-tv-border bg-tv-panel p-1 shadow-lg">
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
