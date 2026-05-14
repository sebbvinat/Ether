"use client";

import { useEffect, useState } from "react";
import { useChartStore } from "@/lib/store/chart-store";
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

export function BottomPanel() {
  const symbol = useChartStore((s) => s.symbol);
  const [s, setS] = useState<Stats | null>(null);

  useEffect(() => {
    let cancelled = false;
    setS(null);
    const inst = getInstrument(symbol);

    async function load() {
      try {
        if (inst.provider === "yahoo") {
          const q = await fetchYahooQuote(inst.yahooSymbol!);
          if (cancelled) return;
          setS({
            pctChange:
              q.prevClose > 0
                ? ((q.price - q.prevClose) / q.prevClose) * 100
                : 0,
            lastPrice: q.price,
          });
        } else {
          const t = await fetchTicker24h(symbol);
          if (cancelled) return;
          setS({
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

  return (
    <div className="hidden h-9 items-center gap-0 overflow-x-auto border-t border-tv-border bg-tv-panel px-3 text-xs md:flex">
      <Stat label="Símbolo" value={inst.displayName} />
      <Stat
        label="Cambio"
        value={s ? formatPct(s.pctChange) : "—"}
        valueClass={s ? upClass(s.pctChange) : ""}
      />
      {isCrypto && (
        <>
          <Stat
            label="24h Alto"
            value={s?.highPrice != null ? formatPrice(s.highPrice) : "—"}
            valueClass="text-tv-green"
          />
          <Stat
            label="24h Bajo"
            value={s?.lowPrice != null ? formatPrice(s.lowPrice) : "—"}
            valueClass="text-tv-red"
          />
          <Stat
            label="24h Vol (base)"
            value={s?.volume != null ? formatVolume(s.volume) : "—"}
          />
          <Stat
            label="24h Vol (USDT)"
            value={s?.quoteVolume != null ? formatVolume(s.quoteVolume) : "—"}
          />
        </>
      )}
      {!isCrypto && (
        <Stat
          label="Precio"
          value={s?.lastPrice != null ? formatPrice(s.lastPrice) : "—"}
        />
      )}
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
      <span className={cn("font-medium tabular-nums", valueClass ?? "text-tv-text")}>
        {value}
      </span>
    </div>
  );
}
