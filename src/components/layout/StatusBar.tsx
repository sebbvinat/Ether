"use client";

import { useEffect, useState } from "react";
import { useChartStore } from "@/lib/store/chart-store";

export function StatusBar() {
  const symbol = useChartStore((s) => s.symbol);
  const timeframe = useChartStore((s) => s.timeframe);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  return (
    <div className="flex h-6 shrink-0 items-center gap-4 border-t border-tv-border bg-tv-panel px-3 text-[11px] text-tv-text-muted">
      <span className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-tv-green shadow-[0_0_6px] shadow-tv-green/70" />
        En vivo
      </span>
      <span className="font-mono text-tv-text">
        {symbol} · {timeframe}
      </span>
      <span className="ml-auto font-mono tabular-nums">
        {now
          ? now.toLocaleString("es-ES", {
              weekday: "short",
              month: "short",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })
          : "—"}
      </span>
      <span>v 0.7</span>
    </div>
  );
}
