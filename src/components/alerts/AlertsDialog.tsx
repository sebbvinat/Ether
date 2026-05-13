"use client";

import { useEffect, useState } from "react";
import { Bell, Trash2, History, Plus } from "lucide-react";
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
import {
  describeCondition,
  type Alert,
  type AlertCondition,
  type Timeframe,
} from "@/lib/alerts/types";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type Tab = "active" | "history";
type CondType = "price" | "ema-cross" | "rsi-threshold" | "macd-cross";

const TF_OPTIONS: Timeframe[] = ["1m", "5m", "15m", "30m", "1h", "4h", "1d"];

export function AlertsDialog({ open, onOpenChange }: Props) {
  const symbol = useChartStore((s) => s.symbol);
  const timeframeGlobal = useChartStore((s) => s.timeframe);
  const [tab, setTab] = useState<Tab>("active");
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [triggered, setTriggered] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  const [condType, setCondType] = useState<CondType>("price");
  const [price, setPrice] = useState("");
  const [direction, setDirection] = useState<"above" | "below">("above");
  const [note, setNote] = useState("");
  const [fast, setFast] = useState("12");
  const [slow, setSlow] = useState("26");
  const [signal, setSignal] = useState("9");
  const [emaFast, setEmaFast] = useState("50");
  const [emaSlow, setEmaSlow] = useState("200");
  const [rsiPeriod, setRsiPeriod] = useState("14");
  const [rsiThreshold, setRsiThreshold] = useState("70");
  const [alertTf, setAlertTf] = useState<Timeframe>(
    (timeframeGlobal as Timeframe) ?? "15m",
  );
  const [submitting, setSubmitting] = useState(false);

  const inst = getInstrument(symbol);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/alerts", { cache: "no-store" });
      const data = await res.json();
      setAlerts(data.alerts ?? []);
      setTriggered(data.triggered ?? []);
      const missing: string[] = [];
      if (!data.upstashConfigured) missing.push("Upstash KV");
      if (!data.telegramConfigured) missing.push("Telegram bot");
      setWarning(
        missing.length > 0
          ? `Falta configurar: ${missing.join(" y ")}. Las alertas no se dispararán. Ver SETUP.md.`
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

  function buildCondition(): AlertCondition | null {
    if (condType === "price") {
      const p = parseFloat(price);
      if (!isFinite(p) || p <= 0) return null;
      return { type: "price", direction, price: p };
    }
    if (condType === "ema-cross") {
      const f = parseInt(emaFast, 10);
      const s = parseInt(emaSlow, 10);
      if (!isFinite(f) || !isFinite(s)) return null;
      return { type: "ema-cross", fast: f, slow: s, direction };
    }
    if (condType === "rsi-threshold") {
      const p = parseInt(rsiPeriod, 10);
      const t = parseFloat(rsiThreshold);
      if (!isFinite(p) || !isFinite(t)) return null;
      return { type: "rsi-threshold", period: p, threshold: t, direction };
    }
    if (condType === "macd-cross") {
      const f = parseInt(fast, 10);
      const s = parseInt(slow, 10);
      const sig = parseInt(signal, 10);
      if (!isFinite(f) || !isFinite(s) || !isFinite(sig)) return null;
      return {
        type: "macd-cross",
        fast: f,
        slow: s,
        signal: sig,
        direction,
      };
    }
    return null;
  }

  async function submit() {
    const condition = buildCondition();
    if (!condition) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          symbol,
          resolvedSymbol: inst.yahooSymbol ?? symbol,
          provider: inst.provider,
          timeframe: alertTf,
          condition,
          note: note.trim() || undefined,
        }),
      });
      if (!res.ok) {
        setWarning(`Error: ${await res.text()}`);
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
      <DialogContent className="max-w-lg gap-0 bg-tv-panel p-0">
        <DialogHeader className="border-b border-tv-border px-4 py-3">
          <DialogTitle className="flex items-center gap-2 text-sm font-medium">
            <Bell className="h-4 w-4" />
            Alertas de precio
          </DialogTitle>
        </DialogHeader>

        <div className="flex border-b border-tv-border bg-tv-panel">
          <TabBtn
            active={tab === "active"}
            icon={<Plus className="h-3 w-3" />}
            label={`Activas (${alerts.length})`}
            onClick={() => setTab("active")}
          />
          <TabBtn
            active={tab === "history"}
            icon={<History className="h-3 w-3" />}
            label={`Historial (${triggered.length})`}
            onClick={() => setTab("history")}
          />
        </div>

        {warning && (
          <div className="border-b border-tv-border bg-tv-yellow/10 px-4 py-2 text-[11px] text-tv-yellow">
            ⚠ {warning}
          </div>
        )}

        {tab === "active" && (
          <>
            <div className="space-y-2 border-b border-tv-border p-3">
              <div className="text-[11px] uppercase tracking-wider text-tv-text-muted">
                Nueva alerta para{" "}
                <span className="text-tv-text">{inst.displayName}</span>
              </div>

              <div className="grid grid-cols-2 gap-1 rounded bg-tv-bg p-0.5">
                {(
                  [
                    { key: "price", label: "Precio" },
                    { key: "ema-cross", label: "EMA cross" },
                    { key: "rsi-threshold", label: "RSI" },
                    { key: "macd-cross", label: "MACD cross" },
                  ] as { key: CondType; label: string }[]
                ).map((c) => (
                  <button
                    key={c.key}
                    onClick={() => setCondType(c.key)}
                    className={cn(
                      "rounded py-1 text-[11px] font-medium",
                      c.key === condType
                        ? "bg-tv-panel-hover text-tv-text"
                        : "text-tv-text-muted hover:text-tv-text",
                    )}
                  >
                    {c.label}
                  </button>
                ))}
              </div>

              <div className="flex gap-2 rounded bg-tv-bg p-0.5">
                <button
                  onClick={() => setDirection("above")}
                  className={cn(
                    "flex-1 rounded py-1 text-xs",
                    direction === "above"
                      ? "bg-tv-green/20 text-tv-green"
                      : "text-tv-text-muted",
                  )}
                >
                  ≥ / cruza arriba
                </button>
                <button
                  onClick={() => setDirection("below")}
                  className={cn(
                    "flex-1 rounded py-1 text-xs",
                    direction === "below"
                      ? "bg-tv-red/20 text-tv-red"
                      : "text-tv-text-muted",
                  )}
                >
                  ≤ / cruza abajo
                </button>
              </div>

              {condType === "price" && (
                <Input
                  type="number"
                  step="any"
                  placeholder="Precio"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="bg-tv-bg"
                />
              )}

              {condType === "ema-cross" && (
                <div className="grid grid-cols-2 gap-2">
                  <Field
                    label="EMA rápida"
                    value={emaFast}
                    onChange={setEmaFast}
                  />
                  <Field
                    label="EMA lenta"
                    value={emaSlow}
                    onChange={setEmaSlow}
                  />
                </div>
              )}

              {condType === "rsi-threshold" && (
                <div className="grid grid-cols-2 gap-2">
                  <Field
                    label="Periodo"
                    value={rsiPeriod}
                    onChange={setRsiPeriod}
                  />
                  <Field
                    label="Threshold"
                    value={rsiThreshold}
                    onChange={setRsiThreshold}
                  />
                </div>
              )}

              {condType === "macd-cross" && (
                <div className="grid grid-cols-3 gap-2">
                  <Field label="Fast" value={fast} onChange={setFast} />
                  <Field label="Slow" value={slow} onChange={setSlow} />
                  <Field label="Signal" value={signal} onChange={setSignal} />
                </div>
              )}

              {condType !== "price" && (
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-[10px] text-tv-text-muted">
                    Timeframe:
                  </span>
                  {TF_OPTIONS.map((tf) => (
                    <button
                      key={tf}
                      onClick={() => setAlertTf(tf)}
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] uppercase",
                        alertTf === tf
                          ? "bg-tv-panel-hover text-tv-text"
                          : "text-tv-text-muted hover:text-tv-text",
                      )}
                    >
                      {tf}
                    </button>
                  ))}
                </div>
              )}

              <Input
                placeholder="Nota (opcional)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="bg-tv-bg"
              />
              <button
                onClick={submit}
                disabled={submitting}
                className="w-full rounded bg-tv-blue py-1.5 text-xs font-semibold text-white hover:bg-tv-blue/90 disabled:opacity-50"
              >
                {submitting ? "Creando…" : "Crear alerta"}
              </button>
            </div>

            <ScrollArea className="h-[240px]">
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
                <AlertRow key={a.id} alert={a} onRemove={() => remove(a.id)} />
              ))}
            </ScrollArea>
          </>
        )}

        {tab === "history" && (
          <ScrollArea className="h-[440px]">
            {loading && (
              <div className="p-4 text-center text-xs text-tv-text-muted">
                Cargando…
              </div>
            )}
            {!loading && triggered.length === 0 && (
              <div className="p-4 text-center text-xs text-tv-text-muted">
                Sin historial todavía
              </div>
            )}
            {triggered.map((a) => (
              <AlertRow key={a.id} alert={a} triggered />
            ))}
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TabBtn({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 border-b-2 py-2 text-xs font-medium",
        active
          ? "border-tv-blue text-tv-text"
          : "border-transparent text-tv-text-muted hover:text-tv-text",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] uppercase text-tv-text-muted">{label}</span>
      <Input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-tv-bg"
      />
    </div>
  );
}

function AlertRow({
  alert,
  onRemove,
  triggered,
}: {
  alert: Alert;
  onRemove?: () => void;
  triggered?: boolean;
}) {
  const inst = getInstrument(alert.symbol);
  return (
    <div className="group flex items-start justify-between border-b border-tv-border px-4 py-2 text-xs">
      <div className="flex flex-col">
        <div className="flex items-center gap-2">
          <span className="font-medium text-tv-text">{inst.displayName}</span>
          {alert.timeframe && (
            <span className="rounded bg-tv-panel-hover px-1 text-[10px] uppercase text-tv-text-muted">
              {alert.timeframe}
            </span>
          )}
          <span
            className={
              alert.condition.direction === "above"
                ? "text-tv-green"
                : "text-tv-red"
            }
          >
            {describeCondition(alert.condition)}
          </span>
        </div>
        {alert.note && (
          <span className="mt-0.5 text-[10px] text-tv-text-muted">
            {alert.note}
          </span>
        )}
        {triggered && alert.triggeredAt && (
          <span className="mt-0.5 text-[10px] text-tv-text-dim">
            {new Date(alert.triggeredAt).toLocaleString()}
          </span>
        )}
      </div>
      {onRemove && (
        <button
          onClick={onRemove}
          className="rounded p-1 text-tv-text-muted opacity-0 transition-opacity hover:text-tv-red group-hover:opacity-100"
          aria-label="Borrar"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
