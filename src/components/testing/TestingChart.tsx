"use client";

/**
 * Wave 18.5 — TestingChart reescrito con cursor BASADO EN TIEMPO.
 *
 * Modelo correcto (estilo FXReplay):
 *  - La sesión tiene [startDate, endDate]. El cursor `replayCursorMs` arranca
 *    en startDate y avanza de a 1 barra del TF actual (lo maneja la page).
 *  - El chart carga 1m desde MUCHO antes de startDate (historia de contexto)
 *    hasta el cursor + buffer. Lazy: trae chunks alrededor del cursor.
 *  - Muestra TODA la historia con time ≤ cursor (cientos de velas), no 1.
 *  - El engine procesa cada vela 1m entre el cursor previo y el nuevo.
 *  - Overlays (posiciones/trades) se re-renderizan en cada pan/zoom para no
 *    "quedarse pegados" cuando se mueve la cámara.
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
import { ema } from "@/lib/indicators";
import { LazyCandleStore, TESTING_TFS, TF_MINUTES } from "@/lib/testing/candles";
import { stepEngine } from "@/lib/testing/engine";
import {
  useTestingStore,
  type SessionMeta,
  type Position,
} from "@/lib/store/testing-store";
import { PositionOverlay } from "./PositionOverlay";
import { ClosedTradesLayer, type ClosedTradesMode } from "./ClosedTradesLayer";

const TV = {
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

interface Props {
  session: SessionMeta;
  closedTradesMode?: ClosedTradesMode;
  /** Callback con velas 1m disponibles (Go To las usa). */
  onCandlesLoaded?: (candles1m: { time: number }[]) => void;
}

export function TestingChart({
  session,
  closedTradesMode = "drawings",
  onCandlesLoaded,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSerRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volSerRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const e20Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const e50Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const e200Ref = useRef<ISeriesApi<"Line"> | null>(null);

  const storeRef = useRef<LazyCandleStore | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [renderTick, setRenderTick] = useState(0);
  const didFitRef = useRef(false);

  const detail = useTestingStore((s) => s.activeDetail);
  const applyEngineState = useTestingStore((s) => s.applyEngineState);

  const cursorMs = session.replayCursorMs ?? session.startDate;
  const chartTf = session.chartTimeframe ?? "15m";

  const sessionRef = useRef(session);
  sessionRef.current = session;
  const detailRef = useRef(detail);
  detailRef.current = detail;

  // ── 1. Crear chart una vez ───────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: TV.bg },
        textColor: TV.text,
        fontFamily: "var(--font-sans), Inter, system-ui, sans-serif",
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: TV.grid },
        horzLines: { color: TV.grid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: TV.textMuted, width: 1, style: 3 },
        horzLine: { color: TV.textMuted, width: 1, style: 3 },
      },
      rightPriceScale: { borderColor: TV.border, textColor: TV.textMuted },
      timeScale: {
        borderColor: TV.border,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 12,
        barSpacing: 7,
      },
      autoSize: true,
    });
    chartRef.current = chart;

    candleSerRef.current = chart.addSeries(CandlestickSeries, {
      upColor: TV.green,
      downColor: TV.red,
      borderUpColor: TV.green,
      borderDownColor: TV.red,
      wickUpColor: TV.green,
      wickDownColor: TV.red,
    });
    volSerRef.current = chart.addSeries(HistogramSeries, {
      priceScaleId: "volume",
      priceFormat: { type: "volume" },
    });
    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });
    e20Ref.current = chart.addSeries(LineSeries, {
      color: TV.yellow,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    e50Ref.current = chart.addSeries(LineSeries, {
      color: TV.blue,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    e200Ref.current = chart.addSeries(LineSeries, {
      color: TV.purple,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    // Re-render overlays en cada pan/zoom (FIX: el trade ya no "se mueve" solo)
    const bump = () => setRenderTick((t) => t + 1);
    chart.timeScale().subscribeVisibleLogicalRangeChange(bump);
    chart.subscribeCrosshairMove(bump);

    const obs = new ResizeObserver(() => {
      const el = containerRef.current;
      if (!el) return;
      setSize({ width: el.clientWidth, height: el.clientHeight });
      bump();
    });
    obs.observe(containerRef.current);

    return () => {
      obs.disconnect();
      try {
        chart.timeScale().unsubscribeVisibleLogicalRangeChange(bump);
        chart.unsubscribeCrosshairMove(bump);
        chart.remove();
      } catch {}
      chartRef.current = null;
      candleSerRef.current = null;
      volSerRef.current = null;
      e20Ref.current = null;
      e50Ref.current = null;
      e200Ref.current = null;
    };
  }, []);

  // ── 2. Cargar candle store (con HISTORIA antes del startDate) ─────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadErr(null);
    didFitRef.current = false;
    const store = new LazyCandleStore(
      session.symbol,
      chartTf,
      // El "inicio cargable" es ~500 barras antes del startDate (contexto).
      session.startDate - 500 * TF_MINUTES[chartTf] * 60_000,
      session.endDate,
    );
    storeRef.current = store;
    // 500 barras de historia + 200 de lookahead = 1 request en la mayoría de TFs.
    store
      .ensureLoaded(session.startDate, 500, 200)
      .then(() => {
        if (cancelled) return;
        onCandlesLoaded?.(store.all);
        setLoading(false);
        setRenderTick((t) => t + 1);
      })
      .catch((e) => {
        if (cancelled) return;
        setLoadErr((e as Error).message ?? "Error cargando velas");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id, session.symbol, session.startDate, session.endDate, chartTf]);

  // ── 3. Prefetch al acercarse al borde del cache ───────────────────────
  useEffect(() => {
    const store = storeRef.current;
    if (!store || loading) return;
    const maxLoaded = (store.all[store.all.length - 1]?.time ?? 0) * 1000;
    // Si el cursor está a menos de 50 barras del borde cargado, traemos más.
    if (cursorMs + 50 * TF_MINUTES[chartTf] * 60_000 > maxLoaded) {
      store.ensureLoaded(cursorMs, 50, 300).then(() => {
        onCandlesLoaded?.(store.all);
        setRenderTick((t) => t + 1);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursorMs, loading]);

  // ── 4. Velas visibles (toda la historia ≤ cursor) ────────────────────
  const displayed = useMemo(() => {
    const store = storeRef.current;
    if (!store || loading) return [];
    const cursorSec = cursorMs / 1000;
    return store.all.filter((c) => c.time <= cursorSec);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursorMs, chartTf, loading, renderTick]);

  // ── 5. Pintar series ──────────────────────────────────────────────────
  useEffect(() => {
    const cs = candleSerRef.current;
    const vs = volSerRef.current;
    if (!cs || !vs || displayed.length === 0) return;
    cs.setData(
      displayed.map((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );
    vs.setData(
      displayed.map((c) => ({
        time: c.time as UTCTimestamp,
        value: c.volume,
        color: c.close >= c.open ? "rgba(38,166,154,0.4)" : "rgba(239,83,80,0.4)",
      })),
    );
    const e20 = ema(displayed, 20);
    const e50 = ema(displayed, 50);
    const e200 = ema(displayed, 200);
    e20Ref.current?.setData(e20.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
    e50Ref.current?.setData(e50.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
    e200Ref.current?.setData(e200.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));

    // Fit solo la primera vez (no en cada step — respeta el pan del usuario)
    if (!didFitRef.current && chartRef.current) {
      chartRef.current.timeScale().fitContent();
      didFitRef.current = true;
    }

    const last = displayed[displayed.length - 1]?.close;
    if (last) {
      window.dispatchEvent(
        new CustomEvent("ether-testing:last-price", { detail: { price: last } }),
      );
    }
  }, [displayed]);

  // ── 6. Engine: procesar velas 1m entre cursor previo y nuevo ──────────
  const lastCursorRef = useRef<number>(session.replayCursorMs ?? session.startDate);
  useEffect(() => {
    if (loading) return;
    const store = storeRef.current;
    const det = detailRef.current;
    const sess = sessionRef.current;
    if (!store || !det) return;
    const prevMs = lastCursorRef.current;
    const curMs = cursorMs;
    if (curMs <= prevMs) {
      lastCursorRef.current = curMs;
      return;
    }
    const prevSec = prevMs / 1000;
    const curSec = curMs / 1000;
    const newCandles = store.all.filter((c) => c.time > prevSec && c.time <= curSec);
    lastCursorRef.current = curMs;
    if (newCandles.length === 0 && det.positions.length === 0) return;

    let state = {
      orders: det.orders,
      positions: det.positions,
      trades: det.trades,
      balance: sess.currentBalance,
      realizedPnL: sess.realizedPnL,
    };
    for (const c of newCandles) {
      state = stepEngine(state, c, { sessionId: sess.id });
    }
    const lastClose = store.all.filter((c) => c.time <= curSec).at(-1)?.close;
    if (lastClose !== undefined) {
      state.positions = state.positions.map((p) => {
        const dir = p.side === "buy" ? 1 : -1;
        return { ...p, unrealizedPnL: (lastClose - p.entry) * p.size * dir };
      });
    }
    applyEngineState({
      orders: state.orders,
      positions: state.positions,
      trades: state.trades,
      realizedPnL: state.realizedPnL,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursorMs, loading]);

  // ── 7. Reprocesar la vela actual cuando se agrega una orden pending ───
  useEffect(() => {
    if (loading || !detail) return;
    const hasPending = detail.orders.some((o) => o.status === "pending");
    if (!hasPending) return;
    const store = storeRef.current;
    const sess = sessionRef.current;
    if (!store) return;
    const curSec = cursorMs / 1000;
    const curCandle = store.all.filter((c) => c.time <= curSec).at(-1);
    if (!curCandle) return;
    const state = {
      orders: detail.orders,
      positions: detail.positions,
      trades: detail.trades,
      balance: sess.currentBalance,
      realizedPnL: sess.realizedPnL,
    };
    const next = stepEngine(state, curCandle, { sessionId: sess.id });
    const changed =
      next.positions.length !== state.positions.length ||
      next.trades.length !== state.trades.length;
    if (changed) {
      applyEngineState({
        orders: next.orders,
        positions: next.positions,
        trades: next.trades,
        realizedPnL: next.realizedPnL,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.orders.length]);

  // ── 8. Coord helpers para overlays ────────────────────────────────────
  function priceToY(price: number): number | null {
    const ser = candleSerRef.current;
    if (!ser) return null;
    return ser.priceToCoordinate(price) ?? null;
  }
  function timeToX(timeSec: number): number | null {
    const chart = chartRef.current;
    if (!chart) return null;
    return chart.timeScale().timeToCoordinate(timeSec as UTCTimestamp) ?? null;
  }

  const openPositions: Position[] = detail?.positions ?? [];
  const closedTrades = detail?.trades ?? [];

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {/* renderTick fuerza recomputar overlays en pan/zoom */}
      <ClosedTradesLayer
        key={`ct-${renderTick}`}
        trades={closedTrades}
        timeToX={timeToX}
        priceToY={priceToY}
        width={size.width}
        height={size.height}
        mode={closedTradesMode}
      />
      <PositionOverlay
        key={`po-${renderTick}`}
        positions={openPositions}
        priceToY={priceToY}
        width={size.width}
        height={size.height}
      />
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
      {loadErr && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-tv-bg/80">
          <div className="rounded border border-tv-red/40 bg-tv-red/10 px-4 py-3 text-[12px] text-tv-red">
            Error: {loadErr}
          </div>
        </div>
      )}
    </div>
  );
}

export { TESTING_TFS };
