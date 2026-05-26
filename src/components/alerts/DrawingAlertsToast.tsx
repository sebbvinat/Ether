"use client";

import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";

/**
 * Wave 14 — toast in-app que escucha el evento `ether:alert-fired` y muestra
 * un panel flotante abajo a la derecha con la alerta disparada.
 *
 * Cada toast vive 8 segundos; el usuario puede cerrarlo antes con la X.
 * Además dispara una Notification del browser si tiene permiso.
 */
interface FiredAlert {
  id: string; // toast id (no drawing id) para soportar múltiples al hilo
  drawingId: string;
  symbol: string;
  level: number;
  price: number;
  direction: "above" | "below" | "both";
  note?: string;
  ts: number;
}

export function DrawingAlertsToast() {
  const [toasts, setToasts] = useState<FiredAlert[]>([]);

  useEffect(() => {
    function onFired(e: Event) {
      const detail = (e as CustomEvent).detail as Omit<FiredAlert, "id" | "ts">;
      if (!detail || typeof detail.level !== "number") return;
      const fa: FiredAlert = {
        id: Math.random().toString(36).slice(2),
        ts: Date.now(),
        ...detail,
      };
      setToasts((prev) => [...prev, fa].slice(-5));
      // Browser Notification (si fue concedido en algún momento)
      if (
        typeof window !== "undefined" &&
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        try {
          const dir =
            detail.direction === "above"
              ? "cruce alcista"
              : detail.direction === "below"
              ? "cruce bajista"
              : "cruce";
          new Notification(`Alerta — ${detail.symbol}`, {
            body: `${dir} en ${detail.level.toFixed(2)} (precio: ${detail.price.toFixed(2)})${
              detail.note ? ` · ${detail.note}` : ""
            }`,
            tag: `drawing-alert-${detail.drawingId}`,
          });
        } catch {}
      }
      // Auto-cierre a los 8s
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== fa.id));
      }, 8000);
    }
    window.addEventListener("ether:alert-fired", onFired);
    return () => window.removeEventListener("ether:alert-fired", onFired);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-16 right-4 z-[100] flex flex-col gap-2">
      {toasts.map((t) => {
        const arrow =
          t.direction === "above" ? "↑" : t.direction === "below" ? "↓" : "⇅";
        const color =
          t.direction === "above"
            ? "#26a69a"
            : t.direction === "below"
            ? "#ef5350"
            : "#ffb74d";
        return (
          <div
            key={t.id}
            className="pointer-events-auto flex w-72 items-start gap-2 rounded-lg border border-tv-border bg-tv-panel/95 px-3 py-2 shadow-xl backdrop-blur"
          >
            <Bell className="mt-0.5 h-4 w-4 shrink-0" style={{ color }} />
            <div className="flex flex-1 flex-col gap-0.5">
              <div className="flex items-center gap-2 text-[12px] font-semibold text-tv-text">
                <span>Alerta {arrow}</span>
                <span className="text-tv-text-muted">·</span>
                <span className="font-mono">{t.symbol}</span>
              </div>
              <div className="font-mono text-[11px] text-tv-text-muted">
                cruzó <span className="text-tv-text">{t.level.toFixed(2)}</span> ·
                precio <span className="text-tv-text">{t.price.toFixed(2)}</span>
              </div>
              {t.note && (
                <div className="mt-0.5 text-[11px] italic text-tv-text-muted">
                  {t.note}
                </div>
              )}
            </div>
            <button
              onClick={() =>
                setToasts((prev) => prev.filter((x) => x.id !== t.id))
              }
              className="rounded p-0.5 text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
              aria-label="Cerrar"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
