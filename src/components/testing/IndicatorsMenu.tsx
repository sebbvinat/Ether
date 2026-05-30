"use client";

/**
 * Wave 18.6 — Menú de indicadores para TestingChart.
 *
 * Subset price-overlay (vive sobre el chart principal): EMAs, SMAs,
 * Bollinger, VWAP. Subpanel (RSI/MACD/etc.) queda para futuro porque
 * requiere panes separados en lightweight-charts.
 */

import { useState } from "react";
import { ChevronDown, Activity } from "lucide-react";
import {
  useTestingStore,
} from "@/lib/store/testing-store";
import { INDICATOR_COLORS, type IndicatorKey } from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";

const TESTING_INDICATORS: { key: IndicatorKey; label: string; group: "overlay" | "subpane" }[] = [
  // Overlays sobre el precio
  { key: "ema20", label: "EMA 20", group: "overlay" },
  { key: "ema50", label: "EMA 50", group: "overlay" },
  { key: "ema200", label: "EMA 200", group: "overlay" },
  { key: "sma20", label: "SMA 20", group: "overlay" },
  { key: "sma50", label: "SMA 50", group: "overlay" },
  { key: "bb", label: "Bollinger Bands", group: "overlay" },
  { key: "vwap", label: "VWAP (sesión actual)", group: "overlay" },
  // Sub-panels abajo del precio
  { key: "rsi", label: "RSI 14", group: "subpane" },
  { key: "macd", label: "MACD 12·26·9", group: "subpane" },
  { key: "stoch", label: "Stochastic 14·3·3", group: "subpane" },
];

export function IndicatorsMenu() {
  const detail = useTestingStore((s) => s.activeDetail);
  const toggle = useTestingStore((s) => s.toggleIndicator);
  const [open, setOpen] = useState(false);

  if (!detail) return null;

  const activeCount = TESTING_INDICATORS.filter((i) => detail.indicators[i.key]).length;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded border border-tv-border bg-tv-panel/40 px-2 py-1 text-[11px] text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
      >
        <Activity className="h-3 w-3" />
        Indicadores
        {activeCount > 0 && (
          <span className="rounded bg-tv-blue/20 px-1 text-[9px] text-tv-blue">
            {activeCount}
          </span>
        )}
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
          <div className="absolute right-0 top-full z-20 mt-1 w-56 overflow-hidden rounded border border-tv-border bg-tv-panel shadow-lg">
            <div className="px-3 py-1 text-[9px] font-semibold uppercase tracking-wider text-tv-text-muted">
              Sobre el precio
            </div>
            {TESTING_INDICATORS.filter((i) => i.group === "overlay").map((ind) => (
              <IndicatorRow key={ind.key} ind={ind} detail={detail} toggle={toggle} />
            ))}
            <div className="my-1 border-t border-tv-border" />
            <div className="px-3 py-1 text-[9px] font-semibold uppercase tracking-wider text-tv-text-muted">
              Sub-paneles
            </div>
            {TESTING_INDICATORS.filter((i) => i.group === "subpane").map((ind) => (
              <IndicatorRow key={ind.key} ind={ind} detail={detail} toggle={toggle} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function IndicatorRow({
  ind,
  detail,
  toggle,
}: {
  ind: { key: IndicatorKey; label: string };
  detail: NonNullable<ReturnType<typeof useTestingStore.getState>["activeDetail"]>;
  toggle: (k: IndicatorKey) => Promise<void>;
}) {
  const active = !!detail.indicators[ind.key];
  const color = INDICATOR_COLORS[ind.key]?.[0] ?? "#787b86";
  return (
    <button
      onClick={() => toggle(ind.key)}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px]",
        active
          ? "bg-tv-blue/10 text-tv-text"
          : "text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text",
      )}
    >
      <span
        className="h-2 w-3 rounded-sm"
        style={{
          background: active ? color : "transparent",
          border: `1px solid ${color}`,
        }}
      />
      <span className="flex-1">{ind.label}</span>
      {active && <span className="text-[9px] text-tv-blue">✓</span>}
    </button>
  );
}
