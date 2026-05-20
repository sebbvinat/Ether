"use client";

import { useRef, useState } from "react";
import {
  MoreHorizontal,
  Activity,
  CandlestickChart,
  LayoutGrid,
  Maximize2,
  FolderOpen,
  Book,
  Layers,
  Camera,
  Play,
  Bell,
  Radar,
  Download,
  Upload,
  Code2,
  LineChart,
} from "lucide-react";
import { useChartStore } from "@/lib/store/chart-store";
import { AlertsDialog } from "@/components/alerts/AlertsDialog";
import { ScannerDialog } from "@/components/scanner/ScannerDialog";
import { WorkspacesDialog } from "@/components/layout/WorkspacesDialog";
import { JournalDialog } from "@/components/journal/JournalDialog";
import { ObjectTreeDialog } from "@/components/layout/ObjectTreeDialog";
import { IndicatorsDialog } from "@/components/chart/IndicatorsDialog";
import { cn } from "@/lib/utils";

/**
 * Catch-all menu for mobile/compact mode — collapses things that don't fit in the top bar
 * into a single popover. Exposes the same dialogs as desktop counterparts.
 */
export function MoreMenu() {
  const [open, setOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [wsOpen, setWsOpen] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [indicatorsOpen, setIndicatorsOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const activeSlotId = useChartStore((s) => s.activeSlotId);
  const replay = useChartStore((s) => s.replay);
  const stopReplay = useChartStore((s) => s.stopReplay);
  const setFocusMode = useChartStore((s) => s.setFocusMode);
  const layout = useChartStore((s) => s.layout);
  const setLayout = useChartStore((s) => s.setLayout);
  const chartStyle = useChartStore((s) => s.chartStyle);
  const setChartStyle = useChartStore((s) => s.setChartStyle);
  const logScale = useChartStore((s) => s.logScale);
  const setLogScale = useChartStore((s) => s.setLogScale);
  const syncCharts = useChartStore((s) => s.syncCharts);
  const setSyncCharts = useChartStore((s) => s.setSyncCharts);
  const binanceMarket = useChartStore((s) => s.binanceMarket);
  const setBinanceMarket = useChartStore((s) => s.setBinanceMarket);

  function onCapture() {
    window.dispatchEvent(
      new CustomEvent("ether:capture", { detail: { slotId: activeSlotId } }),
    );
    setOpen(false);
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
    setOpen(false);
  }

  function exportPreset() {
    const state = useChartStore.getState();
    const payload = {
      version: 2,
      exportedAt: new Date().toISOString(),
      data: { ...state, replay: undefined, mobileLeftOpen: false, mobileRightOpen: false },
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
        if (!parsed?.data) return window.alert("Archivo inválido");
        if (!window.confirm("Reemplazar config actual?")) return;
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
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Más opciones"
        title="Más"
        className="flex h-8 w-8 items-center justify-center rounded text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
      >
        <MoreHorizontal className="h-4 w-4" />
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
            className="fixed inset-0 z-40 bg-black/30"
          />
          <div className="fixed right-2 top-12 z-50 w-64 max-h-[80vh] overflow-y-auto rounded-lg border border-tv-border bg-tv-panel py-1.5 shadow-2xl">
            <Section label="Chart">
              <Row
                icon={<Activity className="h-4 w-4" />}
                label="Indicadores"
                onClick={() => {
                  setOpen(false);
                  setIndicatorsOpen(true);
                }}
              />
              <Row
                icon={<CandlestickChart className="h-4 w-4" />}
                label="Estilo de chart"
                subRight={
                  <select
                    value={chartStyle}
                    onChange={(e) => setChartStyle(e.target.value as "candles" | "heikin" | "line" | "area")}
                    onClick={(e) => e.stopPropagation()}
                    className="rounded bg-tv-bg px-1 py-0.5 text-[11px] text-tv-text"
                  >
                    <option value="candles">Velas</option>
                    <option value="heikin">Heikin Ashi</option>
                    <option value="line">Línea</option>
                    <option value="area">Área</option>
                  </select>
                }
              />
              <Row
                icon={<LayoutGrid className="h-4 w-4" />}
                label="Layout"
                subRight={
                  <select
                    value={layout}
                    onChange={(e) => setLayout(e.target.value as "single" | "2h" | "2v" | "grid4")}
                    onClick={(e) => e.stopPropagation()}
                    className="rounded bg-tv-bg px-1 py-0.5 text-[11px] text-tv-text"
                  >
                    <option value="single">1</option>
                    <option value="2h">2H</option>
                    <option value="2v">2V</option>
                    <option value="grid4">2×2</option>
                  </select>
                }
              />
              <Toggle
                label="Escala logarítmica"
                value={logScale}
                onChange={setLogScale}
              />
              <Toggle
                label="Sync zoom entre slots"
                value={syncCharts}
                onChange={setSyncCharts}
              />
            </Section>

            <Section label="Acciones">
              <Row
                icon={<Play className="h-4 w-4" />}
                label={replay.active ? "Salir replay" : "Replay (barra a barra)"}
                onClick={onReplay}
              />
              <Row
                icon={<Camera className="h-4 w-4" />}
                label="Captura PNG"
                onClick={onCapture}
              />
              <Row
                icon={<Maximize2 className="h-4 w-4" />}
                label="Modo enfoque"
                onClick={() => {
                  setOpen(false);
                  setFocusMode(true);
                }}
              />
            </Section>

            <Section label="Herramientas">
              <Row
                icon={<Code2 className="h-4 w-4" />}
                label="Editor de Pine"
                onClick={() => {
                  setOpen(false);
                  window.dispatchEvent(new CustomEvent("ether:open-pine"));
                }}
              />
              <Row
                icon={<LineChart className="h-4 w-4" />}
                label="Backtest de estrategias"
                onClick={() => {
                  setOpen(false);
                  window.dispatchEvent(new CustomEvent("ether:open-backtest"));
                }}
              />
            </Section>

            <Section label="Datos">
              <Row
                icon={<Bell className="h-4 w-4" />}
                label="Alertas"
                onClick={() => {
                  setOpen(false);
                  setAlertsOpen(true);
                }}
              />
              <Row
                icon={<Radar className="h-4 w-4" />}
                label="Scanner Binance"
                onClick={() => {
                  setOpen(false);
                  setScannerOpen(true);
                }}
              />
              <Row
                icon={<Layers className="h-4 w-4" />}
                label="Capas (objetos)"
                onClick={() => {
                  setOpen(false);
                  setLayersOpen(true);
                }}
              />
              <Row
                icon={<FolderOpen className="h-4 w-4" />}
                label="Workspaces"
                onClick={() => {
                  setOpen(false);
                  setWsOpen(true);
                }}
              />
              <Row
                icon={<Book className="h-4 w-4" />}
                label="Trading Journal"
                onClick={() => {
                  setOpen(false);
                  setJournalOpen(true);
                }}
              />
            </Section>

            <Section label="Mercado Binance">
              <div className="flex gap-1 px-3 py-1.5">
                <button
                  onClick={() => {
                    setBinanceMarket("spot");
                    setOpen(false);
                    window.location.reload();
                  }}
                  className={cn(
                    "flex-1 rounded py-1 text-[11px]",
                    binanceMarket === "spot"
                      ? "bg-tv-blue/15 text-tv-blue"
                      : "bg-tv-bg text-tv-text-muted",
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
                      : "bg-tv-bg text-tv-text-muted",
                  )}
                >
                  Perpetual
                </button>
              </div>
            </Section>

            <Section label="Preset">
              <Row
                icon={<Download className="h-4 w-4" />}
                label="Exportar configuración"
                onClick={exportPreset}
              />
              <Row
                icon={<Upload className="h-4 w-4" />}
                label="Importar configuración"
                onClick={() => fileRef.current?.click()}
              />
            </Section>
          </div>
        </>
      )}

      <AlertsDialog open={alertsOpen} onOpenChange={setAlertsOpen} />
      <ScannerDialog open={scannerOpen} onOpenChange={setScannerOpen} />
      <WorkspacesDialog open={wsOpen} onOpenChange={setWsOpen} />
      <JournalDialog open={journalOpen} onOpenChange={setJournalOpen} />
      <ObjectTreeDialog open={layersOpen} onOpenChange={setLayersOpen} />
      <IndicatorsDialog open={indicatorsOpen} onOpenChange={setIndicatorsOpen} />
    </>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="px-3 pt-2 pb-1 text-[9px] font-semibold uppercase tracking-wider text-tv-text-muted">
        {label}
      </div>
      {children}
      <div className="my-1 border-t border-tv-border last:hidden" />
    </>
  );
}

function Row({
  icon,
  label,
  onClick,
  subRight,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  subRight?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-xs text-tv-text hover:bg-tv-panel-hover"
    >
      <span className="flex items-center gap-2">
        <span className="text-tv-text-muted">{icon}</span>
        {label}
      </span>
      {subRight}
    </button>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-xs text-tv-text hover:bg-tv-panel-hover"
    >
      <span>{label}</span>
      <span
        className={cn(
          "relative h-4 w-7 rounded-full transition-colors",
          value ? "bg-tv-blue" : "bg-tv-bg",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform",
            value ? "translate-x-3.5" : "translate-x-0.5",
          )}
        />
      </span>
    </button>
  );
}
