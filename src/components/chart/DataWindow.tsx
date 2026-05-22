"use client";

import { X } from "lucide-react";
import { useChartStore } from "@/lib/store/chart-store";
import { getInstrument } from "@/lib/instruments";
import { formatPrice, formatVolume } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Data Window — panel flotante con el OHLCV de la vela bajo el cursor
 * (o de la última vela si no hay hover). Estilo TradingView.
 */
export function DataWindow() {
  const open = useChartStore((s) => s.dataWindowOpen);
  const setOpen = useChartStore((s) => s.setDataWindowOpen);
  const dw = useChartStore((s) => s.dataWindow);
  const symbol = useChartStore((s) => s.symbol);

  if (!open) return null;

  const up = dw ? dw.c >= dw.o : true;
  const dirClass = up ? "text-tv-green" : "text-tv-red";

  return (
    <div className="absolute right-3 top-3 z-20 w-44 overflow-hidden rounded-lg border border-tv-border bg-tv-panel/95 shadow-xl backdrop-blur">
      <div className="flex items-center justify-between border-b border-tv-border px-2.5 py-1.5">
        <span className="text-[11px] font-semibold text-tv-text">
          {getInstrument(symbol).displayName}
        </span>
        <button
          onClick={() => setOpen(false)}
          aria-label="Cerrar"
          className="rounded p-0.5 text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex flex-col gap-0.5 px-2.5 py-2 font-mono text-[11px] tabular-nums">
        <Row label="Apertura" value={dw ? formatPrice(dw.o) : "—"} cls={dirClass} />
        <Row label="Máximo" value={dw ? formatPrice(dw.h) : "—"} cls={dirClass} />
        <Row label="Mínimo" value={dw ? formatPrice(dw.l) : "—"} cls={dirClass} />
        <Row label="Cierre" value={dw ? formatPrice(dw.c) : "—"} cls={dirClass} />
        <Row
          label="Cambio"
          value={
            dw
              ? `${dw.changePct >= 0 ? "+" : ""}${dw.changePct.toFixed(2)}%`
              : "—"
          }
          cls={dw && dw.changePct >= 0 ? "text-tv-green" : "text-tv-red"}
        />
        <Row label="Volumen" value={dw ? formatVolume(dw.v) : "—"} />
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  cls,
}: {
  label: string;
  value: string;
  cls?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-tv-text-muted">{label}</span>
      <span className={cn(cls ?? "text-tv-text")}>{value}</span>
    </div>
  );
}
