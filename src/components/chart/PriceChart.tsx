"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  AreaSeries,
  HistogramSeries,
  CrosshairMode,
  PriceScaleMode,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type UTCTimestamp,
} from "lightweight-charts";
import { fetchCandles, fetchOlderCandles, subscribeMarket } from "@/lib/data";
import { getInstrument } from "@/lib/instruments";
import {
  ema,
  sma,
  bollinger,
  rsi,
  macd,
  atr,
  obv,
  stochastic,
  vwap,
  heikinAshi,
} from "@/lib/indicators";
import type { Candle, Timeframe } from "@/lib/binance/types";
import {
  INDICATOR_COLORS,
  useChartStore,
  type IndicatorKey,
} from "@/lib/store/chart-store";
import { formatPrice, formatVolume } from "@/lib/format";
import { IndicatorPill } from "./IndicatorPill";
import { MeasureOverlay } from "./MeasureOverlay";
import { DrawingsLayer } from "./DrawingsLayer";
import { Countdown } from "./Countdown";
import type { Drawing, DrawingPoint, DrawingTool } from "@/lib/store/chart-store";

interface MeasurePoint {
  time: number;
  price: number;
}
interface MeasureState {
  phase: "idle" | "placing" | "done";
  a: MeasurePoint | null;
  b: MeasurePoint | null;
}
const INITIAL_MEASURE: MeasureState = { phase: "idle", a: null, b: null };

function durationLabel(aTime: number, bTime: number): string {
  const diff = Math.abs(bTime - aTime);
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}

interface Props {
  symbol: string;
  timeframe: Timeframe;
  slotId?: string;
}

const TV_COLORS = {
  bg: "#131722",
  panel: "#1e222d",
  border: "#2a2e39",
  text: "#d1d4dc",
  textMuted: "#787b86",
  green: "#26a69a",
  red: "#ef5350",
  blue: "#2962ff",
  yellow: "#ffb74d",
  purple: "#ab47bc",
  grid: "#1e222d",
};

const LIGHT_CHART = {
  bg: "#ffffff",
  panel: "#f4f6fa",
  border: "#d6dae3",
  text: "#131722",
  textMuted: "#5d6068",
  green: "#089981",
  red: "#f23645",
  grid: "#eef0f4",
};

interface HoverInfo {
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  time: number;
  pct: number;
}

interface LastValues {
  ema20?: number;
  ema50?: number;
  ema200?: number;
  sma20?: number;
  sma50?: number;
  bbUpper?: number;
  bbBasis?: number;
  bbLower?: number;
  vwap?: number;
  rsi?: number;
  macd?: number;
  macdSignal?: number;
  macdHist?: number;
  atr?: number;
  obv?: number;
  stochK?: number;
  stochD?: number;
  volume?: number;
}

interface PaneOffset {
  top: number;
  height: number;
}

export function PriceChart({ symbol, timeframe, slotId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const ema20Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const ema50Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const ema200Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const sma20Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const sma50Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const bbUpperRef = useRef<ISeriesApi<"Line"> | null>(null);
  const bbBasisRef = useRef<ISeriesApi<"Line"> | null>(null);
  const bbLowerRef = useRef<ISeriesApi<"Line"> | null>(null);
  const vwapRef = useRef<ISeriesApi<"Line"> | null>(null);
  const overlaySeriesRef = useRef<ISeriesApi<"Line"> | ISeriesApi<"Area"> | null>(null);
  const compareSeriesRef = useRef<Map<string, ISeriesApi<"Line">>>(new Map());
  const rsiRef = useRef<ISeriesApi<"Line"> | null>(null);
  const rsi30Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const rsi70Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const macdRef = useRef<ISeriesApi<"Line"> | null>(null);
  const macdSignalRef = useRef<ISeriesApi<"Line"> | null>(null);
  const macdHistRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const atrRef = useRef<ISeriesApi<"Line"> | null>(null);
  const obvRef = useRef<ISeriesApi<"Line"> | null>(null);
  const stochKRef = useRef<ISeriesApi<"Line"> | null>(null);
  const stochDRef = useRef<ISeriesApi<"Line"> | null>(null);
  const candlesRef = useRef<Candle[]>([]);
  const priceLinesMapRef = useRef<Map<string, IPriceLine>>(new Map());

  const indicators = useChartStore((s) => s.indicators);
  const hidden = useChartStore((s) => s.hidden);
  const config = useChartStore((s) => s.config);
  const tool = useChartStore((s) => s.tool);
  const setTool = useChartStore((s) => s.setTool);
  const priceLines = useChartStore((s) => s.priceLines);
  const addPriceLine = useChartStore((s) => s.addPriceLine);
  const drawings = useChartStore((s) => s.drawings);
  const addDrawing = useChartStore((s) => s.addDrawing);
  const removeDrawing = useChartStore((s) => s.removeDrawing);
  const updateDrawing = useChartStore((s) => s.updateDrawing);
  const selectedDrawingId = useChartStore((s) => s.selectedDrawingId);
  const selectDrawing = useChartStore((s) => s.selectDrawing);
  const panesCollapsed = useChartStore((s) => s.panesCollapsed);
  const storeHideLegend = useChartStore((s) => s.hideLegend);
  const storeCleanMode = useChartStore((s) => s.cleanMode);
  const storeHideDrawings = useChartStore((s) => s.hideDrawings);
  const storeLockDrawings = useChartStore((s) => s.lockDrawings);
  const drawingStyles = useChartStore((s) => s.drawingStyles);
  const theme = useChartStore((s) => s.theme);
  const removeIndicator = useChartStore((s) => s.removeIndicator);
  const toggleHidden = useChartStore((s) => s.toggleHidden);
  const setSettingsTarget = useChartStore((s) => s.setSettingsTarget);
  const replay = useChartStore((s) => s.replay);
  const replayActiveForThis = replay.active && replay.slotId === slotId;
  const chartStyle = useChartStore((s) => s.chartStyle);
  const logScale = useChartStore((s) => s.logScale);
  const syncCharts = useChartStore((s) => s.syncCharts);
  const syncChartsRef = useRef(syncCharts);
  syncChartsRef.current = syncCharts;
  const comparesAll = useChartStore((s) => s.compares);
  const compares = slotId ? comparesAll[slotId] ?? [] : [];
  const binanceMarket = useChartStore((s) => s.binanceMarket);

  // Refs to avoid recreating subscribeClick on every tool change
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const addPriceLineRef = useRef(addPriceLine);
  addPriceLineRef.current = addPriceLine;
  const addDrawingRef = useRef(addDrawing);
  addDrawingRef.current = addDrawing;
  const setToolRef = useRef(setTool);
  setToolRef.current = setTool;
  const symbolRef = useRef(symbol);
  symbolRef.current = symbol;
  const configRef = useRef(config);
  configRef.current = config;
  const replayActiveRef = useRef(replayActiveForThis);
  replayActiveRef.current = replayActiveForThis;
  const replayIndexRef = useRef(replay.index);
  replayIndexRef.current = replay.index;
  const chartStyleRef = useRef(chartStyle);
  chartStyleRef.current = chartStyle;

  function getViewCandles(): Candle[] {
    if (replayActiveRef.current) {
      return candlesRef.current.slice(0, replayIndexRef.current + 1);
    }
    return candlesRef.current;
  }

  function getDisplayCandles(): Candle[] {
    const view = getViewCandles();
    if (chartStyleRef.current === "heikin") return heikinAshi(view);
    return view;
  }

  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [hoverValues, setHoverValues] = useState<LastValues>({});
  const [lastPrice, setLastPrice] = useState<{ value: number; pct: number } | null>(null);
  const [lastValues, setLastValues] = useState<LastValues>({});
  const [paneOffsets, setPaneOffsets] = useState<PaneOffset[]>([]);
  const [measure, setMeasure] = useState<MeasureState>(INITIAL_MEASURE);
  const [renderTick, setRenderTick] = useState(0);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const measureRef = useRef(measure);
  measureRef.current = measure;

  type TwoPointDraftType =
    | "trendline"
    | "arrow"
    | "ray"
    | "fib"
    | "rect"
    | "hrange"
    // Wave 6A — 2-point tools
    | "ellipse"
    | "trange"
    | "forecast"
    | "cycle"
    | "regression"
    | "fibext"
    | "fibarc"
    | "fibfan"
    | "gannbox"
    | "trendangle"
    // Wave 6B — 2-point (no text)
    | "gannfan"
    // Wave 6B — 2-point with text prompt at commit
    | "callout";
  // Wave 6B — multi-point tools
  type NPointDraftType =
    | "channel"
    | "pitch"
    | "triangle"
    | "triangle3"
    | "elliott3"
    | "abcd"
    | "xabcd"
    | "elliott5"
    | "hs";
  type DrawDraft =
    | null
    | {
        type: TwoPointDraftType;
        a: DrawingPoint;
        b: DrawingPoint;
      }
    | {
        type: "long" | "short";
        a: DrawingPoint;
        b: DrawingPoint;
        c: DrawingPoint;
        /** 1 means waiting for stop, 2 waiting for target */
        phase: 1 | 2;
      }
    | {
        type: NPointDraftType;
        /** Array length = phase (committed) + 1 (in-progress hover slot) */
        points: DrawingPoint[];
        phase: number;
        maxPoints: number;
      }
    // Wave 6C — brush polyline (pointer drag)
    | {
        type: "brush";
        points: DrawingPoint[];
      };
  const [draft, setDraft] = useState<DrawDraft>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const [pillsCollapsed, setPillsCollapsed] = useState(false);
  /** Live preview while hovering with long/short tool active */
  const [lsHover, setLsHover] = useState<{ time: number; price: number } | null>(
    null,
  );

  // Helper — compute pane top offsets from chart layout
  function recomputePaneOffsets() {
    if (!chartRef.current) return;
    const panes = chartRef.current.panes();
    let top = 0;
    const offsets: PaneOffset[] = panes.map((p) => {
      const h = p.getHeight();
      const o = { top, height: h };
      top += h;
      return o;
    });
    setPaneOffsets(offsets);
  }

  // Create chart once
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: TV_COLORS.bg },
        textColor: TV_COLORS.text,
        fontFamily: "var(--font-sans), Inter, system-ui, sans-serif",
        fontSize: 11,
        panes: { separatorColor: TV_COLORS.border, separatorHoverColor: TV_COLORS.border },
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: TV_COLORS.grid },
        horzLines: { color: TV_COLORS.grid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: TV_COLORS.textMuted, width: 1, style: 3, labelBackgroundColor: TV_COLORS.panel },
        horzLine: { color: TV_COLORS.textMuted, width: 1, style: 3, labelBackgroundColor: TV_COLORS.panel },
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
        barSpacing: 8,
      },
      autoSize: true,
    });

    // PANE 0 — Candles + EMAs
    candleSeriesRef.current = chart.addSeries(CandlestickSeries, {
      upColor: TV_COLORS.green,
      downColor: TV_COLORS.red,
      borderUpColor: TV_COLORS.green,
      borderDownColor: TV_COLORS.red,
      wickUpColor: TV_COLORS.green,
      wickDownColor: TV_COLORS.red,
      priceLineColor: TV_COLORS.textMuted,
      priceLineStyle: 2,
    });

    ema20Ref.current = chart.addSeries(LineSeries, {
      color: INDICATOR_COLORS.ema20,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    ema50Ref.current = chart.addSeries(LineSeries, {
      color: INDICATOR_COLORS.ema50,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    ema200Ref.current = chart.addSeries(LineSeries, {
      color: INDICATOR_COLORS.ema200,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    vwapRef.current = chart.addSeries(LineSeries, {
      color: INDICATOR_COLORS.vwap,
      lineWidth: 2,
      lineStyle: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    sma20Ref.current = chart.addSeries(LineSeries, {
      color: INDICATOR_COLORS.sma20,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    sma50Ref.current = chart.addSeries(LineSeries, {
      color: INDICATOR_COLORS.sma50,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    bbUpperRef.current = chart.addSeries(LineSeries, {
      color: INDICATOR_COLORS.bb,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    bbBasisRef.current = chart.addSeries(LineSeries, {
      color: INDICATOR_COLORS.bb,
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    bbLowerRef.current = chart.addSeries(LineSeries, {
      color: INDICATOR_COLORS.bb,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    chartRef.current = chart;

    // Click handler — dispatch to active tool
    chart.subscribeClick((param) => {
      if (!param.point || !candleSeriesRef.current) return;
      const rawPrice = candleSeriesRef.current.coordinateToPrice(param.point.y);
      if (rawPrice === null || !isFinite(rawPrice)) return;
      const tool = toolRef.current;
      const sym = symbolRef.current;

      // Wave 6C — magnet snap: round price to nearest OHLC of the candle
      // closest in time to the click. Off if magnetMode is false.
      let price = rawPrice as number;
      const magnetOn = useChartStore.getState().magnetMode;
      if (magnetOn && param.time) {
        const t = Number(param.time);
        const arr = candlesRef.current;
        let near: (typeof arr)[number] | null = null;
        let bestDiff = Infinity;
        for (const c of arr) {
          const dt = Math.abs(c.time - t);
          if (dt < bestDiff) {
            bestDiff = dt;
            near = c;
          }
        }
        if (near) {
          let snapped = price;
          let snapDiff = Infinity;
          for (const v of [near.open, near.high, near.low, near.close]) {
            const dp = Math.abs(v - price);
            if (dp < snapDiff) {
              snapDiff = dp;
              snapped = v;
            }
          }
          price = snapped;
        }
      }

      // Click on empty chart with cursor tool → deselect any selected drawing
      if (tool === "cursor") {
        useChartStore.getState().selectDrawing(null);
      }

      // If replay is active for this slot, clicking a candle moves the replay index
      if (replayActiveRef.current && param.time) {
        const tApi = Number(param.time);
        const arr = candlesRef.current;
        // Find index of candle whose time is closest to clicked time
        let bestIdx = -1;
        let bestDiff = Infinity;
        for (let i = 0; i < arr.length; i++) {
          const diff = Math.abs(arr[i].time - tApi);
          if (diff < bestDiff) {
            bestDiff = diff;
            bestIdx = i;
          }
        }
        if (bestIdx >= 0) {
          useChartStore.getState().setReplayIndex(bestIdx);
        }
        return;
      }

      if (tool === "vline" || tool === "hlineExt") {
        if (!param.time) return;
        const time = Number(param.time);
        addDrawingRef.current({
          type: tool,
          symbol: sym,
          at: { time, price },
        });
        setToolRef.current("cursor");
        return;
      }

      // Wave 6A — 1-point tools that commit immediately
      if (
        tool === "hline" ||
        tool === "cross" ||
        tool === "flag" ||
        tool === "plabel"
      ) {
        if (!param.time) return;
        const time = Number(param.time);
        addDrawingRef.current({
          type: tool,
          symbol: sym,
          at: { time, price },
        });
        setToolRef.current("cursor");
        return;
      }

      if (tool === "measure") {
        if (!param.time) return;
        const time = Number(param.time);
        const current = measureRef.current;
        if (current.phase === "idle") {
          setMeasure({
            phase: "placing",
            a: { time, price },
            b: { time, price },
          });
        } else if (current.phase === "placing") {
          setMeasure({
            phase: "done",
            a: current.a,
            b: { time, price },
          });
        } else {
          setMeasure({
            phase: "placing",
            a: { time, price },
            b: { time, price },
          });
        }
        return;
      }

      if (tool === "text") {
        if (!param.time) return;
        const time = Number(param.time);
        const text = window.prompt("Texto:");
        if (text && text.trim()) {
          addDrawingRef.current({
            type: "text",
            symbol: sym,
            at: { time, price },
            text: text.trim(),
          });
        }
        setToolRef.current("cursor");
        return;
      }

      if (
        tool === "trendline" ||
        tool === "arrow" ||
        tool === "ray" ||
        tool === "fib" ||
        tool === "rect" ||
        tool === "hrange" ||
        // Wave 6A — 2-point tools
        tool === "ellipse" ||
        tool === "trange" ||
        tool === "forecast" ||
        tool === "cycle" ||
        tool === "regression" ||
        tool === "fibext" ||
        tool === "fibarc" ||
        tool === "fibfan" ||
        tool === "gannbox" ||
        tool === "trendangle" ||
        // Wave 6B — 2-point (no text)
        tool === "gannfan"
      ) {
        if (!param.time) return;
        const time = Number(param.time);
        const current = draftRef.current;
        if (
          !current ||
          current.type === "long" ||
          current.type === "short" ||
          current.type !== tool
        ) {
          const newDraft: DrawDraft = {
            type: tool,
            a: { time, price },
            b: { time, price },
          };
          draftRef.current = newDraft;
          setDraft(newDraft);
        } else {
          addDrawingRef.current({
            type: tool,
            symbol: sym,
            a: current.a,
            b: { time, price },
          });
          // Aggressively clear draft + tool so crosshair move can't re-apply it
          draftRef.current = null;
          toolRef.current = "cursor";
          setDraft(null);
          setToolRef.current("cursor");
        }
        return;
      }

      // Wave 6B — callout (2pt + text prompt on 2nd click)
      if (tool === "callout") {
        if (!param.time) return;
        const time = Number(param.time);
        const current = draftRef.current;
        if (
          !current ||
          !("a" in current) ||
          current.type !== "callout"
        ) {
          const newDraft: DrawDraft = {
            type: "callout",
            a: { time, price },
            b: { time, price },
          };
          draftRef.current = newDraft;
          setDraft(newDraft);
        } else {
          const text = window.prompt("Texto del callout:") ?? "";
          if (text.trim()) {
            addDrawingRef.current({
              type: "callout",
              symbol: sym,
              a: current.a,
              b: { time, price },
              text: text.trim(),
            });
          }
          draftRef.current = null;
          toolRef.current = "cursor";
          setDraft(null);
          setToolRef.current("cursor");
        }
        return;
      }

      // Wave 6B — N-point tools (channel 3, pitch 3, triangle 3, triangle3 3,
      // elliott3 3, abcd 4, xabcd 5, elliott5 5, hs 5)
      const MAX_PTS: Partial<Record<DrawingTool, number>> = {
        channel: 3,
        pitch: 3,
        triangle: 3,
        triangle3: 3,
        elliott3: 3,
        abcd: 4,
        xabcd: 5,
        elliott5: 5,
        hs: 5,
      };
      const maxPts = MAX_PTS[tool];
      if (maxPts !== undefined) {
        if (!param.time) return;
        const time = Number(param.time);
        const pt: DrawingPoint = { time, price };
        const current = draftRef.current;
        const isMatchingNDraft =
          current &&
          "points" in current &&
          (current as { type: string }).type === tool;
        if (!isMatchingNDraft) {
          // First click — start a draft with 1 committed point + hover slot
          const newDraft: DrawDraft = {
            type: tool as NPointDraftType,
            points: [pt, pt],
            phase: 1,
            maxPoints: maxPts,
          };
          draftRef.current = newDraft;
          setDraft(newDraft);
        } else {
          // Append the new point; commit if we hit maxPoints
          const cur = current as Extract<DrawDraft, { phase: number; maxPoints: number }>;
          const committed = cur.points.slice(0, cur.phase);
          const nextCommitted = [...committed, pt];
          if (nextCommitted.length === cur.maxPoints) {
            addDrawingRef.current({
              type: tool as NPointDraftType,
              symbol: sym,
              points: nextCommitted,
            });
            draftRef.current = null;
            toolRef.current = "cursor";
            setDraft(null);
            setToolRef.current("cursor");
          } else {
            const newDraft: DrawDraft = {
              type: tool as NPointDraftType,
              points: [...nextCommitted, pt],
              phase: nextCommitted.length,
              maxPoints: cur.maxPoints,
            };
            draftRef.current = newDraft;
            setDraft(newDraft);
          }
        }
        return;
      }

      if (tool === "long" || tool === "short") {
        if (!param.time) return;
        const time = Number(param.time);
        // 1 click and done — entry at click, stop/target at sensible defaults (R:R 1:2)
        const riskPct = 0.01; // 1% default
        const stopPrice =
          tool === "long" ? price * (1 - riskPct) : price * (1 + riskPct);
        const targetPrice =
          tool === "long"
            ? price * (1 + riskPct * 2)
            : price * (1 - riskPct * 2);
        addDrawingRef.current({
          type: tool,
          symbol: sym,
          a: { time, price },
          b: { time, price: stopPrice },
          c: { time, price: targetPrice },
        });
        setToolRef.current("cursor");
        return;
      }
    });

    // Crosshair handler
    chart.subscribeCrosshairMove((param) => {
      if (
        toolRef.current === "measure" &&
        measureRef.current.phase === "placing" &&
        param.point &&
        param.time &&
        candleSeriesRef.current
      ) {
        const price = candleSeriesRef.current.coordinateToPrice(param.point.y);
        if (price !== null && isFinite(price)) {
          const time = Number(param.time);
          setMeasure((prev) =>
            prev.phase === "placing" ? { ...prev, b: { time, price } } : prev,
          );
        }
      }

      // Long/short hover preview — track cursor for live SL/TP lines
      if (
        (toolRef.current === "long" || toolRef.current === "short") &&
        param.point &&
        param.time &&
        candleSeriesRef.current
      ) {
        const price = candleSeriesRef.current.coordinateToPrice(param.point.y);
        if (price !== null && isFinite(price)) {
          setLsHover({ time: Number(param.time), price });
        }
      } else if (
        toolRef.current !== "long" &&
        toolRef.current !== "short" &&
        lsHover
      ) {
        setLsHover(null);
      }

      const draftNow = draftRef.current;
      // Only update the in-progress draft endpoint if the active tool MATCHES
      // the draft type (avoids stuck endpoint after commit).
      if (
        draftNow &&
        draftNow.type !== "long" &&
        draftNow.type !== "short" &&
        draftNow.type === toolRef.current &&
        param.point &&
        param.time &&
        candleSeriesRef.current
      ) {
        const price = candleSeriesRef.current.coordinateToPrice(param.point.y);
        if (price !== null && isFinite(price)) {
          const time = Number(param.time);
          setDraft((prev) => {
            if (!prev || prev.type === "long" || prev.type === "short") {
              return prev;
            }
            // N-point draft: update the hover slot (last index)
            if ("points" in prev) {
              const next = [...prev.points];
              next[next.length - 1] = { time, price };
              return { ...prev, points: next };
            }
            // 2-point draft
            return { ...prev, b: { time, price } };
          });
        }
      }

      if (!param.time || !candleSeriesRef.current) {
        setHover(null);
        setHoverValues({});
        return;
      }
      const data = param.seriesData.get(candleSeriesRef.current);
      const vol = volumeSeriesRef.current
        ? param.seriesData.get(volumeSeriesRef.current)
        : null;
      if (data && "open" in data) {
        const o = data.open as number;
        const c = data.close as number;
        const v = vol && "value" in vol ? (vol.value as number) : 0;
        setHover({
          o,
          h: data.high as number,
          l: data.low as number,
          c,
          v,
          time: Number(param.time),
          pct: o === 0 ? 0 : ((c - o) / o) * 100,
        });
        const lineVal = (
          ref: { current: ISeriesApi<"Line"> | null },
        ): number | undefined => {
          const r = ref.current;
          if (!r) return undefined;
          const d = param.seriesData.get(r);
          return d && "value" in d ? (d.value as number) : undefined;
        };
        setHoverValues({
          ema20: lineVal(ema20Ref),
          ema50: lineVal(ema50Ref),
          ema200: lineVal(ema200Ref),
          sma20: lineVal(sma20Ref),
          sma50: lineVal(sma50Ref),
          bbUpper: lineVal(bbUpperRef),
          bbBasis: lineVal(bbBasisRef),
          bbLower: lineVal(bbLowerRef),
          vwap: lineVal(vwapRef),
          rsi: lineVal(rsiRef),
          macd: lineVal(macdRef),
          macdSignal: lineVal(macdSignalRef),
          atr: lineVal(atrRef),
          obv: lineVal(obvRef),
          stochK: lineVal(stochKRef),
          stochD: lineVal(stochDRef),
          volume: v,
        });
      }
    });

    // Re-render measure overlay on pan / zoom so pixel coords stay in sync
    const tsRangeHandler = () => setRenderTick((t) => t + 1);
    chart.timeScale().subscribeVisibleTimeRangeChange(tsRangeHandler);
    const logicalRangeHandler = () => setRenderTick((t) => t + 1);
    chart.timeScale().subscribeVisibleLogicalRangeChange(logicalRangeHandler);

    // ResizeObserver — recompute pane offsets when chart container resizes
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setContainerSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
      requestAnimationFrame(() => recomputePaneOffsets());
    });
    ro.observe(containerRef.current);
    recomputePaneOffsets();
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setContainerSize({ width: rect.width, height: rect.height });
    }

    return () => {
      chart.timeScale().unsubscribeVisibleTimeRangeChange(tsRangeHandler);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(logicalRangeHandler);
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      priceLinesMapRef.current.clear();
      ema20Ref.current = null;
      ema50Ref.current = null;
      ema200Ref.current = null;
      sma20Ref.current = null;
      sma50Ref.current = null;
      bbUpperRef.current = null;
      bbBasisRef.current = null;
      bbLowerRef.current = null;
      vwapRef.current = null;
      rsiRef.current = null;
      rsi30Ref.current = null;
      rsi70Ref.current = null;
      macdRef.current = null;
      macdSignalRef.current = null;
      macdHistRef.current = null;
      atrRef.current = null;
      obvRef.current = null;
      stochKRef.current = null;
      stochDRef.current = null;
    };
  }, []);

  // Manage volume — overlay at the bottom of the main pane
  useEffect(() => {
    if (!chartRef.current) return;
    if (indicators.volume && !volumeSeriesRef.current) {
      const v = chartRef.current.addSeries(
        HistogramSeries,
        {
          priceFormat: { type: "volume" },
          priceScaleId: "volume",
          color: TV_COLORS.textMuted,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        0,
      );
      v.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      volumeSeriesRef.current = v;
      const data = getViewCandles().map((k) => ({
        time: k.time as UTCTimestamp,
        value: k.volume,
        color: k.close >= k.open ? `${TV_COLORS.green}66` : `${TV_COLORS.red}66`,
      }));
      v.setData(data);
    } else if (!indicators.volume && volumeSeriesRef.current && chartRef.current) {
      chartRef.current.removeSeries(volumeSeriesRef.current);
      volumeSeriesRef.current = null;
    }
    requestAnimationFrame(() => recomputePaneOffsets());
  }, [indicators.volume]);

  // Unified subpane manager — rebuilds the lower panes (rsi, macd, atr, obv,
  // stoch) in a fixed order whenever the active set changes, so pane indices
  // always stay sequential and correct.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const subRefs = [
      rsiRef,
      rsi30Ref,
      rsi70Ref,
      macdRef,
      macdSignalRef,
      macdHistRef,
      atrRef,
      obvRef,
      stochKRef,
      stochDRef,
    ];
    for (const ref of subRefs) {
      if (ref.current) {
        try {
          chart.removeSeries(ref.current);
        } catch {}
        ref.current = null;
      }
    }

    const order: IndicatorKey[] = ["rsi", "macd", "atr", "obv", "stoch"];
    const active = order.filter((k) => indicators[k]);
    const dim = { priceLineVisible: false, lastValueVisible: false } as const;

    active.forEach((key, i) => {
      const pane = i + 1;
      if (key === "rsi") {
        rsiRef.current = chart.addSeries(
          LineSeries,
          { color: INDICATOR_COLORS.rsi, lineWidth: 1, ...dim },
          pane,
        );
        rsi30Ref.current = chart.addSeries(
          LineSeries,
          { color: TV_COLORS.textMuted, lineWidth: 1, lineStyle: 2, ...dim },
          pane,
        );
        rsi70Ref.current = chart.addSeries(
          LineSeries,
          { color: TV_COLORS.textMuted, lineWidth: 1, lineStyle: 2, ...dim },
          pane,
        );
      } else if (key === "macd") {
        macdRef.current = chart.addSeries(
          LineSeries,
          { color: INDICATOR_COLORS.macd, lineWidth: 1, ...dim },
          pane,
        );
        macdSignalRef.current = chart.addSeries(
          LineSeries,
          { color: TV_COLORS.yellow, lineWidth: 1, ...dim },
          pane,
        );
        macdHistRef.current = chart.addSeries(
          HistogramSeries,
          { ...dim },
          pane,
        );
      } else if (key === "atr") {
        atrRef.current = chart.addSeries(
          LineSeries,
          { color: INDICATOR_COLORS.atr, lineWidth: 1, ...dim },
          pane,
        );
      } else if (key === "obv") {
        obvRef.current = chart.addSeries(
          LineSeries,
          { color: INDICATOR_COLORS.obv, lineWidth: 1, ...dim },
          pane,
        );
      } else if (key === "stoch") {
        stochKRef.current = chart.addSeries(
          LineSeries,
          { color: INDICATOR_COLORS.stoch, lineWidth: 1, ...dim },
          pane,
        );
        stochDRef.current = chart.addSeries(
          LineSeries,
          { color: TV_COLORS.yellow, lineWidth: 1, ...dim },
          pane,
        );
      }
    });

    try {
      const isMobile =
        typeof window !== "undefined" && window.innerWidth < 768;
      chart.panes()[0]?.setStretchFactor(isMobile ? 5 : 3);
      for (let p = 1; p <= active.length; p++) {
        chart.panes()[p]?.setStretchFactor(1);
      }
    } catch {}

    updateRSI();
    updateMACD();
    updateATR();
    updateOBV();
    updateStoch();
    requestAnimationFrame(() => recomputePaneOffsets());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    indicators.rsi,
    indicators.macd,
    indicators.atr,
    indicators.obv,
    indicators.stoch,
  ]);

  // Visibility — eye toggle (hidden state) + enabled state combined
  useEffect(() => {
    const v = (key: IndicatorKey) =>
      Boolean(indicators[key]) && !hidden[key];
    ema20Ref.current?.applyOptions({ visible: v("ema20") });
    ema50Ref.current?.applyOptions({ visible: v("ema50") });
    ema200Ref.current?.applyOptions({ visible: v("ema200") });
    sma20Ref.current?.applyOptions({ visible: v("sma20") });
    sma50Ref.current?.applyOptions({ visible: v("sma50") });
    bbUpperRef.current?.applyOptions({ visible: v("bb") });
    bbBasisRef.current?.applyOptions({ visible: v("bb") });
    bbLowerRef.current?.applyOptions({ visible: v("bb") });
    vwapRef.current?.applyOptions({ visible: v("vwap") });
    if (rsiRef.current) rsiRef.current.applyOptions({ visible: v("rsi") });
    if (rsi30Ref.current) rsi30Ref.current.applyOptions({ visible: v("rsi") });
    if (rsi70Ref.current) rsi70Ref.current.applyOptions({ visible: v("rsi") });
    if (macdRef.current) macdRef.current.applyOptions({ visible: v("macd") });
    if (macdSignalRef.current) macdSignalRef.current.applyOptions({ visible: v("macd") });
    if (macdHistRef.current) macdHistRef.current.applyOptions({ visible: v("macd") });
    if (atrRef.current) atrRef.current.applyOptions({ visible: v("atr") });
    if (obvRef.current) obvRef.current.applyOptions({ visible: v("obv") });
    if (stochKRef.current) stochKRef.current.applyOptions({ visible: v("stoch") });
    if (stochDRef.current) stochDRef.current.applyOptions({ visible: v("stoch") });
    if (volumeSeriesRef.current) volumeSeriesRef.current.applyOptions({ visible: v("volume") });
  }, [indicators, hidden]);

  // Wave 6C — brush polyline (pointer drag). Disables chart pan/zoom while
  // active so dragging draws instead of panning. Commits on pointerup.
  useEffect(() => {
    if (tool !== "brush") return;
    const el = containerRef.current;
    const chart = chartRef.current;
    if (!el || !chart) return;

    chart.applyOptions({ handleScroll: false, handleScale: false });

    let lastX = -1;
    let lastY = -1;
    const getRel = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const onDown = (e: PointerEvent) => {
      const { x, y } = getRel(e);
      const pt = fromCoord(x, y);
      if (!pt) return;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {}
      lastX = x;
      lastY = y;
      const newDraft: DrawDraft = { type: "brush", points: [pt] };
      draftRef.current = newDraft;
      setDraft(newDraft);
    };
    const onMove = (e: PointerEvent) => {
      const curr = draftRef.current;
      if (!curr || curr.type !== "brush") return;
      const { x, y } = getRel(e);
      if (Math.hypot(x - lastX, y - lastY) < 3) return;
      const pt = fromCoord(x, y);
      if (!pt) return;
      lastX = x;
      lastY = y;
      setDraft((prev) =>
        prev && prev.type === "brush"
          ? { type: "brush", points: [...prev.points, pt] }
          : prev,
      );
    };
    const onUp = (e: PointerEvent) => {
      const curr = draftRef.current;
      if (curr && curr.type === "brush" && curr.points.length > 1) {
        addDrawingRef.current({
          type: "brush",
          symbol: symbolRef.current,
          points: curr.points,
        });
      }
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {}
      draftRef.current = null;
      setDraft(null);
      setToolRef.current("cursor");
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    return () => {
      try {
        chart.applyOptions({ handleScroll: true, handleScale: true });
      } catch {}
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool]);

  // Re-theme the chart canvas (lightweight-charts ignores CSS variables)
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const c = theme === "light" ? LIGHT_CHART : TV_COLORS;
    chart.applyOptions({
      layout: {
        background: { color: c.bg },
        textColor: c.textMuted,
        panes: { separatorColor: c.border, separatorHoverColor: c.border },
      },
      grid: {
        vertLines: { color: c.grid },
        horzLines: { color: c.grid },
      },
      crosshair: {
        vertLine: { color: c.textMuted, labelBackgroundColor: c.panel },
        horzLine: { color: c.textMuted, labelBackgroundColor: c.panel },
      },
      rightPriceScale: { borderColor: c.border },
      timeScale: { borderColor: c.border },
    });
    candleSeriesRef.current?.applyOptions({
      upColor: c.green,
      downColor: c.red,
      borderUpColor: c.green,
      borderDownColor: c.red,
      wickUpColor: c.green,
      wickDownColor: c.red,
      priceLineColor: c.textMuted,
    });
  }, [theme]);

  // Recompute indicators when config changes (periods)
  useEffect(() => {
    updateEMAs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    config.ema20,
    config.ema50,
    config.ema200,
    config.sma20,
    config.sma50,
    config.bbPeriod,
    config.bbStdDev,
  ]);

  useEffect(() => {
    updateRSI();
  }, [config.rsi]);

  useEffect(() => {
    updateMACD();
  }, [config.macdFast, config.macdSlow, config.macdSignal]);

  useEffect(() => {
    updateATR();
  }, [config.atr]);

  useEffect(() => {
    updateStoch();
  }, [config.stochK, config.stochD]);

  // Sync price lines from store to the candle series
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;
    const map = priceLinesMapRef.current;
    const linesForThisSymbol = priceLines.filter((p) => p.symbol === symbol);
    const activeIds = new Set(linesForThisSymbol.map((p) => p.id));

    for (const [id, apiLine] of map.entries()) {
      if (!activeIds.has(id)) {
        try {
          series.removePriceLine(apiLine);
        } catch {}
        map.delete(id);
      }
    }
    for (const pl of linesForThisSymbol) {
      if (!map.has(pl.id)) {
        const apiLine = series.createPriceLine({
          price: pl.price,
          color: TV_COLORS.blue,
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: "",
        });
        map.set(pl.id, apiLine);
      }
    }
  }, [priceLines, symbol]);

  // Cursor style when drawing tools are active + reset state on tool change
  useEffect(() => {
    if (containerRef.current) {
      const drawTools: string[] = [
        "hline",
        "vline",
        "hlineExt",
        "measure",
        "trendline",
        "ray",
        "arrow",
        "fib",
        "rect",
        "hrange",
        "long",
        "short",
        "text",
        // Wave 6A
        "cross",
        "flag",
        "plabel",
        "ellipse",
        "trange",
        "forecast",
        "cycle",
        "regression",
        "fibext",
        "fibarc",
        "fibfan",
        "gannbox",
        "trendangle",
        // Wave 6B
        "channel",
        "pitch",
        "triangle",
        "triangle3",
        "elliott3",
        "abcd",
        "xabcd",
        "elliott5",
        "hs",
        "gannfan",
        "callout",
        // Wave 6C
        "brush",
      ];
      containerRef.current.style.cursor = drawTools.includes(tool)
        ? "crosshair"
        : "";
    }
    if (tool !== "measure") setMeasure(INITIAL_MEASURE);
    const draftTools = [
      "trendline",
      "arrow",
      "ray",
      "fib",
      "rect",
      "hrange",
      "long",
      "short",
      // Wave 6A (2-point)
      "ellipse",
      "trange",
      "forecast",
      "cycle",
      "regression",
      "fibext",
      "fibarc",
      "fibfan",
      "gannbox",
      "trendangle",
      // Wave 6B
      "channel",
      "pitch",
      "triangle",
      "triangle3",
      "elliott3",
      "abcd",
      "xabcd",
      "elliott5",
      "hs",
      "gannfan",
      "callout",
      // Wave 6C
      "brush",
    ];
    if (!draftTools.includes(tool)) {
      setDraft(null);
    }
    if (tool !== "long" && tool !== "short") {
      setLsHover(null);
    }
  }, [tool]);

  // Esc cancels current draft / measure; Delete/Backspace removes selected drawing
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      if (e.key === "Escape") {
        setDraft(null);
        setMeasure(INITIAL_MEASURE);
        selectDrawing(null);
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedDrawingId) {
        e.preventDefault();
        removeDrawing(selectedDrawingId);
        selectDrawing(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedDrawingId, removeDrawing, selectDrawing]);

  // Doble click sobre el fondo del chart → toggle focus mode.
  // Listener nativo en capture phase: corre antes que cualquier handler de
  // lightweight-charts, así no importa si LWC frena la propagación. Si el
  // doble click fue sobre un dibujo (dentro del SVG de DrawingsLayer) se
  // ignora — el dialog de propiedades de Wave 7 ya se encarga de eso.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const onDbl = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (t && t.closest("svg")) return;
      window.dispatchEvent(new CustomEvent("ether:focus-toggle"));
    };
    el.addEventListener("dblclick", onDbl, true);
    return () => el.removeEventListener("dblclick", onDbl, true);
  }, []);

  // Capture chart as PNG — triggered by Header via custom event.
  // Compone el canvas de lightweight-charts + el SVG de DrawingsLayer
  // (dibujos: trendlines, long/short, fib, etc.) en un solo PNG. Sin esto
  // el screenshot del chart no mostraría ningún dibujo.
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ slotId?: string }>;
      if (ce.detail?.slotId && slotId && ce.detail.slotId !== slotId) return;
      const chart = chartRef.current;
      if (!chart) return;
      const chartCanvas = chart.takeScreenshot();

      // Crear un canvas combinado del mismo tamaño que el chart canvas.
      const out = document.createElement("canvas");
      out.width = chartCanvas.width;
      out.height = chartCanvas.height;
      const ctx = out.getContext("2d");
      if (!ctx) return;
      // 1) chart canvas como capa base
      ctx.drawImage(chartCanvas, 0, 0);

      // 2) buscar el SVG de drawings (hermano del containerRef en el wrapper)
      const wrapper = containerRef.current?.parentElement;
      const svg = wrapper?.querySelector("svg");

      const finalize = () => {
        out.toBlob((blob) => {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          const safeSymbol = symbol.replace(/[^a-zA-Z0-9]/g, "") || "chart";
          const stamp = new Date()
            .toISOString()
            .replace(/[:.]/g, "-")
            .slice(0, 19);
          a.download = `${safeSymbol}-${timeframe}-${stamp}.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        });
      };

      if (!svg) {
        finalize();
        return;
      }

      try {
        // Asegurar dimensiones explícitas en el SVG serializado.
        const cloned = svg.cloneNode(true) as SVGSVGElement;
        const wrapRect = wrapper!.getBoundingClientRect();
        cloned.setAttribute("width", String(wrapRect.width));
        cloned.setAttribute("height", String(wrapRect.height));
        cloned.setAttribute(
          "viewBox",
          `0 0 ${wrapRect.width} ${wrapRect.height}`,
        );
        const xml = new XMLSerializer().serializeToString(cloned);
        const blob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          // Escalar al tamaño del out canvas (puede diferir si el chart tiene
          // padding interno respecto al wrapper). Usamos el ratio canvas/wrapper.
          const sx = out.width / wrapRect.width;
          const sy = out.height / wrapRect.height;
          ctx.save();
          ctx.scale(sx, sy);
          ctx.drawImage(img, 0, 0);
          ctx.restore();
          URL.revokeObjectURL(url);
          finalize();
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          finalize();
        };
        img.src = url;
      } catch {
        finalize();
      }
    };
    window.addEventListener("ether:capture", handler);
    return () => window.removeEventListener("ether:capture", handler);
  }, [symbol, timeframe, slotId]);

  // Start replay when Header dispatches event for this slot
  const startReplay = useChartStore((s) => s.startReplay);
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ slotId?: string }>;
      if (ce.detail?.slotId && slotId && ce.detail.slotId !== slotId) return;
      if (candlesRef.current.length === 0) return;
      startReplay(slotId ?? "slot-1", candlesRef.current.length);
    };
    window.addEventListener("ether:start-replay", handler);
    return () => window.removeEventListener("ether:start-replay", handler);
  }, [slotId, startReplay]);

  // Lazy-load older candles when panning to the left edge
  useEffect(() => {
    if (!chartRef.current) return;
    let loading = false;
    let exhausted = false;
    let cancelled = false;
    const handler = (range: { from: unknown; to: unknown } | null) => {
      if (cancelled || !range || loading || exhausted) return;
      const arr = candlesRef.current;
      if (arr.length < 10) return;
      const firstTime = arr[0].time;
      const fromVal = Number(range.from);
      // If the visible range reaches the first 5% of our data, fetch older
      if (fromVal <= firstTime + 5) {
        loading = true;
        fetchOlderCandles(symbol, timeframe, firstTime)
          .then((older) => {
            // Bail out if symbol/timeframe changed while the fetch was in
            // flight — otherwise we'd setData with stale-tf candles.
            if (cancelled) return;
            if (older.length === 0) {
              exhausted = true;
              return;
            }
            const merged = [...older, ...candlesRef.current];
            candlesRef.current = merged;
            if (candleSeriesRef.current) {
              candleSeriesRef.current.setData(
                merged.map((k) => ({
                  time: k.time as UTCTimestamp,
                  open: k.open,
                  high: k.high,
                  low: k.low,
                  close: k.close,
                })),
              );
            }
            if (volumeSeriesRef.current) {
              volumeSeriesRef.current.setData(
                merged.map((k) => ({
                  time: k.time as UTCTimestamp,
                  value: k.volume,
                  color:
                    k.close >= k.open
                      ? `${TV_COLORS.green}66`
                      : `${TV_COLORS.red}66`,
                })),
              );
            }
            updateEMAs();
            updateRSI();
            updateMACD();
            updateATR();
            updateOBV();
            updateStoch();
          })
          .catch((e) => console.error("loadOlder", e))
          .finally(() => {
            loading = false;
          });
      }
    };
    const rangeHandler = () => {
      const r = chartRef.current?.timeScale().getVisibleRange();
      handler(r as { from: unknown; to: unknown } | null);
    };
    const ts = chartRef.current.timeScale();
    ts.subscribeVisibleLogicalRangeChange(rangeHandler);
    return () => {
      // Detach this effect's handler AND mark in-flight fetches as cancelled,
      // so that across timeframe/symbol changes we don't accumulate stale
      // closures or apply old-tf results to the new chart.
      cancelled = true;
      try {
        ts.unsubscribeVisibleLogicalRangeChange(rangeHandler);
      } catch {}
    };
  }, [symbol, timeframe]);

  // Sync zoom across slots
  useEffect(() => {
    if (!chartRef.current) return;
    let suppress = false;
    const onRange = (range: { from: unknown; to: unknown } | null) => {
      if (!range || !syncChartsRef.current || suppress) return;
      window.dispatchEvent(
        new CustomEvent("ether:tf-range", {
          detail: { from: range.from, to: range.to, sourceSlot: slotId },
        }),
      );
    };
    chartRef.current.timeScale().subscribeVisibleTimeRangeChange(onRange);

    const onIncoming = (e: Event) => {
      const ce = e as CustomEvent<{
        from: unknown;
        to: unknown;
        sourceSlot?: string;
      }>;
      if (!syncChartsRef.current) return;
      if (ce.detail.sourceSlot === slotId) return;
      const chart = chartRef.current;
      if (!chart) return;
      suppress = true;
      try {
        chart
          .timeScale()
          .setVisibleRange({
            from: ce.detail.from as never,
            to: ce.detail.to as never,
          });
      } catch {}
      setTimeout(() => {
        suppress = false;
      }, 50);
    };
    window.addEventListener("ether:tf-range", onIncoming);
    return () => {
      chartRef.current?.timeScale().unsubscribeVisibleTimeRangeChange(onRange);
      window.removeEventListener("ether:tf-range", onIncoming);
    };
  }, [slotId]);

  function updateEMAs() {
    const c = getViewCandles();
    if (c.length === 0) return;
    const cfg = configRef.current;
    let last20: number | undefined;
    let last50: number | undefined;
    let last200: number | undefined;
    let lastVwap: number | undefined;

    if (vwapRef.current) {
      const data = vwap(c);
      vwapRef.current.setData(
        data.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
      );
      lastVwap = data.at(-1)?.value;
    }

    if (ema20Ref.current) {
      const data = ema(c, cfg.ema20);
      ema20Ref.current.setData(
        data.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
      );
      last20 = data.at(-1)?.value;
    }
    if (ema50Ref.current) {
      const data = ema(c, cfg.ema50);
      ema50Ref.current.setData(
        data.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
      );
      last50 = data.at(-1)?.value;
    }
    if (ema200Ref.current) {
      const data = ema(c, cfg.ema200);
      ema200Ref.current.setData(
        data.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
      );
      last200 = data.at(-1)?.value;
    }

    let lastSma20: number | undefined;
    let lastSma50: number | undefined;
    if (sma20Ref.current) {
      const data = sma(c, cfg.sma20);
      sma20Ref.current.setData(
        data.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
      );
      lastSma20 = data.at(-1)?.value;
    }
    if (sma50Ref.current) {
      const data = sma(c, cfg.sma50);
      sma50Ref.current.setData(
        data.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
      );
      lastSma50 = data.at(-1)?.value;
    }

    let lastBbUpper: number | undefined;
    let lastBbBasis: number | undefined;
    let lastBbLower: number | undefined;
    if (bbBasisRef.current && bbUpperRef.current && bbLowerRef.current) {
      const data = bollinger(c, cfg.bbPeriod, cfg.bbStdDev);
      bbUpperRef.current.setData(
        data.map((p) => ({ time: p.time as UTCTimestamp, value: p.upper })),
      );
      bbBasisRef.current.setData(
        data.map((p) => ({ time: p.time as UTCTimestamp, value: p.basis })),
      );
      bbLowerRef.current.setData(
        data.map((p) => ({ time: p.time as UTCTimestamp, value: p.lower })),
      );
      const lb = data.at(-1);
      lastBbUpper = lb?.upper;
      lastBbBasis = lb?.basis;
      lastBbLower = lb?.lower;
    }

    const lastVol = c.at(-1)?.volume;
    setLastValues((prev) => ({
      ...prev,
      ema20: last20,
      ema50: last50,
      ema200: last200,
      sma20: lastSma20,
      sma50: lastSma50,
      bbUpper: lastBbUpper,
      bbBasis: lastBbBasis,
      bbLower: lastBbLower,
      vwap: lastVwap,
      volume: lastVol,
    }));
  }

  function updateRSI() {
    const c = getViewCandles();
    if (c.length === 0 || !rsiRef.current) return;
    const cfg = configRef.current;
    const data = rsi(c, cfg.rsi).map((p) => ({
      time: p.time as UTCTimestamp,
      value: p.value,
    }));
    rsiRef.current.setData(data);
    if (rsi30Ref.current && data.length > 0)
      rsi30Ref.current.setData([
        { time: data[0].time, value: 30 },
        { time: data[data.length - 1].time, value: 30 },
      ]);
    if (rsi70Ref.current && data.length > 0)
      rsi70Ref.current.setData([
        { time: data[0].time, value: 70 },
        { time: data[data.length - 1].time, value: 70 },
      ]);
    setLastValues((prev) => ({ ...prev, rsi: data.at(-1)?.value }));
  }

  function updateMACD() {
    const c = getViewCandles();
    if (c.length === 0 || !macdRef.current) return;
    const cfg = configRef.current;
    const m = macd(c, cfg.macdFast, cfg.macdSlow, cfg.macdSignal);
    macdRef.current.setData(
      m.map((p) => ({ time: p.time as UTCTimestamp, value: p.macd })),
    );
    macdSignalRef.current?.setData(
      m.map((p) => ({ time: p.time as UTCTimestamp, value: p.signal })),
    );
    macdHistRef.current?.setData(
      m.map((p) => ({
        time: p.time as UTCTimestamp,
        value: p.histogram,
        color: p.histogram >= 0 ? `${TV_COLORS.green}80` : `${TV_COLORS.red}80`,
      })),
    );
    const last = m.at(-1);
    setLastValues((prev) => ({
      ...prev,
      macd: last?.macd,
      macdSignal: last?.signal,
      macdHist: last?.histogram,
    }));
  }

  function updateATR() {
    const c = getViewCandles();
    if (c.length === 0 || !atrRef.current) return;
    const data = atr(c, configRef.current.atr);
    atrRef.current.setData(
      data.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
    );
    setLastValues((prev) => ({ ...prev, atr: data.at(-1)?.value }));
  }

  function updateOBV() {
    const c = getViewCandles();
    if (c.length === 0 || !obvRef.current) return;
    const data = obv(c);
    obvRef.current.setData(
      data.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
    );
    setLastValues((prev) => ({ ...prev, obv: data.at(-1)?.value }));
  }

  function updateStoch() {
    const c = getViewCandles();
    if (c.length === 0 || !stochKRef.current) return;
    const cfg = configRef.current;
    const data = stochastic(c, cfg.stochK, cfg.stochD);
    stochKRef.current.setData(
      data.map((p) => ({ time: p.time as UTCTimestamp, value: p.k })),
    );
    stochDRef.current?.setData(
      data.map((p) => ({ time: p.time as UTCTimestamp, value: p.d })),
    );
    const last = data.at(-1);
    setLastValues((prev) => ({
      ...prev,
      stochK: last?.k,
      stochD: last?.d,
    }));
  }

  // Load historical data + subscribe live
  useEffect(() => {
    const unsub = subscribeMarket(symbol, timeframe, {
      onInit: (klines) => {
        candlesRef.current = klines;
        if (candleSeriesRef.current) {
          candleSeriesRef.current.setData(
            klines.map((k) => ({
              time: k.time as UTCTimestamp,
              open: k.open,
              high: k.high,
              low: k.low,
              close: k.close,
            })),
          );
        }
        if (overlaySeriesRef.current) {
          overlaySeriesRef.current.setData(
            klines.map((k) => ({
              time: k.time as UTCTimestamp,
              value: k.close,
            })),
          );
        }
        if (volumeSeriesRef.current) {
          volumeSeriesRef.current.setData(
            klines.map((k) => ({
              time: k.time as UTCTimestamp,
              value: k.volume,
              color:
                k.close >= k.open
                  ? `${TV_COLORS.green}66`
                  : `${TV_COLORS.red}66`,
            })),
          );
        }
        updateEMAs();
        updateRSI();
        updateMACD();
        updateATR();
        updateOBV();
        updateStoch();
        chartRef.current?.timeScale().fitContent();
        requestAnimationFrame(() => recomputePaneOffsets());

        if (klines.length > 0) {
          const last = klines[klines.length - 1];
          const prev = klines[klines.length - 2] ?? last;
          setLastPrice({
            value: last.close,
            pct:
              prev.close === 0
                ? 0
                : ((last.close - prev.close) / prev.close) * 100,
          });
        }
      },
      onCandle: (k) => {
        if (!candleSeriesRef.current) return;
        const arr = candlesRef.current;
        const lastCandle = arr[arr.length - 1];
        if (lastCandle && lastCandle.time === k.time) {
          arr[arr.length - 1] = k;
        } else if (!lastCandle || k.time > lastCandle.time) {
          arr.push(k);
          if (arr.length > 2000) arr.shift();
        } else {
          return;
        }
        // During replay we keep ingesting data into the buffer but don't update the visible series
        if (replayActiveRef.current) return;
        candleSeriesRef.current.update({
          time: k.time as UTCTimestamp,
          open: k.open,
          high: k.high,
          low: k.low,
          close: k.close,
        });
        if (overlaySeriesRef.current) {
          overlaySeriesRef.current.update({
            time: k.time as UTCTimestamp,
            value: k.close,
          });
        }
        if (volumeSeriesRef.current) {
          volumeSeriesRef.current.update({
            time: k.time as UTCTimestamp,
            value: k.volume,
            color:
              k.close >= k.open
                ? `${TV_COLORS.green}66`
                : `${TV_COLORS.red}66`,
          });
        }
        updateEMAs();
        updateRSI();
        updateMACD();
        updateATR();
        updateOBV();
        updateStoch();
        const prev = arr[arr.length - 2] ?? lastCandle;
        setLastPrice({
          value: k.close,
          pct:
            prev && prev.close !== 0
              ? ((k.close - prev.close) / prev.close) * 100
              : 0,
        });
      },
      onError: (e) => console.error("Failed to load chart data:", e),
    });

    return () => unsub();
  }, [symbol, timeframe]);

  // Compare overlays — sync map of series with `compares`
  useEffect(() => {
    if (!chartRef.current) return;
    const chart = chartRef.current;
    const map = compareSeriesRef.current;
    const desired = new Set(compares);

    const COMPARE_COLORS = [
      "#ffb74d",
      "#ab47bc",
      "#26a69a",
      "#ef5350",
      "#42a5f5",
    ];

    // Remove stale
    for (const [sym, ser] of Array.from(map.entries())) {
      if (!desired.has(sym)) {
        try {
          chart.removeSeries(ser);
        } catch {}
        map.delete(sym);
      }
    }

    // Add new — fetch and create series
    let cancelled = false;
    compares.forEach((sym, idx) => {
      if (map.has(sym)) return;
      const color = COMPARE_COLORS[idx % COMPARE_COLORS.length];
      const ser = chart.addSeries(LineSeries, {
        color,
        lineWidth: 1,
        priceScaleId: `cmp-${sym}`,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: false,
        title: sym,
      });
      map.set(sym, ser);
      fetchCandles(sym, timeframe)
        .then((klines) => {
          if (cancelled || !map.has(sym)) return;
          ser.setData(
            klines.map((k) => ({
              time: k.time as UTCTimestamp,
              value: k.close,
            })),
          );
        })
        .catch((e) => console.error("compare fetch", sym, e));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compares.join(","), timeframe]);

  // Collapse / expand secondary panes (RSI, MACD) on double-click
  useEffect(() => {
    if (!chartRef.current) return;
    const chart = chartRef.current;
    try {
      const panes = chart.panes();
      const isMobile =
        typeof window !== "undefined" && window.innerWidth < 768;
      const mainStretch = panesCollapsed ? 1 : isMobile ? 5 : 3;
      panes[0]?.setStretchFactor(mainStretch);
      for (let i = 1; i < panes.length; i++) {
        panes[i]?.setStretchFactor(panesCollapsed ? 0.0001 : 1);
      }
      requestAnimationFrame(() => recomputePaneOffsets());
    } catch (e) {
      console.warn("panesCollapsed apply failed:", e);
    }
  }, [panesCollapsed, indicators.rsi, indicators.macd]);

  // Track price->Y coordinate at ~30fps so the countdown follows zoom/pan/auto-scale
  useEffect(() => {
    if (!lastPrice || !candleSeriesRef.current) return;
    let raf: number | null = null;
    let lastY: number | null = null;
    function tick() {
      const series = candleSeriesRef.current;
      const lp = lastPrice;
      if (series && lp) {
        const y = series.priceToCoordinate(lp.value);
        if (y !== null && isFinite(y)) {
          if (lastY === null || Math.abs(y - lastY) > 0.5) {
            lastY = y;
            setRenderTick((t) => t + 1);
          }
        }
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => {
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, [lastPrice]);

  // Double-click on the price axis (right edge) resets autoScale to recenter
  // the chart on the data. Anywhere else: no-op so lightweight-charts handles
  // its own default behavior. (We used to toggle panes-collapsed on container
  // dblclick — that hijacked the price-axis dblclick and broke the standard
  // "double-click to recenter" gesture.)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: MouseEvent) => {
      const chart = chartRef.current;
      if (!chart) return;
      // Width of the right price scale — only intercept dblclicks inside it.
      let axisWidth = 0;
      try {
        axisWidth = chart.priceScale("right").width();
      } catch {}
      const rect = el.getBoundingClientRect();
      const offsetX = e.clientX - rect.left;
      if (axisWidth > 0 && offsetX >= rect.width - axisWidth) {
        e.preventDefault();
        try {
          chart.priceScale("right").applyOptions({ autoScale: true });
        } catch {}
      }
    };
    el.addEventListener("dblclick", handler);
    return () => el.removeEventListener("dblclick", handler);
  }, []);

  // Log scale toggle
  useEffect(() => {
    if (!chartRef.current) return;
    try {
      chartRef.current.priceScale("right").applyOptions({
        mode: logScale ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal,
      });
    } catch (e) {
      console.warn("logScale apply failed:", e);
    }
  }, [logScale]);

  // Chart style — toggle candles/heikin vs line/area overlay
  useEffect(() => {
    if (!chartRef.current) return;
    const chart = chartRef.current;
    if (overlaySeriesRef.current) {
      try {
        chart.removeSeries(overlaySeriesRef.current);
      } catch {}
      overlaySeriesRef.current = null;
    }
    if (chartStyle === "candles" || chartStyle === "heikin") {
      candleSeriesRef.current?.applyOptions({ visible: true });
      // Reapply data using transformed candles (HA or regular)
      const display = getDisplayCandles();
      candleSeriesRef.current?.setData(
        display.map((k) => ({
          time: k.time as UTCTimestamp,
          open: k.open,
          high: k.high,
          low: k.low,
          close: k.close,
        })),
      );
      return;
    }
    candleSeriesRef.current?.applyOptions({ visible: false });
    const ser =
      chartStyle === "line"
        ? chart.addSeries(LineSeries, {
            color: TV_COLORS.blue,
            lineWidth: 2,
            priceLineColor: TV_COLORS.textMuted,
            priceLineStyle: 2,
          })
        : chart.addSeries(AreaSeries, {
            lineColor: TV_COLORS.blue,
            topColor: "rgba(41,98,255,0.35)",
            bottomColor: "rgba(41,98,255,0)",
            lineWidth: 2,
            priceLineColor: TV_COLORS.textMuted,
            priceLineStyle: 2,
          });
    overlaySeriesRef.current = ser;
    const view = getViewCandles();
    ser.setData(
      view.map((c) => ({ time: c.time as UTCTimestamp, value: c.close })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartStyle]);

  // React to replay state changes — reapply view
  useEffect(() => {
    if (!candleSeriesRef.current) return;
    const view = getViewCandles();
    if (view.length === 0) return;
    candleSeriesRef.current.setData(
      view.map((k) => ({
        time: k.time as UTCTimestamp,
        open: k.open,
        high: k.high,
        low: k.low,
        close: k.close,
      })),
    );
    if (overlaySeriesRef.current) {
      overlaySeriesRef.current.setData(
        view.map((k) => ({
          time: k.time as UTCTimestamp,
          value: k.close,
        })),
      );
    }
    if (volumeSeriesRef.current) {
      volumeSeriesRef.current.setData(
        view.map((k) => ({
          time: k.time as UTCTimestamp,
          value: k.volume,
          color:
            k.close >= k.open
              ? `${TV_COLORS.green}66`
              : `${TV_COLORS.red}66`,
        })),
      );
    }
    updateEMAs();
    updateRSI();
    updateMACD();
    updateATR();
    updateOBV();
    updateStoch();
    const last = view[view.length - 1];
    const prev = view[view.length - 2] ?? last;
    setLastPrice({
      value: last.close,
      pct:
        prev.close === 0 ? 0 : ((last.close - prev.close) / prev.close) * 100,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replayActiveForThis, replay.index]);

  const greenOrRed = (n: number) =>
    n >= 0 ? "text-tv-green" : "text-tv-red";

  // Indicator pills reflect the hovered bar when the crosshair is over the
  // chart, falling back to the latest bar value otherwise.
  const pillSource = hover ? hoverValues : lastValues;
  const pv = (key: keyof LastValues): number | undefined => pillSource[key];
  // H (hide legend) or Z (clean mode) hides the indicator legend.
  const legendHidden = storeHideLegend || storeCleanMode;

  // Helpers for pill rendering
  const isShown = (key: IndicatorKey) =>
    indicators[key] && (key === "volume" || true); // always renderable if enabled
  void isShown;

  // Determine which pane each indicator lives in (based on current layout)
  // Subpane index = position in the fixed order among active subpanes (+1 for
  // the price pane). Mirrors the unified subpane manager.
  const subPaneOrder: IndicatorKey[] = ["rsi", "macd", "atr", "obv", "stoch"];
  const activeSubPanes = subPaneOrder.filter((k) => indicators[k]);
  const subPaneIdx = (k: IndicatorKey) => activeSubPanes.indexOf(k) + 1;
  const rsiPaneIdx = subPaneIdx("rsi");
  const macdPaneIdx = subPaneIdx("macd");
  const atrPaneIdx = subPaneIdx("atr");
  const obvPaneIdx = subPaneIdx("obv");
  const stochPaneIdx = subPaneIdx("stoch");

  let measureRender: React.ReactNode = null;
  if (
    measure.a &&
    measure.b &&
    chartRef.current &&
    candleSeriesRef.current
  ) {
    const ts = chartRef.current.timeScale();
    const aX = ts.timeToCoordinate(measure.a.time as UTCTimestamp);
    const bX = ts.timeToCoordinate(measure.b.time as UTCTimestamp);
    const aY = candleSeriesRef.current.priceToCoordinate(measure.a.price);
    const bY = candleSeriesRef.current.priceToCoordinate(measure.b.price);

    if (aX !== null && bX !== null && aY !== null && bY !== null) {
      const priceDiff = measure.b.price - measure.a.price;
      const pctChange =
        measure.a.price === 0 ? 0 : (priceDiff / measure.a.price) * 100;
      const isUp = priceDiff >= 0;
      const start = Math.min(measure.a.time, measure.b.time);
      const end = Math.max(measure.a.time, measure.b.time);
      const inRange = getViewCandles().filter(
        (c) => c.time >= start && c.time <= end,
      );
      const bars = inRange.length;
      const volume = inRange.reduce((s, c) => s + c.volume, 0);
      const dur = durationLabel(measure.a.time, measure.b.time);

      measureRender = (
        <MeasureOverlay
          aX={aX}
          aY={aY}
          bX={bX}
          bY={bY}
          priceDiff={priceDiff}
          pctChange={pctChange}
          bars={bars}
          volume={volume}
          durationText={dur}
          isUp={isUp}
          isPreview={measure.phase === "placing"}
        />
      );
    }
  }
  // Coord converter for the drawings layer (only valid for the main pane)
  const symbolDrawings = drawings.filter((d) => d.symbol === symbol);
  let draftAsDrawing: Drawing | null = null;
  if (draft) {
    if (draft.type === "long" || draft.type === "short") {
      draftAsDrawing = {
        id: "__draft__",
        symbol,
        type: draft.type,
        a: draft.a,
        b: draft.b,
        c: draft.c,
      };
    } else if ("points" in draft) {
      // N-point draft preview
      draftAsDrawing = {
        id: "__draft__",
        symbol,
        type: draft.type,
        points: draft.points,
      };
    } else if (draft.type === "callout") {
      draftAsDrawing = {
        id: "__draft__",
        symbol,
        type: "callout",
        a: draft.a,
        b: draft.b,
        text: "",
      };
    } else {
      draftAsDrawing = {
        id: "__draft__",
        symbol,
        type: draft.type,
        a: draft.a,
        b: draft.b,
      };
    }
  }

  // Live preview while user is hovering with long/short tool (before click)
  const lsPreview: Drawing | null =
    lsHover && (tool === "long" || tool === "short")
      ? {
          id: "__ls_preview__",
          symbol,
          type: tool,
          a: lsHover,
          b: {
            time: lsHover.time,
            price: tool === "long" ? lsHover.price * 0.99 : lsHover.price * 1.01,
          },
          c: {
            time: lsHover.time,
            price: tool === "long" ? lsHover.price * 1.02 : lsHover.price * 0.98,
          },
        }
      : null;
  void renderTick;

  const toCoord = (time: number, price: number) => {
    const chart = chartRef.current;
    const series = candleSeriesRef.current;
    if (!chart || !series) return null;
    const x = chart.timeScale().timeToCoordinate(time as UTCTimestamp);
    const y = series.priceToCoordinate(price);
    if (x === null || y === null) return null;
    return { x, y };
  };

  const fromCoord = (x: number, y: number) => {
    const chart = chartRef.current;
    const series = candleSeriesRef.current;
    if (!chart || !series) return null;
    // Clampear x e y al rango visible del chart. Sin esto, cuando el cursor
    // se va más lejos que el handle (drag rápido), `coordinateToTime` y
    // `coordinateToPrice` devuelven null y el move handler deja de mover el
    // punto — el usuario percibe que el handle "se cuelga" del cursor.
    const w = containerSize.width;
    const h = containerSize.height;
    const cx = Math.max(0, Math.min(w - 1, x));
    const cy = Math.max(0, Math.min(h - 1, y));
    let time = chart.timeScale().coordinateToTime(cx);
    // Si el x clampeado todavía cae fuera del time range (ej. cursor al
    // borde extremo donde no hay vela), tomamos el último tiempo conocido
    // del candle visible para no perder el move.
    if (time === null) {
      const ts = chart.timeScale();
      const range = ts.getVisibleRange();
      if (range) time = cx < w / 2 ? range.from : range.to;
    }
    const price = series.coordinateToPrice(cy);
    if (time === null || price === null || !isFinite(price)) return null;
    return { time: Number(time), price };
  };

  // Compute Y of the current price for placing the countdown right under the price label
  let countdownY: number | null = null;
  let countdownAxisWidth = 60;
  if (lastPrice && candleSeriesRef.current && chartRef.current) {
    const yCoord = candleSeriesRef.current.priceToCoordinate(lastPrice.value);
    if (yCoord !== null && isFinite(yCoord)) countdownY = yCoord;
    try {
      countdownAxisWidth = chartRef.current.priceScale("right").width();
    } catch {}
  }
  const countdownIsUp = lastPrice ? lastPrice.pct >= 0 : true;

  return (
    <div ref={wrapperRef} className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {/* Countdown pegado al eje derecho, justo debajo del label del precio actual */}
      {countdownY !== null && (
        <div
          className="pointer-events-none absolute z-10"
          style={{
            right: 0,
            top: countdownY + 12,
            width: countdownAxisWidth - 2,
          }}
        >
          <div
            className="mx-auto tabular-nums"
            style={{
              background: countdownIsUp ? TV_COLORS.green : TV_COLORS.red,
              color: "#fff",
              fontSize: 10,
              padding: "1px 4px",
              borderRadius: 2,
              fontWeight: 500,
              lineHeight: 1.3,
              minWidth: 38,
              maxWidth: countdownAxisWidth - 6,
              textAlign: "center",
              display: "inline-block",
              float: "right",
              marginRight: 2,
            }}
          >
            <Countdown timeframe={timeframe} bare />
          </div>
        </div>
      )}
      {measureRender}
      <DrawingsLayer
        drawings={[
          ...symbolDrawings,
          ...(draftAsDrawing ? [draftAsDrawing] : []),
          ...(lsPreview ? [lsPreview] : []),
        ]}
        styles={drawingStyles}
        timeframe={timeframe}
        selectedId={selectedDrawingId}
        toCoord={toCoord}
        fromCoord={fromCoord}
        onUpdate={updateDrawing}
        onRemove={(id) => {
          removeDrawing(id);
          if (selectedDrawingId === id) selectDrawing(null);
        }}
        onSelect={selectDrawing}
        eraserActive={tool === "eraser"}
        hideDrawings={storeHideDrawings}
        lockDrawings={storeLockDrawings}
        toolActive={tool !== "cursor"}
        containerWidth={containerSize.width}
        containerHeight={containerSize.height}
      />


      {/* Top-left of main pane: symbol info + OHLC + Volume pill + EMA pills */}
      <div
        style={{ top: (paneOffsets[0]?.top ?? 0) + 6, left: 8 }}
        className="pointer-events-none absolute z-10 flex flex-col gap-0.5 text-xs tabular-nums md:gap-1"
      >
        {/* Row 1: symbol info + OHLC stats inline on hover (fixed height, never wraps) */}
        <div className="flex h-4 flex-nowrap items-center gap-x-1.5 overflow-hidden whitespace-nowrap md:h-5 md:gap-x-3">
          <div className="flex shrink-0 items-center gap-1 text-[11px] font-semibold md:gap-2 md:text-[13px]">
            <span className="text-tv-text">{getInstrument(symbol).displayName}</span>
            <span className="text-tv-text-muted">·</span>
            <span className="uppercase text-tv-text-muted">{timeframe}</span>
            <span className="hidden text-tv-text-muted md:inline">·</span>
            <span className="hidden text-tv-text-muted md:inline">
              {getInstrument(symbol).provider === "binance"
                ? binanceMarket === "perp"
                  ? "Binance Perp"
                  : "Binance Spot"
                : getInstrument(symbol).exchange}
            </span>
          </div>
          {hover && !legendHidden && (
            <div className="hidden items-center gap-x-3 font-mono text-[11px] md:flex">
              <span className="text-tv-text-muted">
                O <span className={greenOrRed(hover.c - hover.o)}>{formatPrice(hover.o)}</span>
              </span>
              <span className="text-tv-text-muted">
                H <span className={greenOrRed(hover.c - hover.o)}>{formatPrice(hover.h)}</span>
              </span>
              <span className="text-tv-text-muted">
                L <span className={greenOrRed(hover.c - hover.o)}>{formatPrice(hover.l)}</span>
              </span>
              <span className="text-tv-text-muted">
                C <span className={greenOrRed(hover.c - hover.o)}>{formatPrice(hover.c)}</span>
              </span>
              <span className={greenOrRed(hover.pct)}>
                {hover.pct >= 0 ? "+" : ""}
                {hover.pct.toFixed(2)}%
              </span>
              <span className="text-tv-text-muted">
                Vol <span className="text-tv-text">{formatVolume(hover.v)}</span>
              </span>
            </div>
          )}
        </div>

        {/* Row 2: big live price (always present — reserves space even while loading) */}
        <div className="flex h-5 items-center gap-1.5 md:h-7 md:gap-2">
          {lastPrice ? (
            <>
              <span className={`font-mono text-sm font-semibold tabular-nums md:text-lg ${greenOrRed(lastPrice.pct)}`}>
                {formatPrice(lastPrice.value)}
              </span>
              <span className={`font-mono text-[10px] tabular-nums md:text-xs ${greenOrRed(lastPrice.pct)}`}>
                {lastPrice.pct >= 0 ? "+" : ""}
                {lastPrice.pct.toFixed(2)}%
              </span>
            </>
          ) : (
            <span className="text-xs text-tv-text-muted">Cargando…</span>
          )}
        </div>

        {/* Collapse / expand indicator pills */}
        <button
          onClick={() => setPillsCollapsed((v) => !v)}
          title={pillsCollapsed ? "Mostrar indicadores" : "Ocultar lista de indicadores"}
          className="pointer-events-auto mt-0.5 flex h-4 w-4 items-center justify-center rounded text-tv-text-muted opacity-0 transition-opacity hover:bg-tv-panel-hover hover:text-tv-text group-hover:opacity-100 md:opacity-60 md:hover:opacity-100"
          style={{ opacity: pillsCollapsed ? 1 : undefined }}
        >
          <svg viewBox="0 0 12 12" className="h-3 w-3">
            <path
              d={pillsCollapsed ? "M4 3 L8 6 L4 9" : "M3 4 L6 8 L9 4"}
              stroke="currentColor"
              strokeWidth="1.5"
              fill="none"
            />
          </svg>
        </button>

        {/* Indicator pills for the main pane (fixed position below price) */}
        <div
          className="mt-0.5 flex flex-col items-start gap-0.5 md:mt-1 md:gap-1"
          style={{
            display: pillsCollapsed || legendHidden ? "none" : undefined,
          }}
        >
          {indicators.ema20 && (
            <IndicatorPill
              name={`EMA ${config.ema20}`}
              value={pv("ema20") !== undefined ? formatPrice(pv("ema20")!) : undefined}
              color={INDICATOR_COLORS.ema20}
              hidden={hidden.ema20}
              onToggleHide={() => toggleHidden("ema20")}
              onSettings={() => setSettingsTarget("ema20")}
              onRemove={() => removeIndicator("ema20")}
            />
          )}
          {indicators.ema50 && (
            <IndicatorPill
              name={`EMA ${config.ema50}`}
              value={pv("ema50") !== undefined ? formatPrice(pv("ema50")!) : undefined}
              color={INDICATOR_COLORS.ema50}
              hidden={hidden.ema50}
              onToggleHide={() => toggleHidden("ema50")}
              onSettings={() => setSettingsTarget("ema50")}
              onRemove={() => removeIndicator("ema50")}
            />
          )}
          {indicators.ema200 && (
            <IndicatorPill
              name={`EMA ${config.ema200}`}
              value={pv("ema200") !== undefined ? formatPrice(pv("ema200")!) : undefined}
              color={INDICATOR_COLORS.ema200}
              hidden={hidden.ema200}
              onToggleHide={() => toggleHidden("ema200")}
              onSettings={() => setSettingsTarget("ema200")}
              onRemove={() => removeIndicator("ema200")}
            />
          )}
          {indicators.sma20 && (
            <IndicatorPill
              name={`SMA ${config.sma20}`}
              value={pv("sma20") !== undefined ? formatPrice(pv("sma20")!) : undefined}
              color={INDICATOR_COLORS.sma20}
              hidden={hidden.sma20}
              onToggleHide={() => toggleHidden("sma20")}
              onSettings={() => setSettingsTarget("sma20")}
              onRemove={() => removeIndicator("sma20")}
            />
          )}
          {indicators.sma50 && (
            <IndicatorPill
              name={`SMA ${config.sma50}`}
              value={pv("sma50") !== undefined ? formatPrice(pv("sma50")!) : undefined}
              color={INDICATOR_COLORS.sma50}
              hidden={hidden.sma50}
              onToggleHide={() => toggleHidden("sma50")}
              onSettings={() => setSettingsTarget("sma50")}
              onRemove={() => removeIndicator("sma50")}
            />
          )}
          {indicators.bb && (
            <IndicatorPill
              name={`BB ${config.bbPeriod}, ${config.bbStdDev}`}
              value={
                pv("bbBasis") !== undefined
                  ? formatPrice(pv("bbBasis")!)
                  : undefined
              }
              color={INDICATOR_COLORS.bb}
              hidden={hidden.bb}
              onToggleHide={() => toggleHidden("bb")}
              onSettings={() => setSettingsTarget("bb")}
              onRemove={() => removeIndicator("bb")}
            />
          )}
          {indicators.vwap && (
            <IndicatorPill
              name="VWAP"
              value={
                pv("vwap") !== undefined ? formatPrice(pv("vwap")!) : undefined
              }
              color={INDICATOR_COLORS.vwap}
              hidden={hidden.vwap}
              onToggleHide={() => toggleHidden("vwap")}
              onSettings={() => setSettingsTarget("vwap")}
              onRemove={() => removeIndicator("vwap")}
            />
          )}
          {indicators.volume && (
            <div className="hidden md:block">
            <IndicatorPill
              name="Vol"
              value={pv("volume") !== undefined ? formatVolume(pv("volume")!) : undefined}
              color={INDICATOR_COLORS.volume}
              hidden={hidden.volume}
              onToggleHide={() => toggleHidden("volume")}
              onSettings={() => setSettingsTarget("volume")}
              onRemove={() => removeIndicator("volume")}
            />
            </div>
          )}
        </div>
      </div>

      {/* RSI pane label */}
      {indicators.rsi && paneOffsets[rsiPaneIdx] && !pillsCollapsed && !legendHidden && (
        <div
          style={{ top: paneOffsets[rsiPaneIdx].top + 6, left: 12 }}
          className="pointer-events-none absolute z-10"
        >
          <IndicatorPill
            name={`RSI ${config.rsi}`}
            value={pv("rsi") !== undefined ? pv("rsi")!.toFixed(1) : undefined}
            color={INDICATOR_COLORS.rsi}
            hidden={hidden.rsi}
            onToggleHide={() => toggleHidden("rsi")}
            onSettings={() => setSettingsTarget("rsi")}
            onRemove={() => removeIndicator("rsi")}
          />
        </div>
      )}

      {/* MACD pane label */}
      {indicators.macd && paneOffsets[macdPaneIdx] && !pillsCollapsed && !legendHidden && (
        <div
          style={{ top: paneOffsets[macdPaneIdx].top + 6, left: 12 }}
          className="pointer-events-none absolute z-10"
        >
          <IndicatorPill
            name={`MACD ${config.macdFast}, ${config.macdSlow}, ${config.macdSignal}`}
            value={
              pv("macd") !== undefined
                ? `${pv("macd")!.toFixed(2)} / ${(pv("macdSignal") ?? 0).toFixed(2)}`
                : undefined
            }
            color={INDICATOR_COLORS.macd}
            hidden={hidden.macd}
            onToggleHide={() => toggleHidden("macd")}
            onSettings={() => setSettingsTarget("macd")}
            onRemove={() => removeIndicator("macd")}
          />
        </div>
      )}

      {/* ATR pane label */}
      {indicators.atr && paneOffsets[atrPaneIdx] && !pillsCollapsed && !legendHidden && (
        <div
          style={{ top: paneOffsets[atrPaneIdx].top + 6, left: 12 }}
          className="pointer-events-none absolute z-10"
        >
          <IndicatorPill
            name={`ATR ${config.atr}`}
            value={pv("atr") !== undefined ? formatPrice(pv("atr")!) : undefined}
            color={INDICATOR_COLORS.atr}
            hidden={hidden.atr}
            onToggleHide={() => toggleHidden("atr")}
            onSettings={() => setSettingsTarget("atr")}
            onRemove={() => removeIndicator("atr")}
          />
        </div>
      )}

      {/* OBV pane label */}
      {indicators.obv && paneOffsets[obvPaneIdx] && !pillsCollapsed && !legendHidden && (
        <div
          style={{ top: paneOffsets[obvPaneIdx].top + 6, left: 12 }}
          className="pointer-events-none absolute z-10"
        >
          <IndicatorPill
            name="OBV"
            value={pv("obv") !== undefined ? formatVolume(pv("obv")!) : undefined}
            color={INDICATOR_COLORS.obv}
            hidden={hidden.obv}
            onToggleHide={() => toggleHidden("obv")}
            onSettings={() => setSettingsTarget("obv")}
            onRemove={() => removeIndicator("obv")}
          />
        </div>
      )}

      {/* Stochastic pane label */}
      {indicators.stoch && paneOffsets[stochPaneIdx] && !pillsCollapsed && !legendHidden && (
        <div
          style={{ top: paneOffsets[stochPaneIdx].top + 6, left: 12 }}
          className="pointer-events-none absolute z-10"
        >
          <IndicatorPill
            name={`Stoch ${config.stochK}, ${config.stochD}`}
            value={
              pv("stochK") !== undefined
                ? `${pv("stochK")!.toFixed(1)} / ${(pv("stochD") ?? 0).toFixed(1)}`
                : undefined
            }
            color={INDICATOR_COLORS.stoch}
            hidden={hidden.stoch}
            onToggleHide={() => toggleHidden("stoch")}
            onSettings={() => setSettingsTarget("stoch")}
            onRemove={() => removeIndicator("stoch")}
          />
        </div>
      )}
    </div>
  );
}
