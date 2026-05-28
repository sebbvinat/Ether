"use client";

/**
 * Wave 18 — TestingChart.
 *
 * Chart self-contained para una sesión de backtest. NO comparte código con
 * PriceChart (mantiene `/` intacto). Stack:
 *
 *  - LazyCandleStore: descarga 1m alrededor del cursor, prefetch en background.
 *  - aggregateCandles: agrega 1m → TF actual (1m/5m/15m/1h/4h/1d) en cliente.
 *  - lightweight-charts v5: candles + volume + EMA20/50/200.
 *  - PositionOverlay SVG: posiciones abiertas (entry/SL/TP) sobre el chart.
 *  - Engine integration: cada step llama stepEngine() y persiste a IDB.
 *
 * Composición de la página:
 *  - Toolbar arriba (TF selector + Place Order + Go To placeholder)
 *  - Chart (esto)
 *  - Replay controls (play/pause, step, speed)
 *  - Account ticker (Balance / Realized / Unrealized)
 *  - Bottom left: Buy/Sell + Quantity rápido
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle, Timeframe } from "@/lib/binance/types";
import { ema } from "@/lib/indicators";
import { LazyCandleStore, aggregateCandles, TESTING_TFS } from "@/lib/testing/candles";
import { stepEngine } from "@/lib/testing/engine";
import {
  useTestingStore,
  type SessionMeta,
  type Position,
} from "@/lib/store/testing-store";
import { PositionOverlay } from "./PositionOverlay";
import { ClosedTradesLayer, type ClosedTradesMode } from "./ClosedTradesLayer";

const TV_COLORS = {
  bg: "#131722",
  text: "#d1d4dc",
  textMuted: "#787b86",
  green: "#26a69a",
  red: "#ef5350",
  blue: "#2962ff",
  yellow: "#ffb74d",
  purple: "#ab47bc",
  border: "#2a2e39",
  grid: "#1e222d",
};

/** Minutos de historia a cargar ANTES del startDate para tener contexto.
 *  4000 min ≈ 2.7 días de 1m = 266 velas de 15m / 66 de 1h. Balance entre
 *  contexto suficiente y velocidad de carga (~4 requests). El prefetch
 *  extiende sobre la marcha al avanzar el replay. */
const HISTORY_MIN = 4000;
/** Minutos a precargar hacia adelante del cursor (buffer de replay). */
const FUTURE_MIN = 2000;

interface Props {
  session: SessionMeta;
  /** Modo de render de trades cerrados sobre el chart. */
  closedTradesMode?: ClosedTradesMode;
  /** Callback con las velas 1m disponibles (para Go To y otras integraciones). */
  onCandlesLoaded?: (candles1m: { time: number }[]) => void;
}

interface ContainerSize {
  width: number;
  height: number;
}

export function TestingChart({ session, closedTradesMode = "drawings", onCandlesLoaded }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSerRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSerRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const ema20Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const ema50Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const ema200Ref = useRef<ISeriesApi<"Line"> | null>(null);

  const candleStoreRef = useRef<LazyCandleStore | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [size, setSize] = useState<ContainerSize>({ width: 0, height: 0 });
  const [, setRenderTick] = useState(0);

  const detail = useTestingStore((s) => s.activeDetail);
  const applyEngineState = useTestingStore((s) => s.applyEngineState);
  const setReplayTotal = useTestingStore((s) => s.setReplayTotal);

  // Refs siempre frescos para los handlers que viven en closures
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const detailRef = useRef(detail);
  detailRef.current = detail;

  // ── 1. Inicializar el chart UNA VEZ ──────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: TV_COLORS.bg },
        textColor: TV_COLORS.text,
        fontFamily: "var(--font-sans), Inter, system-ui, sans-serif",
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: TV_COLORS.grid },
        horzLines: { color: TV_COLORS.grid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: TV_COLORS.textMuted, width: 1, style: 3 },
        horzLine: { color: TV_COLORS.textMuted, width: 1, style: 3 },
      },
      rightPriceScale: {
        borderColor: TV_COLORS.border,
        textColor: TV_COLORS.textMuted,
      },
      timeScale: {
        borderColor: TV_COLORS.border,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 12,
        barSpacing: 6,
      },
      autoSize: true,
    });
    chartRef.current = chart;

    candleSerRef.current = chart.addSeries(CandlestickSeries, {
      upColor: TV_COLORS.green,
      downColor: TV_COLORS.red,
      borderUpColor: TV_COLORS.green,
      borderDownColor: TV_COLORS.red,
      wickUpColor: TV_COLORS.green,
      wickDownColor: TV_COLORS.red,
      priceFormat: { type: "price", precision: 2, minMove: 0.01 },
    });

    volumeSerRef.current = chart.addSeries(HistogramSeries, {
      priceScaleId: "volume",
      priceFormat: { type: "volume" },
    });
    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });

    ema20Ref.current = chart.addSeries(LineSeries, {
      color: TV_COLORS.yellow,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    ema50Ref.current = chart.addSeries(LineSeries, {
      color: TV_COLORS.blue,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    ema200Ref.current = chart.addSeries(LineSeries, {
      color: TV_COLORS.purple,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    // Tracking de container size para overlay coordinates
    const obs = new ResizeObserver(() => {
      const el = containerRef.current;
      if (!el) return;
      setSize({ width: el.clientWidth, height: el.clientHeight });
    });
    obs.observe(containerRef.current);

    // CRÍTICO: re-render de los overlays (posiciones, trades) cuando el usuario
    // panea/zoomea. Sin esto las líneas quedan fijas mientras las velas se mueven
    // ("el trade se mueve con la cámara"). Forzamos render en cada cambio de rango.
    const onRangeChange = () => setRenderTick((t) => t + 1);
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRangeChange);

    return () => {
      obs.disconnect();
      try {
        chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRangeChange);
      } catch {}
      try {
        chart.remove();
      } catch {}
      chartRef.current = null;
      candleSerRef.current = null;
      volumeSerRef.current = null;
      ema20Ref.current = null;
      ema50Ref.current = null;
      ema200Ref.current = null;
    };
  }, []);

  // ── 2. Cargar candle store + primera ventana ────────────────────────────
  // El cursor del replay es TIEMPO: cursorTimeMs = startDate + replayIndex*60000.
  // El store carga desde (startDate − HISTORY) para tener pasado visible, y el
  // chart muestra TODAS las velas con time ≤ cursorTimeMs.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    // Lower bound del store: HISTORY_MIN antes del startDate (clamp dentro del store).
    const dataStartMs = session.startDate - HISTORY_MIN * 60_000;
    const store = new LazyCandleStore(
      session.symbol,
      dataStartMs,
      session.endDate,
    );
    candleStoreRef.current = store;
    // Cargar historia (HISTORY antes) + buffer hacia adelante.
    store
      .ensureLoaded(session.startDate, HISTORY_MIN, FUTURE_MIN)
      .then(() => {
        if (cancelled) return;
        // replayTotal = minutos totales del rango de replay (start→end).
        const totalMin = Math.max(
          1,
          Math.floor((session.endDate - session.startDate) / 60_000),
        );
        setReplayTotal(totalMin);
        onCandlesLoaded?.(store.all);
        setRenderTick((t) => t + 1);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setLoadError((e as Error).message ?? "Error cargando velas");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id, session.symbol, session.startDate, session.endDate]);

  // ── 2b. Prefetch: cuando el cursor se acerca al borde cargado, traer más ──
  useEffect(() => {
    if (loading) return;
    const store = candleStoreRef.current;
    if (!store) return;
    const cursorTimeMs = session.startDate + session.replayIndex * 60_000;
    const lastLoaded = store.all[store.all.length - 1];
    if (!lastLoaded) return;
    // Si el cursor está a menos de 500 min del borde cargado, traer más.
    if (cursorTimeMs + 500 * 60_000 > lastLoaded.time * 1000) {
      void store.ensureLoaded(cursorTimeMs, 100, FUTURE_MIN).then(() => {
        onCandlesLoaded?.(store.all);
        setRenderTick((t) => t + 1);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.replayIndex, loading]);

  // ── 3. Renderizar las velas + indicadores cuando cambia replayIndex o TF ─
  useEffect(() => {
    if (loading) return;
    const store = candleStoreRef.current;
    const candle = candleSerRef.current;
    const vol = volumeSerRef.current;
    const e20 = ema20Ref.current;
    const e50 = ema50Ref.current;
    const e200 = ema200Ref.current;
    if (!store || !candle || !vol || !e20 || !e50 || !e200) return;

    // Cursor del replay en tiempo (seg UNIX).
    const cursorSec = (session.startDate + session.replayIndex * 60_000) / 1000;
    // Todas las velas 1m hasta el cursor (incluye la historia anterior al start).
    const view1m = store.all.filter((c) => c.time <= cursorSec);
    // Agregar al TF actual
    const view = aggregateCandles(view1m, session.chartTimeframe);
    if (view.length === 0) return;

    candle.setData(
      view.map((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );
    vol.setData(
      view.map((c) => ({
        time: c.time as UTCTimestamp,
        value: c.volume,
        color: c.close >= c.open ? "rgba(38,166,154,0.4)" : "rgba(239,83,80,0.4)",
      })),
    );

    // EMAs (sobre el TF actual — más realista que sobre 1m)
    const e20Pts = ema(view, 20);
    const e50Pts = ema(view, 50);
    const e200Pts = ema(view, 200);
    e20.setData(e20Pts.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
    e50.setData(e50Pts.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
    e200.setData(e200Pts.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
    // Disparar lastPrice para el resto de la UI (fast buy/sell ref price)
    const lastClose = view[view.length - 1]?.close;
    if (lastClose) {
      window.dispatchEvent(
        new CustomEvent("ether-testing:last-price", { detail: { price: lastClose } }),
      );
    }
    setRenderTick((t) => t + 1);
  }, [loading, session.replayIndex, session.chartTimeframe]);

  // ── 4. Step engine cuando avanza el cursor (por TIEMPO) ──────────────────
  // Procesa las velas 1m entre el último cursor procesado y el actual.
  const lastProcessedSecRef = useRef<number>(-1);
  useEffect(() => {
    if (loading) return;
    const store = candleStoreRef.current;
    const det = detailRef.current;
    const sess = sessionRef.current;
    if (!store || !det) return;
    const cursorSec = (sess.startDate + sess.replayIndex * 60_000) / 1000;
    // Primera pasada: inicializamos sin procesar el pasado (la historia previa
    // al start no genera trades — el usuario aún no operó).
    if (lastProcessedSecRef.current < 0) {
      lastProcessedSecRef.current = cursorSec;
      return;
    }
    if (cursorSec < lastProcessedSecRef.current) {
      // Replay rewound — no reprocesamos hacia atrás.
      lastProcessedSecRef.current = cursorSec;
      return;
    }
    const prevSec = lastProcessedSecRef.current;
    const newCandles = store.all.filter(
      (c) => c.time > prevSec && c.time <= cursorSec,
    );
    let state = {
      orders: det.orders,
      positions: det.positions,
      trades: det.trades,
      balance: sess.currentBalance,
      realizedPnL: sess.realizedPnL,
    };
    let changed = false;
    for (const c of newCandles) {
      const next = stepEngine(state, c, { sessionId: sess.id });
      if (
        next.trades.length !== state.trades.length ||
        next.positions.length !== state.positions.length ||
        next.orders.some((o, idx) => o.status !== state.orders[idx]?.status)
      ) {
        changed = true;
      }
      state = next;
    }
    // Actualizar unrealized PnL al cierre de la vela del cursor.
    const lastClose = newCandles[newCandles.length - 1]?.close
      ?? store.all.filter((c) => c.time <= cursorSec).at(-1)?.close;
    if (lastClose != null && state.positions.length > 0) {
      state.positions = state.positions.map((p) => {
        const dir = p.side === "buy" ? 1 : -1;
        return { ...p, unrealizedPnL: (lastClose - p.entry) * p.size * dir };
      });
      changed = true;
    }
    if (changed) {
      applyEngineState({
        orders: state.orders,
        positions: state.positions,
        trades: state.trades,
        realizedPnL: state.realizedPnL,
      });
    }
    lastProcessedSecRef.current = cursorSec;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.replayIndex, loading]);

  // NOTA: las órdenes MARKET se llenan al instante vía openPositionNow (store),
  // sin pasar por el engine. Sólo limit/stop quedan pending y se resuelven al
  // avanzar el replay (effect #4). Por eso ya no hace falta forzar reprocesos.

  // ── 5. Helpers para overlays ─────────────────────────────────────────────
  function priceToY(price: number): number | null {
    const ser = candleSerRef.current;
    if (!ser) return null;
    const y = ser.priceToCoordinate(price);
    return y ?? null;
  }

  function timeToX(time: number): number | null {
    const chart = chartRef.current;
    if (!chart) return null;
    const x = chart.timeScale().timeToCoordinate(time as UTCTimestamp);
    return x ?? null;
  }

  // ── 6. Render ────────────────────────────────────────────────────────────
  const openPositions: Position[] = detail?.positions ?? [];
  const closedTrades = detail?.trades ?? [];

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {/* Layer con trades cerrados (debajo de open positions) */}
      <ClosedTradesLayer
        trades={closedTrades}
        timeToX={timeToX}
        priceToY={priceToY}
        width={size.width}
        height={size.height}
        mode={closedTradesMode}
      />
      {/* Overlay con posiciones abiertas */}
      <PositionOverlay
        positions={openPositions}
        priceToY={priceToY}
        width={size.width}
        height={size.height}
      />
      {/* Loading / error states */}
      {loading && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-tv-bg/70 backdrop-blur-sm">
          <div className="text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-tv-text-muted border-t-tv-blue" />
            <p className="mt-3 text-[12px] text-tv-text-muted">
              Descargando velas desde {new Date(session.startDate).toLocaleDateString()}…
            </p>
          </div>
        </div>
      )}
      {loadError && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-tv-bg/80">
          <div className="rounded border border-tv-red/40 bg-tv-red/10 px-4 py-3 text-[12px] text-tv-red">
            Error: {loadError}
          </div>
        </div>
      )}
    </div>
  );
}

/** Helpers reexportados para que la page los use. */
export { TESTING_TFS };
