"use client";

/**
 * Wave 18.6 — PositionOverlay con drag de SL/TP.
 *
 * Cada posición tiene 3 líneas horizontales (entry/SL/TP). SL y TP ahora
 * se pueden ARRASTRAR para ajustar — patrón similar al drag de drawings
 * en DrawingsLayer del chart en vivo (window-level listeners para evitar
 * race conditions con pointer-events del SVG durante el drag).
 */

import { useEffect, useRef, useState } from "react";
import { useTestingStore, type Position } from "@/lib/store/testing-store";

interface Props {
  positions: Position[];
  priceToY: (price: number) => number | null;
  yToPrice: (y: number) => number | null;
  width: number;
  height: number;
}

type DragState = { positionId: string; kind: "sl" | "tp"; currentY: number };

export function PositionOverlay({
  positions,
  priceToY,
  yToPrice,
  width,
  height,
}: Props) {
  const updateLevels = useTestingStore((s) => s.updatePositionLevels);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  // Drag global con window listeners — evita race con pointer-events:none
  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const y = e.clientY - rect.top;
      setDrag((d) => (d ? { ...d, currentY: y } : null));
    };
    const onUp = (e: PointerEvent) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const newPrice = yToPrice(y);
      if (newPrice !== null && drag) {
        const patch =
          drag.kind === "sl" ? { sl: newPrice } : { tp: newPrice };
        void updateLevels(drag.positionId, patch);
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

  if (positions.length === 0 || width === 0 || height === 0) return null;

  return (
    <svg
      ref={svgRef}
      className="absolute inset-0 h-full w-full"
      // pointer-events: visible permite click sobre rects/lines pero deja
      // pasar a través de áreas vacías (el chart sigue siendo interactivo).
      style={{ zIndex: 5, overflow: "hidden", pointerEvents: "none" }}
    >
      {positions.map((pos) => {
        const yEntry = priceToY(pos.entry);
        if (yEntry === null) return null;
        let ySl = pos.sl !== undefined ? priceToY(pos.sl) : null;
        let yTp = pos.tp !== undefined ? priceToY(pos.tp) : null;
        // Si está arrastrando esta posición, usar el Y del drag para feedback en vivo
        if (drag?.positionId === pos.id) {
          if (drag.kind === "sl") ySl = drag.currentY;
          if (drag.kind === "tp") yTp = drag.currentY;
        }
        const slPrice =
          drag?.positionId === pos.id && drag.kind === "sl" && ySl !== null
            ? yToPrice(ySl) ?? pos.sl
            : pos.sl;
        const tpPrice =
          drag?.positionId === pos.id && drag.kind === "tp" && yTp !== null
            ? yToPrice(yTp) ?? pos.tp
            : pos.tp;
        const dir = pos.side === "buy" ? 1 : -1;
        const risk =
          slPrice !== undefined ? Math.abs(pos.entry - slPrice) * pos.size : null;
        const reward =
          tpPrice !== undefined ? Math.abs(tpPrice - pos.entry) * pos.size : null;

        return (
          <g key={pos.id}>
            {/* TP zone */}
            {yTp !== null && (
              <rect
                x={0}
                y={Math.min(yEntry, yTp)}
                width={width}
                height={Math.abs(yEntry - yTp)}
                fill="rgba(38,166,154,0.10)"
              />
            )}
            {/* SL zone */}
            {ySl !== null && (
              <rect
                x={0}
                y={Math.min(yEntry, ySl)}
                width={width}
                height={Math.abs(yEntry - ySl)}
                fill="rgba(239,83,80,0.10)"
              />
            )}

            {/* Entry line (no draggeable) */}
            <line
              x1={0}
              y1={yEntry}
              x2={width}
              y2={yEntry}
              stroke={dir === 1 ? "#26a69a" : "#ef5350"}
              strokeWidth={1.5}
            />
            <rect
              x={width - 100}
              y={yEntry - 10}
              width={94}
              height={20}
              fill={dir === 1 ? "#26a69a" : "#ef5350"}
              opacity={0.95}
              rx={2}
            />
            <text
              x={width - 53}
              y={yEntry + 4}
              fill="#fff"
              fontSize={10}
              fontWeight={600}
              fontFamily="var(--font-mono), monospace"
              textAnchor="middle"
            >
              {pos.side === "buy" ? "▲ " : "▼ "}
              {pos.entry.toFixed(2)}
            </text>

            {/* SL line — DRAGGEABLE */}
            {ySl !== null && (
              <g style={{ pointerEvents: "auto", cursor: "ns-resize" }}>
                {/* Hit area ancha invisible para captar el drag */}
                <line
                  x1={0}
                  y1={ySl}
                  x2={width}
                  y2={ySl}
                  stroke="transparent"
                  strokeWidth={12}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    setDrag({ positionId: pos.id, kind: "sl", currentY: ySl! });
                  }}
                />
                <line
                  x1={0}
                  y1={ySl}
                  x2={width}
                  y2={ySl}
                  stroke="#ef5350"
                  strokeWidth={drag?.positionId === pos.id && drag.kind === "sl" ? 2 : 1}
                  strokeDasharray="4 3"
                />
                <rect
                  x={width - 100}
                  y={ySl - 10}
                  width={94}
                  height={20}
                  fill="#ef5350"
                  opacity={0.95}
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
                {risk !== null && (
                  <text
                    x={8}
                    y={ySl - 4}
                    fill="#ef5350"
                    fontSize={10}
                    fontWeight={500}
                    fontFamily="var(--font-mono), monospace"
                    style={{ pointerEvents: "none" }}
                  >
                    Risk -${risk.toFixed(2)}
                  </text>
                )}
              </g>
            )}

            {/* TP line — DRAGGEABLE */}
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
                    setDrag({ positionId: pos.id, kind: "tp", currentY: yTp! });
                  }}
                />
                <line
                  x1={0}
                  y1={yTp}
                  x2={width}
                  y2={yTp}
                  stroke="#26a69a"
                  strokeWidth={drag?.positionId === pos.id && drag.kind === "tp" ? 2 : 1}
                  strokeDasharray="4 3"
                />
                <rect
                  x={width - 100}
                  y={yTp - 10}
                  width={94}
                  height={20}
                  fill="#26a69a"
                  opacity={0.95}
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
                {reward !== null && (
                  <text
                    x={8}
                    y={yTp - 4}
                    fill="#26a69a"
                    fontSize={10}
                    fontWeight={500}
                    fontFamily="var(--font-mono), monospace"
                    style={{ pointerEvents: "none" }}
                  >
                    Reward +${reward.toFixed(2)}
                  </text>
                )}
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}
