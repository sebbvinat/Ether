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
  ChevronsRight,
  Play,
  Pause,
  Plus,
} from "lucide-react";
import { useTestingStore } from "@/lib/store/testing-store";
import { getInstrument } from "@/lib/instruments";
import { isTypingTarget } from "@/lib/shortcuts";
import { TF_MINUTES } from "@/lib/testing/candles";
import { evaluateRules } from "@/lib/testing/rules";
import { TestingChart, TESTING_TFS } from "@/components/testing/TestingChart";
import { PlaceOrderDialog } from "@/components/testing/PlaceOrderDialog";
import { PositionsPanel } from "@/components/testing/PositionsPanel";
import { GoToMenu } from "@/components/testing/GoToMenu";
import { IndicatorsMenu } from "@/components/testing/IndicatorsMenu";
import { ChecklistGate } from "@/components/testing/ChecklistGate";
import type { ClosedTradesMode } from "@/components/testing/ClosedTradesLayer";
import type { Timeframe } from "@/lib/binance/types";
import { usePriceFlash } from "@/lib/use-price-flash";
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

/**
 * §11 — en modo intrabar la velocidad no se mide en velas sino en MINUTOS DE
 * MERCADO por segundo real. Se guarda en el mismo `replayIntervalMs` que el
 * modo vela (como clave de la opción elegida, no como intervalo) para no
 * sumarle otro campo a la sesión; los valores coinciden con los de SPEEDS,
 * así que volver a modo vela deja una velocidad sensata.
 */
const INTRABAR_SPEEDS: { ms: number; minPerSec: number; label: string }[] = [
  { ms: 2000, minPerSec: 1, label: "1 min/s" },
  { ms: 1000, minPerSec: 5, label: "5 min/s" },
  { ms: 500, minPerSec: 15, label: "15 min/s" },
  { ms: 200, minPerSec: 60, label: "1 h/s" },
];

/** El tick del autoplay intrabar. Suficientemente fino para que el avance se
 *  vea continuo sin ahogar al render. */
const INTRABAR_TICK_MS = 100;

/** Atajos de tecla → herramienta de dibujo (§2). Se emiten como CustomEvent
 *  porque el estado `tool` vive dentro de TestingChart. */
const TOOL_KEYS: Record<string, string> = {
  t: "trendline",
  h: "hline",
  r: "rect",
  f: "fib",
  l: "long",
  s: "short",
  e: "eraser",
  Escape: "cursor",
};

/** §10 — un número monetario que destella cuando cambia. Vive como componente
 *  propio porque la página tiene early-returns antes del ticker y el hook no
 *  puede colgar de ahí. */
function FlashMoney({ value }: { value: number }) {
  const flash = usePriceFlash(value);
  return (
    <span
      className={cn(
        "rounded px-0.5 tabular-nums",
        value >= 0 ? "text-tv-green" : "text-tv-red",
        flash,
      )}
    >
      {value >= 0 ? "+" : ""}${value.toFixed(2)}
    </span>
  );
}

/** §11 — el cierre de la vela del TF que contiene a `ms`. Si el cursor ya
 *  está justo en un cierre, devuelve el de la vela siguiente. */
function nextBarCloseMs(ms: number, tfMinutes: number): number {
  const tfMs = tfMinutes * 60_000;
  return (Math.floor(ms / tfMs) + 1) * tfMs;
}

/** ms → valor de un <input type="datetime-local"> en hora LOCAL. */
function msToLocalInput(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

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
  const setPlaybackMode = useTestingStore((s) => s.setPlaybackMode);
  const setChartTf2 = useTestingStore((s) => s.setChartTimeframe2);
  const openPositionNow = useTestingStore((s) => s.openPositionNow);
  const undoDrawings = useTestingStore((s) => s.undoDrawings);
  const redoDrawings = useTestingStore((s) => s.redoDrawings);

  const [orderDialogOpen, setOrderDialogOpen] = useState(false);
  const [autoplay, setAutoplay] = useState(false);
  const [quantity, setQuantity] = useState("1");
  const [closedMode, setClosedMode] = useState<ClosedTradesMode>("drawings");
  const [candles1m, setCandles1m] = useState<{ time: number }[]>([]);
  const [showPanel, setShowPanel] = useState(true);
  /** §2 — con autoplay activo, pausar tras cada vela para decidir sin apuro. */
  const [pauseEachBar, setPauseEachBar] = useState(false);
  /** §2 — popover del jump-to-date. */
  const [jumpOpen, setJumpOpen] = useState(false);
  /** §12 — cuántos paneles de chart mostrar. */
  const [panes, setPanes] = useState<1 | 2>(1);
  /** §16 — orden esperando a que se complete el checklist. */
  const [pendingSide, setPendingSide] = useState<"buy" | "sell" | null>(null);

  // Asegurarse de que la sesión activa esté seteada (carga IDB)
  useEffect(() => {
    if (session && activeId !== session.id) {
      setActive(session.id);
    }
  }, [session, activeId, setActive]);

  // Step en ms = nº de barras × minutos del TF actual.
  const barsPerStep = session?.replayStepSize ?? 1;
  const tfMinutes = session ? TF_MINUTES[session.chartTimeframe] : 1;
  // §11 — en 1m no hay sub-resolución: el modo intrabar no aplica.
  const intrabar =
    session?.playbackMode === "intrabar" && session?.chartTimeframe !== "1m";
  // En modo intrabar el step es de un minuto; en modo vela, de N velas.
  const stepMs = session
    ? intrabar
      ? 60_000
      : barsPerStep * tfMinutes * 60_000
    : 60_000;

  // Refs frescos para el autoplay (closures)
  const cursorRef = useRef(session?.replayCursorMs ?? session?.startDate ?? 0);
  cursorRef.current = session?.replayCursorMs ?? session?.startDate ?? 0;
  const endRef = useRef(session?.endDate ?? 0);
  endRef.current = session?.endDate ?? 0;
  const stepMsRef = useRef(stepMs);
  stepMsRef.current = stepMs;
  const pauseEachBarRef = useRef(pauseEachBar);
  pauseEachBarRef.current = pauseEachBar;

  /** §11 — minutos que quedaron a medias entre ticks del autoplay intrabar.
   *  Sin esto, 1 min/s con ticks de 100ms redondearía a cero y no avanzaría. */
  const intrabarRemainderRef = useRef(0);

  useEffect(() => {
    if (!autoplay || !session) return;
    const intervalMs = session.replayIntervalMs ?? 1000;

    if (intrabar) {
      const minPerSec =
        INTRABAR_SPEEDS.find((s) => s.ms === intervalMs)?.minPerSec ?? 5;
      const minPerTick = (minPerSec * INTRABAR_TICK_MS) / 1000;
      const tfMs = tfMinutes * 60_000;
      intrabarRemainderRef.current = 0;
      const interval = setInterval(() => {
        intrabarRemainderRef.current += minPerTick;
        const whole = Math.floor(intrabarRemainderRef.current);
        if (whole < 1) return; // todavía no juntamos un minuto entero
        intrabarRemainderRef.current -= whole;
        const prev = cursorRef.current;
        const next = prev + whole * 60_000;
        if (next >= endRef.current) {
          setAutoplay(false);
          setReplayCursor(endRef.current);
          return;
        }
        setReplayCursor(next);
        // "Pausar c/vela" en intrabar = pausar al cerrar la vela del TF.
        if (pauseEachBarRef.current && Math.floor(next / tfMs) > Math.floor(prev / tfMs)) {
          setAutoplay(false);
        }
      }, INTRABAR_TICK_MS);
      return () => clearInterval(interval);
    }

    const interval = setInterval(() => {
      const next = cursorRef.current + stepMsRef.current;
      if (next >= endRef.current) {
        setAutoplay(false);
        setReplayCursor(endRef.current);
        return;
      }
      setReplayCursor(next);
      // §2 — "Pausar c/vela": avanza una y frena, para decidir bar-by-bar.
      if (pauseEachBarRef.current) setAutoplay(false);
    }, intervalMs);
    return () => clearInterval(interval);
  }, [autoplay, session, setReplayCursor, intrabar, tfMinutes]);

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

  // §16 — límites diarios. El "día" es el del cursor de replay, no el de hoy.
  const checklistItems = detail?.checklistTemplate ?? [];
  const checklistRequired =
    (session?.rules?.enforceChecklist ?? false) && checklistItems.length > 0;
  const verdict = useMemo(
    () => evaluateRules({ rules: session?.rules }, detail?.trades ?? [], currentTimeMs),
    [session?.rules, detail?.trades, currentTimeMs],
  );

  // §2 — atajos de teclado del replay + selección de herramienta.
  // Nota: L y S quedan tomadas por las tools long/short, así que los atajos
  // de Go To (Y/Z/I/L/N estilo FXReplay) no se implementan — Go To va por menú.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(document.activeElement)) return;
      if (!session) return;
      // §1 — undo/redo de dibujos (Ctrl+Z · Ctrl+Shift+Z · Ctrl+Y).
      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        const lk = e.key.toLowerCase();
        if (lk === "z") {
          e.preventDefault();
          if (e.shiftKey) void redoDrawings();
          else void undoDrawings();
          return;
        }
        if (lk === "y") {
          e.preventDefault();
          void redoDrawings();
          return;
        }
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key;
      if (k === " ") {
        e.preventDefault();
        setAutoplay((v) => !v);
        return;
      }
      if (k === "ArrowRight") {
        e.preventDefault();
        // §11 — en intrabar, Shift salta al cierre de la vela en curso en vez
        // de avanzar 10 minutos sueltos.
        setReplayCursor(
          intrabar && e.shiftKey
            ? nextBarCloseMs(currentTimeMs, tfMinutes)
            : currentTimeMs + (e.shiftKey ? 10 : 1) * stepMs,
        );
        return;
      }
      if (k === "ArrowLeft") {
        e.preventDefault();
        setReplayCursor(currentTimeMs - (e.shiftKey ? 10 : 1) * stepMs);
        return;
      }
      if (k === "Home") {
        e.preventDefault();
        setReplayCursor(session.startDate);
        return;
      }
      if (k === "End") {
        e.preventDefault();
        setReplayCursor(session.endDate);
        return;
      }
      const tool = TOOL_KEYS[k.length === 1 ? k.toLowerCase() : k];
      if (tool) {
        // Esc además cierra el popover de jump-to-date.
        if (k === "Escape") setJumpOpen(false);
        window.dispatchEvent(
          new CustomEvent("ether-testing:set-tool", { detail: { tool } }),
        );
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    session,
    currentTimeMs,
    stepMs,
    setReplayCursor,
    intrabar,
    tfMinutes,
    undoDrawings,
    redoDrawings,
  ]);

  const submitFastBuy = useCallback(
    async (side: "buy" | "sell", notes?: string) => {
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
        notes,
        openedAtMs: currentTimeMs,
      });
    },
    [session, quantity, lastPrice, openPositionNow, currentTimeMs],
  );

  const handleFastBuy = useCallback(
    (side: "buy" | "sell") => {
      // §16 — con el checklist exigido, la orden espera a que se complete.
      if (checklistRequired) {
        setPendingSide(side);
        return;
      }
      void submitFastBuy(side);
    },
    [checklistRequired, submitFastBuy],
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

        {/* §12 — layout de paneles. Con 2, el segundo muestra otro TF del
            mismo símbolo y avanza con el mismo cursor. */}
        <div className="flex items-center overflow-hidden rounded border border-tv-border">
          {([1, 2] as const).map((n) => (
            <button
              key={n}
              onClick={() => setPanes(n)}
              title={n === 1 ? "Un chart" : "Dos charts (multi-timeframe)"}
              className={cn(
                "px-2 py-0.5 text-[10px]",
                panes === n
                  ? "bg-tv-blue/15 text-tv-blue"
                  : "text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text",
              )}
            >
              {n === 1 ? "▭" : "▯▯"}
            </button>
          ))}
        </div>

        {/* Indicadores */}
        <IndicatorsMenu />

        {/* Go To */}
        <GoToMenu currentTimeMs={currentTimeMs} onGoTo={(ms) => setReplayCursor(ms)} />

        <button
          onClick={() => setOrderDialogOpen(true)}
          disabled={!!verdict.blocked}
          title={verdict.blockedMessage}
          className="flex items-center gap-1 rounded bg-tv-blue px-3 py-1 text-[11px] font-medium text-white hover:bg-tv-blue/90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus className="h-3 w-3" />
          Place Order
        </button>
      </div>

      {/* §16 — el bloqueo sólo frena órdenes NUEVAS: cerrar y modificar
          posiciones abiertas siempre se puede. */}
      {verdict.blocked && (
        <div className="shrink-0 border-b border-tv-red/40 bg-tv-red/10 px-3 py-1 text-center text-[11px] font-medium text-tv-red">
          {verdict.blockedMessage} · podés cerrar o ajustar lo que ya está abierto
        </div>
      )}
      {!verdict.blocked && verdict.targetReached && (
        <div className="shrink-0 border-b border-tv-green/40 bg-tv-green/10 px-3 py-1 text-center text-[11px] font-medium text-tv-green">
          🎯 Objetivo diario alcanzado (+${verdict.stats.pnl.toFixed(2)})
        </div>
      )}

      {/* Chart + Positions Panel (split vertical) */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1">
          <div className="relative min-h-0 flex-1">
            <TestingChart
              session={session}
              closedTradesMode={closedMode}
              onCandlesLoaded={setCandles1m}
            />
          </div>
          {panes === 2 && (
            <div className="relative min-h-0 flex-1 border-l border-tv-border">
              {/* engineEnabled={false}: el engine corre sólo en el primario.
                  Con los dos procesando las mismas velas, cada fill se
                  aplicaría dos veces. */}
              <TestingChart
                session={session}
                closedTradesMode={closedMode}
                tfOverride={session.chartTimeframe2 ?? "1m"}
                onTfChange={(tf) => setChartTf2(tf)}
                engineEnabled={false}
                showToolbar={false}
              />
            </div>
          )}
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
            <PositionsPanel lastPrice={lastPrice} currentTimeMs={currentTimeMs} />
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
        <button
          onClick={() => setReplayCursor(session.endDate)}
          className="rounded p-1 text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
          title="Ir al final (precio actual)"
        >
          <ChevronsRight className="h-4 w-4" />
        </button>

        {/* §11 — resolución del replay. En 1m no hay sub-resolución que
            mostrar, así que el toggle se apaga. */}
        <div
          className="ml-2 flex items-center overflow-hidden rounded border border-tv-border"
          title={
            session.chartTimeframe === "1m"
              ? "El TF ya es 1m: no hay sub-resolución que reproducir"
              : "Velas: avanza de vela en vela · Ticks: la vela se forma minuto a minuto"
          }
        >
          {(["bar", "intrabar"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setPlaybackMode(mode)}
              disabled={session.chartTimeframe === "1m"}
              className={cn(
                "px-2 py-0.5 text-[10px]",
                (session.playbackMode ?? "bar") === mode
                  ? "bg-tv-blue/15 text-tv-blue"
                  : "text-tv-text-muted enabled:hover:bg-tv-panel-hover enabled:hover:text-tv-text",
                "disabled:cursor-not-allowed disabled:opacity-40",
              )}
            >
              {mode === "bar" ? "Velas" : "Ticks"}
            </button>
          ))}
        </div>

        {/* Step size (cuánto avanza por click) */}
        <div className="ml-2 flex items-center gap-1">
          <span className="text-[10px] uppercase tracking-wider text-tv-text-muted">
            Step
          </span>
          <select
            value={intrabar ? 1 : session.replayStepSize}
            disabled={intrabar}
            title={intrabar ? "En modo Ticks el step es de 1 minuto" : undefined}
            onChange={(e) => setStepSize(parseInt(e.target.value, 10))}
            className="rounded border border-tv-border bg-tv-bg px-1.5 py-0.5 font-mono text-[11px] text-tv-text disabled:cursor-not-allowed disabled:opacity-40"
          >
            {intrabar ? (
              <option value={1}>1 min</option>
            ) : (
              STEP_BARS.map((bars) => (
                <option key={bars} value={bars}>
                  {stepLabel(bars, TF_MINUTES[session.chartTimeframe])}
                  {bars > 1 ? ` (${bars} velas)` : " (1 vela)"}
                </option>
              ))
            )}
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
            {(intrabar ? INTRABAR_SPEEDS : SPEEDS).map((s) => (
              <option key={s.ms} value={s.ms}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {/* Pausar tras cada vela (§2) */}
        <label
          className="flex cursor-pointer items-center gap-1 text-[10px] text-tv-text-muted hover:text-tv-text"
          title="Con play activo, avanza una vela y pausa"
        >
          <input
            type="checkbox"
            checked={pauseEachBar}
            onChange={(e) => setPauseEachBar(e.target.checked)}
            className="h-3 w-3 accent-tv-blue"
          />
          Pausar c/vela
        </label>

        {/* Progress + jump-to-date (§2) */}
        <div className="relative ml-3 flex flex-1 items-center gap-2">
          <button
            onClick={() => setJumpOpen((v) => !v)}
            className={cn(
              "whitespace-nowrap rounded px-1.5 py-0.5 font-mono text-[10px] hover:bg-tv-panel-hover hover:text-tv-text",
              jumpOpen ? "bg-tv-panel-hover text-tv-text" : "text-tv-text-muted",
            )}
            title="Saltar a una fecha"
          >
            {cursorDate.toLocaleString("es-AR", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </button>
          {jumpOpen && (
            <>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => setJumpOpen(false)}
                className="fixed inset-0 z-10 cursor-default"
              />
              <div className="absolute bottom-full left-0 z-20 mb-1 rounded border border-tv-border bg-tv-panel p-2 shadow-lg">
                <div className="mb-1 text-[9px] uppercase tracking-wider text-tv-text-muted">
                  Saltar a
                </div>
                <input
                  type="datetime-local"
                  value={msToLocalInput(currentTimeMs)}
                  min={msToLocalInput(session.startDate)}
                  max={msToLocalInput(session.endDate)}
                  onChange={(e) => {
                    const ms = new Date(e.target.value).getTime();
                    if (Number.isFinite(ms)) {
                      setReplayCursor(ms); // el store clampea al rango
                      setJumpOpen(false);
                    }
                  }}
                  className="rounded border border-tv-border bg-tv-bg px-2 py-1 font-mono text-[11px] text-tv-text"
                />
              </div>
            </>
          )}
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
            disabled={!!verdict.blocked}
            title={verdict.blockedMessage}
            className="rounded bg-tv-green px-3 py-1 text-[11px] font-medium text-white hover:bg-tv-green/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Buy
          </button>
          <button
            onClick={() => handleFastBuy("sell")}
            disabled={!!verdict.blocked}
            title={verdict.blockedMessage}
            className="rounded bg-tv-red px-3 py-1 text-[11px] font-medium text-white hover:bg-tv-red/90 disabled:cursor-not-allowed disabled:opacity-40"
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
            <FlashMoney value={session.realizedPnL} />
          </span>
          <span>
            <span className="text-tv-text-muted">Unrealized</span>{" "}
            <FlashMoney value={unrealizedTotal} />
          </span>
        </div>
      </div>

      <ChecklistGate
        open={pendingSide !== null}
        items={checklistItems}
        onCancel={() => setPendingSide(null)}
        onConfirm={(notes) => {
          const side = pendingSide;
          setPendingSide(null);
          if (side) void submitFastBuy(side, notes);
        }}
      />

      <PlaceOrderDialog
        open={orderDialogOpen}
        onOpenChange={setOrderDialogOpen}
        refPrice={lastPrice || 0}
        currentTimeMs={currentTimeMs}
        sessionBalance={session.currentBalance}
        defaultRiskPct={session.defaultRiskPct}
      />
    </div>
  );
}
