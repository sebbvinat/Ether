"use client";

import type { Candle } from "@/lib/binance/types";
import type { SessionDef } from "@/lib/store/chart-store";

interface Props {
  sessions: SessionDef[];
  enabled: boolean;
  candles: Candle[];
  /** Convierte un tiempo (unix seg) a coordenada X. null si está fuera. */
  timeToX: (time: number) => number | null;
  width: number;
  height: number;
}

/** Devuelve true si `min` cae dentro de [startMin, endMin), soportando wrap
 *  alrededor de medianoche (endMin < startMin). */
function inSession(min: number, startMin: number, endMin: number): boolean {
  if (endMin >= startMin) {
    return min >= startMin && min < endMin;
  }
  // cruza medianoche
  return min >= startMin || min < endMin;
}

/** Minutos desde 00:00 UTC para un unix-seconds. */
function minutesOfDay(timeSec: number): number {
  const d = new Date(timeSec * 1000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/**
 * Resaltado de sesiones — pinta bandas verticales semi-transparentes sobre el
 * chart para marcar Asia / Europa / NY. Read-only (pointer-events:none).
 *
 * Estrategia: para cada sesión activa, recorrer las velas visibles y encontrar
 * runs continuos de velas que caen dentro de la ventana horaria; cada run se
 * pinta como un solo `<rect>` (de xStart a xEnd).
 */
export function SessionsLayer({
  sessions,
  enabled,
  candles,
  timeToX,
  width,
  height,
}: Props) {
  if (!enabled) return null;
  const active = sessions.filter((s) => s.enabled);
  if (active.length === 0 || candles.length === 0) return null;

  // Una banda = rect SVG. Las acumulamos por sesión para poder renderizar
  // ordenado y permitir overlap visual (Europa + NY se solapan en el overlap).
  const bands: { sessionId: string; color: string; x: number; w: number }[] = [];

  for (const s of active) {
    let runStart: number | null = null;
    let runStartTime = 0;
    let lastTime = 0;
    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      const min = minutesOfDay(c.time);
      const inside = inSession(min, s.startMin, s.endMin);
      if (inside) {
        if (runStart === null) {
          runStart = i;
          runStartTime = c.time;
        }
        lastTime = c.time;
      } else {
        if (runStart !== null) {
          // cerrar el run
          const x1 = timeToX(runStartTime);
          const x2 = timeToX(lastTime);
          if (x1 != null && x2 != null) {
            bands.push({
              sessionId: s.id,
              color: s.color,
              x: Math.min(x1, x2),
              w: Math.max(2, Math.abs(x2 - x1) + 2),
            });
          }
          runStart = null;
        }
      }
    }
    // run abierto al final
    if (runStart !== null) {
      const x1 = timeToX(runStartTime);
      const x2 = timeToX(lastTime);
      if (x1 != null && x2 != null) {
        bands.push({
          sessionId: s.id,
          color: s.color,
          x: Math.min(x1, x2),
          w: Math.max(2, Math.abs(x2 - x1) + 2),
        });
      }
    }
  }

  if (bands.length === 0) return null;

  return (
    <svg
      className="absolute inset-0 h-full w-full"
      style={{ overflow: "hidden", pointerEvents: "none", zIndex: 1 }}
    >
      {bands.map((b, i) => (
        <rect
          key={i}
          x={b.x}
          y={0}
          width={b.w}
          height={height}
          fill={b.color}
          opacity={0.08}
        />
      ))}
      {/* Mini-leyenda arriba a la izquierda con las sesiones activas. */}
      <g transform={`translate(8, ${height - 18})`} style={{ pointerEvents: "none" }}>
        {active.map((s, i) => (
          <g key={s.id} transform={`translate(${i * 90}, 0)`}>
            <rect width={10} height={10} fill={s.color} opacity={0.7} rx={1} />
            <text
              x={14}
              y={9}
              fill="#a3a6af"
              fontSize={10}
              fontFamily="var(--font-mono), monospace"
            >
              {s.name}
            </text>
          </g>
        ))}
      </g>
      {/* width usado sólo para satisfacer la prop (clip a nivel SVG). */}
      <rect x={0} y={0} width={width} height={0} fill="none" />
    </svg>
  );
}
