"use client";

import { useState } from "react";
import type { Drawing, DrawingPoint } from "@/lib/store/chart-store";

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

type HandleKey = "a" | "b" | "at";

interface Props {
  drawings: Drawing[];
  toCoord: (time: number, price: number) => Coord | null;
  fromCoord: (x: number, y: number) => DrawingPoint | null;
  onUpdate: (id: string, patch: Partial<{ a: DrawingPoint; b: DrawingPoint; at: DrawingPoint }>) => void;
  onRemove: (id: string) => void;
  containerWidth: number;
}

export function DrawingsLayer({
  drawings,
  toCoord,
  fromCoord,
  onUpdate,
  onRemove,
  containerWidth,
}: Props) {
  const [hover, setHover] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; handle: HandleKey } | null>(
    null,
  );

  function svgRect(target: SVGElement): DOMRect {
    const root = target.ownerSVGElement ?? (target as SVGSVGElement);
    return root.getBoundingClientRect();
  }

  function onHandleDown(
    e: React.PointerEvent<SVGCircleElement>,
    id: string,
    handle: HandleKey,
  ) {
    e.stopPropagation();
    e.preventDefault();
    const svg = e.currentTarget.ownerSVGElement;
    if (svg) {
      try {
        svg.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
    setDrag({ id, handle });
  }

  function onSvgPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!drag) return;
    const rect = svgRect(e.currentTarget);
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const pt = fromCoord(x, y);
    if (!pt) return;
    onUpdate(drag.id, { [drag.handle]: pt });
  }

  function onSvgPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    if (!drag) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    setDrag(null);
  }

  return (
    <svg
      className="absolute inset-0 h-full w-full"
      style={{
        overflow: "visible",
        pointerEvents: drag ? "auto" : "none",
      }}
      onPointerMove={onSvgPointerMove}
      onPointerUp={onSvgPointerUp}
      onPointerCancel={onSvgPointerUp}
    >
      {drawings.map((d) => {
        if (d.type === "trendline" || d.type === "arrow") {
          const a = toCoord(d.a.time, d.a.price);
          const b = toCoord(d.b.time, d.b.price);
          if (!a || !b) return null;
          const isUp = d.b.price >= d.a.price;
          const color = isUp ? TV_GREEN : TV_RED;
          // Arrow head
          let headRender: React.ReactNode = null;
          if (d.type === "arrow") {
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const len = Math.hypot(dx, dy) || 1;
            const ux = dx / len;
            const uy = dy / len;
            const size = 10;
            // Perpendicular vector
            const px = -uy;
            const py = ux;
            const baseX = b.x - ux * size;
            const baseY = b.y - uy * size;
            const leftX = baseX + px * (size * 0.5);
            const leftY = baseY + py * (size * 0.5);
            const rightX = baseX - px * (size * 0.5);
            const rightY = baseY - py * (size * 0.5);
            headRender = (
              <polygon
                points={`${b.x},${b.y} ${leftX},${leftY} ${rightX},${rightY}`}
                fill={color}
              />
            );
          }
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
                stroke={color}
                strokeWidth={1.5}
              />
              {headRender}
              <DragHandle
                cx={a.x}
                cy={a.y}
                onDown={(e) => onHandleDown(e, d.id, "a")}
              />
              <DragHandle
                cx={b.x}
                cy={b.y}
                onDown={(e) => onHandleDown(e, d.id, "b")}
              />
              {hover === d.id && (
                <RemoveHandle
                  x={(a.x + b.x) / 2}
                  y={(a.y + b.y) / 2 - 14}
                  onRemove={() => onRemove(d.id)}
                />
              )}
            </g>
          );
        }

        if (d.type === "hrange") {
          const a = toCoord(d.a.time, d.a.price);
          const b = toCoord(d.b.time, d.b.price);
          if (!a || !b) return null;
          const yTop = Math.min(a.y, b.y);
          const yBottom = Math.max(a.y, b.y);
          const priceTop = Math.max(d.a.price, d.b.price);
          const priceBottom = Math.min(d.a.price, d.b.price);
          const range = priceTop - priceBottom;
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
                x={0}
                y={yTop}
                width={containerWidth}
                height={yBottom - yTop}
                fill={color}
                fillOpacity={0.08}
              />
              <line
                x1={0}
                y1={yTop}
                x2={containerWidth}
                y2={yTop}
                stroke={color}
                strokeWidth={1}
              />
              <line
                x1={0}
                y1={yBottom}
                x2={containerWidth}
                y2={yBottom}
                stroke={color}
                strokeWidth={1}
              />
              <text
                x={8}
                y={(yTop + yBottom) / 2}
                fill={color}
                fontSize={11}
                fontFamily="var(--font-sans), Inter, sans-serif"
              >
                {priceTop.toFixed(2)} → {priceBottom.toFixed(2)} (Δ{" "}
                {range.toFixed(2)})
              </text>
              <DragHandle
                cx={a.x}
                cy={a.y}
                onDown={(e) => onHandleDown(e, d.id, "a")}
              />
              <DragHandle
                cx={b.x}
                cy={b.y}
                onDown={(e) => onHandleDown(e, d.id, "b")}
              />
              {hover === d.id && (
                <RemoveHandle
                  x={containerWidth - 20}
                  y={yTop + 8}
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
              <DragHandle
                cx={a.x}
                cy={a.y}
                onDown={(e) => onHandleDown(e, d.id, "a")}
              />
              <DragHandle
                cx={b.x}
                cy={b.y}
                onDown={(e) => onHandleDown(e, d.id, "b")}
              />
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
              <DragHandle
                cx={a.x}
                cy={a.y}
                onDown={(e) => onHandleDown(e, d.id, "a")}
              />
              <DragHandle
                cx={b.x}
                cy={b.y}
                onDown={(e) => onHandleDown(e, d.id, "b")}
              />
              {hover === d.id && (
                <RemoveHandle
                  x={x + w}
                  y={y - 4}
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
                style={{ userSelect: "none" }}
              >
                {d.text}
              </text>
              <DragHandle
                cx={p.x - 4}
                cy={p.y - 4}
                onDown={(e) => onHandleDown(e, d.id, "at")}
                small
              />
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

function DragHandle({
  cx,
  cy,
  onDown,
  small,
}: {
  cx: number;
  cy: number;
  onDown: (e: React.PointerEvent<SVGCircleElement>) => void;
  small?: boolean;
}) {
  return (
    <circle
      cx={cx}
      cy={cy}
      r={small ? 3 : 4.5}
      fill={TV_BLUE}
      stroke="#fff"
      strokeWidth={1}
      style={{ cursor: "grab", pointerEvents: "auto" }}
      onPointerDown={onDown}
    />
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
    <g style={{ cursor: "pointer", pointerEvents: "auto" }} onClick={onRemove}>
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
