"use client";

/**
 * Wave 18a — Dialog para crear órdenes simuladas en el área Testing.
 *
 * Campos: Side · Type (Market/Limit/Stop) · Position Size · Entry Price ·
 * Stop Loss toggle · Take Profit toggle · Tags · Notes.
 *
 * Save crea la orden y la añade al store de testing. El engine la procesa
 * en el siguiente step del replay (market se llena en la próxima vela,
 * limit/stop esperan a que el precio cruce el nivel).
 */

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useTestingStore,
  type Side,
  type OrderType,
} from "@/lib/store/testing-store";
import { makeLimitOrder, makeStopOrder } from "@/lib/testing/engine";
import { sizeFromRisk } from "@/lib/testing/sizing";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Precio referencial (la última vela del replay) — para prefill de Entry. */
  refPrice: number;
  /** Timestamp (ms) de la vela actual del replay — para openedAt de market fills. */
  currentTimeMs: number;
  /** §3 — balance actual de la sesión, base del sizing por riesgo. */
  sessionBalance: number;
  /** §3 — riesgo por defecto en % (de la sesión). */
  defaultRiskPct?: number;
}

export function PlaceOrderDialog({
  open,
  onOpenChange,
  refPrice,
  currentTimeMs,
  sessionBalance,
  defaultRiskPct,
}: Props) {
  const addOrder = useTestingStore((s) => s.addOrder);
  const openPositionNow = useTestingStore((s) => s.openPositionNow);
  const [side, setSide] = useState<Side>("buy");
  const [orderType, setOrderType] = useState<OrderType>("market");
  const [size, setSize] = useState("1");
  const [entry, setEntry] = useState(String(refPrice.toFixed(2)));
  const [slEnabled, setSlEnabled] = useState(false);
  const [sl, setSl] = useState("");
  const [tpEnabled, setTpEnabled] = useState(false);
  const [tp, setTp] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [notes, setNotes] = useState("");
  // §3 — sizing: manual (tipeás las unidades) o por riesgo (las calcula el
  // % de la cuenta que estás dispuesto a perder contra el stop).
  const [sizeMode, setSizeMode] = useState<"manual" | "risk">("risk");
  const [riskPct, setRiskPct] = useState(String(defaultRiskPct ?? 0.5));
  // §4 — mover el stop al entry cuando el trade recorre 1R a favor.
  const [autoBE, setAutoBE] = useState(false);

  // Refresh entry cuando cambia refPrice o al abrir
  useEffect(() => {
    if (open) {
      setEntry(String(refPrice.toFixed(2)));
    }
  }, [open, refPrice]);

  function reset() {
    setSide("buy");
    setOrderType("market");
    setSize("1");
    setEntry(String(refPrice.toFixed(2)));
    setSlEnabled(false);
    setSl("");
    setTpEnabled(false);
    setTp("");
    setTagsInput("");
    setNotes("");
    setSizeMode("risk");
    setRiskPct(String(defaultRiskPct ?? 0.5));
    setAutoBE(false);
  }

  async function handleSave() {
    const entryN = parseFloat(entry);
    const slN = slEnabled ? parseFloat(sl) : undefined;
    const tpN = tpEnabled ? parseFloat(tp) : undefined;
    // §3 — en modo riesgo el tamaño lo calcula la distancia al stop.
    const sizeN = sizeMode === "risk" ? sizing.size : parseFloat(size);
    if (sizeMode === "risk" && sizing.size === null) {
      alert(sizing.message ?? "No se puede calcular el tamaño");
      return;
    }
    if (!Number.isFinite(sizeN) || sizeN === null || sizeN <= 0) {
      alert("Tamaño inválido");
      return;
    }
    if (orderType !== "market" && !Number.isFinite(entryN)) {
      alert("Precio de entrada inválido");
      return;
    }
    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (orderType === "market") {
      // Market: fill inmediato al precio actual (refPrice), incluso pausado.
      await openPositionNow({
        side,
        size: sizeN,
        entry: refPrice,
        sl: slN,
        tp: tpN,
        tags,
        notes: notes || undefined,
        openedAtMs: currentTimeMs,
        autoBreakeven: autoBE && slEnabled,
      });
    } else if (orderType === "limit") {
      await addOrder(
        makeLimitOrder({
          side,
          size: sizeN,
          entryPrice: entryN,
          sl: slN,
          tp: tpN,
          tags,
          notes: notes || undefined,
          autoBreakeven: autoBE && slEnabled,
        }),
      );
    } else {
      await addOrder(
        makeStopOrder({
          side,
          size: sizeN,
          entryPrice: entryN,
          sl: slN,
          tp: tpN,
          tags,
          notes: notes || undefined,
          autoBreakeven: autoBE && slEnabled,
        }),
      );
    }
    reset();
    onOpenChange(false);
  }

  // ── Sizing y preview de riesgo/reward ────────────────────────────────
  const entryN = parseFloat(entry);
  const slN = slEnabled ? parseFloat(sl) : NaN;
  const tpN = tpEnabled ? parseFloat(tp) : NaN;
  // Una market order se llena al precio actual, no al del campo Entry.
  const effectiveEntry = orderType === "market" ? refPrice : entryN;

  // §3 — tamaño calculado desde el riesgo. `message` explica por qué no se
  // pudo cuando corresponde, para mostrarlo en la UI en vez de fallar mudo.
  const sizing: { size: number | null; message: string | null } = (() => {
    if (sizeMode !== "risk") return { size: null, message: null };
    const r = sizeFromRisk({
      equity: sessionBalance,
      riskPct: parseFloat(riskPct),
      entry: effectiveEntry,
      sl: Number.isFinite(slN) ? slN : undefined,
    });
    if (r.ok) return { size: r.size, message: null };
    return {
      size: null,
      message:
        r.reason === "no-sl"
          ? "Activá el Stop Loss para calcular el tamaño"
          : r.reason === "too-small"
            ? "El riesgo es muy chico para esta distancia al stop"
            : "Revisá el riesgo % y los precios",
    };
  })();

  // El tamaño que realmente se va a usar (y con el que se calcula el preview).
  const sizeN = sizeMode === "risk" ? (sizing.size ?? NaN) : parseFloat(size);

  let riskAmount: number | null = null;
  let rewardAmount: number | null = null;
  let rr: number | null = null;
  if (Number.isFinite(sizeN) && Number.isFinite(effectiveEntry)) {
    if (Number.isFinite(slN)) {
      riskAmount = Math.abs(effectiveEntry - slN) * sizeN;
    }
    if (Number.isFinite(tpN)) {
      rewardAmount = Math.abs(tpN - effectiveEntry) * sizeN;
    }
    if (riskAmount && rewardAmount && riskAmount > 0) {
      rr = rewardAmount / riskAmount;
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 bg-tv-panel p-0">
        <DialogHeader className="border-b border-tv-border px-4 py-3">
          <DialogTitle className="text-sm font-medium">Nueva orden</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 px-4 py-3">
          {/* Side */}
          <div className="flex gap-2">
            <button
              onClick={() => setSide("buy")}
              className={cn(
                "flex-1 rounded border px-3 py-2 text-[12px] font-medium",
                side === "buy"
                  ? "border-tv-green bg-tv-green/10 text-tv-green"
                  : "border-tv-border text-tv-text-muted hover:text-tv-text",
              )}
            >
              Comprar (Buy)
            </button>
            <button
              onClick={() => setSide("sell")}
              className={cn(
                "flex-1 rounded border px-3 py-2 text-[12px] font-medium",
                side === "sell"
                  ? "border-tv-red bg-tv-red/10 text-tv-red"
                  : "border-tv-border text-tv-text-muted hover:text-tv-text",
              )}
            >
              Vender (Sell)
            </button>
          </div>

          {/* Type */}
          <Field label="Tipo de orden">
            <select
              value={orderType}
              onChange={(e) => setOrderType(e.target.value as OrderType)}
              className="w-full rounded border border-tv-border bg-tv-bg px-2 py-1.5 text-[12px] text-tv-text"
            >
              <option value="market">Market (al precio actual)</option>
              <option value="limit">Limit (espera mejor precio)</option>
              <option value="stop">Stop (espera ruptura)</option>
            </select>
          </Field>

          {/* §3 — cómo se define el tamaño */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-medium uppercase tracking-wider text-tv-text-muted">
              Tamaño
            </span>
            <div className="flex overflow-hidden rounded border border-tv-border">
              {(["risk", "manual"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setSizeMode(m)}
                  className={cn(
                    "px-2 py-0.5 text-[10px]",
                    sizeMode === m
                      ? "bg-tv-blue text-white"
                      : "text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text",
                  )}
                >
                  {m === "risk" ? "Por riesgo" : "Manual"}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {sizeMode === "risk" ? (
              <Field label="Riesgo (% del balance)">
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={riskPct}
                  onChange={(e) => setRiskPct(e.target.value)}
                  className="w-full rounded border border-tv-border bg-tv-bg px-2 py-1.5 font-mono text-[12px] text-tv-text"
                />
              </Field>
            ) : (
              <Field label="Tamaño (contracts/units)">
                <input
                  type="number"
                  step="any"
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                  className="w-full rounded border border-tv-border bg-tv-bg px-2 py-1.5 font-mono text-[12px] text-tv-text"
                />
              </Field>
            )}
            <Field label={orderType === "market" ? "Precio referencial" : "Precio de entrada"}>
              <input
                type="number"
                step="any"
                value={entry}
                onChange={(e) => setEntry(e.target.value)}
                disabled={orderType === "market"}
                className="w-full rounded border border-tv-border bg-tv-bg px-2 py-1.5 font-mono text-[12px] text-tv-text disabled:opacity-50"
              />
            </Field>
          </div>

          {/* Stop Loss */}
          <div className="rounded border border-tv-border bg-tv-bg/30 px-3 py-2">
            <label className="flex items-center justify-between text-[12px]">
              <span className="font-medium text-tv-text">Stop Loss</span>
              <input
                type="checkbox"
                checked={slEnabled}
                onChange={(e) => setSlEnabled(e.target.checked)}
              />
            </label>
            {slEnabled && (
              <input
                type="number"
                step="any"
                value={sl}
                onChange={(e) => setSl(e.target.value)}
                placeholder="Precio SL"
                className="mt-2 w-full rounded border border-tv-border bg-tv-bg px-2 py-1.5 font-mono text-[12px] text-tv-red"
              />
            )}
          </div>

          {/* Take Profit */}
          <div className="rounded border border-tv-border bg-tv-bg/30 px-3 py-2">
            <label className="flex items-center justify-between text-[12px]">
              <span className="font-medium text-tv-text">Take Profit</span>
              <input
                type="checkbox"
                checked={tpEnabled}
                onChange={(e) => setTpEnabled(e.target.checked)}
              />
            </label>
            {tpEnabled && (
              <input
                type="number"
                step="any"
                value={tp}
                onChange={(e) => setTp(e.target.value)}
                placeholder="Precio TP"
                className="mt-2 w-full rounded border border-tv-border bg-tv-bg px-2 py-1.5 font-mono text-[12px] text-tv-green"
              />
            )}
          </div>

          {/* §4 — Auto break-even. Requiere SL: sin stop no hay 1R que medir. */}
          <div
            className={cn(
              "rounded border border-tv-border bg-tv-bg/30 px-3 py-2",
              !slEnabled && "opacity-50",
            )}
          >
            <label
              className={cn(
                "flex items-center justify-between text-[12px]",
                slEnabled ? "cursor-pointer" : "cursor-not-allowed",
              )}
            >
              <span className="font-medium text-tv-text">Auto break-even</span>
              <input
                type="checkbox"
                checked={autoBE && slEnabled}
                disabled={!slEnabled}
                onChange={(e) => setAutoBE(e.target.checked)}
              />
            </label>
            <p className="mt-1 text-[10px] leading-snug text-tv-text-muted">
              {slEnabled
                ? "Al recorrer 1R a favor, el stop se muda al precio de entrada."
                : "Activá el Stop Loss para poder usarlo."}
            </p>
          </div>

          {/* §3 — resultado del sizing por riesgo */}
          {sizeMode === "risk" && (
            <div
              className={cn(
                "rounded border px-3 py-2 font-mono text-[11px]",
                sizing.size !== null
                  ? "border-tv-border bg-tv-bg/30 text-tv-text"
                  : "border-tv-yellow/40 bg-tv-yellow/10 text-tv-yellow",
              )}
            >
              {sizing.size !== null ? (
                <>
                  Tamaño calculado:{" "}
                  <span className="font-semibold text-tv-blue">{sizing.size}</span>{" "}
                  <span className="text-tv-text-muted">
                    · balance ${sessionBalance.toFixed(2)}
                  </span>
                </>
              ) : (
                sizing.message
              )}
            </div>
          )}

          {/* Risk preview */}
          {(riskAmount !== null || rewardAmount !== null) && (
            <div className="grid grid-cols-3 gap-2 rounded border border-tv-border bg-tv-bg/30 px-3 py-2 font-mono text-[11px]">
              <div>
                <div className="text-tv-text-muted">Riesgo</div>
                <div className="text-tv-red">
                  {riskAmount !== null ? `$${riskAmount.toFixed(2)}` : "—"}
                </div>
              </div>
              <div>
                <div className="text-tv-text-muted">Reward</div>
                <div className="text-tv-green">
                  {rewardAmount !== null ? `$${rewardAmount.toFixed(2)}` : "—"}
                </div>
              </div>
              <div>
                <div className="text-tv-text-muted">R:R</div>
                <div className="text-tv-text">
                  {rr !== null ? `${rr.toFixed(2)}` : "—"}
                </div>
              </div>
            </div>
          )}

          <Field label="Tags (separadas por coma)">
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="ej: ICT, NY AM, breakout"
              className="w-full rounded border border-tv-border bg-tv-bg px-2 py-1.5 text-[12px] text-tv-text"
            />
          </Field>

          <Field label="Notas">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Razón del trade, contexto, lo que sea…"
              className="w-full rounded border border-tv-border bg-tv-bg px-2 py-1.5 text-[12px] text-tv-text"
            />
          </Field>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-tv-border px-4 py-2.5">
          <button
            onClick={() => onOpenChange(false)}
            className="rounded border border-tv-border px-3 py-1.5 text-[12px] text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
          >
            <X className="mr-1 inline h-3 w-3" />
            Descartar
          </button>
          <button
            onClick={handleSave}
            className={cn(
              "rounded px-4 py-1.5 text-[12px] font-medium text-white",
              side === "buy" ? "bg-tv-green hover:bg-tv-green/90" : "bg-tv-red hover:bg-tv-red/90",
            )}
          >
            {orderType === "market" ? "Ejecutar al mercado" : "Guardar orden"}
          </button>
        </div>
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
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wider text-tv-text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}
