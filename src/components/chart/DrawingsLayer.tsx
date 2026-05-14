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

type HandleKey = "a" | "b" | "c" | "at";

interface Props {
  drawings: Drawing[];
  selectedId: string | null;
  toCoord: (time: number, price: number) => Coord | null;
  fromCoord: (x: number, y: number) => DrawingPoint | null;
  onUpdate: (
    id: string,
    patch: Partial<{
      a: DrawingPoint;
      b: DrawingPoint;
      c: DrawingPoint;
      at: DrawingPoint;
    }>,
  ) => void;
  onRemove: (id: string) => void;
  onSelect: (id: string | null) => void;
  /** If true, clicking a drawing removes it (eraser tool active) */
  eraserActive?: boolean;
  containerWidth: number;
  containerHeight: number;
}

export function DrawingsLayer({
  drawings,
  selectedId,
  toCoord,
  fromCoord,
  onUpdate,
  onRemove,
  onSelect,
  eraserActive,
  containerWidth,
  containerHeight,
}: Props) {
  const [hover, setHover] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; handle: HandleKey } | null>(
    null,
  );

  function handleClick(id: string) {
    if (eraserActive) {
      onRemove(id);
    } else {
      onSelect(id === selectedId ? null : id);
    }
  }

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
        overflow: "hidden",
        pointerEvents: drag ? "auto" : "none",
        zIndex: 5,
      }}
      onPointerMove={onSvgPointerMove}
      onPointerUp={onSvgPointerUp}
      onPointerCancel={onSvgPointerUp}
    >
      {drawings.map((d) => {
        const isSelected = selectedId === d.id;
        const selectedWidth = isSelected ? 1 : 0;
        const grStyle: React.CSSProperties = {
          pointerEvents: "auto",
          cursor: eraserActive ? "crosshair" : "pointer",
        };
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
              onClick={() => handleClick(d.id)}
              style={grStyle}
            >
              {/* invisible hit area for easier click */}
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="transparent"
                strokeWidth={12}
              />
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={color}
                strokeWidth={1.5 + selectedWidth}
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
              onClick={() => handleClick(d.id)}
              style={grStyle}
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
              onClick={() => handleClick(d.id)}
              style={grStyle}
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
              onClick={() => handleClick(d.id)}
              style={grStyle}
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

        if (d.type === "ray") {
          const a = toCoord(d.a.time, d.a.price);
          const b = toCoord(d.b.time, d.b.price);
          if (!a || !b) return null;
          const isUp = d.b.price >= d.a.price;
          const color = isUp ? TV_GREEN : TV_RED;
          // Extend beyond b in the same direction up to the right edge
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          let endX = b.x;
          let endY = b.y;
          if (Math.abs(dx) > 0.001) {
            const t = (containerWidth - a.x) / dx;
            if (t > 1) {
              endX = a.x + dx * t;
              endY = a.y + dy * t;
            }
          }
          return (
            <g
              key={d.id}
              onMouseEnter={() => setHover(d.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => handleClick(d.id)}
              style={grStyle}
            >
              <line
                x1={a.x}
                y1={a.y}
                x2={endX}
                y2={endY}
                stroke="transparent"
                strokeWidth={12}
              />
              <line
                x1={a.x}
                y1={a.y}
                x2={endX}
                y2={endY}
                stroke={color}
                strokeWidth={1.5 + selectedWidth}
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
                  x={(a.x + b.x) / 2}
                  y={(a.y + b.y) / 2 - 14}
                  onRemove={() => onRemove(d.id)}
                />
              )}
            </g>
          );
        }

        if (d.type === "vline") {
          const p = toCoord(d.at.time, d.at.price);
          if (!p) return null;
          return (
            <g
              key={d.id}
              onMouseEnter={() => setHover(d.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => handleClick(d.id)}
              style={grStyle}
            >
              <line
                x1={p.x}
                y1={0}
                x2={p.x}
                y2={containerHeight}
                stroke="transparent"
                strokeWidth={12}
              />
              <line
                x1={p.x}
                y1={0}
                x2={p.x}
                y2={containerHeight}
                stroke={TV_BLUE}
                strokeWidth={1 + selectedWidth}
                strokeDasharray="4 3"
              />
              <DragHandle
                cx={p.x}
                cy={Math.max(20, Math.min(containerHeight - 20, p.y))}
                onDown={(e) => onHandleDown(e, d.id, "at")}
              />
              {hover === d.id && (
                <RemoveHandle
                  x={p.x + 10}
                  y={20}
                  onRemove={() => onRemove(d.id)}
                />
              )}
            </g>
          );
        }

        if (d.type === "hlineExt") {
          const p = toCoord(d.at.time, d.at.price);
          if (!p) return null;
          return (
            <g
              key={d.id}
              onMouseEnter={() => setHover(d.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => handleClick(d.id)}
              style={grStyle}
            >
              <line
                x1={0}
                y1={p.y}
                x2={containerWidth}
                y2={p.y}
                stroke="transparent"
                strokeWidth={12}
              />
              <line
                x1={0}
                y1={p.y}
                x2={containerWidth}
                y2={p.y}
                stroke={TV_BLUE}
                strokeWidth={1 + selectedWidth}
                strokeDasharray="4 3"
              />
              <text
                x={8}
                y={p.y - 3}
                fill={TV_BLUE}
                fontSize={11}
                fontFamily="var(--font-sans), Inter, sans-serif"
              >
                {d.at.price.toFixed(2)}
              </text>
              <DragHandle
                cx={Math.min(p.x, containerWidth - 10)}
                cy={p.y}
                onDown={(e) => onHandleDown(e, d.id, "at")}
              />
              {hover === d.id && (
                <RemoveHandle
                  x={containerWidth - 16}
                  y={p.y - 12}
                  onRemove={() => onRemove(d.id)}
                />
              )}
            </g>
          );
        }

        if (d.type === "long" || d.type === "short") {
          const a = toCoord(d.a.time, d.a.price);
          const b = toCoord(d.b.time, d.b.price);
          const c = toCoord(d.c.time, d.c.price);
          if (!a || !b || !c) return null;
          const isLong = d.type === "long";
          const entry = d.a.price;
          const stop = d.b.price;
          const target = d.c.price;
          const risk = Math.abs(entry - stop);
          const reward = Math.abs(target - entry);
          const rr = risk > 0 ? reward / risk : 0;
          // Validate direction
          const stopOk = isLong ? stop < entry : stop > entry;
          const targetOk = isLong ? target > entry : target < entry;
          const xLeft = a.x;
          const xRight = Math.max(a.x + 60, Math.max(b.x, c.x));
          // Stop zone (red) and Target zone (green)
          const stopY1 = Math.min(a.y, b.y);
          const stopY2 = Math.max(a.y, b.y);
          const targetY1 = Math.min(a.y, c.y);
          const targetY2 = Math.max(a.y, c.y);
          return (
            <g
              key={d.id}
              onMouseEnter={() => setHover(d.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => handleClick(d.id)}
              style={grStyle}
            >
              {/* Stop zone (red translucent) */}
              <rect
                x={xLeft}
                y={stopY1}
                width={xRight - xLeft}
                height={stopY2 - stopY1}
                fill={TV_RED}
                fillOpacity={stopOk ? 0.15 : 0.05}
                stroke={TV_RED}
                strokeWidth={1}
              />
              {/* Target zone (green translucent) */}
              <rect
                x={xLeft}
                y={targetY1}
                width={xRight - xLeft}
                height={targetY2 - targetY1}
                fill={TV_GREEN}
                fillOpacity={targetOk ? 0.15 : 0.05}
                stroke={TV_GREEN}
                strokeWidth={1}
              />
              {/* Entry line */}
              <line
                x1={xLeft}
                y1={a.y}
                x2={xRight}
                y2={a.y}
                stroke={TV_BLUE}
                strokeWidth={1.5}
              />
              {/* Labels */}
              <text
                x={xLeft + 4}
                y={a.y - 3}
                fill={TV_BLUE}
                fontSize={10}
                fontFamily="var(--font-sans), Inter, sans-serif"
              >
                Entry {entry.toFixed(2)} · {isLong ? "LONG" : "SHORT"} · R:R{" "}
                {rr.toFixed(2)}
              </text>
              <text
                x={xLeft + 4}
                y={(stopY1 + stopY2) / 2 + 4}
                fill={TV_RED}
                fontSize={10}
                fontFamily="var(--font-sans), Inter, sans-serif"
              >
                SL {stop.toFixed(2)} ({risk.toFixed(2)})
              </text>
              <text
                x={xLeft + 4}
                y={(targetY1 + targetY2) / 2 + 4}
                fill={TV_GREEN}
                fontSize={10}
                fontFamily="var(--font-sans), Inter, sans-serif"
              >
                TP {target.toFixed(2)} ({reward.toFixed(2)})
              </text>
              <DragHandle
                cx={a.x}
                cy={a.y}
                onDown={(e) => onHandleDown(e, d.id, "a")}
              />
              <DragHandle
                cx={a.x}
                cy={b.y}
                onDown={(e) => onHandleDown(e, d.id, "b")}
              />
              <DragHandle
                cx={a.x}
                cy={c.y}
                onDown={(e) => onHandleDown(e, d.id, "c")}
              />
              {hover === d.id && (
                <RemoveHandle
                  x={xRight - 16}
                  y={a.y - 14}
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
              onClick={() => handleClick(d.id)}
              style={grStyle}
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
