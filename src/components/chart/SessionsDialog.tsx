"use client";

import { RotateCcw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useChartStore } from "@/lib/store/chart-store";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

/** Minutos UTC → "HH:MM" */
function fmt(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Configuración de sesiones — toggle por sesión + color picker + reset.
 * El master toggle vive en MoreMenu; acá sólo configurás cada sesión.
 */
export function SessionsDialog({ open, onOpenChange }: Props) {
  const sessions = useChartStore((s) => s.sessions);
  const toggleSession = useChartStore((s) => s.toggleSession);
  const setSessionColor = useChartStore((s) => s.setSessionColor);
  const resetSessions = useChartStore((s) => s.resetSessions);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 bg-tv-panel p-0">
        <DialogHeader className="border-b border-tv-border px-4 py-3">
          <DialogTitle className="flex items-center justify-between gap-2 text-sm font-medium">
            <span>Sesiones de mercado</span>
            <button
              onClick={resetSessions}
              className="flex items-center gap-1 rounded border border-tv-border px-2 py-1 text-[11px] text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
              title="Restablecer a los valores por defecto"
            >
              <RotateCcw className="h-3 w-3" />
              Reset
            </button>
          </DialogTitle>
        </DialogHeader>

        <div className="px-4 py-3">
          <p className="mb-3 text-[11px] text-tv-text-muted">
            Horarios en UTC (sin DST). Cada sesión se pinta como una banda
            vertical sobre el chart. Activá el master toggle en el menú "···".
          </p>
          <div className="flex flex-col gap-2">
            {sessions.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between gap-3 rounded border border-tv-border bg-tv-bg/40 px-3 py-2"
              >
                <label className="flex flex-1 cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={s.enabled}
                    onChange={() => toggleSession(s.id)}
                    className="h-4 w-4 accent-tv-blue"
                  />
                  <div className="flex flex-col">
                    <span className="text-[12px] font-medium text-tv-text">
                      {s.name}
                    </span>
                    <span className="font-mono text-[10px] text-tv-text-muted">
                      {fmt(s.startMin)} – {fmt(s.endMin)} UTC
                    </span>
                  </div>
                </label>
                <input
                  type="color"
                  value={s.color}
                  onChange={(e) => setSessionColor(s.id, e.target.value)}
                  className="h-7 w-10 cursor-pointer rounded border border-tv-border bg-transparent"
                  title="Color de la banda"
                />
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
