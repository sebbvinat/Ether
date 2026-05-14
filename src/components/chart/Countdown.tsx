"use client";

import { useEffect, useState } from "react";
import type { Timeframe } from "@/lib/binance/types";

interface Props {
  timeframe: Timeframe;
  bare?: boolean;
}

const TF_SECONDS: Record<Timeframe, number> = {
  "1m": 60,
  "3m": 180,
  "5m": 300,
  "15m": 900,
  "30m": 1800,
  "1h": 3600,
  "2h": 7200,
  "4h": 14400,
  "6h": 21600,
  "8h": 28800,
  "12h": 43200,
  "1d": 86400,
  "3d": 259200,
  "1w": 604800,
  "1M": 2592000,
};

function fmt(secs: number): string {
  if (secs <= 0) return "0s";
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/**
 * Tiny pill showing time until the next candle close for the active timeframe.
 * Updates every second.
 */
export function Countdown({ timeframe, bare }: Props) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  const period = TF_SECONDS[timeframe];
  const remaining = period - (now % period);

  if (bare) {
    return (
      <span className="tabular-nums">{fmt(remaining)}</span>
    );
  }

  return (
    <div className="pointer-events-none rounded bg-tv-panel/95 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-tv-text-muted ring-1 ring-tv-border backdrop-blur">
      {fmt(remaining)}
    </div>
  );
}
