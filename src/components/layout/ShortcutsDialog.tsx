"use client";

import { useState } from "react";
import { RotateCcw, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useChartStore } from "@/lib/store/chart-store";
import {
  SHORTCUT_LABELS,
  comboFromEvent,
  DEFAULT_SHORTCUTS,
  type ShortcutAction,
} from "@/lib/shortcuts";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

/**
 * Configuración de atajos de teclado — lista de acciones con su combo actual.
 * Clic sobre un combo lo pone en "capturando" — la próxima tecla pulsada
 * (no-modificador sola) se serializa y guarda. Esc cancela la captura.
 */
export function ShortcutsDialog({ open, onOpenChange }: Props) {
  const shortcuts = useChartStore((s) => s.shortcuts);
  const setShortcut = useChartStore((s) => s.setShortcut);
  const resetShortcuts = useChartStore((s) => s.resetShortcuts);
  const [capturing, setCapturing] = useState<ShortcutAction | null>(null);

  function startCapture(action: ShortcutAction) {
    setCapturing(action);
  }

  function onCaptureKey(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (!capturing) return;
    if (e.key === "Escape") {
      setCapturing(null);
      return;
    }
    if (e.key === "Backspace" || e.key === "Delete") {
      // Borra el binding
      setShortcut(capturing, "");
      setCapturing(null);
      e.preventDefault();
      return;
    }
    const combo = comboFromEvent(e.nativeEvent);
    if (!combo) return; // sólo modificadores → ignorar
    setShortcut(capturing, combo);
    setCapturing(null);
    e.preventDefault();
  }

  const actions = Object.keys(DEFAULT_SHORTCUTS) as ShortcutAction[];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 bg-tv-panel p-0">
        <DialogHeader className="border-b border-tv-border px-4 py-3">
          <DialogTitle className="flex items-center justify-between gap-2 text-sm font-medium">
            <span>Atajos de teclado</span>
            <button
              onClick={resetShortcuts}
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
            Clic en un combo para rebindearlo. Pulsá la nueva combinación o
            Backspace para borrarlo. Esc cancela. <b>Esc</b> está reservado para
            salir de modos y no es configurable.
          </p>
          <div className="flex flex-col gap-1">
            {actions.map((action) => {
              const combo = shortcuts[action] ?? "";
              const isCapturing = capturing === action;
              return (
                <div
                  key={action}
                  className="flex items-center justify-between gap-3 rounded border border-tv-border bg-tv-bg/30 px-3 py-1.5"
                >
                  <span className="text-[12px] text-tv-text">
                    {SHORTCUT_LABELS[action]}
                  </span>
                  <button
                    onClick={() => startCapture(action)}
                    onKeyDown={onCaptureKey}
                    className={
                      "min-w-[120px] rounded border border-tv-border px-2 py-1 font-mono text-[11px] " +
                      (isCapturing
                        ? "border-tv-blue bg-tv-blue/10 text-tv-blue"
                        : "bg-tv-panel text-tv-text hover:bg-tv-panel-hover")
                    }
                  >
                    {isCapturing
                      ? "Pulsá una tecla…"
                      : combo
                      ? combo
                      : "— sin asignar —"}
                  </button>
                </div>
              );
            })}
          </div>
          {capturing && (
            <div className="mt-3 flex items-center justify-end">
              <button
                onClick={() => setCapturing(null)}
                className="flex items-center gap-1 rounded border border-tv-border px-2 py-1 text-[11px] text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
              >
                <X className="h-3 w-3" />
                Cancelar
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
