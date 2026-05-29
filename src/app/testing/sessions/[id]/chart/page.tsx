"use client";

/**
 * Wave 18 — Página del chart de una sesión de Testing.
 *
 * Stack visual:
 *   - Top toolbar: volver · TF selector · Place Order · Go To (placeholder Wave 19)
 *   - TestingChart (occupy 1fr)
 *   - Replay bar: |◀ rewind · ◀ step back · ▶/⏸ play · ▶| step fwd · step size · speed · autoplay
 *   - Bottom strip: Buy/Sell + Quantity · ··· · Account ticker (Balance / Realized / Unrealized)
 */

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  Play,
  Pause,
  Plus,
} from "lucide-react";
import { useTestingStore } from "@/lib/store/testing-store";
import { getInstrument } from "@/lib/instruments";
import { TF_MINUTES } from "@/lib/testing/candles";
import { TestingChart, TESTING_TFS } from "@/components/testing/TestingChart";
import { PlaceOrderDialog } from "@/components/testing/PlaceOrderDialog";
import { PositionsPanel } from "@/components/testing/PositionsPanel";
import { GoToMenu } from "@/components/testing/GoToMenu";
import { IndicatorsMenu } from "@/components/testing/IndicatorsMenu";
import type { ClosedTradesMode } from "@/components/testing/ClosedTradesLayer";
import type { Timeframe } from "@/lib/binance/types";
import { cn } from "@/lib/utils";

interface Props {
  params: Promise<{ id: string }>;
}

// Cuántas barras del TF actual avanza cada step.
const STEP_BARS = [1, 2, 5, 10];

/** Etiqueta humana para un step: "1 vela 15m", "30 min", "2 horas", etc. */
function stepLabel(bars: number, tfMinutes: number): string {
  const totalMin = bars * tfMinutes;
  if (totalMin < 60) return `${totalMin} min`;
  if (totalMin < 1440) {
    const h = totalMin / 60;
    return h === Math.floor(h) ? `${h} h` : `${h.toFixed(1)} h`;
  }
  const d = totalMin / 1440;
  return d === Math.floor(d) ? `${d} día${d > 1 ? "s" : ""}` : `${d.toFixed(1)} días`;
}

const SPEEDS: { ms: number; label: string }[] = [
  { ms: 2000, label: "0.5x" },
  { ms: 1000, label: "1x" },
  { ms: 500, label: "2x" },
  { ms: 200, label: "5x" },
  { ms: 100, label: "10x" },
  { ms: 50, label: "20x" },
];

export default function SessionChartPage({ params }: Props) {
  const { id } = use(params);
  const session = useTestingStore((s) => s.sessions.find((x) => x.id === id));
  const detail = useTestingStore((s) => s.activeDetail);
  const activeId = useTestingStore((s) => s.activeSessionId);
  const setActive = useTestingStore((s) => s.setActiveSession);
  const setReplayCursor = useTestingStore((s) => s.setReplayCursor);
  const setChartTf = useTestingStore((s) => s.setChartTimeframe);
  const setStepSize = useTestingStore((s) => s.setReplayStepSize);
  const setIntervalMs = useTestingStore((s) => s.setReplayIntervalMs);
  const openPositionNow = useTestingStore((s) => s.openPositionNow);

  const [orderDialogOpen, setOrderDialogOpen] = useState(false);
  const [autoplay, setAutoplay] = useState(false);
  const [quantity, setQuantity] = useState("1");
  const [closedMode, setClosedMode] = useState<ClosedTradesMode>("drawings");
  const [candles1m, setCandles1m] = useState<{ time: number }[]>([]);
  const [showPanel, setShowPanel] = useState(true);

  // Asegurarse de que la sesión activa esté seteada (carga IDB)
  useEffect(() => {
    if (session && activeId !== session.id) {
      setActive(session.id);
    }
  }, [session, activeId, setActive]);

  // Step en ms = nº de barras × minutos del TF actual.
  const barsPerStep = session?.replayStepSize ?? 1;
  const stepMs = session
    ? barsPerStep * TF_MINUTES[session.chartTimeframe] * 60_000
    : 60_000;

  // Refs frescos para el autoplay (closures)
  const cursorRef = useRef(session?.replayCursorMs ?? session?.startDate ?? 0);
  cursorRef.current = session?.replayCursorMs ?? session?.startDate ?? 0;
  const endRef = useRef(session?.endDate ?? 0);
  endRef.current = session?.endDate ?? 0;
  const stepMsRef = useRef(stepMs);
  stepMsRef.current = stepMs;

  useEffect(() => {
    if (!autoplay || !session) return;
    const intervalMs = session.replayIntervalMs ?? 1000;
    const interval = setInterval(() => {
      const next = cursorRef.current + stepMsRef.current;
      if (next >= endRef.current) {
        setAutoplay(false);
        setReplayCursor(endRef.current);
        return;
      }
      setReplayCursor(next);
    }, intervalMs);
    return () => clearInterval(interval);
  }, [autoplay, session, setReplayCursor]);

  // Precio actual del chart (sincronizado vía custom event que dispara TestingChart).
  const [lastPrice, setLastPrice] = useState<number>(0);
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ price: number }>;
      if (ce.detail?.price) setLastPrice(ce.detail.price);
    };
    window.addEventListener("ether-testing:last-price", handler);
    return () => window.removeEventListener("ether-testing:last-price", handler);
  }, []);

  // Timestamp (ms) del cursor de replay — fuente de verdad.
  const currentTimeMs = session?.replayCursorMs ?? session?.startDate ?? Date.now();

  const handleFastBuy = useCallback(
    async (side: "buy" | "sell") => {
      if (!session) return;
      const sizeN = parseFloat(quantity);
      if (!Number.isFinite(sizeN) || sizeN <= 0) return;
      const refPrice = lastPrice || 0;
      if (refPrice <= 0) {
        alert("Esperá a que cargue el precio actual");
        return;
      }
      // Market fill inmediato al precio actual (incluso pausado).
      await openPositionNow({
        side,
        size: sizeN,
        entry: refPrice,
        tags: ["fast"],
        openedAtMs: currentTimeMs,
      });
    },
    [session, quantity, lastPrice, openPositionNow, currentTimeMs],
  );

  if (!session) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Link
          href="/testing/sessions"
          className="inline-flex items-center gap-1 text-[12px] text-tv-text-muted hover:text-tv-text"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver
        </Link>
        <div className="mt-6 rounded-lg border border-tv-border p-6 text-center text-sm text-tv-text-muted">
          Esa sesión no existe.
        </div>
      </div>
    );
  }

  const inst = getInstrument(session.symbol);
  const positions = detail?.positions ?? [];
  const unrealizedTotal = positions.reduce(
    (acc, p) => acc + (p.unrealizedPnL ?? 0),
    0,
  );
  const span = session.endDate - session.startDate;
  const progressPct =
    span > 0
      ? Math.round(((currentTimeMs - session.startDate) / span) * 100)
      : 0;
  const cursorDate = new Date(currentTimeMs);

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col bg-tv-bg">
      {/* Top toolbar */}
      <div className="flex items-center gap-2 border-b border-tv-border px-3 py-1.5">
        <Link
          href={`/testing/sessions/${session.id}`}
          className="rounded p-1 text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
          title="Volver al resumen"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
        </Link>
        <div className="flex items-center gap-1.5">
          <span className="text-[12px] font-semibold text-tv-text">
            {session.name}
          </span>
          <span className="text-[11px] text-tv-text-muted">·</span>
          <span className="text-[11px] text-tv-text-muted">
            {inst.displayName}
          </span>
        </div>

        {/* TF selector */}
        <div className="ml-3 flex items-center gap-0.5 rounded border border-tv-border bg-tv-panel/40 p-0.5">
          {TESTING_TFS.map((tf: Timeframe) => (
            <button
              key={tf}
              onClick={() => setChartTf(tf)}
              className={cn(
                "rounded px-2 py-0.5 text-[10px] font-medium",
                session.chartTimeframe === tf
                  ? "bg-tv-blue text-white"
                  : "text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text",
              )}
            >
              {tf}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Closed trades render mode */}
        <div className="flex items-center gap-1 rounded border border-tv-border bg-tv-panel/40 p-0.5 text-[10px]">
          {(["drawings", "arrows", "hidden"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setClosedMode(m)}
              className={cn(
                "rounded px-1.5 py-0.5",
                closedMode === m
                  ? "bg-tv-blue text-white"
                  : "text-tv-text-muted hover:text-tv-text",
              )}
              title={`Trades cerrados: ${m === "drawings" ? "cajas" : m === "arrows" ? "flechas" : "ocultos"}`}
            >
              {m === "drawings" ? "□" : m === "arrows" ? "→" : "✕"}
            </button>
          ))}
        </div>

        {/* Indicadores */}
        <IndicatorsMenu />

        {/* Go To */}
        <GoToMenu currentTimeMs={currentTimeMs} onGoTo={(ms) => setReplayCursor(ms)} />

        <button
          onClick={() => setOrderDialogOpen(true)}
          className="flex items-center gap-1 rounded bg-tv-blue px-3 py-1 text-[11px] font-medium text-white hover:bg-tv-blue/90"
        >
          <Plus className="h-3 w-3" />
          Place Order
        </button>
      </div>

      {/* Chart + Positions Panel (split vertical) */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="relative min-h-0 flex-1">
          <TestingChart
            session={session}
            closedTradesMode={closedMode}
            onCandlesLoaded={setCandles1m}
          />
        </div>
        {/* Minimize/expand tab para el panel de posiciones */}
        <div className="flex shrink-0 items-center justify-between border-t border-tv-border bg-tv-panel/40 px-3 py-0.5">
          <div className="flex items-center gap-3 text-[10px] uppercase tracking-wider text-tv-text-muted">
            <span>Posiciones</span>
            {detail && (
              <span className="font-mono">
                <span className="text-tv-green">{detail.positions.length} abiertas</span>
                {" · "}
                <span>{detail.orders.filter((o) => o.status === "pending").length} pendientes</span>
                {" · "}
                <span className="text-tv-text-muted">{detail.trades.length} cerradas</span>
              </span>
            )}
          </div>
          <button
            onClick={() => setShowPanel((v) => !v)}
            className="rounded px-2 py-0.5 text-[10px] text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
            title={showPanel ? "Minimizar" : "Mostrar"}
          >
            {showPanel ? "▼ Ocultar" : "▲ Mostrar"}
          </button>
        </div>
        {showPanel && (
          <div className="h-48 shrink-0 border-t border-tv-border">
            <PositionsPanel lastPrice={lastPrice} />
          </div>
        )}
      </div>

      {/* Replay controls */}
      <div className="flex items-center gap-2 border-t border-tv-border px-3 py-1.5">
        <button
          onClick={() => setReplayCursor(session.startDate)}
          className="rounded p-1 text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
          title="Volver al inicio"
        >
          <ChevronsLeft className="h-4 w-4" />
        </button>
        <button
          onClick={() => setReplayCursor(currentTimeMs - stepMs)}
          className="rounded p-1 text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
          title="Barra anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          onClick={() => setAutoplay((v) => !v)}
          className={cn(
            "rounded px-2 py-1 text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text",
            autoplay && "bg-tv-blue/10 text-tv-blue",
          )}
          title={autoplay ? "Pausar" : "Reproducir"}
        >
          {autoplay ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <button
          onClick={() => setReplayCursor(currentTimeMs + stepMs)}
          className="rounded p-1 text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
          title="Barra siguiente"
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        {/* Step size (cuánto avanza por click) */}
        <div className="ml-2 flex items-center gap-1">
          <span className="text-[10px] uppercase tracking-wider text-tv-text-muted">
            Step
          </span>
          <select
            value={session.replayStepSize}
            onChange={(e) => setStepSize(parseInt(e.target.value, 10))}
            className="rounded border border-tv-border bg-tv-bg px-1.5 py-0.5 font-mono text-[11px] text-tv-text"
          >
            {STEP_BARS.map((bars) => (
              <option key={bars} value={bars}>
                {stepLabel(bars, TF_MINUTES[session.chartTimeframe])}
                {bars > 1 ? ` (${bars} velas)` : " (1 vela)"}
              </option>
            ))}
          </select>
        </div>

        {/* Speed */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] uppercase tracking-wider text-tv-text-muted">
            Vel.
          </span>
          <select
            value={session.replayIntervalMs}
            onChange={(e) => setIntervalMs(parseInt(e.target.value, 10))}
            className="rounded border border-tv-border bg-tv-bg px-1.5 py-0.5 font-mono text-[11px] text-tv-text"
          >
            {SPEEDS.map((s) => (
              <option key={s.ms} value={s.ms}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {/* Progress */}
        <div className="ml-3 flex flex-1 items-center gap-2">
          <span className="whitespace-nowrap text-[10px] font-mono text-tv-text-muted">
            {cursorDate.toLocaleString("es-AR", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          <div className="h-1 flex-1 overflow-hidden rounded bg-tv-panel">
            <div
              className="h-full bg-tv-blue"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="text-[10px] font-mono text-tv-text-muted">
            {progressPct}%
          </span>
        </div>
      </div>

      {/* Bottom strip: fast buy/sell + ticker */}
      <div className="flex items-center justify-between gap-3 border-t border-tv-border px-3 py-1.5">
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleFastBuy("buy")}
            className="rounded bg-tv-green px-3 py-1 text-[11px] font-medium text-white hover:bg-tv-green/90"
          >
            Buy
          </button>
          <button
            onClick={() => handleFastBuy("sell")}
            className="rounded bg-tv-red px-3 py-1 text-[11px] font-medium text-white hover:bg-tv-red/90"
          >
            Sell
          </button>
          <input
            type="number"
            step="any"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="Quantity"
            className="w-20 rounded border border-tv-border bg-tv-bg px-2 py-1 text-center font-mono text-[11px] text-tv-text"
          />
        </div>

        <div className="flex items-center gap-4 font-mono text-[11px]">
          <span>
            <span className="text-tv-text-muted">Balance</span>{" "}
            <span className="text-tv-text">${session.currentBalance.toFixed(2)}</span>
          </span>
          <span>
            <span className="text-tv-text-muted">Realized</span>{" "}
            <span
              className={cn(
                session.realizedPnL >= 0 ? "text-tv-green" : "text-tv-red",
              )}
            >
              {session.realizedPnL >= 0 ? "+" : ""}${session.realizedPnL.toFixed(2)}
            </span>
          </span>
          <span>
            <span className="text-tv-text-muted">Unrealized</span>{" "}
            <span
              className={cn(
                unrealizedTotal >= 0 ? "text-tv-green" : "text-tv-red",
              )}
            >
              {unrealizedTotal >= 0 ? "+" : ""}${unrealizedTotal.toFixed(2)}
            </span>
          </span>
        </div>
      </div>

      <PlaceOrderDialog
        open={orderDialogOpen}
        onOpenChange={setOrderDialogOpen}
        refPrice={lastPrice || 0}
        currentTimeMs={currentTimeMs}
      />
    </div>
  );
}
