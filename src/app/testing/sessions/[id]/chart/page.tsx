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
import { TestingChart, TESTING_TFS } from "@/components/testing/TestingChart";
import { PlaceOrderDialog } from "@/components/testing/PlaceOrderDialog";
import { PositionsPanel } from "@/components/testing/PositionsPanel";
import { GoToMenu } from "@/components/testing/GoToMenu";
import type { ClosedTradesMode } from "@/components/testing/ClosedTradesLayer";
import type { Timeframe } from "@/lib/binance/types";
import { cn } from "@/lib/utils";

interface Props {
  params: Promise<{ id: string }>;
}

const STEP_SIZES: { value: number; label: string }[] = [
  { value: 1, label: "1m" },
  { value: 5, label: "5m" },
  { value: 15, label: "15m" },
  { value: 30, label: "30m" },
  { value: 60, label: "1h" },
];

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
  const setReplayIndex = useTestingStore((s) => s.setReplayIndex);
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

  // Autoplay tick — usa replayIntervalMs de la sesión
  const replayIndexRef = useRef(session?.replayIndex ?? 0);
  replayIndexRef.current = session?.replayIndex ?? 0;
  const replayTotalRef = useRef(session?.replayTotal ?? 0);
  replayTotalRef.current = session?.replayTotal ?? 0;
  const stepSizeRef = useRef(session?.replayStepSize ?? 1);
  stepSizeRef.current = session?.replayStepSize ?? 1;

  useEffect(() => {
    if (!autoplay || !session) return;
    const intervalMs = session.replayIntervalMs ?? 1000;
    const interval = setInterval(() => {
      const nextIdx = replayIndexRef.current + stepSizeRef.current;
      if (nextIdx >= replayTotalRef.current - 1) {
        setAutoplay(false);
        setReplayIndex(replayTotalRef.current - 1);
        return;
      }
      setReplayIndex(nextIdx);
    }, intervalMs);
    return () => clearInterval(interval);
  }, [autoplay, session, setReplayIndex]);

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

  // Timestamp (ms) de la vela actual del replay — cursorTime = start + idx*60000.
  const currentTimeMs = useMemo(() => {
    if (!session) return Date.now();
    return session.startDate + session.replayIndex * 60_000;
  }, [session]);

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
  const progressPct =
    session.replayTotal > 0
      ? Math.round(((session.replayIndex + 1) / session.replayTotal) * 100)
      : 0;

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

        {/* Go To */}
        <GoToMenu
          currentTimeMs={currentTimeMs}
          startDateMs={session.startDate}
          candles1m={candles1m}
          onGoTo={(idx) => setReplayIndex(idx)}
        />

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
        {showPanel && (
          <div className="h-48 shrink-0 border-t border-tv-border">
            <PositionsPanel lastPrice={lastPrice} />
          </div>
        )}
      </div>

      {/* Replay controls */}
      <div className="flex items-center gap-2 border-t border-tv-border px-3 py-1.5">
        <button
          onClick={() => setReplayIndex(0)}
          className="rounded p-1 text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
          title="Volver al inicio"
        >
          <ChevronsLeft className="h-4 w-4" />
        </button>
        <button
          onClick={() => setReplayIndex(session.replayIndex - session.replayStepSize)}
          className="rounded p-1 text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
          title="Vela anterior"
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
          onClick={() =>
            setReplayIndex(session.replayIndex + session.replayStepSize)
          }
          className="rounded p-1 text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
          title="Vela siguiente"
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        {/* Step size */}
        <div className="ml-2 flex items-center gap-1">
          <span className="text-[10px] uppercase tracking-wider text-tv-text-muted">
            Step
          </span>
          <select
            value={session.replayStepSize}
            onChange={(e) => setStepSize(parseInt(e.target.value, 10))}
            className="rounded border border-tv-border bg-tv-bg px-1.5 py-0.5 font-mono text-[11px] text-tv-text"
          >
            {STEP_SIZES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
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
          <span className="text-[10px] font-mono text-tv-text-muted">
            {session.replayIndex + 1} / {session.replayTotal || "—"}
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
