"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Timeframe } from "@/lib/binance/types";
import { setYahooSymbolsCache, type Instrument } from "@/lib/instruments";

export type IndicatorKey =
  | "ema20"
  | "ema50"
  | "ema200"
  | "sma20"
  | "sma50"
  | "bb"
  | "vwap"
  | "rsi"
  | "macd"
  | "atr"
  | "obv"
  | "stoch"
  | "volume";

export type DrawingTool =
  | "cursor"
  | "hline"
  | "vline"
  | "hlineExt"
  | "ray"
  | "trendline"
  | "arrow"
  | "fib"
  | "rect"
  | "hrange"
  | "long"
  | "short"
  | "text"
  | "measure"
  | "eraser";

export type ChartStyle = "candles" | "heikin" | "line" | "area";

export interface WatchlistSection {
  id: string;
  name: string;
  symbols: string[];
}

export interface WatchlistDef {
  id: string;
  name: string;
  /** Legacy flat list — kept in sync with sections[0] for backwards compat */
  symbols: string[];
  /** Optional grouped sections. If absent, treat symbols[] as a single unnamed section. */
  sections?: WatchlistSection[];
}

export interface TabState {
  id: string;
  name: string;
  symbol: string;
  timeframe: Timeframe;
  layout: LayoutType;
  slots: ChartSlot[];
  activeSlotId: string;
  indicators: Record<IndicatorKey, boolean>;
  hidden: Record<IndicatorKey, boolean>;
  config: IndicatorConfig;
  drawings: Drawing[];
  priceLines: PriceLine[];
}

export interface WorkspaceSnapshot {
  id: string;
  name: string;
  savedAt: number;
  /** Subset of state that defines a workspace */
  symbol: string;
  timeframe: Timeframe;
  layout: LayoutType;
  slots: ChartSlot[];
  indicators: Record<IndicatorKey, boolean>;
  hidden: Record<IndicatorKey, boolean>;
  config: IndicatorConfig;
  chartStyle: ChartStyle;
  logScale: boolean;
}

export interface IndicatorTemplate {
  id: string;
  name: string;
  indicators: Record<IndicatorKey, boolean>;
  config: IndicatorConfig;
}

export type TradeSide = "long" | "short";

export interface JournalEntry {
  id: string;
  symbol: string;
  side: TradeSide;
  entryPrice: number;
  exitPrice?: number;
  size?: number;
  openedAt: number;
  closedAt?: number;
  notes?: string;
}

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
      type: "arrow";
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
      type: "hrange";
      a: DrawingPoint;
      b: DrawingPoint;
    }
  | {
      id: string;
      symbol: string;
      type: "ray";
      a: DrawingPoint;
      b: DrawingPoint;
    }
  | {
      id: string;
      symbol: string;
      type: "vline";
      at: DrawingPoint;
    }
  | {
      id: string;
      symbol: string;
      type: "hlineExt";
      at: DrawingPoint;
    }
  | {
      id: string;
      symbol: string;
      type: "long" | "short";
      /** entry point (time + price) */
      a: DrawingPoint;
      /** stop loss price (time same as a) */
      b: DrawingPoint;
      /** take profit price */
      c: DrawingPoint;
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
  | { type: "arrow"; symbol: string; a: DrawingPoint; b: DrawingPoint }
  | { type: "fib"; symbol: string; a: DrawingPoint; b: DrawingPoint }
  | { type: "rect"; symbol: string; a: DrawingPoint; b: DrawingPoint }
  | { type: "hrange"; symbol: string; a: DrawingPoint; b: DrawingPoint }
  | { type: "ray"; symbol: string; a: DrawingPoint; b: DrawingPoint }
  | { type: "vline"; symbol: string; at: DrawingPoint }
  | { type: "hlineExt"; symbol: string; at: DrawingPoint }
  | {
      type: "long" | "short";
      symbol: string;
      a: DrawingPoint;
      b: DrawingPoint;
      c: DrawingPoint;
    }
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

function getTabName(s: { activeTabId: string; tabs: TabState[]; symbol: string }): string {
  const t = s.tabs.find((t) => t.id === s.activeTabId);
  return t?.name ?? s.symbol;
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
  sma20: number;
  sma50: number;
  bbPeriod: number;
  bbStdDev: number;
  rsi: number;
  macdFast: number;
  macdSlow: number;
  macdSignal: number;
  atr: number;
  stochK: number;
  stochD: number;
}

export const DEFAULT_CONFIG: IndicatorConfig = {
  ema20: 20,
  ema50: 50,
  ema200: 200,
  sma20: 20,
  sma50: 50,
  bbPeriod: 20,
  bbStdDev: 2,
  rsi: 14,
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
  atr: 14,
  stochK: 14,
  stochD: 3,
};

export const INDICATOR_COLORS: Record<IndicatorKey, string> = {
  ema20: "#ffb74d",
  ema50: "#2962ff",
  ema200: "#ab47bc",
  sma20: "#42a5f5",
  sma50: "#ec407a",
  bb: "#26c6da",
  vwap: "#26a69a",
  rsi: "#ab47bc",
  macd: "#2962ff",
  atr: "#ff7043",
  obv: "#26c6da",
  stoch: "#ab47bc",
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
  /** Visual style of the main price series */
  chartStyle: ChartStyle;
  /** Use logarithmic price scale */
  logScale: boolean;
  /** When true, panning/zoom in one slot syncs the visible time range to others */
  syncCharts: boolean;
  /** Per-slot compare overlays — extra symbols to plot as line on the same chart */
  compares: Record<string, string[]>;
  /** Focus mode hides all chrome (header, sidebars, panels) — only the chart */
  focusMode: boolean;
  /** UI theme — dark (default) or light */
  theme: "dark" | "light";
  /** Clean mode (Z) — distraction-free: hides chrome + legend + overlays */
  cleanMode: boolean;
  /** Hide indicator legend pills (H) — keeps symbol/price line */
  hideLegend: boolean;
  /** Binance market: spot or futures (perpetual) */
  binanceMarket: "spot" | "perp";
  /** Saved workspaces — named snapshots of the current setup */
  workspaces: WorkspaceSnapshot[];
  /** Saved indicator templates — combos of indicators + config */
  indicatorTemplates: IndicatorTemplate[];
  /** Manual trading journal entries */
  journal: JournalEntry[];
  /** Open tabs — each tab has its own state slice (symbol, timeframe, layout, slots, drawings, priceLines, indicators, hidden, config) */
  tabs: TabState[];
  activeTabId: string;
  /** Multiple named watchlists. `watchlist` mirrors the active one for legacy access. */
  watchlists: WatchlistDef[];
  activeWatchlistId: string;
  watchlist: string[];

  /** Yahoo symbols selected at runtime (stocks, FX, commodities) — keyed by symbol */
  yahooSymbols: Record<string, Instrument>;

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
  /** Currently selected drawing — Delete/Supr removes it */
  selectedDrawingId: string | null;
  /** When true, secondary panes (RSI, MACD) collapse and only main chart shows */
  panesCollapsed: boolean;

  // Actions
  setSymbol: (s: string, slotId?: string) => void;
  setTimeframe: (t: Timeframe, slotId?: string) => void;
  setLayout: (l: LayoutType) => void;
  setActiveSlot: (id: string) => void;
  toggleIndicator: (key: IndicatorKey) => void;
  removeIndicator: (key: IndicatorKey) => void;
  toggleHidden: (key: IndicatorKey) => void;
  setConfig: (patch: Partial<IndicatorConfig>) => void;
  setChartStyle: (s: ChartStyle) => void;
  setLogScale: (v: boolean) => void;
  setSyncCharts: (v: boolean) => void;
  setTheme: (t: "dark" | "light") => void;
  toggleTheme: () => void;
  setFocusMode: (v: boolean) => void;
  setCleanMode: (v: boolean) => void;
  toggleCleanMode: () => void;
  setHideLegend: (v: boolean) => void;
  toggleHideLegend: () => void;
  setBinanceMarket: (m: "spot" | "perp") => void;
  saveWorkspace: (name: string) => void;
  loadWorkspace: (id: string) => void;
  deleteWorkspace: (id: string) => void;
  saveIndicatorTemplate: (name: string) => void;
  loadIndicatorTemplate: (id: string) => void;
  deleteIndicatorTemplate: (id: string) => void;
  createTab: (name?: string) => void;
  closeTab: (id: string) => void;
  switchTab: (id: string) => void;
  renameTab: (id: string, name: string) => void;
  addJournalEntry: (e: Omit<JournalEntry, "id">) => void;
  updateJournalEntry: (id: string, patch: Partial<JournalEntry>) => void;
  removeJournalEntry: (id: string) => void;
  addCompare: (slotId: string, symbol: string) => void;
  removeCompare: (slotId: string, symbol: string) => void;
  addToWatchlist: (s: string) => void;
  removeFromWatchlist: (s: string) => void;
  createWatchlist: (id: string, name: string) => void;
  deleteWatchlist: (id: string) => void;
  setActiveWatchlist: (id: string) => void;
  renameWatchlist: (id: string, name: string) => void;
  addWatchlistSection: (name: string) => void;
  renameWatchlistSection: (sectionId: string, name: string) => void;
  removeWatchlistSection: (sectionId: string) => void;
  addSymbolToSection: (sectionId: string, symbol: string) => void;
  addYahooSymbol: (inst: Instrument) => void;
  setTool: (t: DrawingTool) => void;
  addPriceLine: (price: number, symbol: string) => void;
  clearPriceLines: (symbol?: string) => void;
  addDrawing: (d: DrawingInput) => void;
  removeDrawing: (id: string) => void;
  updateDrawing: (
    id: string,
    patch: Partial<{
      a: DrawingPoint;
      b: DrawingPoint;
      c: DrawingPoint;
      at: DrawingPoint;
      text: string;
    }>,
  ) => void;
  clearDrawings: (symbol?: string) => void;
  setSymbolDialogOpen: (v: boolean) => void;
  setSettingsTarget: (k: IndicatorKey | null) => void;
  setMobileLeftOpen: (v: boolean) => void;
  setMobileRightOpen: (v: boolean) => void;
  selectDrawing: (id: string | null) => void;
  setPanesCollapsed: (v: boolean) => void;
  togglePanesCollapsed: () => void;
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
        sma20: false,
        sma50: false,
        bb: false,
        vwap: false,
        rsi: true,
        macd: false,
        atr: false,
        obv: false,
        stoch: false,
        volume: true,
      },
      hidden: {
        ema20: false,
        ema50: false,
        ema200: false,
        sma20: false,
        sma50: false,
        bb: false,
        vwap: false,
        rsi: false,
        macd: false,
        atr: false,
        obv: false,
        stoch: false,
        volume: false,
      },
      config: { ...DEFAULT_CONFIG },
      chartStyle: "candles" as ChartStyle,
      logScale: false,
      syncCharts: false,
      compares: {},
      theme: "dark" as "dark" | "light",
      focusMode: false,
      cleanMode: false,
      hideLegend: false,
      binanceMarket: "spot" as "spot" | "perp",
      workspaces: [],
      indicatorTemplates: [],
      journal: [],
      tabs: [],
      activeTabId: "",
      watchlists: [
        { id: "main", name: "Principal", symbols: DEFAULT_WATCHLIST },
      ],
      activeWatchlistId: "main",
      watchlist: DEFAULT_WATCHLIST,
      yahooSymbols: {},
      drawings: [],
      tool: "cursor",
      priceLines: [],
      symbolDialogOpen: false,
      settingsTarget: null,
      mobileLeftOpen: false,
      mobileRightOpen: false,
      selectedDrawingId: null,
      panesCollapsed: false,
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
      setChartStyle: (chartStyle) => set({ chartStyle }),
      setLogScale: (logScale) => set({ logScale }),
      setSyncCharts: (syncCharts) => set({ syncCharts }),
      setTheme: (theme) => set({ theme }),
      toggleTheme: () =>
        set((s) => ({ theme: s.theme === "dark" ? "light" : "dark" })),
      setFocusMode: (focusMode) => set({ focusMode }),
      setCleanMode: (cleanMode) => set({ cleanMode }),
      toggleCleanMode: () => set((s) => ({ cleanMode: !s.cleanMode })),
      setHideLegend: (hideLegend) => set({ hideLegend }),
      toggleHideLegend: () => set((s) => ({ hideLegend: !s.hideLegend })),
      setBinanceMarket: (binanceMarket) => set({ binanceMarket }),
      saveWorkspace: (name) =>
        set((s) => ({
          workspaces: [
            ...s.workspaces,
            {
              id: newId(),
              name,
              savedAt: Date.now(),
              symbol: s.symbol,
              timeframe: s.timeframe,
              layout: s.layout,
              slots: s.slots,
              indicators: s.indicators,
              hidden: s.hidden,
              config: s.config,
              chartStyle: s.chartStyle,
              logScale: s.logScale,
            },
          ],
        })),
      loadWorkspace: (id) =>
        set((s) => {
          const w = s.workspaces.find((w) => w.id === id);
          if (!w) return {};
          return {
            symbol: w.symbol,
            timeframe: w.timeframe,
            layout: w.layout,
            slots: w.slots,
            indicators: w.indicators,
            hidden: w.hidden,
            config: w.config,
            chartStyle: w.chartStyle,
            logScale: w.logScale,
          };
        }),
      deleteWorkspace: (id) =>
        set((s) => ({
          workspaces: s.workspaces.filter((w) => w.id !== id),
        })),
      saveIndicatorTemplate: (name) =>
        set((s) => ({
          indicatorTemplates: [
            ...s.indicatorTemplates,
            {
              id: newId(),
              name,
              indicators: s.indicators,
              config: s.config,
            },
          ],
        })),
      loadIndicatorTemplate: (id) =>
        set((s) => {
          const t = s.indicatorTemplates.find((t) => t.id === id);
          if (!t) return {};
          return { indicators: t.indicators, config: t.config };
        }),
      deleteIndicatorTemplate: (id) =>
        set((s) => ({
          indicatorTemplates: s.indicatorTemplates.filter((t) => t.id !== id),
        })),
      createTab: (name) =>
        set((s) => {
          const id = newId();
          // Snapshot current state into a tab before opening the new one
          const currentSnapshot: TabState = {
            id: s.activeTabId || newId(),
            name: getTabName(s) || "Tab 1",
            symbol: s.symbol,
            timeframe: s.timeframe,
            layout: s.layout,
            slots: s.slots,
            activeSlotId: s.activeSlotId,
            indicators: s.indicators,
            hidden: s.hidden,
            config: s.config,
            drawings: s.drawings,
            priceLines: s.priceLines,
          };
          const tabs = s.tabs.length > 0 ? s.tabs : [currentSnapshot];
          const newTab: TabState = {
            id,
            name: name ?? `Tab ${tabs.length + 1}`,
            symbol: "BTCUSDT",
            timeframe: "15m" as Timeframe,
            layout: "single",
            slots: [
              { id: "slot-1", symbol: "BTCUSDT", timeframe: "15m" as Timeframe },
            ],
            activeSlotId: "slot-1",
            indicators: s.indicators,
            hidden: s.hidden,
            config: s.config,
            drawings: [],
            priceLines: [],
          };
          return {
            tabs: [
              ...tabs.map((t) =>
                t.id === currentSnapshot.id ? currentSnapshot : t,
              ),
              newTab,
            ],
            activeTabId: id,
            // Activate the new tab's state
            symbol: newTab.symbol,
            timeframe: newTab.timeframe,
            layout: newTab.layout,
            slots: newTab.slots,
            activeSlotId: newTab.activeSlotId,
            drawings: newTab.drawings,
            priceLines: newTab.priceLines,
          };
        }),
      closeTab: (id) =>
        set((s) => {
          if (s.tabs.length <= 1) return {}; // keep at least one
          const idx = s.tabs.findIndex((t) => t.id === id);
          if (idx < 0) return {};
          const tabs = s.tabs.filter((t) => t.id !== id);
          // If we closed the active tab, switch to a neighbor
          if (s.activeTabId === id) {
            const next = tabs[Math.max(0, idx - 1)];
            return {
              tabs,
              activeTabId: next.id,
              symbol: next.symbol,
              timeframe: next.timeframe,
              layout: next.layout,
              slots: next.slots,
              activeSlotId: next.activeSlotId,
              drawings: next.drawings,
              priceLines: next.priceLines,
            };
          }
          return { tabs };
        }),
      switchTab: (id) =>
        set((s) => {
          if (s.activeTabId === id) return {};
          const target = s.tabs.find((t) => t.id === id);
          if (!target) return {};
          // Save current state into the current active tab
          const tabs = s.tabs.map((t) =>
            t.id === s.activeTabId
              ? {
                  ...t,
                  symbol: s.symbol,
                  timeframe: s.timeframe,
                  layout: s.layout,
                  slots: s.slots,
                  activeSlotId: s.activeSlotId,
                  indicators: s.indicators,
                  hidden: s.hidden,
                  config: s.config,
                  drawings: s.drawings,
                  priceLines: s.priceLines,
                }
              : t,
          );
          return {
            tabs,
            activeTabId: id,
            symbol: target.symbol,
            timeframe: target.timeframe,
            layout: target.layout,
            slots: target.slots,
            activeSlotId: target.activeSlotId,
            drawings: target.drawings,
            priceLines: target.priceLines,
          };
        }),
      renameTab: (id, name) =>
        set((s) => ({
          tabs: s.tabs.map((t) => (t.id === id ? { ...t, name } : t)),
        })),
      addJournalEntry: (e) =>
        set((s) => ({
          journal: [...s.journal, { ...e, id: newId() }],
        })),
      updateJournalEntry: (id, patch) =>
        set((s) => ({
          journal: s.journal.map((j) => (j.id === id ? { ...j, ...patch } : j)),
        })),
      removeJournalEntry: (id) =>
        set((s) => ({
          journal: s.journal.filter((j) => j.id !== id),
        })),
      addCompare: (slotId, symbol) =>
        set((state) => {
          const existing = state.compares[slotId] ?? [];
          if (existing.includes(symbol)) return {};
          return {
            compares: { ...state.compares, [slotId]: [...existing, symbol] },
          };
        }),
      removeCompare: (slotId, symbol) =>
        set((state) => {
          const existing = state.compares[slotId] ?? [];
          return {
            compares: {
              ...state.compares,
              [slotId]: existing.filter((s) => s !== symbol),
            },
          };
        }),
      addToWatchlist: (s) =>
        set((state) => {
          const next = state.watchlists.map((w) =>
            w.id === state.activeWatchlistId && !w.symbols.includes(s)
              ? { ...w, symbols: [...w.symbols, s] }
              : w,
          );
          const active = next.find((w) => w.id === state.activeWatchlistId);
          return {
            watchlists: next,
            watchlist: active?.symbols ?? state.watchlist,
          };
        }),
      removeFromWatchlist: (s) =>
        set((state) => {
          const next = state.watchlists.map((w) =>
            w.id === state.activeWatchlistId
              ? { ...w, symbols: w.symbols.filter((x) => x !== s) }
              : w,
          );
          const active = next.find((w) => w.id === state.activeWatchlistId);
          return {
            watchlists: next,
            watchlist: active?.symbols ?? state.watchlist,
          };
        }),
      createWatchlist: (id, name) =>
        set((state) => {
          if (state.watchlists.some((w) => w.id === id)) return {};
          return {
            watchlists: [...state.watchlists, { id, name, symbols: [] }],
            activeWatchlistId: id,
            watchlist: [],
          };
        }),
      deleteWatchlist: (id) =>
        set((state) => {
          if (state.watchlists.length <= 1) return {};
          const next = state.watchlists.filter((w) => w.id !== id);
          const active =
            state.activeWatchlistId === id
              ? next[0]
              : next.find((w) => w.id === state.activeWatchlistId) ?? next[0];
          return {
            watchlists: next,
            activeWatchlistId: active.id,
            watchlist: active.symbols,
          };
        }),
      setActiveWatchlist: (id) =>
        set((state) => {
          const w = state.watchlists.find((w) => w.id === id);
          if (!w) return {};
          return { activeWatchlistId: id, watchlist: w.symbols };
        }),
      renameWatchlist: (id, name) =>
        set((state) => ({
          watchlists: state.watchlists.map((w) =>
            w.id === id ? { ...w, name } : w,
          ),
        })),
      addWatchlistSection: (name) =>
        set((state) => {
          const wls = state.watchlists.map((w) => {
            if (w.id !== state.activeWatchlistId) return w;
            const sections = w.sections ?? [];
            return {
              ...w,
              sections: [
                ...sections,
                { id: newId(), name, symbols: [] },
              ],
            };
          });
          return { watchlists: wls };
        }),
      renameWatchlistSection: (sectionId, name) =>
        set((state) => {
          const wls = state.watchlists.map((w) => {
            if (w.id !== state.activeWatchlistId) return w;
            const sections = (w.sections ?? []).map((sec) =>
              sec.id === sectionId ? { ...sec, name } : sec,
            );
            return { ...w, sections };
          });
          return { watchlists: wls };
        }),
      removeWatchlistSection: (sectionId) =>
        set((state) => {
          const wls = state.watchlists.map((w) => {
            if (w.id !== state.activeWatchlistId) return w;
            const sections = (w.sections ?? []).filter(
              (sec) => sec.id !== sectionId,
            );
            return { ...w, sections };
          });
          return { watchlists: wls };
        }),
      addSymbolToSection: (sectionId, symbol) =>
        set((state) => {
          const wls = state.watchlists.map((w) => {
            if (w.id !== state.activeWatchlistId) return w;
            const sections = (w.sections ?? []).map((sec) =>
              sec.id === sectionId && !sec.symbols.includes(symbol)
                ? { ...sec, symbols: [...sec.symbols, symbol] }
                : sec,
            );
            return { ...w, sections };
          });
          return { watchlists: wls };
        }),
      addYahooSymbol: (inst) =>
        set((state) => {
          const next = { ...state.yahooSymbols, [inst.symbol]: inst };
          setYahooSymbolsCache(next);
          return { yahooSymbols: next };
        }),
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
      updateDrawing: (id, patch) =>
        set((state) => ({
          drawings: state.drawings.map((d) =>
            d.id === id ? ({ ...d, ...patch } as Drawing) : d,
          ),
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
      selectDrawing: (selectedDrawingId) => set({ selectedDrawingId }),
      setPanesCollapsed: (panesCollapsed) => set({ panesCollapsed }),
      togglePanesCollapsed: () =>
        set((s) => ({ panesCollapsed: !s.panesCollapsed })),
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
        theme: s.theme,
        symbol: s.symbol,
        timeframe: s.timeframe,
        layout: s.layout,
        slots: s.slots,
        activeSlotId: s.activeSlotId,
        indicators: s.indicators,
        hidden: s.hidden,
        config: s.config,
        watchlist: s.watchlist,
        watchlists: s.watchlists,
        activeWatchlistId: s.activeWatchlistId,
        chartStyle: s.chartStyle,
        logScale: s.logScale,
        syncCharts: s.syncCharts,
        compares: s.compares,
        workspaces: s.workspaces,
        indicatorTemplates: s.indicatorTemplates,
        journal: s.journal,
        tabs: s.tabs,
        activeTabId: s.activeTabId,
        binanceMarket: s.binanceMarket,
        yahooSymbols: s.yahooSymbols,
        drawings: s.drawings,
        priceLines: s.priceLines,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.yahooSymbols) setYahooSymbolsCache(state.yahooSymbols);
      },
      merge: (persistedState, currentState) => {
        const p = (persistedState ?? {}) as Partial<ChartState>;
        return {
          ...currentState,
          ...p,
          // Deep-merge collections that might be missing keys after schema bumps
          indicators: {
            ...currentState.indicators,
            ...(p.indicators ?? {}),
          },
          hidden: {
            ...currentState.hidden,
            ...(p.hidden ?? {}),
          },
          config: {
            ...currentState.config,
            ...(p.config ?? {}),
          },
          compares: p.compares ?? currentState.compares,
          workspaces: p.workspaces ?? currentState.workspaces,
          indicatorTemplates:
            p.indicatorTemplates ?? currentState.indicatorTemplates,
          journal: p.journal ?? currentState.journal,
          watchlists: p.watchlists ?? currentState.watchlists,
          yahooSymbols: p.yahooSymbols ?? currentState.yahooSymbols,
          drawings: p.drawings ?? currentState.drawings,
          priceLines: p.priceLines ?? currentState.priceLines,
          binanceMarket: p.binanceMarket ?? currentState.binanceMarket,
          chartStyle: p.chartStyle ?? currentState.chartStyle,
          tabs: p.tabs ?? currentState.tabs,
          activeTabId: p.activeTabId ?? currentState.activeTabId,
        };
      },
    },
  ),
);
