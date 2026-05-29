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
  /** Salto: setea el nuevo cursor de replay (timestamp ms). */
  onGoTo: (newCursorMs: number) => void;
}

/** Devuelve la hora/minuto NY de un timestamp UTC ms (h23). */
function nyHourMinute(ms: number): { hour: number; minute: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = fmt.formatToParts(ms);
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const minute = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
  return { hour, minute };
}

/**
 * Devuelve el próximo timestamp UTC (ms) cuya hora NY sea exactamente
 * `targetHourNY:targetMinuteNY`, estrictamente posterior a `fromMs`.
 * Usa aritmética en minutos NY → robusto a DST (con ±1h de error en el día
 * de transición, aceptable).
 */
function nextOccurrenceMs(fromMs: number, targetHourNY: number, targetMinuteNY: number): number {
  const { hour, minute } = nyHourMinute(fromMs);
  const curMin = hour * 60 + minute;
  const tgtMin = targetHourNY * 60 + targetMinuteNY;
  let offsetMin: number;
  if (tgtMin > curMin) offsetMin = tgtMin - curMin;
  else offsetMin = 24 * 60 - curMin + tgtMin;
  return fromMs + offsetMin * 60_000;
}

export function GoToMenu({ currentTimeMs, onGoTo }: Props) {
  const [open, setOpen] = useState(false);

  function jumpTo(target: Preset) {
    const targetMs = nextOccurrenceMs(currentTimeMs, target.hourNY, target.minuteNY);
    // Si el target está más allá de la data cargada, igual avanzamos —
    // el chart se va a re-prefetchear automáticamente.
    onGoTo(targetMs);
    setOpen(false);
  }

  function jumpNextSession() {
    // Próxima sesión = la más cercana entre Asian/London/NY desde ahora.
    const candidates = [
      { hour: 19, minute: 0 }, // Asian
      { hour: 2, minute: 0 }, // London
      { hour: 9, minute: 30 }, // NY
    ].map((t) => nextOccurrenceMs(currentTimeMs, t.hour, t.minute));
    const nextMs = Math.min(...candidates);
    onGoTo(nextMs);
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
