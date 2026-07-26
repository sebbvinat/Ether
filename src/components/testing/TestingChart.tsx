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
import { ema, sma, bollinger, vwap, rsi, macd, stochastic } from "@/lib/indicators";
import { LazyCandleStore, TESTING_TFS, TF_MINUTES } from "@/lib/testing/candles";
import { stepEngine, makeLimitOrder } from "@/lib/testing/engine";
import {
  composeDisplayed,
  hasIntrabarData,
  subCandlesBetween,
} from "@/lib/testing/intrabar";
import {
  engineConfigFor,
  useTestingStore,
  type SessionMeta,
  type Position,
} from "@/lib/store/testing-store";
import {
  INDICATOR_COLORS,
  type IndicatorConfig,
  type IndicatorKey,
} from "@/lib/store/chart-store";
import { PositionOverlay } from "./PositionOverlay";
import { PendingOrdersOverlay } from "./PendingOrdersOverlay";
import { ClosedTradesLayer, type ClosedTradesMode } from "./ClosedTradesLayer";
import { TestingDrawingsLayer, type DrawingTool } from "./TestingDrawingsLayer";
import {
  CursorIcon,
  EraserIcon,
  FibIcon,
  HLineIcon,
  LongIcon,
  RectIcon,
  ShortIcon,
  TrashIcon,
  TrendlineIcon,
} from "@/components/icons/ToolIcons";
import { TV, TV_ALPHA } from "@/lib/theme";
import { cn } from "@/lib/utils";
import type { Timeframe } from "@/lib/binance/types";
import type { Drawing, DrawingPoint } from "@/lib/store/chart-store";

// §10 — la paleta vive en lib/theme.ts (fuente única).

interface Props {
  session: SessionMeta;
  closedTradesMode?: ClosedTradesMode;
  /** Callback con velas 1m disponibles (Go To las usa). */
  onCandlesLoaded?: (candles1m: { time: number }[]) => void;
  /** §12 — TF propio de este panel. Sin esto usa el de la sesión. */
  tfOverride?: Timeframe;
  /** §12 — si está, el panel muestra su propio selector de TF. */
  onTfChange?: (tf: Timeframe) => void;
  /** §12 — sólo UN panel corre el engine. Con dos paneles procesando las
   *  mismas velas los fills se aplicarían dos veces. */
  engineEnabled?: boolean;
  /** §12 — el panel secundario no repite la barra de dibujo. */
  showToolbar?: boolean;
}

export function TestingChart({
  session,
  closedTradesMode = "drawings",
  onCandlesLoaded,
  tfOverride,
  onTfChange,
  engineEnabled = true,
  showToolbar = true,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSerRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volSerRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  /** Mapa de series de indicadores activas. Keys del IndicatorKey enum +
   *  sufijos para multi-línea ("bb-up", "bb-low", etc.). */
  const indSeriesRef = useRef<Map<string, ISeriesApi<"Line">>>(new Map());

  const storeRef = useRef<LazyCandleStore | null>(null);
  /** §11 — velas de 1m alrededor del cursor, sólo en modo intrabar. */
  const subStoreRef = useRef<LazyCandleStore | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [renderTick, setRenderTick] = useState(0);
  /** §11 — aviso de que acá no hay 1m y el replay avanza por vela completa.
   *  Se muestra una sola vez por sesión de navegación para no ser molesto. */
  const [noIntrabarData, setNoIntrabarData] = useState(false);
  const warnedNoIntrabarRef = useRef(false);
  const didFitRef = useRef(false);
  // Wave 18.6 — drawing tool state
  const [tool, setTool] = useState<DrawingTool>("cursor");
  const [draft, setDraft] = useState<
    | { type: "trendline" | "rect" | "fib"; a: DrawingPoint }
    | { type: "long" | "short"; entry: DrawingPoint; sl?: DrawingPoint }
    | null
  >(null);
  const toolRef = useRef<DrawingTool>(tool);
  toolRef.current = tool;
  const draftRef = useRef(draft);
  draftRef.current = draft;

  // §2 — la página emite este evento con los atajos de teclado (T/H/R/F/L/S/E/Esc).
  // Se hace por evento porque el estado `tool` vive acá adentro.
  useEffect(() => {
    const h = (e: Event) => {
      const t = (e as CustomEvent<{ tool: DrawingTool }>).detail?.tool;
      if (t) {
        setTool(t);
        setDraft(null);
      }
    };
    window.addEventListener("ether-testing:set-tool", h);
    return () => window.removeEventListener("ether-testing:set-tool", h);
  }, []);

  const detail = useTestingStore((s) => s.activeDetail);
  const applyEngineState = useTestingStore((s) => s.applyEngineState);

  const cursorMs = session.replayCursorMs ?? session.startDate;
  const chartTf = tfOverride ?? session.chartTimeframe ?? "15m";
  const tfSec = TF_MINUTES[chartTf] * 60;
  // §11 — en 1m no hay sub-resolución que mostrar: el modo se ignora.
  const intrabar = session.playbackMode === "intrabar" && chartTf !== "1m";

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
        // §10 — las etiquetas de los ejes en azul, como TradingView.
        vertLine: {
          color: TV.textMuted,
          width: 1,
          style: 3,
          labelBackgroundColor: TV.blue,
        },
        horzLine: {
          color: TV.textMuted,
          width: 1,
          style: 3,
          labelBackgroundColor: TV.blue,
        },
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

    // Re-render overlays en cada pan/zoom — THROTTLED a rAF para que pan/zoom
    // rápido no haga cientos de renders por segundo (era el lag del overlay).
    let pending = false;
    const bump = () => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        setRenderTick((t) => t + 1);
      });
    };
    // Wave 18.9 — prefetch backward: cuando el usuario panea hacia atrás y
    // se acerca al borde izquierdo del cache, traer más historia.
    let prefetchingBackward = false;
    const onRangeChange = (range: { from: number; to: number } | null) => {
      bump();
      const store = storeRef.current;
      if (!store || range == null) return;
      // range.from = índice lógico de la primera barra visible (puede ser
      // negativo si hay whitespace). Si estamos a menos de 50 barras del
      // inicio del cache, cargar más historia.
      if (range.from < 50 && store.all.length > 0 && !prefetchingBackward) {
        prefetchingBackward = true;
        const minMs = store.all[0].time * 1000;
        const currentTf = sessionRef.current.chartTimeframe ?? "15m";
        void store
          .ensureLoaded(
            minMs - 500 * TF_MINUTES[currentTf] * 60_000,
            1000,
            0,
          )
          .then(() => {
            prefetchingBackward = false;
            setRenderTick((t) => t + 1);
          })
          .catch(() => {
            prefetchingBackward = false;
          });
      }
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRangeChange);
    chart.subscribeCrosshairMove(bump);

    // Wave 18.6 — handler de clicks para dibujar (lee tool/draft via ref).
    const clickHandler = (param: { time?: unknown; point?: { x: number; y: number } }) => {
      const t = toolRef.current;
      if (t === "cursor" || t === "eraser") return;
      if (!param.time || !param.point) return;
      const cs = candleSerRef.current;
      if (!cs) return;
      const price = cs.coordinateToPrice(param.point.y);
      if (price == null) return;
      const time = Number(param.time);
      const pt: DrawingPoint = { time, price };
      const uid = (): string =>
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2);
      const symbol = sessionRef.current.symbol;
      const store = useTestingStore.getState();
      if (t === "hline") {
        void store.addDrawingToActive({
          id: uid(),
          symbol,
          type: "hline",
          at: pt,
        } as Drawing);
        setTool("cursor");
        return;
      }
      const d = draftRef.current;
      // Long/Short: 3 clicks → entry, SL, TP → crea limit order
      if (t === "long" || t === "short") {
        if (!d || d.type !== t) {
          setDraft({ type: t, entry: pt });
          return;
        }
        if (!("sl" in d) || d.sl === undefined) {
          setDraft({ type: t, entry: d.entry, sl: pt });
          return;
        }
        // 3er click = TP → crear orden limit
        const order = makeLimitOrder({
          side: t === "long" ? "buy" : "sell",
          size: 1,
          entryPrice: d.entry.price,
          sl: d.sl.price,
          tp: pt.price,
          tags: [t],
        });
        void store.addOrder(order);
        setDraft(null);
        setTool("cursor");
        return;
      }
      // Resto: 2 puntos
      if (!d || d.type !== t) {
        setDraft({ type: t as "trendline" | "rect" | "fib", a: pt });
        return;
      }
      void store.addDrawingToActive({
        id: uid(),
        symbol,
        type: t,
        a: (d as { a: DrawingPoint }).a,
        b: pt,
      } as Drawing);
      setDraft(null);
      setTool("cursor");
    };
    chart.subscribeClick(clickHandler);

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
        chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRangeChange);
        chart.unsubscribeCrosshairMove(bump);
        chart.unsubscribeClick(clickHandler);
        chart.remove();
      } catch {}
      chartRef.current = null;
      candleSerRef.current = null;
      volSerRef.current = null;
      indSeriesRef.current.clear();
    };
  }, []);

  // ── 2. Cargar candle store (con HISTORIA antes del startDate) ─────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadErr(null);
    didFitRef.current = false;
    paintedRef.current = null; // serie nueva: el próximo pintado es completo
    const store = new LazyCandleStore(
      session.symbol,
      chartTf,
      // Wave 18.9 — hint muy amplio. El clamp ya no aplica en ensureLoaded,
      // pero dejamos un piso para no ir a 1970 accidentalmente.
      Date.UTC(2017, 0, 1), // Binance crypto empieza ~2017
      session.endDate,
    );
    storeRef.current = store;
    // Wave 18.11 — centrar el load en el CURSOR (no en startDate). Cuando la
    // sesión arranca en el fin del rango (endDate = hoy), el cursor está en
    // Julio pero startDate en Enero: centrar en startDate cargaba data vieja
    // y dejaba un hueco de meses. Centrando en cursor arrancamos con data
    // relevante al momento donde estamos viendo.
    // 1500 barras hacia atrás + 200 de lookahead = ~2 requests a Binance.
    store
      .ensureLoaded(cursorMs, 1500, 200)
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

  // ── 3b. §11 — store de 1m para el modo intrabar ───────────────────────
  //   Se crea sólo cuando hace falta y se tira al salir del modo o cambiar de
  //   símbolo: son muchas velas y no tiene sentido tenerlas si no se usan.
  const [subLoaded, setSubLoaded] = useState(0);
  useEffect(() => {
    warnedNoIntrabarRef.current = false;
    setNoIntrabarData(false);
    if (!intrabar) {
      subStoreRef.current = null;
      return;
    }
    subStoreRef.current = new LazyCandleStore(
      session.symbol,
      "1m",
      Date.UTC(2017, 0, 1),
      session.endDate,
    );
    setSubLoaded((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intrabar, session.symbol, session.endDate]);

  useEffect(() => {
    const sub = subStoreRef.current;
    if (!intrabar || !sub) return;
    // Sólo pedir cuando el cursor se acerca al borde de lo cargado. Sin este
    // chequeo, cada minuto de replay dispara un fetch (el rango pedido se
    // corre junto con el cursor) y el playback queda a una vela por segundo
    // sin importar la velocidad elegida.
    const loadedMaxMs = (sub.all[sub.all.length - 1]?.time ?? 0) * 1000;
    const near = cursorMs + 60 * 60_000 > loadedMaxMs; // menos de 1h de colchón
    if (!near) return;
    let cancelled = false;
    const before = sub.length;
    // ±12h de 1m alrededor del cursor = 1 request, y alcanza para varias
    // barras hacia adelante antes de tener que volver a pedir.
    sub
      .ensureLoaded(cursorMs, 720, 720)
      .then(() => {
        // Sin velas nuevas no hay nada que repintar: bumpear igual haría un
        // render de más por cada minuto del replay.
        if (!cancelled && sub.length !== before) setSubLoaded((n) => n + 1);
      })
      .catch(() => {
        // Sin 1m el chart cae a vela completa solo (composeDisplayed devuelve
        // las cerradas). No es un error que valga interrumpir el replay.
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intrabar, cursorMs]);

  // ── 4. Velas visibles ─────────────────────────────────────────────────
  //   §11 — derivadas del cursor: las que ya cerraron, más la que se está
  //   formando si estamos en modo intrabar y hay 1m para armarla.
  const displayed = useMemo(() => {
    const store = storeRef.current;
    if (!store || loading) return [];
    const cursorSec = cursorMs / 1000;
    const oneMin = intrabar ? (subStoreRef.current?.all ?? null) : null;
    return composeDisplayed(store.all, oneMin, cursorSec, tfSec);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursorMs, chartTf, loading, renderTick, intrabar, subLoaded, tfSec]);

  // ── 5. Pintar series ──────────────────────────────────────────────────
  //   §11 — en modo intrabar esto corre una vez por minuto de mercado. Un
  //   setData completo con miles de barras a esa frecuencia traba el pan y el
  //   zoom, así que cuando lo único que cambió es el final de la serie se
  //   actualizan sólo esas barras. El setData completo queda para cambios de
  //   TF, rewind y cargas de historia.
  const paintedRef = useRef<{ count: number; lastTime: number } | null>(null);
  useEffect(() => {
    const cs = candleSerRef.current;
    const vs = volSerRef.current;
    if (!cs || !vs || displayed.length === 0) return;

    const bar = (c: (typeof displayed)[number]) => ({
      time: c.time as UTCTimestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    });
    const vol = (c: (typeof displayed)[number]) => ({
      time: c.time as UTCTimestamp,
      value: c.volume,
      color: c.close >= c.open ? TV_ALPHA.green40 : TV_ALPHA.red40,
    });

    const last = displayed[displayed.length - 1];
    const prev = paintedRef.current;
    // Sólo se puede parchear si la serie creció como mucho una barra y el
    // tiempo no retrocedió — `update()` no acepta barras anteriores al final.
    const grew = prev ? displayed.length - prev.count : NaN;
    const patchable =
      prev !== null && last.time >= prev.lastTime && (grew === 0 || grew === 1);

    if (patchable) {
      // Si cruzamos boundary, la anteúltima es la que acaba de cerrar.
      const from = grew === 1 ? displayed.length - 2 : displayed.length - 1;
      for (let i = Math.max(0, from); i < displayed.length; i++) {
        cs.update(bar(displayed[i]));
        vs.update(vol(displayed[i]));
      }
    } else {
      cs.setData(displayed.map(bar));
      vs.setData(displayed.map(vol));
    }
    paintedRef.current = { count: displayed.length, lastTime: last.time };
    // (los indicadores se rendean en su propio effect — ver más abajo)

    // Fit solo la primera vez (no en cada step — respeta el pan del usuario)
    if (!didFitRef.current && chartRef.current) {
      chartRef.current.timeScale().fitContent();
      didFitRef.current = true;
    }

    // §12 — con dos paneles sólo el primario publica el precio: si no, el
    // secundario (otro TF) pisaría la referencia de las órdenes.
    if (last.close && engineEnabled) {
      window.dispatchEvent(
        new CustomEvent("ether-testing:last-price", { detail: { price: last.close } }),
      );
    }
  }, [displayed, engineEnabled]);

  // ── 5b. Reconciliar indicadores cuando cambien las velas, los toggles o
  //        los períodos configurados (§9) ─────────────────────────────────
  useEffect(() => {
    if (displayed.length === 0) return;
    renderIndicators(
      displayed,
      detail?.indicators,
      detail?.config,
      chartRef.current,
      indSeriesRef.current,
    );
  }, [displayed, detail?.indicators, detail?.config]);

  // ── 6. Engine: procesar velas 1m entre cursor previo y nuevo ──────────
  const lastCursorRef = useRef<number>(session.replayCursorMs ?? session.startDate);
  useEffect(() => {
    if (loading || !engineEnabled) return;
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
    // §11 — en modo intrabar el engine evalúa fills minuto a minuto: un TP
    // dentro de la vela se cierra EN el minuto que lo toca, no al cierre de
    // la barra. Si no hay 1m para este tramo (Yahoo viejo, pre-listing),
    // cae a las velas del TF sin avisar nada — es la misma precisión de antes.
    const sub = subStoreRef.current;
    const useSub =
      intrabar && sub !== null && hasIntrabarData(sub.all, curSec, tfSec);
    // El proveedor no tiene 1m tan atrás (Yahoo >7 días, cripto pre-listing):
    // se avanza por vela completa, que es lo que había antes de §11.
    if (intrabar && !useSub && !warnedNoIntrabarRef.current) {
      warnedNoIntrabarRef.current = true;
      setNoIntrabarData(true);
    }
    const newCandles = useSub
      ? subCandlesBetween(sub!.all, prevSec, curSec)
      : store.all.filter((c) => c.time > prevSec && c.time <= curSec);
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
      state = stepEngine(state, c, engineConfigFor(sess));
    }
    const lastClose = useSub
      ? sub!.all.filter((c) => c.time <= curSec).at(-1)?.close
      : store.all.filter((c) => c.time <= curSec).at(-1)?.close;
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
  }, [cursorMs, loading, intrabar, subLoaded, engineEnabled]);

  // ── 7. Reprocesar la vela actual cuando se agrega una orden pending ───
  useEffect(() => {
    if (loading || !detail || !engineEnabled) return;
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
    const next = stepEngine(state, curCandle, engineConfigFor(sess));
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
  function yToPrice(y: number): number | null {
    const ser = candleSerRef.current;
    if (!ser) return null;
    return ser.coordinateToPrice(y);
  }

  const openPositions: Position[] = detail?.positions ?? [];
  const pendingOrders = (detail?.orders ?? []).filter((o) => o.status === "pending");
  const closedTrades = detail?.trades ?? [];
  const drawings: Drawing[] = detail?.drawings ?? [];

  function toCoord(timeSec: number, price: number) {
    const x = timeToX(timeSec);
    const y = priceToY(price);
    if (x == null || y == null) return null;
    return { x, y };
  }

  return (
    <div className="relative h-full w-full">
      <div
        ref={containerRef}
        className="h-full w-full"
        style={{ cursor: tool === "cursor" ? "default" : "crosshair" }}
      />
      {/* Drawings (debajo de posiciones, encima de candles) */}
      <TestingDrawingsLayer
        drawings={drawings}
        toCoord={toCoord}
        onErase={
          tool === "eraser"
            ? (id) => {
                void useTestingStore.getState().removeDrawingFromActive(id);
              }
            : undefined
        }
        width={size.width}
        height={size.height}
      />
      {/* Sin key=renderTick — los overlays re-renderizan via props frescos
          (priceToY/timeToX cambian de ref en cada render del padre). */}
      <ClosedTradesLayer
        trades={closedTrades}
        timeToX={timeToX}
        priceToY={priceToY}
        width={size.width}
        height={size.height}
        mode={closedTradesMode}
      />
      <PositionOverlay
        positions={openPositions}
        lastPrice={displayed[displayed.length - 1]?.close ?? 0}
        currentTimeMs={cursorMs}
        priceToY={priceToY}
        yToPrice={yToPrice}
        width={size.width}
        height={size.height}
      />
      <PendingOrdersOverlay
        orders={pendingOrders}
        priceToY={priceToY}
        yToPrice={yToPrice}
        width={size.width}
        height={size.height}
      />
      {/* §12 — el selector propio sólo aparece en el panel secundario. */}
      {onTfChange && (
        <div className="pointer-events-auto absolute left-2 top-2 z-20 flex items-center gap-0.5 rounded border border-tv-border bg-tv-panel/90 p-0.5">
          {TESTING_TFS.map((tf) => (
            <button
              key={tf}
              onClick={() => onTfChange(tf)}
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px]",
                tf === chartTf
                  ? "bg-tv-blue/15 text-tv-blue"
                  : "text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text",
              )}
            >
              {tf}
            </button>
          ))}
        </div>
      )}
      {/* Toolbar vertical de drawings — izquierda del chart */}
      {showToolbar && (
      <DrawingsToolbar
        tool={tool}
        onSelect={(t) => {
          setTool(t);
          setDraft(null);
        }}
        onClear={() => {
          void useTestingStore.getState().clearDrawingsInActive();
          setTool("cursor");
        }}
      />
      )}
      {loading && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-tv-bg/70 backdrop-blur-sm">
          <div className="text-center">
            <CandleSkeleton />
            <p className="mt-4 text-[12px] text-tv-text-muted">
              Descargando velas desde {new Date(session.startDate).toLocaleDateString()}…
            </p>
          </div>
        </div>
      )}
      {noIntrabarData && (
        <div className="pointer-events-auto absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-2 rounded border border-tv-yellow/40 bg-tv-panel/95 px-3 py-1.5 text-[11px] text-tv-yellow shadow-lg">
          Sin datos de 1m acá — el replay avanza por vela completa.
          <button
            onClick={() => setNoIntrabarData(false)}
            className="rounded px-1 text-tv-text-muted hover:text-tv-text"
            aria-label="Cerrar aviso"
          >
            ✕
          </button>
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

// ─── CandleSkeleton ───────────────────────────────────────────────────────
// §10 — placeholder de carga con forma de chart en vez de un spinner
// genérico: comunica qué está llegando. Las alturas salen de una progresión
// determinística (un primo módulo un rango) para que el patrón se vea
// irregular sin usar Math.random, que cambiaría en cada render.

function CandleSkeleton() {
  const bars = Array.from({ length: 40 }, (_, i) => ({
    height: 14 + ((i * 7919) % 60),
    up: (i * 7919) % 2 === 0,
  }));
  return (
    <div
      className="flex h-24 items-center justify-center gap-1"
      aria-hidden="true"
    >
      {bars.map((b, i) => (
        <div
          key={i}
          className={cn(
            "w-1.5 animate-pulse rounded-sm",
            b.up ? "bg-tv-green/25" : "bg-tv-red/25",
          )}
          style={{ height: `${b.height}%`, animationDelay: `${(i % 8) * 60}ms` }}
        />
      ))}
    </div>
  );
}

// ─── DrawingsToolbar ──────────────────────────────────────────────────────
// Toolbar vertical sobre el chart con los 5 tools básicos + clear.

function DrawingsToolbar({
  tool,
  onSelect,
  onClear,
}: {
  tool: DrawingTool;
  onSelect: (t: DrawingTool) => void;
  onClear: () => void;
}) {
  // §15 — íconos SVG propios en vez de glifos unicode: se alinean entre sí,
  // no dependen de la fuente del sistema y heredan currentColor.
  const tools: { key: DrawingTool; Icon: typeof CursorIcon; title: string }[] = [
    { key: "cursor", Icon: CursorIcon, title: "Cursor" },
    { key: "trendline", Icon: TrendlineIcon, title: "Línea de tendencia (2 clics)" },
    { key: "hline", Icon: HLineIcon, title: "Línea horizontal (1 clic)" },
    { key: "rect", Icon: RectIcon, title: "Rectángulo (2 clics)" },
    { key: "fib", Icon: FibIcon, title: "Fibonacci retroceso (2 clics)" },
    {
      key: "long",
      Icon: LongIcon,
      title: "Posición LONG (3 clics: entry → SL → TP, crea buy limit)",
    },
    {
      key: "short",
      Icon: ShortIcon,
      title: "Posición SHORT (3 clics: entry → SL → TP, crea sell limit)",
    },
    { key: "eraser", Icon: EraserIcon, title: "Borrador" },
  ];
  return (
    <div className="absolute left-1 top-1 z-20 flex flex-col gap-0.5 rounded border border-tv-border bg-tv-panel/95 p-1 shadow-md">
      {tools.map((t) => {
        const isLong = t.key === "long";
        const isShort = t.key === "short";
        const activeBg = isLong
          ? "bg-tv-green/20 text-tv-green"
          : isShort
            ? "bg-tv-red/20 text-tv-red"
            : "bg-tv-blue/20 text-tv-blue";
        const inactiveColor =
          isLong
            ? "text-tv-green/70 hover:bg-tv-green/10 hover:text-tv-green"
            : isShort
              ? "text-tv-red/70 hover:bg-tv-red/10 hover:text-tv-red"
              : "text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text";
        return (
          <button
            key={t.key}
            onClick={() => onSelect(t.key)}
            title={t.title}
            aria-label={t.title}
            aria-pressed={tool === t.key}
            className={
              "grid h-6 w-6 place-items-center rounded " +
              (tool === t.key ? activeBg : inactiveColor)
            }
          >
            <t.Icon size={15} />
          </button>
        );
      })}
      <div className="my-0.5 border-t border-tv-border" />
      <button
        onClick={onClear}
        title="Borrar todos los dibujos"
        aria-label="Borrar todos los dibujos"
        className="grid h-6 w-6 place-items-center rounded text-tv-text-muted hover:bg-tv-red/20 hover:text-tv-red"
      >
        <TrashIcon size={15} />
      </button>
    </div>
  );
}

// ─── renderIndicators ─────────────────────────────────────────────────────
// Reconcilia las series de indicadores con el set activo en detail.indicators.
// Crea series nuevas para indicadores que no estaban, las quita si dejaron de
// estar activas, y actualiza los datos de las activas.

import type { Candle } from "@/lib/binance/types";

function renderIndicators(
  candles: Candle[],
  active: Record<IndicatorKey, boolean> | undefined,
  config: Partial<IndicatorConfig> | undefined,
  chart: IChartApi | null,
  series: Map<string, ISeriesApi<"Line">>,
) {
  if (!chart) return;
  // §9 — períodos configurables por sesión. Los defaults igualan lo que el
  // código tenía hardcodeado, así que una sesión sin config no cambia.
  const cfg = {
    rsi: config?.rsi ?? 14,
    macdFast: config?.macdFast ?? 12,
    macdSlow: config?.macdSlow ?? 26,
    macdSignal: config?.macdSignal ?? 9,
    stochK: config?.stochK ?? 14,
    stochD: config?.stochD ?? 3,
    bbPeriod: config?.bbPeriod ?? 20,
    bbStdDev: config?.bbStdDev ?? 2,
  };
  // Conjunto de keys que DEBERÍAN tener serie
  const wanted = new Set<string>();
  if (active?.ema20) wanted.add("ema20");
  if (active?.ema50) wanted.add("ema50");
  if (active?.ema200) wanted.add("ema200");
  if (active?.sma20) wanted.add("sma20");
  if (active?.sma50) wanted.add("sma50");
  if (active?.bb) {
    wanted.add("bb-up");
    wanted.add("bb-mid");
    wanted.add("bb-low");
  }
  if (active?.vwap) wanted.add("vwap");
  if (active?.rsi) {
    wanted.add("rsi");
    wanted.add("rsi-30");
    wanted.add("rsi-70");
  }
  if (active?.macd) {
    wanted.add("macd-line");
    wanted.add("macd-signal");
    wanted.add("macd-hist");
  }
  if (active?.stoch) {
    wanted.add("stoch-k");
    wanted.add("stoch-d");
    wanted.add("stoch-20");
    wanted.add("stoch-80");
  }

  // Quitar series que ya no están activas
  for (const [key, ser] of series.entries()) {
    if (!wanted.has(key)) {
      try {
        chart.removeSeries(ser);
      } catch {}
      series.delete(key);
    }
  }

  // Helper para crear/get una line series con color en un pane específico
  function getOrCreate(
    key: string,
    color: string,
    width = 1,
    paneIndex = 0,
  ): ISeriesApi<"Line"> {
    let s = series.get(key);
    if (!s) {
      s = chart!.addSeries(
        LineSeries,
        {
          color,
          lineWidth: width as 1 | 2 | 3 | 4,
          priceLineVisible: false,
          lastValueVisible: paneIndex > 0,
        },
        paneIndex,
      );
      series.set(key, s);
    }
    return s;
  }

  // EMAs y SMAs (línea simple)
  const singleLines: [string, IndicatorKey | null, number, "ema" | "sma"][] = [
    ["ema20", "ema20", 20, "ema"],
    ["ema50", "ema50", 50, "ema"],
    ["ema200", "ema200", 200, "ema"],
    ["sma20", "sma20", 20, "sma"],
    ["sma50", "sma50", 50, "sma"],
  ];
  for (const [key, indKey, period, kind] of singleLines) {
    if (!indKey || !wanted.has(key)) continue;
    const color = INDICATOR_COLORS[indKey]?.[0] ?? "#999";
    const ser = getOrCreate(key, color, period >= 200 ? 2 : 1);
    const pts = kind === "ema" ? ema(candles, period) : sma(candles, period);
    ser.setData(pts.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
  }

  // Bollinger (3 líneas)
  if (wanted.has("bb-mid")) {
    const cols = INDICATOR_COLORS.bb ?? [TV.textMuted, TV.textMuted, TV.textMuted];
    const up = getOrCreate("bb-up", cols[0]);
    const mid = getOrCreate("bb-mid", cols[1]);
    const low = getOrCreate("bb-low", cols[2]);
    const pts = bollinger(candles, cfg.bbPeriod, cfg.bbStdDev);
    up.setData(pts.map((p) => ({ time: p.time as UTCTimestamp, value: p.upper })));
    mid.setData(pts.map((p) => ({ time: p.time as UTCTimestamp, value: p.basis })));
    low.setData(pts.map((p) => ({ time: p.time as UTCTimestamp, value: p.lower })));
  }

  // VWAP (1 línea — anclada al inicio del rango cargado, suficiente para MVP)
  if (wanted.has("vwap")) {
    const color = INDICATOR_COLORS.vwap?.[0] ?? TV.yellow;
    const ser = getOrCreate("vwap", color, 2);
    const pts = vwap(candles);
    ser.setData(pts.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
  }

  // ── Sub-panels (paneIndex > 0) ─────────────────────────────────────────

  // RSI 14 en pane 1, con líneas de oversold/overbought
  if (wanted.has("rsi")) {
    const color = INDICATOR_COLORS.rsi?.[0] ?? TV.purple;
    const ser = getOrCreate("rsi", color, 1, 1);
    const pts = rsi(candles, cfg.rsi);
    ser.setData(pts.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
    // Guides: 30 y 70 como líneas planas
    if (pts.length > 0) {
      const t0 = pts[0].time as UTCTimestamp;
      const tN = pts[pts.length - 1].time as UTCTimestamp;
      const guide30 = getOrCreate("rsi-30", TV.textMuted, 1, 1);
      guide30.applyOptions({ lineStyle: 3 });
      guide30.setData([
        { time: t0, value: 30 },
        { time: tN, value: 30 },
      ]);
      const guide70 = getOrCreate("rsi-70", TV.textMuted, 1, 1);
      guide70.applyOptions({ lineStyle: 3 });
      guide70.setData([
        { time: t0, value: 70 },
        { time: tN, value: 70 },
      ]);
    }
  }

  // MACD en pane 2 (2 líneas: MACD y signal)
  if (wanted.has("macd-line")) {
    const cols = INDICATOR_COLORS.macd ?? [TV.blue, TV.red, TV.textMuted];
    const line = getOrCreate("macd-line", cols[0], 1, 2);
    const signal = getOrCreate("macd-signal", cols[1], 1, 2);
    const pts = macd(candles, cfg.macdFast, cfg.macdSlow, cfg.macdSignal);
    line.setData(pts.map((p) => ({ time: p.time as UTCTimestamp, value: p.macd })));
    signal.setData(pts.map((p) => ({ time: p.time as UTCTimestamp, value: p.signal })));
    // hist como línea (en MVP — un histogram real necesitaría HistogramSeries)
    const hist = getOrCreate("macd-hist", cols[2], 1, 2);
    hist.applyOptions({ lineStyle: 0 });
    hist.setData(pts.map((p) => ({ time: p.time as UTCTimestamp, value: p.histogram })));
  }

  // Stochastic en pane 3 (%K + %D + guías 20/80)
  if (wanted.has("stoch-k")) {
    const cols = INDICATOR_COLORS.stoch ?? [TV.blue, TV.red];
    const k = getOrCreate("stoch-k", cols[0], 1, 3);
    const d = getOrCreate("stoch-d", cols[1] ?? TV.red, 1, 3);
    const pts = stochastic(candles, cfg.stochK, cfg.stochD);
    k.setData(pts.map((p) => ({ time: p.time as UTCTimestamp, value: p.k })));
    d.setData(pts.map((p) => ({ time: p.time as UTCTimestamp, value: p.d })));
    if (pts.length > 0) {
      const t0 = pts[0].time as UTCTimestamp;
      const tN = pts[pts.length - 1].time as UTCTimestamp;
      const g20 = getOrCreate("stoch-20", TV.textMuted, 1, 3);
      g20.applyOptions({ lineStyle: 3 });
      g20.setData([
        { time: t0, value: 20 },
        { time: tN, value: 20 },
      ]);
      const g80 = getOrCreate("stoch-80", TV.textMuted, 1, 3);
      g80.applyOptions({ lineStyle: 3 });
      g80.setData([
        { time: t0, value: 80 },
        { time: tN, value: 80 },
      ]);
    }
  }
}
