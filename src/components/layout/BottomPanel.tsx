"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Check } from "lucide-react";
import {
  useChartStore,
  INDICATOR_COLORS,
  type IndicatorKey,
  type IndicatorConfig,
} from "@/lib/store/chart-store";
import { fetchTicker24h } from "@/lib/binance/rest";
import { fetchYahooQuote } from "@/lib/yahoo/rest";
import { getInstrument } from "@/lib/instruments";
import { formatPrice, formatPct, formatVolume } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Stats {
  pctChange: number;
  highPrice?: number;
  lowPrice?: number;
  volume?: number;
  quoteVolume?: number;
  lastPrice: number;
}

interface CatalogEntry {
  key: IndicatorKey;
  category: string;
  label: (c: IndicatorConfig) => string;
}

const CATALOG: CatalogEntry[] = [
  { key: "ema20", category: "Medias móviles", label: (c) => `EMA ${c.ema20}` },
  { key: "ema50", category: "Medias móviles", label: (c) => `EMA ${c.ema50}` },
  { key: "ema200", category: "Medias móviles", label: (c) => `EMA ${c.ema200}` },
  { key: "sma20", category: "Medias móviles", label: (c) => `SMA ${c.sma20}` },
  { key: "sma50", category: "Medias móviles", label: (c) => `SMA ${c.sma50}` },
  {
    key: "bb",
    category: "Volatilidad",
    label: (c) => `Bollinger (${c.bbPeriod}, ${c.bbStdDev})`,
  },
  { key: "atr", category: "Volatilidad", label: (c) => `ATR (${c.atr})` },
  { key: "vwap", category: "Volumen", label: () => "VWAP" },
  { key: "obv", category: "Volumen", label: () => "OBV" },
  { key: "volume", category: "Volumen", label: () => "Volumen" },
  { key: "rsi", category: "Osciladores", label: (c) => `RSI (${c.rsi})` },
  {
    key: "macd",
    category: "Osciladores",
    label: (c) => `MACD (${c.macdFast}, ${c.macdSlow}, ${c.macdSignal})`,
  },
  {
    key: "stoch",
    category: "Osciladores",
    label: (c) => `Estocástico (${c.stochK}, ${c.stochD})`,
  },
];

const CATEGORIES = ["Todos", "Medias móviles", "Volatilidad", "Volumen", "Osciladores"];

export function BottomPanel() {
  const symbol = useChartStore((s) => s.symbol);
  const indicators = useChartStore((st) => st.indicators);
  const config = useChartStore((st) => st.config);
  const toggleIndicator = useChartStore((st) => st.toggleIndicator);
  const [stats, setStats] = useState<Stats | null>(null);
  const [tab, setTab] = useState<"resumen" | "indicadores">("resumen");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Todos");

  useEffect(() => {
    let cancelled = false;
    setStats(null);
    const inst = getInstrument(symbol);

    async function load() {
      try {
        if (inst.provider === "yahoo") {
          const q = await fetchYahooQuote(inst.yahooSymbol!);
          if (cancelled) return;
          setStats({
            pctChange:
              q.prevClose > 0
                ? ((q.price - q.prevClose) / q.prevClose) * 100
                : 0,
            lastPrice: q.price,
          });
        } else {
          const t = await fetchTicker24h(symbol);
          if (cancelled) return;
          setStats({
            pctChange: t.priceChangePercent,
            highPrice: t.highPrice,
            lowPrice: t.lowPrice,
            volume: t.volume,
            quoteVolume: t.quoteVolume,
            lastPrice: t.lastPrice,
          });
        }
      } catch (e) {
        console.error(e);
      }
    }

    load();
    const id = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [symbol]);

  const upClass = (n: number) => (n >= 0 ? "text-tv-green" : "text-tv-red");
  const inst = getInstrument(symbol);
  const isCrypto = inst.provider === "binance";
  const liveLabel = isCrypto ? "Binance · Live" : "Yahoo · 5s";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CATALOG.filter((e) => {
      if (category !== "Todos" && e.category !== category) return false;
      if (q && !e.label(config).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [query, category, config]);

  const byCategory = useMemo(() => {
    const m: Record<string, CatalogEntry[]> = {};
    for (const e of filtered) (m[e.category] ||= []).push(e);
    return m;
  }, [filtered]);

  return (
    <div className="hidden flex-col border-t border-tv-border bg-tv-panel md:flex">
      {/* Tab bar */}
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-tv-border px-2">
        {(["resumen", "indicadores"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded px-2.5 py-1 text-[11px] font-medium capitalize",
              tab === t
                ? "bg-tv-panel-hover text-tv-text"
                : "text-tv-text-muted hover:text-tv-text",
            )}
          >
            {t}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-3 whitespace-nowrap text-[10px] text-tv-text-dim">
          <a
            href="https://www.tradingview.com/lightweight-charts/"
            target="_blank"
            rel="noopener noreferrer"
            className="opacity-50 hover:text-tv-text hover:opacity-100"
            title="Charts powered by TradingView Lightweight Charts (Apache 2.0)"
          >
            Charts by TradingView
          </a>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-tv-green" />
            <span>{liveLabel}</span>
          </div>
        </div>
      </div>

      {tab === "resumen" && (
        <div className="flex h-9 items-center gap-0 overflow-x-auto px-3 text-xs">
          <Stat label="Símbolo" value={inst.displayName} />
          <Stat
            label="Cambio"
            value={stats ? formatPct(stats.pctChange) : "—"}
            valueClass={stats ? upClass(stats.pctChange) : ""}
          />
          {isCrypto && (
            <>
              <Stat
                label="24h Alto"
                value={
                  stats?.highPrice != null ? formatPrice(stats.highPrice) : "—"
                }
                valueClass="text-tv-green"
              />
              <Stat
                label="24h Bajo"
                value={
                  stats?.lowPrice != null ? formatPrice(stats.lowPrice) : "—"
                }
                valueClass="text-tv-red"
              />
              <Stat
                label="24h Vol (base)"
                value={stats?.volume != null ? formatVolume(stats.volume) : "—"}
              />
              <Stat
                label="24h Vol (USDT)"
                value={
                  stats?.quoteVolume != null
                    ? formatVolume(stats.quoteVolume)
                    : "—"
                }
              />
            </>
          )}
          {!isCrypto && (
            <Stat
              label="Precio"
              value={
                stats?.lastPrice != null ? formatPrice(stats.lastPrice) : "—"
              }
            />
          )}
        </div>
      )}

      {tab === "indicadores" && (
        <div className="flex max-h-[40vh] flex-col">
          <div className="flex shrink-0 items-center gap-2 px-3 py-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-tv-text-muted" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar indicador…"
                className="w-full rounded border border-tv-border bg-tv-bg py-1 pl-7 pr-2 text-xs text-tv-text outline-none placeholder:text-tv-text-muted focus:border-tv-blue"
              />
            </div>
            <div className="flex gap-1">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={cn(
                    "rounded px-2 py-1 text-[10px] whitespace-nowrap",
                    category === c
                      ? "bg-tv-blue/15 text-tv-blue"
                      : "text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text",
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
            {filtered.length === 0 && (
              <div className="py-6 text-center text-xs text-tv-text-muted">
                Sin resultados
              </div>
            )}
            {Object.entries(byCategory).map(([cat, items]) => (
              <div key={cat} className="mb-3">
                <div className="mb-1 text-[10px] uppercase tracking-wider text-tv-text-muted">
                  {cat}
                </div>
                <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-3">
                  {items.map((e) => {
                    const on = indicators[e.key];
                    return (
                      <button
                        key={e.key}
                        onClick={() => toggleIndicator(e.key)}
                        className={cn(
                          "flex items-center justify-between gap-2 rounded border px-2.5 py-1.5 text-xs",
                          on
                            ? "border-tv-blue/40 bg-tv-blue/10 text-tv-text"
                            : "border-tv-border bg-tv-bg text-tv-text-muted hover:text-tv-text",
                        )}
                      >
                        <span className="flex items-center gap-2 truncate">
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ background: INDICATOR_COLORS[e.key] }}
                          />
                          <span className="truncate">{e.label(config)}</span>
                        </span>
                        {on ? (
                          <Check className="h-3.5 w-3.5 shrink-0 text-tv-blue" />
                        ) : (
                          <span className="shrink-0 text-[10px] text-tv-text-muted">
                            +
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap border-r border-tv-border px-3">
      <span className="text-tv-text-dim">{label}</span>
      <span
        className={cn(
          "font-mono font-medium tabular-nums",
          valueClass ?? "text-tv-text",
        )}
      >
        {value}
      </span>
    </div>
  );
}
