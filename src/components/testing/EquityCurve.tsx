"use client";

/**
 * Wave 20 — Equity curve chart (SVG inline, sin dependencias).
 *
 * Toma los puntos {time, equity} y renderiza una línea con área bajo la curva.
 * Color verde si termina en positivo vs initialBalance, rojo si negativo.
 */

import type { EquityPoint } from "@/lib/testing/metrics";

interface Props {
  points: EquityPoint[];
  initialBalance: number;
  width?: number;
  height?: number;
}

export function EquityCurve({ points, initialBalance, width = 600, height = 200 }: Props) {
  if (points.length < 2) {
    return (
      <div
        className="grid place-items-center rounded border border-tv-border bg-tv-panel/20 text-[12px] text-tv-text-muted"
        style={{ width: "100%", height }}
      >
        Sin trades todavía
      </div>
    );
  }

  const equities = points.map((p) => p.equity);
  const minEq = Math.min(...equities, initialBalance);
  const maxEq = Math.max(...equities, initialBalance);
  const range = Math.max(1, maxEq - minEq);
  const padding = { top: 10, bottom: 18, left: 8, right: 8 };
  const w = width - padding.left - padding.right;
  const h = height - padding.top - padding.bottom;

  const xForIdx = (i: number) =>
    padding.left + (points.length === 1 ? 0 : (i / (points.length - 1)) * w);
  const yForEq = (eq: number) =>
    padding.top + h - ((eq - minEq) / range) * h;

  const baselineY = yForEq(initialBalance);
  const finalEq = points[points.length - 1].equity;
  const isPositive = finalEq >= initialBalance;
  const lineColor = isPositive ? "#26a69a" : "#ef5350";
  const fillColor = isPositive ? "rgba(38,166,154,0.18)" : "rgba(239,83,80,0.18)";

  const polylinePts = points.map((p, i) => `${xForIdx(i)},${yForEq(p.equity)}`).join(" ");

  // Área cerrada para fill
  const areaPath = `M ${xForIdx(0)},${baselineY} ${points
    .map((p, i) => `L ${xForIdx(i)},${yForEq(p.equity)}`)
    .join(" ")} L ${xForIdx(points.length - 1)},${baselineY} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full">
      {/* Baseline (initial balance) */}
      <line
        x1={padding.left}
        y1={baselineY}
        x2={width - padding.right}
        y2={baselineY}
        stroke="#787b86"
        strokeWidth={0.75}
        strokeDasharray="2 3"
      />
      <text
        x={padding.left}
        y={baselineY - 3}
        fill="#787b86"
        fontSize={9}
        fontFamily="var(--font-mono), monospace"
      >
        ${initialBalance.toFixed(0)} (initial)
      </text>

      {/* Area */}
      <path d={areaPath} fill={fillColor} />

      {/* Line */}
      <polyline points={polylinePts} fill="none" stroke={lineColor} strokeWidth={1.5} />

      {/* Final point */}
      <circle
        cx={xForIdx(points.length - 1)}
        cy={yForEq(finalEq)}
        r={3}
        fill={lineColor}
      />
      <text
        x={xForIdx(points.length - 1) - 4}
        y={yForEq(finalEq) - 6}
        fill={lineColor}
        fontSize={10}
        fontWeight={600}
        fontFamily="var(--font-mono), monospace"
        textAnchor="end"
      >
        ${finalEq.toFixed(2)}
      </text>
    </svg>
  );
}
