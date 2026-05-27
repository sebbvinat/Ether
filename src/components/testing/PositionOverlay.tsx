"use client";

/**
 * Wave 18b — SVG overlay que dibuja las posiciones abiertas sobre el chart.
 *
 * Cada posición se renderiza con 3 líneas horizontales (entry/SL/TP) +
 * zonas coloreadas (verde TP, rojo SL) + label con risk/reward en $.
 *
 * Es read-only (pointer-events:none) — los SL/TP no se arrastran desde acá
 * todavía (deferred a polish). Patrón: VolumeProfileLayer.tsx + SessionsLayer.tsx.
 */

import type { Position } from "@/lib/store/testing-store";

interface Props {
  positions: Position[];
  priceToY: (price: number) => number | null;
  width: number;
  height: number;
}

export function PositionOverlay({ positions, priceToY, width, height }: Props) {
  if (positions.length === 0 || width === 0 || height === 0) return null;

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      style={{ zIndex: 5, overflow: "hidden" }}
    >
      {positions.map((pos) => {
        const yEntry = priceToY(pos.entry);
        if (yEntry === null) return null;
        const ySl = pos.sl !== undefined ? priceToY(pos.sl) : null;
        const yTp = pos.tp !== undefined ? priceToY(pos.tp) : null;
        const dir = pos.side === "buy" ? 1 : -1;
        const risk =
          pos.sl !== undefined
            ? Math.abs(pos.entry - pos.sl) * pos.size
            : null;
        const reward =
          pos.tp !== undefined
            ? Math.abs(pos.tp - pos.entry) * pos.size
            : null;

        return (
          <g key={pos.id}>
            {/* TP zone: between entry and TP (green) */}
            {yTp !== null && (
              <rect
                x={0}
                y={Math.min(yEntry, yTp)}
                width={width}
                height={Math.abs(yEntry - yTp)}
                fill="rgba(38,166,154,0.10)"
              />
            )}
            {/* SL zone: between entry and SL (red) */}
            {ySl !== null && (
              <rect
                x={0}
                y={Math.min(yEntry, ySl)}
                width={width}
                height={Math.abs(yEntry - ySl)}
                fill="rgba(239,83,80,0.10)"
              />
            )}

            {/* Entry line */}
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

            {/* SL line */}
            {ySl !== null && (
              <>
                <line
                  x1={0}
                  y1={ySl}
                  x2={width}
                  y2={ySl}
                  stroke="#ef5350"
                  strokeWidth={1}
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
                >
                  SL {pos.sl?.toFixed(2)}
                </text>
                {risk !== null && (
                  <text
                    x={8}
                    y={ySl - 4}
                    fill="#ef5350"
                    fontSize={10}
                    fontWeight={500}
                    fontFamily="var(--font-mono), monospace"
                  >
                    Risk -${risk.toFixed(2)}
                  </text>
                )}
              </>
            )}

            {/* TP line */}
            {yTp !== null && (
              <>
                <line
                  x1={0}
                  y1={yTp}
                  x2={width}
                  y2={yTp}
                  stroke="#26a69a"
                  strokeWidth={1}
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
                >
                  TP {pos.tp?.toFixed(2)}
                </text>
                {reward !== null && (
                  <text
                    x={8}
                    y={yTp - 4}
                    fill="#26a69a"
                    fontSize={10}
                    fontWeight={500}
                    fontFamily="var(--font-mono), monospace"
                  >
                    Reward +${reward.toFixed(2)}
                  </text>
                )}
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}
