"use client";

import { Activity, Check, Save, Trash2, FolderOpen } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useChartStore,
  type IndicatorKey,
  type IndicatorConfig,
} from "@/lib/store/chart-store";

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
    label: (c) => `MACD (${c.macdFast}, ${c.macdSlow}, ${c.macdSignal})`,
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
];

export function IndicatorMenu() {
  const indicators = useChartStore((s) => s.indicators);
  const config = useChartStore((s) => s.config);
  const toggle = useChartStore((s) => s.toggleIndicator);
  const templates = useChartStore((s) => s.indicatorTemplates) ?? [];
  const saveTemplate = useChartStore((s) => s.saveIndicatorTemplate);
  const loadTemplate = useChartStore((s) => s.loadIndicatorTemplate);
  const deleteTemplate = useChartStore((s) => s.deleteIndicatorTemplate);

  function onSaveTemplate() {
    const name = window.prompt("Nombre de la plantilla:");
    if (!name || !name.trim()) return;
    saveTemplate(name.trim());
  }

  const groups = ENTRIES.reduce<Record<string, Entry[]>>((acc, i) => {
    (acc[i.group] ||= []).push(i);
    return acc;
  }, {});

  const activeCount = Object.values(indicators).filter(Boolean).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs text-tv-text hover:bg-tv-panel-hover">
        <Activity className="h-3.5 w-3.5" />
        <span>Indicadores</span>
        {activeCount > 0 && (
          <span className="ml-1 rounded bg-tv-blue/20 px-1.5 py-0.5 text-[10px] font-semibold text-tv-blue">
            {activeCount}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 bg-tv-panel">
        {Object.entries(groups).map(([group, items], idx) => (
          <DropdownMenuGroup key={group}>
            {idx > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-tv-text-muted">
              {group}
            </DropdownMenuLabel>
            {items.map((i) => (
              <DropdownMenuItem
                key={i.key}
                closeOnClick={false}
                onClick={() => toggle(i.key)}
                className="flex items-center justify-between text-xs"
              >
                <span>{i.label(config)}</span>
                {indicators[i.key] && <Check className="h-3.5 w-3.5 text-tv-blue" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        ))}

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-tv-text-muted">
          Plantillas
        </DropdownMenuLabel>
        <DropdownMenuItem
          closeOnClick={false}
          onClick={onSaveTemplate}
          className="flex items-center gap-2 text-xs"
        >
          <Save className="h-3.5 w-3.5" />
          Guardar combinación actual
        </DropdownMenuItem>
        {templates.length === 0 && (
          <DropdownMenuItem disabled className="text-[11px] text-tv-text-muted">
            Sin plantillas guardadas
          </DropdownMenuItem>
        )}
        {templates.map((t) => (
          <DropdownMenuItem
            key={t.id}
            closeOnClick={false}
            className="group flex items-center justify-between text-xs"
            onClick={() => loadTemplate(t.id)}
          >
            <span className="flex items-center gap-2">
              <FolderOpen className="h-3.5 w-3.5 text-tv-text-muted" />
              {t.name}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm(`Borrar plantilla "${t.name}"?`))
                  deleteTemplate(t.id);
              }}
              className="rounded p-0.5 opacity-0 hover:text-tv-red group-hover:opacity-100"
              aria-label="Borrar plantilla"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
