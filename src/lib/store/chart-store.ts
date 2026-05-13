"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Timeframe } from "@/lib/binance/types";

export type IndicatorKey =
  | "ema20"
  | "ema50"
  | "ema200"
  | "rsi"
  | "macd"
  | "volume";

export type DrawingTool =
  | "cursor"
  | "hline"
  | "trendline"
  | "fib"
  | "rect"
  | "text"
  | "measure";

export interface PriceLine {
  id: string;
  symbol: string;
  price: number;
}

export interface DrawingPoint {
  time: number;
  price: number;
}

export type Drawing =
  | {
      id: string;
      symbol: string;
      type: "trendline";
      a: DrawingPoint;
      b: DrawingPoint;
    }
  | {
      id: string;
      symbol: string;
      type: "fib";
      a: DrawingPoint;
      b: DrawingPoint;
    }
  | {
      id: string;
      symbol: string;
      type: "rect";
      a: DrawingPoint;
      b: DrawingPoint;
    }
  | {
      id: string;
      symbol: string;
      type: "text";
      at: DrawingPoint;
      text: string;
    };

export type DrawingInput =
  | {
      type: "trendline";
      symbol: string;
      a: DrawingPoint;
      b: DrawingPoint;
    }
  | { type: "fib"; symbol: string; a: DrawingPoint; b: DrawingPoint }
  | { type: "rect"; symbol: string; a: DrawingPoint; b: DrawingPoint }
  | {
      type: "text";
      symbol: string;
      at: DrawingPoint;
      text: string;
    };

export function layoutSlotCount(l: LayoutType): number {
  switch (l) {
    case "single":
      return 1;
    case "2h":
    case "2v":
      return 2;
    case "grid4":
      return 4;
  }
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random()}`;
}

export interface IndicatorConfig {
  ema20: number;
  ema50: number;
  ema200: number;
  rsi: number;
  macdFast: number;
  macdSlow: number;
  macdSignal: number;
}

export const DEFAULT_CONFIG: IndicatorConfig = {
  ema20: 20,
  ema50: 50,
  ema200: 200,
  rsi: 14,
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
};

export const INDICATOR_COLORS: Record<IndicatorKey, string> = {
  ema20: "#ffb74d",
  ema50: "#2962ff",
  ema200: "#ab47bc",
  rsi: "#ab47bc",
  macd: "#2962ff",
  volume: "#787b86",
};

export type LayoutType = "single" | "2h" | "2v" | "grid4";

export interface ChartSlot {
  id: string;
  symbol: string;
  timeframe: Timeframe;
}

export const DEFAULT_WATCHLIST = [
  "^GSPC",
  "^IXIC",
  "^DJI",
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "BNBUSDT",
  "XRPUSDT",
  "DOGEUSDT",
  "ADAUSDT",
  "AVAXUSDT",
  "LINKUSDT",
];

interface ChartState {
  /** Mirrors the active slot's symbol — kept top-level for legacy access */
  symbol: string;
  /** Mirrors the active slot's timeframe — kept top-level for legacy access */
  timeframe: Timeframe;
  /** Multi-chart layout */
  layout: LayoutType;
  slots: ChartSlot[];
  activeSlotId: string;
  /** Indicator is added to the chart (appears in pill + renders unless hidden) */
  indicators: Record<IndicatorKey, boolean>;
  /** Indicator is hidden (eye icon off) — kept in pill list, just not rendered */
  hidden: Record<IndicatorKey, boolean>;
  /** Periods and parameters for each indicator */
  config: IndicatorConfig;
  watchlist: string[];

  // Persisted: drawings (trendline, fib, rect, text) — per symbol
  drawings: Drawing[];

  /** Replay (bar-by-bar) state — not persisted */
  replay: {
    active: boolean;
    /** which slot is being replayed (only one at a time) */
    slotId: string | null;
    /** index in the slot's candles[] up to which to render */
    index: number;
    /** total candles available for the active replay session */
    total: number;
    playing: boolean;
    /** ms between auto-steps when playing */
    intervalMs: number;
  };

  // Ephemeral UI state (not persisted)
  tool: DrawingTool;
  priceLines: PriceLine[];
  symbolDialogOpen: boolean;
  /** Which indicator's settings dialog is open (null = closed) */
  settingsTarget: IndicatorKey | null;
  /** Mobile: side panels open as drawer */
  mobileLeftOpen: boolean;
  mobileRightOpen: boolean;

  // Actions
  setSymbol: (s: string, slotId?: string) => void;
  setTimeframe: (t: Timeframe, slotId?: string) => void;
  setLayout: (l: LayoutType) => void;
  setActiveSlot: (id: string) => void;
  toggleIndicator: (key: IndicatorKey) => void;
  removeIndicator: (key: IndicatorKey) => void;
  toggleHidden: (key: IndicatorKey) => void;
  setConfig: (patch: Partial<IndicatorConfig>) => void;
  addToWatchlist: (s: string) => void;
  removeFromWatchlist: (s: string) => void;
  setTool: (t: DrawingTool) => void;
  addPriceLine: (price: number, symbol: string) => void;
  clearPriceLines: (symbol?: string) => void;
  addDrawing: (d: DrawingInput) => void;
  removeDrawing: (id: string) => void;
  clearDrawings: (symbol?: string) => void;
  setSymbolDialogOpen: (v: boolean) => void;
  setSettingsTarget: (k: IndicatorKey | null) => void;
  setMobileLeftOpen: (v: boolean) => void;
  setMobileRightOpen: (v: boolean) => void;
  startReplay: (slotId: string, total: number) => void;
  stopReplay: () => void;
  setReplayIndex: (idx: number) => void;
  setReplayPlaying: (p: boolean) => void;
  setReplaySpeed: (intervalMs: number) => void;
  stepReplay: () => void;
}

export const useChartStore = create<ChartState>()(
  persist(
    (set) => ({
      symbol: "BTCUSDT",
      timeframe: "15m" as Timeframe,
      layout: "single" as LayoutType,
      slots: [
        { id: "slot-1", symbol: "BTCUSDT", timeframe: "15m" as Timeframe },
      ],
      activeSlotId: "slot-1",
      indicators: {
        ema20: true,
        ema50: true,
        ema200: false,
        rsi: true,
        macd: false,
        volume: true,
      },
      hidden: {
        ema20: false,
        ema50: false,
        ema200: false,
        rsi: false,
        macd: false,
        volume: false,
      },
      config: { ...DEFAULT_CONFIG },
      watchlist: DEFAULT_WATCHLIST,
      drawings: [],
      tool: "cursor",
      priceLines: [],
      symbolDialogOpen: false,
      settingsTarget: null,
      mobileLeftOpen: false,
      mobileRightOpen: false,
      replay: {
        active: false,
        slotId: null,
        index: 0,
        total: 0,
        playing: false,
        intervalMs: 500,
      },

      setSymbol: (symbol, slotId) =>
        set((s) => {
          const targetId = slotId ?? s.activeSlotId;
          const slots = s.slots.map((sl) =>
            sl.id === targetId ? { ...sl, symbol } : sl,
          );
          return {
            slots,
            symbol: targetId === s.activeSlotId ? symbol : s.symbol,
          };
        }),
      setTimeframe: (timeframe, slotId) =>
        set((s) => {
          const targetId = slotId ?? s.activeSlotId;
          const slots = s.slots.map((sl) =>
            sl.id === targetId ? { ...sl, timeframe } : sl,
          );
          return {
            slots,
            timeframe: targetId === s.activeSlotId ? timeframe : s.timeframe,
          };
        }),
      setLayout: (layout) =>
        set((s) => {
          const want = layoutSlotCount(layout);
          let slots = s.slots.slice(0, want);
          while (slots.length < want) {
            const base = slots[0] ?? {
              id: "slot-1",
              symbol: "BTCUSDT",
              timeframe: "15m" as Timeframe,
            };
            slots = [
              ...slots,
              {
                id: `slot-${slots.length + 1}`,
                symbol: base.symbol,
                timeframe: base.timeframe,
              },
            ];
          }
          const activeSlotId = slots.some((sl) => sl.id === s.activeSlotId)
            ? s.activeSlotId
            : slots[0].id;
          const active = slots.find((sl) => sl.id === activeSlotId)!;
          return {
            layout,
            slots,
            activeSlotId,
            symbol: active.symbol,
            timeframe: active.timeframe,
          };
        }),
      setActiveSlot: (id) =>
        set((s) => {
          const slot = s.slots.find((sl) => sl.id === id);
          if (!slot) return {};
          return {
            activeSlotId: id,
            symbol: slot.symbol,
            timeframe: slot.timeframe,
          };
        }),
      toggleIndicator: (key) =>
        set((s) => ({
          indicators: { ...s.indicators, [key]: !s.indicators[key] },
          // When re-adding, ensure not hidden
          hidden: !s.indicators[key]
            ? { ...s.hidden, [key]: false }
            : s.hidden,
        })),
      removeIndicator: (key) =>
        set((s) => ({
          indicators: { ...s.indicators, [key]: false },
          hidden: { ...s.hidden, [key]: false },
        })),
      toggleHidden: (key) =>
        set((s) => ({ hidden: { ...s.hidden, [key]: !s.hidden[key] } })),
      setConfig: (patch) =>
        set((s) => ({ config: { ...s.config, ...patch } })),
      addToWatchlist: (s) =>
        set((state) => ({
          watchlist: state.watchlist.includes(s)
            ? state.watchlist
            : [...state.watchlist, s],
        })),
      removeFromWatchlist: (s) =>
        set((state) => ({
          watchlist: state.watchlist.filter((x) => x !== s),
        })),
      setTool: (tool) => set({ tool }),
      addPriceLine: (price, symbol) =>
        set((state) => ({
          priceLines: [
            ...state.priceLines,
            {
              id:
                typeof crypto !== "undefined" && "randomUUID" in crypto
                  ? crypto.randomUUID()
                  : `${Date.now()}-${Math.random()}`,
              symbol,
              price,
            },
          ],
        })),
      clearPriceLines: (symbol) =>
        set((state) => ({
          priceLines: symbol
            ? state.priceLines.filter((p) => p.symbol !== symbol)
            : [],
        })),
      addDrawing: (d) =>
        set((state) => ({
          drawings: [...state.drawings, { ...d, id: newId() } satisfies Drawing],
        })),
      removeDrawing: (id) =>
        set((state) => ({
          drawings: state.drawings.filter((d) => d.id !== id),
        })),
      clearDrawings: (symbol) =>
        set((state) => ({
          drawings: symbol
            ? state.drawings.filter((d) => d.symbol !== symbol)
            : [],
          priceLines: symbol
            ? state.priceLines.filter((p) => p.symbol !== symbol)
            : [],
        })),
      setSymbolDialogOpen: (symbolDialogOpen) => set({ symbolDialogOpen }),
      setSettingsTarget: (settingsTarget) => set({ settingsTarget }),
      setMobileLeftOpen: (mobileLeftOpen) => set({ mobileLeftOpen }),
      setMobileRightOpen: (mobileRightOpen) => set({ mobileRightOpen }),
      startReplay: (slotId, total) =>
        set({
          replay: {
            active: true,
            slotId,
            index: Math.max(0, Math.min(total - 1, total - 100)),
            total,
            playing: false,
            intervalMs: 500,
          },
        }),
      stopReplay: () =>
        set((s) => ({
          replay: { ...s.replay, active: false, playing: false, slotId: null },
        })),
      setReplayIndex: (idx) =>
        set((s) => ({
          replay: {
            ...s.replay,
            index: Math.max(0, Math.min(s.replay.total - 1, idx)),
          },
        })),
      setReplayPlaying: (playing) =>
        set((s) => ({ replay: { ...s.replay, playing } })),
      setReplaySpeed: (intervalMs) =>
        set((s) => ({ replay: { ...s.replay, intervalMs } })),
      stepReplay: () =>
        set((s) => {
          const next = s.replay.index + 1;
          if (next >= s.replay.total) {
            return { replay: { ...s.replay, playing: false } };
          }
          return { replay: { ...s.replay, index: next } };
        }),
    }),
    {
      name: "tv-gratis-chart-state",
      partialize: (s) => ({
        symbol: s.symbol,
        timeframe: s.timeframe,
        layout: s.layout,
        slots: s.slots,
        activeSlotId: s.activeSlotId,
        indicators: s.indicators,
        hidden: s.hidden,
        config: s.config,
        watchlist: s.watchlist,
        drawings: s.drawings,
        priceLines: s.priceLines,
      }),
    },
  ),
);
