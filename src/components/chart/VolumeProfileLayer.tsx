"use client";

import type { VolumeProfileResult } from "@/lib/indicators";

interface Props {
  result: VolumeProfileResult | null;
  /** Convierte un precio a coordenada Y en píxeles. null si está fuera. */
  priceToY: (price: number) => number | null;
  /** Ancho del contenedor del chart en píxeles. */
  width: number;
  /** Color base del histograma. */
  color: string;
}

/**
 * Volume Profile (Visible Range) — histograma horizontal de volumen por nivel
 * de precio, anclado al borde derecho del chart. Resalta el POC (Point of
 * Control) y sombrea el Value Area (~70% del volumen).
 *
 * Es read-only (pointer-events:none) — no intercepta clicks del chart.
 */
export function VolumeProfileLayer({ result, priceToY, width, color }: Props) {
  if (!result || result.maxVolume <= 0) return null;

  // El histograma ocupa como máximo ~20% del ancho del chart.
  const maxBarWidth = Math.max(40, width * 0.2);
  const pocColor = "#ffb74d";

  return (
    <svg
      className="absolute inset-0 h-full w-full"
      style={{ overflow: "hidden", pointerEvents: "none", zIndex: 4 }}
    >
      {result.bins.map((bin, i) => {
        const yHigh = priceToY(bin.high);
        const yLow = priceToY(bin.low);
        if (yHigh == null || yLow == null) return null;
        const top = Math.min(yHigh, yLow);
        const h = Math.max(1, Math.abs(yLow - yHigh) - 1);
        const bw = (bin.volume / result.maxVolume) * maxBarWidth;
        const midPrice = (bin.low + bin.high) / 2;
        const isPoc =
          midPrice >= result.poc - (bin.high - bin.low) / 2 &&
          midPrice <= result.poc + (bin.high - bin.low) / 2;
        const inVA = midPrice >= result.vaLow && midPrice <= result.vaHigh;
        const fill = isPoc ? pocColor : color;
        const opacity = isPoc ? 0.85 : inVA ? 0.5 : 0.22;
        return (
          <rect
            key={i}
            x={width - bw}
            y={top}
            width={bw}
            height={h}
            fill={fill}
            opacity={opacity}
          />
        );
      })}

      {/* Línea del POC */}
      {(() => {
        const y = priceToY(result.poc);
        if (y == null) return null;
        return (
          <line
            x1={width - maxBarWidth}
            y1={y}
            x2={width}
            y2={y}
            stroke={pocColor}
            strokeWidth={1.5}
            opacity={0.9}
          />
        );
      })()}
    </svg>
  );
}
