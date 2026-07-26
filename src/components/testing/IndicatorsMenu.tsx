"use client";

/**
 * Wave 18.6 — Menú de indicadores para TestingChart.
 *
 * Dos grupos: overlays sobre el precio (EMAs, SMAs, Bollinger, VWAP) y
 * sub-paneles (RSI, MACD, Stochastic). §9 agrega el engranaje para ajustar
 * los períodos de los que tienen parámetros.
 */

import { useEffect, useState } from "react";
import { ChevronDown, Activity, Settings2 } from "lucide-react";
import { useTestingStore } from "@/lib/store/testing-store";
import {
  INDICATOR_COLORS,
  type IndicatorConfig,
  type IndicatorKey,
} from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";

/** §9 — qué períodos se pueden tocar por indicador. Las EMAs y SMAs quedan
 *  fijas a propósito: son series distintas por diseño (EMA 20, 50 y 200 son
 *  tres entradas del menú, no una con parámetro). */
interface ConfigFieldDef {
  key: keyof IndicatorConfig;
  label: string;
  fallback: number;
  min?: number;
  step?: number;
}

const SETTINGS_FIELDS: Partial<Record<IndicatorKey, ConfigFieldDef[]>> = {
  bb: [
    { key: "bbPeriod", label: "Período", fallback: 20 },
    { key: "bbStdDev", label: "Desvíos", fallback: 2, min: 0.1, step: 0.1 },
  ],
  rsi: [{ key: "rsi", label: "Período", fallback: 14 }],
  macd: [
    { key: "macdFast", label: "Rápida", fallback: 12 },
    { key: "macdSlow", label: "Lenta", fallback: 26 },
    { key: "macdSignal", label: "Señal", fallback: 9 },
  ],
  stoch: [
    { key: "stochK", label: "%K", fallback: 14 },
    { key: "stochD", label: "%D", fallback: 3 },
  ],
};

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
  const [showSettings, setShowSettings] = useState(false);
  const fields = SETTINGS_FIELDS[ind.key];
  return (
    <div>
      <div
        className={cn(
          "flex w-full items-center gap-2 pl-3 pr-1 text-[11px]",
          active
            ? "bg-tv-blue/10 text-tv-text"
            : "text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text",
        )}
      >
        <button
          onClick={() => toggle(ind.key)}
          className="flex flex-1 items-center gap-2 py-1.5 text-left"
        >
          <span
            className="h-2 w-3 shrink-0 rounded-sm"
            style={{
              background: active ? color : "transparent",
              border: `1px solid ${color}`,
            }}
          />
          <span className="flex-1">{ind.label}</span>
          {active && <span className="text-[9px] text-tv-blue">✓</span>}
        </button>
        {/* §9 — el engranaje sólo aparece si el indicador está activo y tiene
            períodos que valga la pena tocar. */}
        {active && fields && (
          <button
            onClick={() => setShowSettings((v) => !v)}
            title="Ajustar períodos"
            className={cn(
              "rounded p-1 text-[11px] hover:bg-tv-panel-hover",
              showSettings ? "text-tv-blue" : "text-tv-text-muted",
            )}
          >
            <Settings2 className="h-3 w-3" />
          </button>
        )}
      </div>
      {active && fields && showSettings && (
        <div className="flex flex-wrap gap-2 border-y border-tv-border bg-tv-bg/40 px-3 py-2">
          {fields.map((f) => (
            <ConfigField key={f.key} field={f} detail={detail} />
          ))}
        </div>
      )}
    </div>
  );
}

/** §9 — un input numérico que commitea al salir o con Enter, y revierte si el
 *  valor no sirve (0, negativo o no numérico). */
function ConfigField({
  field,
  detail,
}: {
  field: ConfigFieldDef;
  detail: NonNullable<ReturnType<typeof useTestingStore.getState>["activeDetail"]>;
}) {
  const updateConfig = useTestingStore((s) => s.updateIndicatorConfig);
  const current = (detail.config as Partial<IndicatorConfig>)[field.key] ?? field.fallback;
  const [draft, setDraft] = useState(String(current));

  // Si el valor cambia desde afuera (otra sesión, reset), reflejarlo.
  useEffect(() => {
    setDraft(String(current));
  }, [current]);

  function commit() {
    const n = parseFloat(draft);
    if (!Number.isFinite(n) || n < (field.min ?? 1)) {
      setDraft(String(current)); // inválido → revertir
      return;
    }
    if (n !== current) void updateConfig({ [field.key]: n });
  }

  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[9px] uppercase tracking-wider text-tv-text-muted">
        {field.label}
      </span>
      <input
        type="number"
        step={field.step ?? 1}
        min={field.min ?? 1}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
            (e.target as HTMLInputElement).blur();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setDraft(String(current));
            (e.target as HTMLInputElement).blur();
          }
          e.stopPropagation(); // no disparar los atajos globales del replay
        }}
        className="w-14 rounded border border-tv-border bg-tv-bg px-1.5 py-0.5 font-mono text-[11px] text-tv-text"
      />
    </label>
  );
}
