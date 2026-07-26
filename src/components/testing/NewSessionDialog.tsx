"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useTestingStore } from "@/lib/store/testing-store";
import type { Timeframe } from "@/lib/binance/types";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Si se pasa, llama acá al crear con el id de la nueva sesión. */
  onCreated?: (id: string) => void;
  /** Defaults pre-llenados si vienen. */
  defaults?: {
    symbol?: string;
    timeframe?: Timeframe;
  };
}

const TFS: Timeframe[] = ["1m", "5m", "15m", "30m", "1h", "4h", "1d"];

// Símbolos populares pre-cargados (el usuario puede tipear cualquier ticker
// Binance — los más comunes están de quick-pick).
const POPULAR = [
  { symbol: "BTCUSDT", label: "BTCUSDT · Binance" },
  { symbol: "ETHUSDT", label: "ETHUSDT · Binance" },
  { symbol: "SOLUSDT", label: "SOLUSDT · Binance" },
  { symbol: "^GSPC", label: "S&P 500 · Yahoo" },
  { symbol: "^IXIC", label: "Nasdaq Composite · Yahoo" },
];

function isoToMs(s: string): number {
  return new Date(s + "T00:00:00Z").getTime();
}
function msToIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Wave 17 — Nueva sesión de backtest.
 * Mínimo: nombre + símbolo + timeframe + rango de fechas + balance inicial.
 */
export function NewSessionDialog({ open, onOpenChange, onCreated, defaults }: Props) {
  const createSession = useTestingStore((s) => s.createSession);
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState(defaults?.symbol ?? "BTCUSDT");
  const [timeframe, setTimeframe] = useState<Timeframe>(defaults?.timeframe ?? "15m");
  // Default range: últimos 6 meses
  const now = Date.now();
  const sixMonthsAgo = now - 1000 * 60 * 60 * 24 * 180;
  const [startDate, setStartDate] = useState(msToIso(sixMonthsAgo));
  const [endDate, setEndDate] = useState(msToIso(now));
  const [initialBalance, setInitialBalance] = useState("100000");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  // §5 — costos de trading (opcionales, default sin fricción).
  const [commissionPerUnit, setCommissionPerUnit] = useState("0");
  const [spreadTicks, setSpreadTicks] = useState("0");
  const [tickSize, setTickSize] = useState("0.01");
  // §3 — riesgo por trade que el diálogo de órdenes usa por defecto.
  const [defaultRiskPct, setDefaultRiskPct] = useState("0.5");
  const spreadCost =
    (Number(spreadTicks) || 0) * (Number(tickSize) || 0);
  // Wave 18.10 — dónde arranca el cursor: al inicio (backtest desde el pasado)
  // o al final del rango (chequear precio actual y avanzar poco a poco).
  const [startAt, setStartAt] = useState<"start" | "end">("start");
  const updateSessionMeta = useTestingStore((s) => s.updateSessionMeta);

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const startMs = isoToMs(startDate);
    const endMs = isoToMs(endDate);
    if (!name.trim()) {
      setError("Poné un nombre para la sesión.");
      return;
    }
    if (!symbol.trim()) {
      setError("Elegí o tipeá un símbolo.");
      return;
    }
    if (endMs <= startMs) {
      setError("La fecha de fin debe ser posterior a la de inicio.");
      return;
    }
    const balance = Number(initialBalance.replace(/,/g, ""));
    if (!Number.isFinite(balance) || balance <= 0) {
      setError("Balance inicial inválido.");
      return;
    }
    const id = createSession({
      name: name.trim(),
      symbol: symbol.trim().toUpperCase(),
      timeframe,
      startDate: startMs,
      endDate: endMs,
      initialBalance: balance,
      commissionPerUnit: Math.max(0, Number(commissionPerUnit) || 0),
      spreadTicks: Math.max(0, Number(spreadTicks) || 0),
      tickSize: Math.max(0, Number(tickSize) || 0.01),
      defaultRiskPct: Math.max(0, Number(defaultRiskPct) || 0.5),
      description: description.trim() || undefined,
      tags: [],
    });
    if (startAt === "end") {
      // Cursor arranca al final del rango (para chequear precio actual).
      updateSessionMeta(id, { replayCursorMs: endMs });
    }
    onOpenChange(false);
    onCreated?.(id);
    // reset
    setName("");
    setInitialBalance("100000");
    setDescription("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 bg-tv-panel p-0">
        <DialogHeader className="border-b border-tv-border px-4 py-3">
          <DialogTitle className="text-sm font-medium">
            Nueva sesión de backtest
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleCreate} className="flex flex-col gap-3 p-4">
          <Field label="Nombre">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: NQ 1A1 RT NY AM"
              autoFocus
            />
          </Field>

          <Field label="Símbolo">
            <Input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="BTCUSDT, ETHUSDT, ^GSPC..."
            />
            <div className="mt-1.5 flex flex-wrap gap-1">
              {POPULAR.map((p) => (
                <button
                  key={p.symbol}
                  type="button"
                  onClick={() => setSymbol(p.symbol)}
                  className="rounded bg-tv-bg/40 px-2 py-0.5 text-[10px] text-tv-text-muted hover:bg-tv-blue/15 hover:text-tv-blue"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Timeframe">
              <select
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value as Timeframe)}
                className="h-9 w-full rounded border border-tv-border bg-tv-bg px-2 text-sm text-tv-text"
              >
                {TFS.map((tf) => (
                  <option key={tf} value={tf}>
                    {tf}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Desde">
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </Field>
            <Field label="Hasta">
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </Field>
          </div>

          <Field label="Balance inicial (USD)">
            <Input
              value={initialBalance}
              onChange={(e) => setInitialBalance(e.target.value)}
              placeholder="100000"
              inputMode="numeric"
            />
          </Field>

          <Field label="Cursor arranca en">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStartAt("start")}
                className={
                  "flex-1 rounded border px-3 py-1.5 text-left text-[11px] " +
                  (startAt === "start"
                    ? "border-tv-blue bg-tv-blue/10 text-tv-blue"
                    : "border-tv-border text-tv-text-muted hover:text-tv-text")
                }
              >
                <div className="font-medium">Inicio del rango</div>
                <div className="text-[10px] opacity-70">
                  Backtest desde el pasado hacia el presente.
                </div>
              </button>
              <button
                type="button"
                onClick={() => setStartAt("end")}
                className={
                  "flex-1 rounded border px-3 py-1.5 text-left text-[11px] " +
                  (startAt === "end"
                    ? "border-tv-blue bg-tv-blue/10 text-tv-blue"
                    : "border-tv-border text-tv-text-muted hover:text-tv-text")
                }
              >
                <div className="font-medium">Fin del rango (precio actual)</div>
                <div className="text-[10px] opacity-70">
                  Ves el precio de hoy. Rewind para el pasado.
                </div>
              </button>
            </div>
          </Field>

          {/* §5 — costos de trading. Colapsado por defecto: la mayoría
              arranca sin fricción y los ajusta después. */}
          <details className="rounded border border-tv-border bg-tv-bg/30">
            <summary className="cursor-pointer select-none px-2 py-1.5 text-[11px] text-tv-text-muted hover:text-tv-text">
              Configuración avanzada — costos de trading
            </summary>
            <div className="flex flex-col gap-3 border-t border-tv-border px-2 py-2">
              <p className="text-[10px] leading-relaxed text-tv-text-muted">
                Las velas se tratan como precio <b>bid</b>: toda compra se llena{" "}
                <b>spread × tick</b> peor (entrar en largo, salir de un corto).
                Las ventas van al precio de la vela. La comisión se cobra por
                unidad y por lado, así que un round-trip paga el doble.
              </p>
              <Field label="Riesgo por trade (% del balance)">
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={defaultRiskPct}
                  onChange={(e) => setDefaultRiskPct(e.target.value)}
                  className="w-full rounded border border-tv-border bg-tv-bg px-2 py-1.5 font-mono text-[12px] text-tv-text"
                />
              </Field>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Comisión / unidad">
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={commissionPerUnit}
                    onChange={(e) => setCommissionPerUnit(e.target.value)}
                    className="w-full rounded border border-tv-border bg-tv-bg px-2 py-1.5 font-mono text-[12px] text-tv-text"
                  />
                </Field>
                <Field label="Spread (ticks)">
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={spreadTicks}
                    onChange={(e) => setSpreadTicks(e.target.value)}
                    className="w-full rounded border border-tv-border bg-tv-bg px-2 py-1.5 font-mono text-[12px] text-tv-text"
                  />
                </Field>
                <Field label="Tick size">
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={tickSize}
                    onChange={(e) => setTickSize(e.target.value)}
                    className="w-full rounded border border-tv-border bg-tv-bg px-2 py-1.5 font-mono text-[12px] text-tv-text"
                  />
                </Field>
              </div>
              {spreadCost > 0 && (
                <div className="font-mono text-[10px] text-tv-text-muted">
                  Spread efectivo: {spreadCost} por unidad de precio
                </div>
              )}
            </div>
          </details>

          <Field label="Descripción (opcional)">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Notas sobre la estrategia, hipótesis..."
              rows={2}
              className="w-full resize-none rounded border border-tv-border bg-tv-bg px-2 py-1.5 text-sm text-tv-text"
            />
          </Field>

          {error && (
            <div className="rounded border border-tv-red/40 bg-tv-red/10 px-2 py-1.5 text-[12px] text-tv-red">
              {error}
            </div>
          )}

          <div className="mt-1 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded border border-tv-border px-3 py-1.5 text-[12px] text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded bg-tv-blue px-3 py-1.5 text-[12px] font-medium text-white hover:bg-tv-blue/90"
            >
              Crear sesión
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-tv-text-muted">
        {label}
      </div>
      {children}
    </label>
  );
}
