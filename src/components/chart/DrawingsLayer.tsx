"use client";

import { useState } from "react";
import type { Drawing } from "@/lib/store/chart-store";

const TV_GREEN = "#26a69a";
const TV_RED = "#ef5350";
const TV_BLUE = "#2962ff";
const TV_YELLOW = "#ffb74d";
const TV_TEXT = "#d1d4dc";

const FIB_LEVELS = [
  { level: 0, color: "#787b86" },
  { level: 0.236, color: "#ffb74d" },
  { level: 0.382, color: "#26a69a" },
  { level: 0.5, color: "#2962ff" },
  { level: 0.618, color: "#ab47bc" },
  { level: 0.786, color: "#ef5350" },
  { level: 1, color: "#787b86" },
];

interface Coord {
  x: number;
  y: number;
}

interface Props {
  drawings: Drawing[];
  toCoord: (time: number, price: number) => Coord | null;
  onRemove: (id: string) => void;
  containerWidth: number;
}

export function DrawingsLayer({
  drawings,
  toCoord,
  onRemove,
  containerWidth,
}: Props) {
  const [hover, setHover] = useState<string | null>(null);

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      style={{ overflow: "visible" }}
    >
      {drawings.map((d) => {
        if (d.type === "trendline") {
          const a = toCoord(d.a.time, d.a.price);
          const b = toCoord(d.b.time, d.b.price);
          if (!a || !b) return null;
          const isUp = d.b.price >= d.a.price;
          return (
            <g
              key={d.id}
              onMouseEnter={() => setHover(d.id)}
              onMouseLeave={() => setHover(null)}
              style={{ pointerEvents: "auto" }}
            >
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={isUp ? TV_GREEN : TV_RED}
                strokeWidth={1.5}
              />
              <circle cx={a.x} cy={a.y} r={3} fill={TV_BLUE} />
              <circle cx={b.x} cy={b.y} r={3} fill={TV_BLUE} />
              {hover === d.id && (
                <RemoveHandle
                  x={(a.x + b.x) / 2}
                  y={(a.y + b.y) / 2}
                  onRemove={() => onRemove(d.id)}
                />
              )}
            </g>
          );
        }

        if (d.type === "fib") {
          const a = toCoord(d.a.time, d.a.price);
          const b = toCoord(d.b.time, d.b.price);
          if (!a || !b) return null;
          const yHigh = Math.min(a.y, b.y);
          const yLow = Math.max(a.y, b.y);
          const priceHigh = Math.max(d.a.price, d.b.price);
          const priceLow = Math.min(d.a.price, d.b.price);
          const xLeft = Math.min(a.x, b.x);
          const xRight = containerWidth;
          return (
            <g
              key={d.id}
              onMouseEnter={() => setHover(d.id)}
              onMouseLeave={() => setHover(null)}
              style={{ pointerEvents: "auto" }}
            >
              {FIB_LEVELS.map(({ level, color }) => {
                const y = yHigh + (yLow - yHigh) * level;
                const price = priceHigh - (priceHigh - priceLow) * level;
                return (
                  <g key={level}>
                    <line
                      x1={xLeft}
                      y1={y}
                      x2={xRight}
                      y2={y}
                      stroke={color}
                      strokeWidth={1}
                      strokeOpacity={0.7}
                      strokeDasharray={level === 0 || level === 1 ? "" : "4 3"}
                    />
                    <text
                      x={xLeft + 4}
                      y={y - 3}
                      fill={color}
                      fontSize={10}
                      fontFamily="var(--font-sans), Inter, sans-serif"
                    >
                      {level.toFixed(3)} ({price.toFixed(2)})
                    </text>
                  </g>
                );
              })}
              <circle cx={a.x} cy={a.y} r={3} fill={TV_BLUE} />
              <circle cx={b.x} cy={b.y} r={3} fill={TV_BLUE} />
              {hover === d.id && (
                <RemoveHandle
                  x={a.x}
                  y={a.y - 14}
                  onRemove={() => onRemove(d.id)}
                />
              )}
            </g>
          );
        }

        if (d.type === "rect") {
          const a = toCoord(d.a.time, d.a.price);
          const b = toCoord(d.b.time, d.b.price);
          if (!a || !b) return null;
          const x = Math.min(a.x, b.x);
          const y = Math.min(a.y, b.y);
          const w = Math.abs(b.x - a.x);
          const h = Math.abs(b.y - a.y);
          const isUp = d.b.price >= d.a.price;
          const color = isUp ? TV_GREEN : TV_RED;
          return (
            <g
              key={d.id}
              onMouseEnter={() => setHover(d.id)}
              onMouseLeave={() => setHover(null)}
              style={{ pointerEvents: "auto" }}
            >
              <rect
                x={x}
                y={y}
                width={w}
                height={h}
                fill={color}
                fillOpacity={0.1}
                stroke={color}
                strokeWidth={1}
              />
              {hover === d.id && (
                <RemoveHandle
                  x={x + w}
                  y={y}
                  onRemove={() => onRemove(d.id)}
                />
              )}
            </g>
          );
        }

        if (d.type === "text") {
          const p = toCoord(d.at.time, d.at.price);
          if (!p) return null;
          return (
            <g
              key={d.id}
              onMouseEnter={() => setHover(d.id)}
              onMouseLeave={() => setHover(null)}
              style={{ pointerEvents: "auto" }}
            >
              <text
                x={p.x}
                y={p.y}
                fill={TV_YELLOW}
                fontSize={12}
                fontFamily="var(--font-sans), Inter, sans-serif"
              >
                {d.text}
              </text>
              {hover === d.id && (
                <RemoveHandle
                  x={p.x + Math.max(20, d.text.length * 7)}
                  y={p.y - 12}
                  onRemove={() => onRemove(d.id)}
                />
              )}
            </g>
          );
        }

        return null;
      })}
    </svg>
  );
}

function RemoveHandle({
  x,
  y,
  onRemove,
}: {
  x: number;
  y: number;
  onRemove: () => void;
}) {
  return (
    <g style={{ cursor: "pointer" }} onClick={onRemove}>
      <circle cx={x} cy={y} r={8} fill="#1e222d" stroke={TV_TEXT} strokeWidth={1} />
      <line
        x1={x - 4}
        y1={y - 4}
        x2={x + 4}
        y2={y + 4}
        stroke={TV_TEXT}
        strokeWidth={1.5}
      />
      <line
        x1={x + 4}
        y1={y - 4}
        x2={x - 4}
        y2={y + 4}
        stroke={TV_TEXT}
        strokeWidth={1.5}
      />
    </g>
  );
}
