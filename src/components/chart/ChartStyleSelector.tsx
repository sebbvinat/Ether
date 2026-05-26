"use client";

import { useState } from "react";
import {
  CandlestickChart,
  LineChart,
  AreaChart,
  Flame,
  Activity,
  ChevronDown,
  BarChart3,
  Boxes,
} from "lucide-react";
import {
  useChartStore,
  type ChartStyle,
  type PriceScaleModeKey,
} from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";

const STYLES: { key: ChartStyle; label: string; icon: typeof CandlestickChart }[] = [
  { key: "candles", label: "Velas", icon: CandlestickChart },
  { key: "heikin", label: "Heikin Ashi", icon: Flame },
  { key: "line", label: "Línea", icon: LineChart },
  { key: "area", label: "Área", icon: AreaChart },
  { key: "baseline", label: "Baseline", icon: Activity },
  { key: "renko", label: "Renko", icon: Boxes },
  { key: "lineBreak", label: "Line Break", icon: BarChart3 },
];

const SCALE_MODES: { key: PriceScaleModeKey; label: string }[] = [
  { key: "normal", label: "Normal" },
  { key: "log", label: "Logarítmica" },
  { key: "percent", label: "Porcentaje" },
  { key: "indexed", label: "Indexada a 100" },
];

export function ChartStyleSelector() {
  const style = useChartStore((s) => s.chartStyle);
  const setStyle = useChartStore((s) => s.setChartStyle);
  const scaleMode = useChartStore((s) => s.priceScaleMode);
  const setScaleMode = useChartStore((s) => s.setPriceScaleMode);
  const [open, setOpen] = useState(false);

  const Current = STYLES.find((s) => s.key === style) ?? STYLES[0];
  const CurrentIcon = Current.icon;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Estilo del chart"
        title="Estilo del chart"
        className="flex h-8 items-center gap-1 rounded px-1.5 text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
      >
        <CurrentIcon className="h-4 w-4" />
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10"
          />
          <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded border border-tv-border bg-tv-panel p-1 shadow-lg">
            {STYLES.map((s) => {
              const Icon = s.icon;
              return (
                <button
                  key={s.key}
                  onClick={() => {
                    setStyle(s.key);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs",
                    s.key === style
                      ? "bg-tv-blue/15 text-tv-blue"
                      : "text-tv-text hover:bg-tv-panel-hover",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {s.label}
                </button>
              );
            })}
            <div className="my-1 border-t border-tv-border" />
            <div className="px-2 pb-0.5 pt-1 text-[9px] font-semibold uppercase tracking-wider text-tv-text-muted">
              Escala de precio
            </div>
            {SCALE_MODES.map((m) => (
              <button
                key={m.key}
                onClick={() => {
                  setScaleMode(m.key);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs",
                  m.key === scaleMode
                    ? "bg-tv-blue/15 text-tv-blue"
                    : "text-tv-text hover:bg-tv-panel-hover",
                )}
              >
                <span className="w-3.5 text-center">
                  {m.key === scaleMode ? "✓" : ""}
                </span>
                {m.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
