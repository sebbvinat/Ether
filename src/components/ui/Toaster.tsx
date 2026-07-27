"use client";

/**
 * G4 — el que dibuja los avisos de `lib/toast`.
 *
 * Se monta una sola vez en el layout raíz. Los avisos se apilan abajo a la
 * derecha, se van solos a los 5 segundos y se pueden cerrar antes.
 */

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { TOAST_EVENT, type ToastDetail, type ToastKind } from "@/lib/toast";
import { cn } from "@/lib/utils";

interface Toast extends ToastDetail {
  id: string;
}

const LIFETIME_MS = 5000;
/** Más de esto en pantalla y dejan de leerse; se van los más viejos. */
const MAX_VISIBLE = 4;

const STYLES: Record<ToastKind, { cls: string; Icon: typeof Info }> = {
  error: { cls: "border-tv-red/50 bg-tv-red/10 text-tv-red", Icon: AlertCircle },
  success: {
    cls: "border-tv-green/50 bg-tv-green/10 text-tv-green",
    Icon: CheckCircle2,
  },
  info: { cls: "border-tv-border bg-tv-panel text-tv-text", Icon: Info },
};

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const onToast = (e: Event) => {
      const d = (e as CustomEvent<ToastDetail>).detail;
      if (!d?.message) return;
      const t: Toast = { ...d, id: Math.random().toString(36).slice(2) };
      setToasts((prev) => [...prev, t].slice(-MAX_VISIBLE));
      setTimeout(
        () => setToasts((prev) => prev.filter((x) => x.id !== t.id)),
        LIFETIME_MS,
      );
    };
    window.addEventListener(TOAST_EVENT, onToast);
    return () => window.removeEventListener(TOAST_EVENT, onToast);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col gap-2"
      // Los avisos se anuncian solos a los lectores de pantalla: aparecen sin
      // que el usuario haya movido el foco a ningún lado.
      role="status"
      aria-live="polite"
    >
      {toasts.map((t) => {
        const { cls, Icon } = STYLES[t.kind];
        return (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex max-w-sm items-start gap-2 rounded border px-3 py-2 text-[12px] shadow-lg",
              cls,
            )}
          >
            <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="flex-1">{t.message}</span>
            <button
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              aria-label="Cerrar aviso"
              className="shrink-0 opacity-60 hover:opacity-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
