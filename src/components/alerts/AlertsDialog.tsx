"use client";

import { useEffect, useState } from "react";
import { Bell, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useChartStore } from "@/lib/store/chart-store";
import { getInstrument } from "@/lib/instruments";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/format";
import type { Alert } from "@/lib/alerts/types";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function AlertsDialog({ open, onOpenChange }: Props) {
  const symbol = useChartStore((s) => s.symbol);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [price, setPrice] = useState("");
  const [direction, setDirection] = useState<"above" | "below">("above");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const inst = getInstrument(symbol);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/alerts", { cache: "no-store" });
      const data = await res.json();
      setAlerts(data.alerts ?? []);
      const missing: string[] = [];
      if (!data.upstashConfigured) missing.push("Upstash KV");
      if (!data.telegramConfigured) missing.push("Telegram bot");
      setWarning(
        missing.length > 0
          ? `Falta configurar: ${missing.join(" y ")}. Las alertas no se dispararán.`
          : null,
      );
    } catch (e) {
      setWarning((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) load();
  }, [open]);

  async function submit() {
    const p = parseFloat(price);
    if (!isFinite(p) || p <= 0) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          symbol,
          resolvedSymbol: inst.yahooSymbol ?? symbol,
          provider: inst.provider,
          direction,
          price: p,
          note: note.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        setWarning(`Error: ${err}`);
        return;
      }
      setPrice("");
      setNote("");
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/alerts?id=${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 bg-tv-panel p-0">
        <DialogHeader className="border-b border-tv-border px-4 py-3">
          <DialogTitle className="flex items-center gap-2 text-sm font-medium">
            <Bell className="h-4 w-4" />
            Alertas de precio
          </DialogTitle>
        </DialogHeader>

        {warning && (
          <div className="border-b border-tv-border bg-tv-yellow/10 px-4 py-2 text-[11px] text-tv-yellow">
            ⚠ {warning}
          </div>
        )}

        <div className="space-y-2 border-b border-tv-border p-3">
          <div className="text-[11px] uppercase tracking-wider text-tv-text-muted">
            Nueva alerta para <span className="text-tv-text">{inst.displayName}</span>
          </div>
          <div className="grid grid-cols-[auto_1fr] items-center gap-2">
            <div className="flex rounded bg-tv-bg p-0.5">
              <button
                onClick={() => setDirection("above")}
                className={cn(
                  "rounded px-2 py-1 text-xs",
                  direction === "above"
                    ? "bg-tv-green/20 text-tv-green"
                    : "text-tv-text-muted",
                )}
              >
                ≥
              </button>
              <button
                onClick={() => setDirection("below")}
                className={cn(
                  "rounded px-2 py-1 text-xs",
                  direction === "below"
                    ? "bg-tv-red/20 text-tv-red"
                    : "text-tv-text-muted",
                )}
              >
                ≤
              </button>
            </div>
            <Input
              type="number"
              step="any"
              placeholder="Precio"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="bg-tv-bg"
            />
          </div>
          <Input
            placeholder="Nota (opcional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="bg-tv-bg"
          />
          <button
            onClick={submit}
            disabled={submitting || !price}
            className="w-full rounded bg-tv-blue py-1.5 text-xs font-semibold text-white hover:bg-tv-blue/90 disabled:opacity-50"
          >
            {submitting ? "Creando…" : "Crear alerta"}
          </button>
        </div>

        <ScrollArea className="h-[280px]">
          <div className="flex flex-col">
            {loading && (
              <div className="p-4 text-center text-xs text-tv-text-muted">
                Cargando…
              </div>
            )}
            {!loading && alerts.length === 0 && (
              <div className="p-4 text-center text-xs text-tv-text-muted">
                Sin alertas activas
              </div>
            )}
            {alerts.map((a) => (
              <div
                key={a.id}
                className="group flex items-center justify-between border-b border-tv-border px-4 py-2 text-xs"
              >
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-tv-text">
                      {getInstrument(a.symbol).displayName}
                    </span>
                    <span
                      className={
                        a.direction === "above"
                          ? "text-tv-green"
                          : "text-tv-red"
                      }
                    >
                      {a.direction === "above" ? "≥" : "≤"} {formatPrice(a.price)}
                    </span>
                  </div>
                  {a.note && (
                    <span className="mt-0.5 text-[10px] text-tv-text-muted">
                      {a.note}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => remove(a.id)}
                  className="rounded p-1 text-tv-text-muted opacity-0 transition-opacity hover:text-tv-red group-hover:opacity-100"
                  aria-label="Borrar alerta"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
