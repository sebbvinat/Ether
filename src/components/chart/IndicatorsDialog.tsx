"use client";

import { Activity, Check, Save, Trash2, FolderOpen } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  useChartStore,
  type IndicatorKey,
  type IndicatorConfig,
} from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";

interface Entry {
  key: IndicatorKey;
  label: (cfg: IndicatorConfig) => string;
  group: string;
}

const ENTRIES: Entry[] = [
  { key: "ema20", group: "Medias móviles", label: (c) => `EMA ${c.ema20}` },
  { key: "ema50", group: "Medias móviles", label: (c) => `EMA ${c.ema50}` },
  { key: "ema200", group: "Medias móviles", label: (c) => `EMA ${c.ema200}` },
  { key: "sma20", group: "Medias móviles", label: (c) => `SMA ${c.sma20}` },
  { key: "sma50", group: "Medias móviles", label: (c) => `SMA ${c.sma50}` },
  {
    key: "bb",
    group: "Volatilidad",
    label: (c) => `Bollinger (${c.bbPeriod}, ${c.bbStdDev})`,
  },
  {
    key: "atr",
    group: "Volatilidad",
    label: (c) => `ATR (${c.atr})`,
  },
  { key: "vwap", group: "Volumen", label: () => "VWAP" },
  { key: "obv", group: "Volumen", label: () => "OBV" },
  { key: "volume", group: "Volumen", label: () => "Volumen" },
  { key: "rsi", group: "Osciladores", label: (c) => `RSI (${c.rsi})` },
  {
    key: "macd",
    group: "Osciladores",
    label: (c) => `MACD (${c.macdFast},${c.macdSlow},${c.macdSignal})`,
  },
  {
    key: "stoch",
    group: "Osciladores",
    label: (c) => `Estocástico (${c.stochK}, ${c.stochD})`,
  },
  { key: "cci", group: "Osciladores", label: (c) => `CCI (${c.cci})` },
  {
    key: "williamsR",
    group: "Osciladores",
    label: (c) => `Williams %R (${c.williamsR})`,
  },
  { key: "mfi", group: "Osciladores", label: (c) => `MFI (${c.mfi})` },
  { key: "adx", group: "Osciladores", label: (c) => `ADX / DMI (${c.adx})` },
  {
    key: "stochRsi",
    group: "Osciladores",
    label: (c) => `Stoch RSI (${c.stochRsiRsi})`,
  },
  {
    key: "ao",
    group: "Osciladores",
    label: (c) => `Awesome Oscillator (${c.aoFast}, ${c.aoSlow})`,
  },
  {
    key: "donchian",
    group: "Volatilidad",
    label: (c) => `Donchian (${c.donchianPeriod})`,
  },
  {
    key: "keltner",
    group: "Volatilidad",
    label: (c) => `Keltner (${c.keltnerEma}, ${c.keltnerMult})`,
  },
  {
    key: "supertrend",
    group: "Volatilidad",
    label: (c) => `Supertrend (${c.supertrendAtr}, ${c.supertrendMult})`,
  },
  {
    key: "psar",
    group: "Tendencia",
    label: (c) => `Parabolic SAR (${c.psarStep}, ${c.psarMax})`,
  },
  { key: "pivots", group: "Tendencia", label: () => "Pivot Points" },
  {
    key: "ichimoku",
    group: "Tendencia",
    label: (c) =>
      `Ichimoku (${c.ichimokuTenkan}, ${c.ichimokuKijun}, ${c.ichimokuSenkouB})`,
  },
  {
    key: "vp",
    group: "Volumen",
    label: (c) => `Volume Profile (${c.vpBins})`,
  },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function IndicatorsDialog({ open, onOpenChange }: Props) {
  const indicators = useChartStore((s) => s.indicators);
  const config = useChartStore((s) => s.config);
  const toggle = useChartStore((s) => s.toggleIndicator);
  const templates = useChartStore((s) => s.indicatorTemplates) ?? [];
  const saveTemplate = useChartStore((s) => s.saveIndicatorTemplate);
  const loadTemplate = useChartStore((s) => s.loadIndicatorTemplate);
  const deleteTemplate = useChartStore((s) => s.deleteIndicatorTemplate);

  const groups = ENTRIES.reduce<Record<string, Entry[]>>((acc, i) => {
    (acc[i.group] ||= []).push(i);
    return acc;
  }, {});

  function onSaveTemplate() {
    const name = window.prompt("Nombre de la plantilla:");
    if (!name || !name.trim()) return;
    saveTemplate(name.trim());
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 bg-tv-panel p-0">
        <DialogHeader className="border-b border-tv-border px-4 py-3">
          <DialogTitle className="flex items-center gap-2 text-sm font-medium">
            <Activity className="h-4 w-4" />
            Indicadores
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          {Object.entries(groups).map(([group, items]) => (
            <div key={group} className="border-b border-tv-border last:border-0">
              <div className="px-4 py-2 text-[10px] uppercase tracking-wider text-tv-text-muted">
                {group}
              </div>
              {items.map((i) => (
                <button
                  key={i.key}
                  onClick={() => toggle(i.key)}
                  className="flex w-full items-center justify-between px-4 py-2 text-xs hover:bg-tv-panel-hover"
                >
                  <span>{i.label(config)}</span>
                  {indicators[i.key] && (
                    <Check className="h-3.5 w-3.5 text-tv-blue" />
                  )}
                </button>
              ))}
            </div>
          ))}

          <div className="border-b border-tv-border">
            <div className="flex items-center justify-between px-4 py-2 text-[10px] uppercase tracking-wider text-tv-text-muted">
              <span>Plantillas</span>
              <button
                onClick={onSaveTemplate}
                className="flex items-center gap-1 rounded bg-tv-blue/15 px-2 py-0.5 text-[10px] font-medium text-tv-blue hover:bg-tv-blue/25"
              >
                <Save className="h-3 w-3" />
                Guardar combo
              </button>
            </div>
            {templates.length === 0 && (
              <div className="px-4 py-2 text-[11px] text-tv-text-muted">
                Sin plantillas guardadas
              </div>
            )}
            {templates.map((t) => (
              <div
                key={t.id}
                className={cn(
                  "group flex items-center justify-between px-4 py-2 text-xs hover:bg-tv-panel-hover",
                )}
              >
                <button
                  onClick={() => loadTemplate(t.id)}
                  className="flex flex-1 items-center gap-2 text-left"
                >
                  <FolderOpen className="h-3.5 w-3.5 text-tv-text-muted" />
                  {t.name}
                </button>
                <button
                  onClick={() => {
                    if (window.confirm(`Borrar plantilla "${t.name}"?`))
                      deleteTemplate(t.id);
                  }}
                  className="rounded p-1 text-tv-text-muted opacity-0 transition-opacity hover:text-tv-red group-hover:opacity-100"
                  aria-label="Borrar"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
