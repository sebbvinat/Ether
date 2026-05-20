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

// Wave 6A — extension levels for fibext (project beyond 1.0)
const FIB_EXT_LEVELS = [
  { level: 0, color: "#787b86" },
  { level: 0.382, color: "#26a69a" },
  { level: 0.618, color: "#ab47bc" },
  { level: 1, color: "#787b86" },
  { level: 1.272, color: "#ffb74d" },
  { level: 1.618, color: "#ef5350" },
  { level: 2, color: "#2962ff" },
  { level: 2.618, color: "#ab47bc" },
];

// Wave 6A — sub-divisions for gann box grid
const GANN_DIVS = [0.236, 0.382, 0.5, 0.618, 0.786];

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
        const isPreview = d.id.startsWith("__");
        const isSelected = !isPreview && selectedId === d.id;
        const isHovered = !isPreview && hover === d.id;
        const isDragging = !isPreview && drag?.id === d.id;
        const showHandles = !isPreview && (isSelected || isHovered || isDragging);
        const hideHandle = !showHandles;
        const selectedWidth = isSelected ? 1 : 0;
        const grStyle: React.CSSProperties = isPreview
          ? { pointerEvents: "none", opacity: 0.7 }
          : {
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
                hidden={hideHandle}
              />
              <DragHandle
                cx={b.x}
                cy={b.y}
                onDown={(e) => onHandleDown(e, d.id, "b")}
                hidden={hideHandle}
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
                hidden={hideHandle}
              />
              <DragHandle
                cx={b.x}
                cy={b.y}
                onDown={(e) => onHandleDown(e, d.id, "b")}
                hidden={hideHandle}
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
                hidden={hideHandle}
              />
              <DragHandle
                cx={b.x}
                cy={b.y}
                onDown={(e) => onHandleDown(e, d.id, "b")}
                hidden={hideHandle}
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
                hidden={hideHandle}
              />
              <DragHandle
                cx={b.x}
                cy={b.y}
                onDown={(e) => onHandleDown(e, d.id, "b")}
                hidden={hideHandle}
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
                hidden={hideHandle}
              />
              <DragHandle
                cx={b.x}
                cy={b.y}
                onDown={(e) => onHandleDown(e, d.id, "b")}
                hidden={hideHandle}
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
                hidden={hideHandle}
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
                hidden={hideHandle}
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
          // Use a finite right edge (entry + 60px or further-out handle), preview extends a bit more
          const xRight = isPreview
            ? a.x + 80
            : Math.max(a.x + 60, Math.max(b.x, c.x));
          // Show a thin full-width dashed guide line ONLY while the user is dragging the SL or TP handle
          const dragForThis = drag && drag.id === d.id ? drag : null;
          const showSLGuide = !isPreview && dragForThis?.handle === "b";
          const showTPGuide = !isPreview && dragForThis?.handle === "c";
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
              {/* While dragging SL handle: full-width dashed guide */}
              {showSLGuide && (
                <line
                  x1={0}
                  y1={b.y}
                  x2={containerWidth}
                  y2={b.y}
                  stroke={TV_RED}
                  strokeWidth={1}
                  strokeDasharray="4 3"
                  opacity={0.7}
                />
              )}
              {/* While dragging TP handle: full-width dashed guide */}
              {showTPGuide && (
                <line
                  x1={0}
                  y1={c.y}
                  x2={containerWidth}
                  y2={c.y}
                  stroke={TV_GREEN}
                  strokeWidth={1}
                  strokeDasharray="4 3"
                  opacity={0.7}
                />
              )}
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
                hidden={hideHandle}
              />
              <DragHandle
                cx={a.x}
                cy={b.y}
                onDown={(e) => onHandleDown(e, d.id, "b")}
                hidden={hideHandle}
              />
              <DragHandle
                cx={a.x}
                cy={c.y}
                onDown={(e) => onHandleDown(e, d.id, "c")}
                hidden={hideHandle}
              />
              {!isPreview && hover === d.id && (
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
                hidden={hideHandle}
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

        // ============================================================
        // Wave 6A — 14 nuevas herramientas (1 y 2 puntos)
        // ============================================================

        // --- hline (1pt, full-width dashed) ---
        if (d.type === "hline") {
          const a = toCoord(d.at.time, d.at.price);
          if (!a) return null;
          const color = d.color ?? TV_BLUE;
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
                y1={a.y}
                x2={containerWidth}
                y2={a.y}
                stroke="transparent"
                strokeWidth={12}
              />
              <line
                x1={0}
                y1={a.y}
                x2={containerWidth}
                y2={a.y}
                stroke={color}
                strokeWidth={1 + selectedWidth}
                strokeDasharray="4 3"
              />
              <rect
                x={containerWidth - 70}
                y={a.y - 9}
                width={64}
                height={18}
                fill={color}
                opacity={0.85}
              />
              <text
                x={containerWidth - 38}
                y={a.y + 4}
                fill="#fff"
                fontSize={10}
                fontFamily="var(--font-mono), monospace"
                textAnchor="middle"
              >
                {d.at.price.toFixed(2)}
              </text>
              <DragHandle
                cx={containerWidth / 2}
                cy={a.y}
                onDown={(e) => onHandleDown(e, d.id, "at")}
                hidden={hideHandle}
              />
              {hover === d.id && (
                <RemoveHandle
                  x={containerWidth / 2 + 14}
                  y={a.y - 14}
                  onRemove={() => onRemove(d.id)}
                />
              )}
            </g>
          );
        }

        // --- cross (1pt H+V dashed cross) ---
        if (d.type === "cross") {
          const a = toCoord(d.at.time, d.at.price);
          if (!a) return null;
          const color = d.color ?? TV_BLUE;
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
                y1={a.y}
                x2={containerWidth}
                y2={a.y}
                stroke={color}
                strokeWidth={1 + selectedWidth}
                strokeDasharray="4 3"
              />
              <line
                x1={a.x}
                y1={0}
                x2={a.x}
                y2={containerHeight}
                stroke={color}
                strokeWidth={1 + selectedWidth}
                strokeDasharray="4 3"
              />
              <rect
                x={containerWidth - 70}
                y={a.y - 9}
                width={64}
                height={18}
                fill={color}
                opacity={0.85}
              />
              <text
                x={containerWidth - 38}
                y={a.y + 4}
                fill="#fff"
                fontSize={10}
                fontFamily="var(--font-mono), monospace"
                textAnchor="middle"
              >
                {d.at.price.toFixed(2)}
              </text>
              <DragHandle
                cx={a.x}
                cy={a.y}
                onDown={(e) => onHandleDown(e, d.id, "at")}
                hidden={hideHandle}
              />
              {hover === d.id && (
                <RemoveHandle
                  x={a.x + 14}
                  y={a.y - 14}
                  onRemove={() => onRemove(d.id)}
                />
              )}
            </g>
          );
        }

        // --- flag (1pt pin marker) ---
        if (d.type === "flag") {
          const a = toCoord(d.at.time, d.at.price);
          if (!a) return null;
          const color = d.color ?? TV_YELLOW;
          const flagH = 18;
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
                x2={a.x}
                y2={a.y + flagH}
                stroke={color}
                strokeWidth={1.5 + selectedWidth}
              />
              <polygon
                points={`${a.x},${a.y} ${a.x + 12},${a.y + 4} ${a.x},${a.y + 8}`}
                fill={color}
              />
              {d.text && (
                <text
                  x={a.x + 16}
                  y={a.y + 6}
                  fill={TV_TEXT}
                  fontSize={10}
                  fontFamily="var(--font-sans), Inter, sans-serif"
                >
                  {d.text}
                </text>
              )}
              <DragHandle
                cx={a.x}
                cy={a.y}
                onDown={(e) => onHandleDown(e, d.id, "at")}
                hidden={hideHandle}
                small
              />
              {hover === d.id && (
                <RemoveHandle
                  x={a.x + 14}
                  y={a.y - 14}
                  onRemove={() => onRemove(d.id)}
                />
              )}
            </g>
          );
        }

        // --- plabel (1pt right-edge price badge) ---
        if (d.type === "plabel") {
          const a = toCoord(d.at.time, d.at.price);
          if (!a) return null;
          const color = d.color ?? TV_BLUE;
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
                x2={containerWidth - 82}
                y2={a.y}
                stroke={color}
                strokeWidth={0.75}
                strokeDasharray="3 3"
                opacity={0.5}
              />
              <rect
                x={containerWidth - 82}
                y={a.y - 10}
                width={78}
                height={20}
                fill={color}
                opacity={0.95}
                rx={2}
              />
              <text
                x={containerWidth - 43}
                y={a.y + 4}
                fill="#fff"
                fontSize={11}
                fontFamily="var(--font-mono), monospace"
                fontWeight={500}
                textAnchor="middle"
              >
                {d.text ?? d.at.price.toFixed(2)}
              </text>
              <DragHandle
                cx={a.x}
                cy={a.y}
                onDown={(e) => onHandleDown(e, d.id, "at")}
                hidden={hideHandle}
                small
              />
              {hover === d.id && (
                <RemoveHandle
                  x={a.x + 14}
                  y={a.y - 14}
                  onRemove={() => onRemove(d.id)}
                />
              )}
            </g>
          );
        }

        // --- ellipse (2pt diagonal corners) ---
        if (d.type === "ellipse") {
          const a = toCoord(d.a.time, d.a.price);
          const b = toCoord(d.b.time, d.b.price);
          if (!a || !b) return null;
          const cx = (a.x + b.x) / 2;
          const cy = (a.y + b.y) / 2;
          const rx = Math.abs(b.x - a.x) / 2;
          const ry = Math.abs(b.y - a.y) / 2;
          const color = d.color ?? (d.b.price >= d.a.price ? TV_GREEN : TV_RED);
          return (
            <g
              key={d.id}
              onMouseEnter={() => setHover(d.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => handleClick(d.id)}
              style={grStyle}
            >
              <ellipse
                cx={cx}
                cy={cy}
                rx={rx}
                ry={ry}
                stroke={color}
                strokeWidth={1.5 + selectedWidth}
                fill={color}
                fillOpacity={0.08}
              />
              <DragHandle
                cx={a.x}
                cy={a.y}
                onDown={(e) => onHandleDown(e, d.id, "a")}
                hidden={hideHandle}
              />
              <DragHandle
                cx={b.x}
                cy={b.y}
                onDown={(e) => onHandleDown(e, d.id, "b")}
                hidden={hideHandle}
              />
              {hover === d.id && (
                <RemoveHandle
                  x={cx}
                  y={Math.min(a.y, b.y) - 14}
                  onRemove={() => onRemove(d.id)}
                />
              )}
            </g>
          );
        }

        // --- trange (2pt vertical date band, full height) ---
        if (d.type === "trange") {
          const a = toCoord(d.a.time, d.a.price);
          const b = toCoord(d.b.time, d.b.price);
          if (!a || !b) return null;
          const xL = Math.min(a.x, b.x);
          const xW = Math.abs(b.x - a.x);
          const color = d.color ?? TV_BLUE;
          // Estimate bars by guessing avg bar pixel width (rough)
          const bars = Math.max(1, Math.round(xW / 6));
          return (
            <g
              key={d.id}
              onMouseEnter={() => setHover(d.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => handleClick(d.id)}
              style={grStyle}
            >
              <rect
                x={xL}
                y={0}
                width={xW}
                height={containerHeight}
                fill={color}
                fillOpacity={0.08}
                stroke={color}
                strokeWidth={1 + selectedWidth}
                strokeDasharray="4 3"
              />
              <text
                x={xL + xW / 2}
                y={16}
                fill={color}
                fontSize={11}
                fontFamily="var(--font-mono), monospace"
                textAnchor="middle"
              >
                ~{bars} bars
              </text>
              <DragHandle
                cx={a.x}
                cy={containerHeight / 2}
                onDown={(e) => onHandleDown(e, d.id, "a")}
                hidden={hideHandle}
              />
              <DragHandle
                cx={b.x}
                cy={containerHeight / 2}
                onDown={(e) => onHandleDown(e, d.id, "b")}
                hidden={hideHandle}
              />
              {hover === d.id && (
                <RemoveHandle
                  x={xL + xW / 2 + 30}
                  y={20}
                  onRemove={() => onRemove(d.id)}
                />
              )}
            </g>
          );
        }

        // --- forecast (2pt projection rect with Δ labels) ---
        if (d.type === "forecast") {
          const a = toCoord(d.a.time, d.a.price);
          const b = toCoord(d.b.time, d.b.price);
          if (!a || !b) return null;
          const isUp = d.b.price >= d.a.price;
          const color = d.color ?? (isUp ? TV_GREEN : TV_RED);
          const x = Math.min(a.x, b.x);
          const y = Math.min(a.y, b.y);
          const w = Math.abs(b.x - a.x);
          const h = Math.abs(b.y - a.y);
          const dp = d.b.price - d.a.price;
          const dpct = d.a.price ? (dp / d.a.price) * 100 : 0;
          const bars = Math.max(1, Math.round(w / 6));
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
                strokeWidth={1 + selectedWidth}
              />
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={color}
                strokeWidth={1.5}
                strokeDasharray="4 3"
              />
              <text
                x={x + w / 2}
                y={y - 6}
                fill={color}
                fontSize={11}
                fontFamily="var(--font-mono), monospace"
                textAnchor="middle"
              >
                {dp >= 0 ? "+" : ""}
                {dp.toFixed(2)} ({dpct >= 0 ? "+" : ""}
                {dpct.toFixed(2)}%) · {bars}b
              </text>
              <DragHandle
                cx={a.x}
                cy={a.y}
                onDown={(e) => onHandleDown(e, d.id, "a")}
                hidden={hideHandle}
              />
              <DragHandle
                cx={b.x}
                cy={b.y}
                onDown={(e) => onHandleDown(e, d.id, "b")}
                hidden={hideHandle}
              />
              {hover === d.id && (
                <RemoveHandle
                  x={x + w / 2}
                  y={y - 22}
                  onRemove={() => onRemove(d.id)}
                />
              )}
            </g>
          );
        }

        // --- cycle (2pt repeating vlines at constant period) ---
        if (d.type === "cycle") {
          const a = toCoord(d.a.time, d.a.price);
          const b = toCoord(d.b.time, d.b.price);
          if (!a || !b) return null;
          const color = d.color ?? TV_BLUE;
          const period = Math.abs(b.x - a.x);
          if (period < 4) return null;
          const startX = Math.min(a.x, b.x);
          const lines: number[] = [];
          for (let x = startX; x < containerWidth; x += period) {
            lines.push(x);
          }
          for (let x = startX - period; x > 0; x -= period) {
            lines.push(x);
          }
          return (
            <g
              key={d.id}
              onMouseEnter={() => setHover(d.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => handleClick(d.id)}
              style={grStyle}
            >
              {lines.map((x, i) => (
                <line
                  key={i}
                  x1={x}
                  y1={0}
                  x2={x}
                  y2={containerHeight}
                  stroke={color}
                  strokeWidth={Math.abs(x - a.x) < 1 || Math.abs(x - b.x) < 1 ? 1.5 + selectedWidth : 1}
                  strokeDasharray="3 3"
                  opacity={
                    Math.abs(x - a.x) < 1 || Math.abs(x - b.x) < 1 ? 0.9 : 0.5
                  }
                />
              ))}
              <DragHandle
                cx={a.x}
                cy={a.y}
                onDown={(e) => onHandleDown(e, d.id, "a")}
                hidden={hideHandle}
              />
              <DragHandle
                cx={b.x}
                cy={b.y}
                onDown={(e) => onHandleDown(e, d.id, "b")}
                hidden={hideHandle}
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

        // --- regression (2pt linear regression channel) ---
        if (d.type === "regression") {
          const a = toCoord(d.a.time, d.a.price);
          const b = toCoord(d.b.time, d.b.price);
          if (!a || !b) return null;
          const color = d.color ?? TV_BLUE;
          // Band offset perpendicular to the trend line — using a simple
          // y-axis offset proportional to the y delta for a clean look.
          const bandHalf = Math.max(8, Math.abs(b.y - a.y) * 0.25);
          const ax = a.x;
          const bx = b.x;
          const ay = a.y;
          const by = b.y;
          return (
            <g
              key={d.id}
              onMouseEnter={() => setHover(d.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => handleClick(d.id)}
              style={grStyle}
            >
              <polygon
                points={`${ax},${ay - bandHalf} ${bx},${by - bandHalf} ${bx},${by + bandHalf} ${ax},${ay + bandHalf}`}
                fill={color}
                fillOpacity={0.08}
              />
              <line
                x1={ax}
                y1={ay - bandHalf}
                x2={bx}
                y2={by - bandHalf}
                stroke={color}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
              <line
                x1={ax}
                y1={ay + bandHalf}
                x2={bx}
                y2={by + bandHalf}
                stroke={color}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
              <line
                x1={ax}
                y1={ay}
                x2={bx}
                y2={by}
                stroke={color}
                strokeWidth={1.5 + selectedWidth}
              />
              <DragHandle
                cx={ax}
                cy={ay}
                onDown={(e) => onHandleDown(e, d.id, "a")}
                hidden={hideHandle}
              />
              <DragHandle
                cx={bx}
                cy={by}
                onDown={(e) => onHandleDown(e, d.id, "b")}
                hidden={hideHandle}
              />
              {hover === d.id && (
                <RemoveHandle
                  x={(ax + bx) / 2}
                  y={(ay + by) / 2 - 14}
                  onRemove={() => onRemove(d.id)}
                />
              )}
            </g>
          );
        }

        // --- fibext (2pt Fibonacci extension; levels include >1.0) ---
        if (d.type === "fibext") {
          const a = toCoord(d.a.time, d.a.price);
          const b = toCoord(d.b.time, d.b.price);
          if (!a || !b) return null;
          const diff = d.b.price - d.a.price;
          return (
            <g
              key={d.id}
              onMouseEnter={() => setHover(d.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => handleClick(d.id)}
              style={grStyle}
            >
              {FIB_EXT_LEVELS.map(({ level, color }) => {
                const levelPrice = d.a.price + diff * level;
                const lp = toCoord(d.b.time, levelPrice);
                if (!lp) return null;
                const ly = lp.y;
                return (
                  <g key={level}>
                    <line
                      x1={Math.min(a.x, b.x)}
                      y1={ly}
                      x2={containerWidth}
                      y2={ly}
                      stroke={color}
                      strokeWidth={1 + selectedWidth}
                      strokeDasharray="3 3"
                      opacity={0.7}
                    />
                    <rect
                      x={containerWidth - 90}
                      y={ly - 8}
                      width={86}
                      height={16}
                      fill={color}
                      opacity={0.18}
                    />
                    <text
                      x={containerWidth - 48}
                      y={ly + 4}
                      fill={color}
                      fontSize={10}
                      fontFamily="var(--font-mono), monospace"
                      textAnchor="middle"
                    >
                      {level.toFixed(3).replace(/\.?0+$/, "")} · {levelPrice.toFixed(2)}
                    </text>
                  </g>
                );
              })}
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={TV_TEXT}
                strokeWidth={1}
                opacity={0.5}
                strokeDasharray="2 4"
              />
              <DragHandle
                cx={a.x}
                cy={a.y}
                onDown={(e) => onHandleDown(e, d.id, "a")}
                hidden={hideHandle}
              />
              <DragHandle
                cx={b.x}
                cy={b.y}
                onDown={(e) => onHandleDown(e, d.id, "b")}
                hidden={hideHandle}
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

        // --- fibarc (2pt Fib semicircles centered at A, radius |AB|) ---
        if (d.type === "fibarc") {
          const a = toCoord(d.a.time, d.a.price);
          const b = toCoord(d.b.time, d.b.price);
          if (!a || !b) return null;
          const color = d.color ?? TV_BLUE;
          const r = Math.hypot(b.x - a.x, b.y - a.y);
          if (r < 4) return null;
          const ratios = [0.382, 0.5, 0.618, 1.0];
          return (
            <g
              key={d.id}
              onMouseEnter={() => setHover(d.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => handleClick(d.id)}
              style={grStyle}
            >
              {ratios.map((ratio, i) => {
                const rr = r * ratio;
                // semicircle: a sweep arc from (a.x - rr, a.y) to (a.x + rr, a.y) going down
                const path = `M ${a.x - rr} ${a.y} A ${rr} ${rr} 0 0 0 ${a.x + rr} ${a.y}`;
                return (
                  <path
                    key={i}
                    d={path}
                    stroke={color}
                    strokeWidth={1 + selectedWidth}
                    strokeDasharray="3 3"
                    fill="none"
                    opacity={0.7}
                  />
                );
              })}
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={color}
                strokeWidth={0.75}
                strokeDasharray="2 4"
                opacity={0.5}
              />
              <DragHandle
                cx={a.x}
                cy={a.y}
                onDown={(e) => onHandleDown(e, d.id, "a")}
                hidden={hideHandle}
              />
              <DragHandle
                cx={b.x}
                cy={b.y}
                onDown={(e) => onHandleDown(e, d.id, "b")}
                hidden={hideHandle}
              />
              {hover === d.id && (
                <RemoveHandle
                  x={a.x}
                  y={a.y - r - 14}
                  onRemove={() => onRemove(d.id)}
                />
              )}
            </g>
          );
        }

        // --- fibfan (2pt Fib radiating lines from A through ratio-scaled B) ---
        if (d.type === "fibfan") {
          const a = toCoord(d.a.time, d.a.price);
          const b = toCoord(d.b.time, d.b.price);
          if (!a || !b) return null;
          const color = d.color ?? TV_BLUE;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const ratios = [0.236, 0.382, 0.5, 0.618, 0.786, 1.0];
          return (
            <g
              key={d.id}
              onMouseEnter={() => setHover(d.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => handleClick(d.id)}
              style={grStyle}
            >
              {ratios.map((r, i) => {
                // Endpoint: extend far along ratio-scaled direction
                const ex = a.x + dx * 20;
                const ey = a.y + dy * r * 20;
                return (
                  <line
                    key={i}
                    x1={a.x}
                    y1={a.y}
                    x2={ex}
                    y2={ey}
                    stroke={color}
                    strokeWidth={1 + selectedWidth}
                    opacity={0.65}
                  />
                );
              })}
              <DragHandle
                cx={a.x}
                cy={a.y}
                onDown={(e) => onHandleDown(e, d.id, "a")}
                hidden={hideHandle}
              />
              <DragHandle
                cx={b.x}
                cy={b.y}
                onDown={(e) => onHandleDown(e, d.id, "b")}
                hidden={hideHandle}
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

        // --- gannbox (2pt rect with inner grid + diagonals) ---
        if (d.type === "gannbox") {
          const a = toCoord(d.a.time, d.a.price);
          const b = toCoord(d.b.time, d.b.price);
          if (!a || !b) return null;
          const color = d.color ?? TV_BLUE;
          const x = Math.min(a.x, b.x);
          const y = Math.min(a.y, b.y);
          const w = Math.abs(b.x - a.x);
          const h = Math.abs(b.y - a.y);
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
                fillOpacity={0.04}
                stroke={color}
                strokeWidth={1 + selectedWidth}
              />
              {GANN_DIVS.map((div, i) => (
                <line
                  key={`v${i}`}
                  x1={x + w * div}
                  y1={y}
                  x2={x + w * div}
                  y2={y + h}
                  stroke={color}
                  strokeWidth={0.5}
                  opacity={0.4}
                  strokeDasharray="2 3"
                />
              ))}
              {GANN_DIVS.map((div, i) => (
                <line
                  key={`h${i}`}
                  x1={x}
                  y1={y + h * div}
                  x2={x + w}
                  y2={y + h * div}
                  stroke={color}
                  strokeWidth={0.5}
                  opacity={0.4}
                  strokeDasharray="2 3"
                />
              ))}
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={color}
                strokeWidth={0.75}
                opacity={0.6}
              />
              <line
                x1={a.x}
                y1={b.y}
                x2={b.x}
                y2={a.y}
                stroke={color}
                strokeWidth={0.75}
                opacity={0.6}
              />
              <DragHandle
                cx={a.x}
                cy={a.y}
                onDown={(e) => onHandleDown(e, d.id, "a")}
                hidden={hideHandle}
              />
              <DragHandle
                cx={b.x}
                cy={b.y}
                onDown={(e) => onHandleDown(e, d.id, "b")}
                hidden={hideHandle}
              />
              {hover === d.id && (
                <RemoveHandle
                  x={x + w / 2}
                  y={y - 14}
                  onRemove={() => onRemove(d.id)}
                />
              )}
            </g>
          );
        }

        // --- trendangle (2pt trendline + reference horiz + angle arc + label) ---
        if (d.type === "trendangle") {
          const a = toCoord(d.a.time, d.a.price);
          const b = toCoord(d.b.time, d.b.price);
          if (!a || !b) return null;
          const isUp = d.b.price >= d.a.price;
          const color = d.color ?? (isUp ? TV_GREEN : TV_RED);
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const angleDeg = (Math.atan2(-dy, dx) * 180) / Math.PI;
          const pricePct = d.a.price
            ? ((d.b.price - d.a.price) / d.a.price) * 100
            : 0;
          // Arc: 20px radius at A, from horizontal to the trend direction
          const arcR = 20;
          // Endpoint of arc (along the trend direction)
          const len = Math.hypot(dx, dy) || 1;
          const arcEndX = a.x + (dx / len) * arcR;
          const arcEndY = a.y + (dy / len) * arcR;
          const sweep = dy < 0 ? 0 : 1;
          const arcPath = `M ${a.x + arcR} ${a.y} A ${arcR} ${arcR} 0 0 ${sweep} ${arcEndX} ${arcEndY}`;
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
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={a.y}
                stroke={color}
                strokeWidth={0.75}
                strokeDasharray="3 3"
                opacity={0.5}
              />
              <path d={arcPath} stroke={color} strokeWidth={1} fill="none" />
              <text
                x={a.x + arcR + 6}
                y={a.y - 4}
                fill={color}
                fontSize={11}
                fontFamily="var(--font-mono), monospace"
              >
                {angleDeg.toFixed(1)}° · {pricePct >= 0 ? "+" : ""}
                {pricePct.toFixed(2)}%
              </text>
              <DragHandle
                cx={a.x}
                cy={a.y}
                onDown={(e) => onHandleDown(e, d.id, "a")}
                hidden={hideHandle}
              />
              <DragHandle
                cx={b.x}
                cy={b.y}
                onDown={(e) => onHandleDown(e, d.id, "b")}
                hidden={hideHandle}
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
  hidden,
}: {
  cx: number;
  cy: number;
  onDown: (e: React.PointerEvent<SVGCircleElement>) => void;
  small?: boolean;
  hidden?: boolean;
}) {
  if (hidden) return null;
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
