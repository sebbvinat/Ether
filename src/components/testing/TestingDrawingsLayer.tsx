"use client";

/**
 * Wave 18.6 — Drawings layer simplificado para TestingChart.
 *
 * Soporta: trendline, hline, rect, fib retracement. Suficiente para el
 * 90% del trabajo de backtest manual. El DrawingsLayer del chart en vivo
 * (2900 LOC) tiene 30+ tipos y está acoplado a chart-store: reescribir
 * para Testing era riesgoso. Esto es un layer focused, simple y aislado.
 */

import type { Drawing, DrawingPoint } from "@/lib/store/chart-store";

const TV = {
  blue: "#2962ff",
  red: "#ef5350",
  green: "#26a69a",
  yellow: "#ffb74d",
  purple: "#ab47bc",
  text: "#d1d4dc",
};

const FIB_LEVELS = [
  { level: 0, color: "#787b86" },
  { level: 0.236, color: TV.yellow },
  { level: 0.382, color: TV.green },
  { level: 0.5, color: TV.blue },
  { level: 0.618, color: TV.purple },
  { level: 0.786, color: TV.red },
  { level: 1, color: "#787b86" },
];

interface Coord {
  x: number;
  y: number;
}

interface Props {
  drawings: Drawing[];
  toCoord: (timeSec: number, price: number) => Coord | null;
  /** Si está seteado, click sobre un dibujo lo borra (eraser mode). */
  onErase?: (drawingId: string) => void;
  width: number;
  height: number;
}

export function TestingDrawingsLayer({
  drawings,
  toCoord,
  onErase,
  width,
  height,
}: Props) {
  if (width === 0 || drawings.length === 0) return null;

  return (
    <svg
      className="absolute inset-0 h-full w-full"
      style={{
        // En modo eraser dejamos pasar clicks sólo en strokes
        pointerEvents: onErase ? "visiblePainted" : "none",
        zIndex: 4,
      }}
    >
      {drawings.map((d) => {
        if (d.type === "trendline") return renderTrendline(d, toCoord, width, onErase);
        if (d.type === "hline") return renderHline(d, toCoord, width, onErase);
        if (d.type === "rect") return renderRect(d, toCoord, onErase);
        if (d.type === "fib") return renderFib(d, toCoord, width, onErase);
        return null;
      })}
    </svg>
  );
}

function renderTrendline(
  d: Extract<Drawing, { type: "trendline" }>,
  toCoord: Props["toCoord"],
  width: number,
  onErase?: (id: string) => void,
) {
  const a = toCoord(d.a.time, d.a.price);
  const b = toCoord(d.b.time, d.b.price);
  if (!a || !b) return null;
  const color = (d as { color?: string }).color ?? TV.blue;
  return (
    <g key={d.id}>
      {/* Hit area wider para click */}
      <line
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        stroke="transparent"
        strokeWidth={10}
        onClick={() => onErase?.(d.id)}
        style={{ cursor: onErase ? "pointer" : "default" }}
      />
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={1.5} />
    </g>
  );
}

function renderHline(
  d: Extract<Drawing, { type: "hline" }>,
  toCoord: Props["toCoord"],
  width: number,
  onErase?: (id: string) => void,
) {
  const a = toCoord(d.at.time, d.at.price);
  if (!a) return null;
  const color = d.color ?? TV.blue;
  return (
    <g key={d.id}>
      <line
        x1={0}
        y1={a.y}
        x2={width}
        y2={a.y}
        stroke="transparent"
        strokeWidth={10}
        onClick={() => onErase?.(d.id)}
        style={{ cursor: onErase ? "pointer" : "default" }}
      />
      <line
        x1={0}
        y1={a.y}
        x2={width}
        y2={a.y}
        stroke={color}
        strokeWidth={1}
        strokeDasharray="4 3"
      />
      <rect x={width - 70} y={a.y - 9} width={64} height={18} fill={color} opacity={0.85} />
      <text
        x={width - 38}
        y={a.y + 4}
        fill="#fff"
        fontSize={10}
        fontFamily="var(--font-mono), monospace"
        textAnchor="middle"
      >
        {d.at.price.toFixed(2)}
      </text>
    </g>
  );
}

function renderRect(
  d: Extract<Drawing, { type: "rect" }>,
  toCoord: Props["toCoord"],
  onErase?: (id: string) => void,
) {
  const a = toCoord(d.a.time, d.a.price);
  const b = toCoord(d.b.time, d.b.price);
  if (!a || !b) return null;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.abs(b.x - a.x);
  const h = Math.abs(b.y - a.y);
  return (
    <g key={d.id}>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill={TV.blue}
        fillOpacity={0.12}
        stroke={TV.blue}
        strokeWidth={1.5}
        onClick={() => onErase?.(d.id)}
        style={{ cursor: onErase ? "pointer" : "default" }}
      />
    </g>
  );
}

function renderFib(
  d: Extract<Drawing, { type: "fib" }>,
  toCoord: Props["toCoord"],
  width: number,
  onErase?: (id: string) => void,
) {
  const a = toCoord(d.a.time, d.a.price);
  const b = toCoord(d.b.time, d.b.price);
  if (!a || !b) return null;
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const priceDiff = d.b.price - d.a.price;
  return (
    <g key={d.id}>
      {FIB_LEVELS.map(({ level, color }) => {
        const price = d.a.price + priceDiff * level;
        const coord = toCoord(d.a.time, price);
        if (!coord) return null;
        return (
          <g key={level}>
            <line
              x1={minX}
              y1={coord.y}
              x2={maxX}
              y2={coord.y}
              stroke={color}
              strokeWidth={1}
              strokeOpacity={0.7}
              onClick={() => onErase?.(d.id)}
              style={{ cursor: onErase ? "pointer" : "default" }}
            />
            <text
              x={minX + 4}
              y={coord.y - 3}
              fill={color}
              fontSize={9}
              fontFamily="var(--font-mono), monospace"
            >
              {level.toFixed(3)} · {price.toFixed(2)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

export type DrawingTool =
  | "cursor"
  | "trendline"
  | "hline"
  | "rect"
  | "fib"
  | "long"
  | "short"
  | "eraser";

interface DrawingPointDraft extends DrawingPoint {}
export type { DrawingPointDraft };
