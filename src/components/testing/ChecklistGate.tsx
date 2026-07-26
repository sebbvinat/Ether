"use client";

/**
 * §16 — el checklist que se interpone antes de confirmar una orden.
 *
 * La idea no es burocracia: es que el momento de más impulso (el clic de
 * entrada) sea justo el que exige releer las condiciones propias. Los items
 * tildados quedan en las notas de la orden, así que después se puede revisar
 * qué se chequeó en los trades que salieron mal.
 */

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  items: string[];
  onCancel: () => void;
  /** Recibe las notas ya formateadas ("✓ item" por línea). */
  onConfirm: (notes: string) => void;
}

export function ChecklistGate({ open, items, onCancel, onConfirm }: Props) {
  const [checked, setChecked] = useState<boolean[]>([]);

  // Cada apertura arranca de cero: heredar los tildes de la orden anterior
  // vaciaría de sentido al checklist.
  useEffect(() => {
    if (open) setChecked(items.map(() => false));
  }, [open, items]);

  if (!open) return null;

  const allChecked = items.length > 0 && checked.every(Boolean);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60"
      onClick={onCancel}
    >
      <div
        className="w-[min(420px,92vw)] overflow-hidden rounded-lg border border-tv-border bg-tv-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-tv-border px-4 py-2.5">
          <div className="text-sm font-medium text-tv-text">Antes de entrar</div>
          <div className="text-[11px] text-tv-text-muted">
            Repasá tus condiciones. La orden se confirma con todo tildado.
          </div>
        </div>

        <div className="flex flex-col gap-1 p-3">
          {items.map((item, i) => (
            <label
              key={i}
              className="flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-[12px] text-tv-text hover:bg-tv-panel-hover"
            >
              <input
                type="checkbox"
                checked={checked[i] ?? false}
                onChange={(e) =>
                  setChecked((c) => c.map((v, j) => (j === i ? e.target.checked : v)))
                }
                className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-tv-blue"
              />
              <span className={cn(checked[i] && "text-tv-text-muted line-through")}>
                {item}
              </span>
            </label>
          ))}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-tv-border px-3 py-2">
          <button
            onClick={onCancel}
            className="rounded px-3 py-1 text-[11px] text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
          >
            Cancelar
          </button>
          <button
            onClick={() =>
              onConfirm(items.map((it) => `✓ ${it}`).join("\n"))
            }
            disabled={!allChecked}
            className="rounded bg-tv-blue px-3 py-1 text-[11px] font-medium text-white hover:bg-tv-blue/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Confirmar orden
          </button>
        </div>
      </div>
    </div>
  );
}
