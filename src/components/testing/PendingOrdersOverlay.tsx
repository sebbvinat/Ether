"use client";

/**
 * Wave 18.7 — SVG overlay con las órdenes pendientes (limit/stop).
 *
 * Cada orden se dibuja con 3 líneas: entry (naranja sólida), SL (rojo
 * punteado), TP (verde punteado). Las 3 son draggeables — soltás la línea
 * en el nuevo nivel y se persiste vía updateOrderLevels.
 *
 * También dibuja una "X" para cancelar la orden inline.
 */

import { useEffect, useRef, useState } from "react";
import { useTestingStore, type Order } from "@/lib/store/testing-store";

interface Props {
  orders: Order[]; // ya filtradas a pending
  priceToY: (price: number) => number | null;
  yToPrice: (y: number) => number | null;
  width: number;
  height: number;
}

type DragKind = "entry" | "sl" | "tp";
type DragState = { orderId: string; kind: DragKind; currentY: number };

const ORANGE = "#ffb74d";
const RED = "#ef5350";
const GREEN = "#26a69a";

export function PendingOrdersOverlay({
  orders,
  priceToY,
  yToPrice,
  width,
  height,
}: Props) {
  const updateLevels = useTestingStore((s) => s.updateOrderLevels);
  const cancelOrder = useTestingStore((s) => s.cancelOrderById);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      setDrag((d) => (d ? { ...d, currentY: e.clientY - rect.top } : null));
    };
    const onUp = (e: PointerEvent) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const newPrice = yToPrice(y);
      if (newPrice !== null && drag) {
        const patch =
          drag.kind === "entry"
            ? { entryPrice: newPrice }
            : drag.kind === "sl"
              ? { sl: newPrice }
              : { tp: newPrice };
        void updateLevels(drag.orderId, patch);
      }
      setDrag(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag, yToPrice, updateLevels]);

  if (orders.length === 0 || width === 0 || height === 0) return null;

  return (
    <svg
      ref={svgRef}
      className="absolute inset-0 h-full w-full"
      style={{ zIndex: 5, overflow: "hidden", pointerEvents: "none" }}
    >
      {orders.map((o) => {
        const yEntryRaw = priceToY(o.entryPrice);
        if (yEntryRaw === null) return null;
        let yEntry = yEntryRaw;
        let ySl = o.sl !== undefined ? priceToY(o.sl) : null;
        let yTp = o.tp !== undefined ? priceToY(o.tp) : null;
        // Drag preview
        if (drag?.orderId === o.id) {
          if (drag.kind === "entry") yEntry = drag.currentY;
          if (drag.kind === "sl") ySl = drag.currentY;
          if (drag.kind === "tp") yTp = drag.currentY;
        }
        const entryPrice =
          drag?.orderId === o.id && drag.kind === "entry"
            ? yToPrice(yEntry) ?? o.entryPrice
            : o.entryPrice;
        const slPrice =
          drag?.orderId === o.id && drag.kind === "sl" && ySl !== null
            ? yToPrice(ySl) ?? o.sl
            : o.sl;
        const tpPrice =
          drag?.orderId === o.id && drag.kind === "tp" && yTp !== null
            ? yToPrice(yTp) ?? o.tp
            : o.tp;

        const sideLabel = `${o.side === "buy" ? "Buy" : "Sell"} ${o.type}`;

        return (
          <g key={o.id}>
            {/* Entry line — naranja, draggeable */}
            <g style={{ pointerEvents: "auto", cursor: "ns-resize" }}>
              <line
                x1={0}
                y1={yEntry}
                x2={width}
                y2={yEntry}
                stroke="transparent"
                strokeWidth={12}
                onPointerDown={(e) => {
                  e.preventDefault();
                  setDrag({ orderId: o.id, kind: "entry", currentY: yEntry });
                }}
              />
              <line
                x1={0}
                y1={yEntry}
                x2={width}
                y2={yEntry}
                stroke={ORANGE}
                strokeWidth={1.25}
                strokeDasharray="6 3"
                opacity={0.9}
              />
              {/* Tag a la izquierda */}
              <g transform={`translate(8, ${yEntry - 22})`} style={{ pointerEvents: "none" }}>
                <rect
                  width={110}
                  height={18}
                  rx={2}
                  fill="rgba(30,34,45,0.92)"
                  stroke={ORANGE}
                  strokeWidth={0.5}
                />
                <text
                  x={6}
                  y={12}
                  fill={ORANGE}
                  fontSize={10}
                  fontWeight={600}
                  fontFamily="var(--font-mono), monospace"
                >
                  ⏳ {sideLabel} · {o.size}
                </text>
              </g>
              {/* Pill precio a la derecha */}
              <rect
                x={width - 100}
                y={yEntry - 10}
                width={94}
                height={20}
                fill={ORANGE}
                opacity={0.95}
                rx={2}
              />
              <text
                x={width - 53}
                y={yEntry + 4}
                fill="#000"
                fontSize={10}
                fontWeight={600}
                fontFamily="var(--font-mono), monospace"
                textAnchor="middle"
                style={{ pointerEvents: "none" }}
              >
                {entryPrice.toFixed(2)}
              </text>
              {/* Cancel button "X" */}
              <g
                transform={`translate(${width - 124}, ${yEntry - 10})`}
                style={{ cursor: "pointer", pointerEvents: "auto" }}
                onClick={(e) => {
                  e.stopPropagation();
                  void cancelOrder(o.id);
                }}
              >
                <rect width={20} height={20} fill="rgba(239,83,80,0.85)" rx={2} />
                <text x={10} y={14} fill="#fff" fontSize={11} fontWeight={700} textAnchor="middle">
                  ×
                </text>
              </g>
            </g>

            {/* SL line — rojo, draggeable */}
            {ySl !== null && (
              <g style={{ pointerEvents: "auto", cursor: "ns-resize" }}>
                <line
                  x1={0}
                  y1={ySl}
                  x2={width}
                  y2={ySl}
                  stroke="transparent"
                  strokeWidth={12}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    setDrag({ orderId: o.id, kind: "sl", currentY: ySl! });
                  }}
                />
                <line
                  x1={0}
                  y1={ySl}
                  x2={width}
                  y2={ySl}
                  stroke={RED}
                  strokeWidth={1}
                  strokeDasharray="3 4"
                  opacity={0.7}
                />
                <rect
                  x={width - 100}
                  y={ySl - 10}
                  width={94}
                  height={20}
                  fill={RED}
                  opacity={0.85}
                  rx={2}
                />
                <text
                  x={width - 53}
                  y={ySl + 4}
                  fill="#fff"
                  fontSize={10}
                  fontWeight={600}
                  fontFamily="var(--font-mono), monospace"
                  textAnchor="middle"
                  style={{ pointerEvents: "none" }}
                >
                  SL {slPrice?.toFixed(2)}
                </text>
              </g>
            )}

            {/* TP line — verde, draggeable */}
            {yTp !== null && (
              <g style={{ pointerEvents: "auto", cursor: "ns-resize" }}>
                <line
                  x1={0}
                  y1={yTp}
                  x2={width}
                  y2={yTp}
                  stroke="transparent"
                  strokeWidth={12}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    setDrag({ orderId: o.id, kind: "tp", currentY: yTp! });
                  }}
                />
                <line
                  x1={0}
                  y1={yTp}
                  x2={width}
                  y2={yTp}
                  stroke={GREEN}
                  strokeWidth={1}
                  strokeDasharray="3 4"
                  opacity={0.7}
                />
                <rect
                  x={width - 100}
                  y={yTp - 10}
                  width={94}
                  height={20}
                  fill={GREEN}
                  opacity={0.85}
                  rx={2}
                />
                <text
                  x={width - 53}
                  y={yTp + 4}
                  fill="#fff"
                  fontSize={10}
                  fontWeight={600}
                  fontFamily="var(--font-mono), monospace"
                  textAnchor="middle"
                  style={{ pointerEvents: "none" }}
                >
                  TP {tpPrice?.toFixed(2)}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}
