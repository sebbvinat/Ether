"use client";

/**
 * Wave 19 — SVG overlay con los trades CERRADOS dibujados sobre el chart.
 *
 * Dos modos (toggle "Show as"):
 *  - "drawings": cada trade = una caja (entry → close), con líneas SL/TP,
 *    color verde para wins / rojo para losses.
 *  - "arrows": sólo una flecha + texto en el entry (más limpio en charts con muchos trades).
 *
 * Read-only (pointer-events:none).
 */

import type { Trade } from "@/lib/store/testing-store";
import { TV } from "@/lib/theme";

export type ClosedTradesMode = "drawings" | "arrows" | "hidden";

interface Props {
  trades: Trade[];
  /** time (segundos) → x en píxeles. null si fuera del rango visible. */
  timeToX: (time: number) => number | null;
  /** precio → y en píxeles. null si fuera del rango visible. */
  priceToY: (price: number) => number | null;
  width: number;
  height: number;
  mode: ClosedTradesMode;
}

export function ClosedTradesLayer({ trades, timeToX, priceToY, width, height, mode }: Props) {
  if (mode === "hidden" || trades.length === 0 || width === 0 || height === 0) {
    return null;
  }

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      style={{ zIndex: 4, overflow: "hidden" }}
    >
      {trades.map((t) => {
        const xOpen = timeToX(Math.floor(t.openedAt / 1000));
        const xClose = timeToX(Math.floor(t.closedAt / 1000));
        const yEntry = priceToY(t.entry);
        const yClose = priceToY(t.closePrice);
        if (xOpen === null || xClose === null || yEntry === null || yClose === null) {
          return null;
        }
        const isWin = t.outcome === "win";
        const color = isWin ? TV.green : t.outcome === "loss" ? TV.red : TV.textMuted;

        if (mode === "arrows") {
          // Solo flecha en el entry
          const dir = t.side === "buy" ? 1 : -1;
          const arrowSize = 6;
          return (
            <g key={t.id}>
              <polygon
                points={
                  dir === 1
                    ? `${xOpen - arrowSize},${yEntry + arrowSize * 2} ${xOpen + arrowSize},${yEntry + arrowSize * 2} ${xOpen},${yEntry}`
                    : `${xOpen - arrowSize},${yEntry - arrowSize * 2} ${xOpen + arrowSize},${yEntry - arrowSize * 2} ${xOpen},${yEntry}`
                }
                fill={color}
                opacity={0.7}
              />
            </g>
          );
        }

        // mode === "drawings" — caja entry→close + SL/TP lines
        const ySl = t.sl !== undefined ? priceToY(t.sl) : null;
        const yTp = t.tp !== undefined ? priceToY(t.tp) : null;

        const x = Math.min(xOpen, xClose);
        const w = Math.abs(xClose - xOpen);

        return (
          <g key={t.id} opacity={0.65}>
            {/* TP zone */}
            {yTp !== null && (
              <rect
                x={x}
                y={Math.min(yEntry, yTp)}
                width={w}
                height={Math.abs(yEntry - yTp)}
                fill="rgba(38,166,154,0.13)"
              />
            )}
            {/* SL zone */}
            {ySl !== null && (
              <rect
                x={x}
                y={Math.min(yEntry, ySl)}
                width={w}
                height={Math.abs(yEntry - ySl)}
                fill="rgba(239,83,80,0.13)"
              />
            )}

            {/* Entry → close line */}
            <line
              x1={xOpen}
              y1={yEntry}
              x2={xClose}
              y2={yClose}
              stroke={color}
              strokeWidth={1.5}
              strokeDasharray="2 2"
            />
            {/* Entry marker */}
            <circle cx={xOpen} cy={yEntry} r={3} fill={color} />
            {/* Close marker */}
            <circle cx={xClose} cy={yClose} r={3} fill={color} />

            {/* SL line */}
            {ySl !== null && (
              <line
                x1={x}
                y1={ySl}
                x2={x + w}
                y2={ySl}
                stroke={TV.red}
                strokeWidth={0.75}
                strokeDasharray="3 3"
              />
            )}
            {/* TP line */}
            {yTp !== null && (
              <line
                x1={x}
                y1={yTp}
                x2={x + w}
                y2={yTp}
                stroke={TV.green}
                strokeWidth={0.75}
                strokeDasharray="3 3"
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}
