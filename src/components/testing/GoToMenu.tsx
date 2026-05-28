"use client";

/**
 * Wave 19 — Go To menu para saltar el replay a puntos clave.
 *
 * Presets que coinciden con FXReplay (horarios en NY time):
 *   - Next Day Open (Y) — 17:00 NY = inicio de session futures
 *   - Next Session (Z) — la próxima sesión que toque (Asia/London/NY)
 *   - Asian Session (I) — 19:00 NY
 *   - London Session (L) — 02:00 NY
 *   - New York Session (N) — 09:30 NY
 *   - Silver Bullet London — 03:00 NY
 *   - Silver Bullet NY AM — 10:00 NY
 *   - Silver Bullet NY PM — 14:00 NY
 *
 * Implementación: dado el `currentCandleTimeMs` y el array de velas 1m,
 * encuentra el índice de la próxima vela que matchee la hora objetivo en
 * NY time. Asume DST automático via Intl.
 */

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type GoToTarget =
  | "next-day-open"
  | "next-session"
  | "asian"
  | "london"
  | "ny"
  | "sb-london"
  | "sb-ny-am"
  | "sb-ny-pm";

interface Preset {
  key: GoToTarget;
  label: string;
  /** Hora NY (24h). */
  hourNY: number;
  /** Minutos NY. */
  minuteNY: number;
  shortcut?: string;
}

const PRESETS: Preset[] = [
  { key: "next-day-open", label: "Próxima apertura (17:00 NY)", hourNY: 17, minuteNY: 0, shortcut: "Y" },
  { key: "asian", label: "Sesión asiática (19:00 NY)", hourNY: 19, minuteNY: 0, shortcut: "I" },
  { key: "london", label: "Sesión Londres (02:00 NY)", hourNY: 2, minuteNY: 0, shortcut: "L" },
  { key: "ny", label: "Sesión Nueva York (09:30 NY)", hourNY: 9, minuteNY: 30, shortcut: "N" },
  { key: "sb-london", label: "Silver Bullet Londres (03:00 NY)", hourNY: 3, minuteNY: 0 },
  { key: "sb-ny-am", label: "Silver Bullet NY AM (10:00 NY)", hourNY: 10, minuteNY: 0 },
  { key: "sb-ny-pm", label: "Silver Bullet NY PM (14:00 NY)", hourNY: 14, minuteNY: 0 },
];

interface Props {
  /** Vela actual (timestamp del replay en ms). */
  currentTimeMs: number;
  /** Array de velas 1m disponibles (para buscar el próximo match). time en seg UNIX. */
  candles1m: { time: number }[];
  /** Salto: setea el nuevo cursor de replay (timestamp ms). */
  onGoTo: (newCursorMs: number) => void;
}

/** True si la vela `candleMs` cae en la hora NY `targetH:targetM` (vela 1m). */
function matchesNYTime(candleMs: number, targetH: number, targetM: number): boolean {
  const d = new Date(candleMs);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const minute = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
  return hour === targetH && minute === targetM;
}

export function GoToMenu({ currentTimeMs, candles1m, onGoTo }: Props) {
  const [open, setOpen] = useState(false);

  function jumpTo(target: Preset) {
    // Buscar la próxima vela 1m (time > cursor) cuyo NY-time matchee el target.
    const startIdx = candles1m.findIndex((c) => c.time * 1000 > currentTimeMs);
    if (startIdx === -1) return;
    for (let i = startIdx; i < candles1m.length; i++) {
      const ms = candles1m[i].time * 1000;
      if (matchesNYTime(ms, target.hourNY, target.minuteNY)) {
        onGoTo(ms);
        setOpen(false);
        return;
      }
    }
    // No encontrado en lo cacheado — fallback: avanzar al final de lo cargado.
    const lastMs = candles1m[candles1m.length - 1]?.time * 1000;
    if (lastMs) onGoTo(lastMs);
    setOpen(false);
  }

  function jumpNextSession() {
    const startIdx = candles1m.findIndex((c) => c.time * 1000 > currentTimeMs);
    if (startIdx === -1) return;
    const targets = [
      { hour: 19, minute: 0 }, // Asian
      { hour: 2, minute: 0 }, // London
      { hour: 9, minute: 30 }, // NY
    ];
    for (let i = startIdx; i < candles1m.length; i++) {
      const ms = candles1m[i].time * 1000;
      for (const t of targets) {
        if (matchesNYTime(ms, t.hour, t.minute)) {
          onGoTo(ms);
          setOpen(false);
          return;
        }
      }
    }
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded border border-tv-border bg-tv-panel/40 px-2 py-1 text-[11px] text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
      >
        Go To
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10"
          />
          <div className="absolute right-0 top-full z-20 mt-1 w-60 overflow-hidden rounded border border-tv-border bg-tv-panel shadow-lg">
            <button
              onClick={jumpNextSession}
              className="flex w-full items-center justify-between border-b border-tv-border px-3 py-1.5 text-left text-[11px] text-tv-text hover:bg-tv-panel-hover"
            >
              <span>Próxima sesión</span>
              <span className="rounded bg-tv-bg px-1 py-px font-mono text-[9px] text-tv-text-muted">Z</span>
            </button>
            {PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => jumpTo(p)}
                className={cn(
                  "flex w-full items-center justify-between px-3 py-1.5 text-left text-[11px] hover:bg-tv-panel-hover",
                  "text-tv-text",
                )}
              >
                <span>{p.label}</span>
                {p.shortcut && (
                  <span className="rounded bg-tv-bg px-1 py-px font-mono text-[9px] text-tv-text-muted">
                    {p.shortcut}
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
