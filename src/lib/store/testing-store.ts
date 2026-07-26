"use client";

/**
 * Wave 17 — store de la zona Testing (clon de FXReplay).
 *
 * Separado de chart-store para no contaminar el live chart. Persiste sólo
 * la META de cada sesión en localStorage (id, name, símbolo, fechas,
 * balance, totales). El detalle pesado (trades, orders, journal, drawings)
 * vive en IndexedDB vía `lib/testing/storage.ts` y se carga on-demand al
 * entrar a /testing/sessions/[id].
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Timeframe } from "@/lib/binance/types";
import type {
  Drawing,
  DrawingStyle,
  IndicatorConfig,
  IndicatorKey,
} from "./chart-store";
import {
  idbGet,
  idbSet,
  sessionDetailKey,
  deleteSessionData,
} from "@/lib/testing/storage";
import { HistoryStack } from "@/lib/history";
import { manualClose, partialClose, type EngineConfig } from "@/lib/testing/engine";

/** §1 — historial de dibujos de la sesión activa. Vive fuera del store porque
 *  es estado efímero de UI: no se persiste ni dispara re-renders. Se limpia al
 *  cambiar de sesión para no mezclar contextos. */
const drawingsHistory = new HistoryStack<Drawing[]>();

/** §5 — arma la config del engine desde los costos de la sesión. Única fuente
 *  de esa conversión: la usa tanto el store como TestingChart. */
export function engineConfigFor(meta: SessionMeta): EngineConfig {
  return {
    sessionId: meta.id,
    commissionPerUnit: meta.commissionPerUnit ?? 0,
    spreadAmount: (meta.spreadTicks ?? 0) * (meta.tickSize ?? 0.01),
  };
}

// ─── tipos ───────────────────────────────────────────────────────────────────

export type Side = "buy" | "sell";

export type OrderType = "market" | "limit" | "stop";

export type OrderStatus = "pending" | "filled" | "cancelled";

/** Una orden pendiente / a ejecutar por el engine. */
export interface Order {
  id: string;
  side: Side;
  type: OrderType;
  /** En contracts / units (el size del instrumento). */
  size: number;
  /** Para market: precio referencial al crearla. Para limit/stop: nivel a cruzar. */
  entryPrice: number;
  sl?: number;
  tp?: number;
  autoBreakeven?: boolean;
  tags: string[];
  notes?: string;
  status: OrderStatus;
  createdAt: number; // ms
  filledAt?: number; // ms
  /** Si fue cancelada. */
  cancelledAt?: number;
}

/** Una posición abierta. */
export interface Position {
  id: string;
  /** Order que la originó. */
  orderId: string;
  side: Side;
  size: number;
  /** Precio efectivo de fill. */
  entry: number;
  sl?: number;
  tp?: number;
  /** Timestamp del candle en que se abrió. */
  openedAt: number;
  /** PnL no-realizado a precio actual (recalculado por el engine). */
  unrealizedPnL: number;
  tags: string[];
  /** Máximo drawdown contra (en $) — para MAE en analytics. */
  maxAdverse?: number;
  /** Máximo favorable (para Ideal RR). */
  maxFavorable?: number;
  /** §4 — mover el SL al entry automáticamente al alcanzar 1R. */
  autoBreakeven?: boolean;
  /** §4 — true una vez que el auto-BE ya movió el stop (no se repite). */
  beApplied?: boolean;
}

/** §11 — resolución del replay. */
export type PlaybackMode = "bar" | "intrabar";

export type TradeOutcome = "win" | "loss" | "breakeven";

/** Una posición ya cerrada. Forma la base de toda la analítica. */
export interface Trade {
  id: string;
  sessionId: string;
  side: Side;
  size: number;
  entry: number;
  sl?: number;
  tp?: number;
  closePrice: number;
  /** Cómo se cerró. `partial` = §6, una fracción tomada con la posición
   *  todavía abierta. */
  closeReason: "sl" | "tp" | "manual" | "session-end" | "partial";
  openedAt: number;
  closedAt: number;
  realizedPnL: number;
  commission: number;
  outcome: TradeOutcome;
  /** R-multiple realizado: realizedPnL / risk. */
  rMultiple?: number;
  /** Máximo RR alcanzado durante la vida del trade (Ideal RR). */
  idealRR?: number;
  maxAdverse: number;
  maxFavorable: number;
  tags: string[];
  /** ID del JournalEntry asociado (si existe). */
  journalId?: string;
}

export type ChecklistItem = { id: string; label: string; checked: boolean };

export interface JournalEntry {
  id: string;
  tradeId: string;
  sessionId: string;
  notes: string; // markdown
  tags: string[];
  /** 0-100 — pre-trade conviction. */
  confidence?: number;
  /** 1-5 — post-trade self-grade. */
  rating?: number;
  checklist: ChecklistItem[];
  /** IDs de screenshots en IDB. */
  screenshotIds: string[];
  createdAt: number;
  updatedAt: number;
}

// ─── Session ──────────────────────────────────────────────────────────────────

/** Lo que persiste en localStorage. Ligero. */
export interface SessionMeta {
  id: string;
  name: string;
  symbol: string;
  timeframe: Timeframe;
  /** ms — fecha inicial del rango de backtesting (vela de partida). */
  startDate: number;
  /** ms — fin del rango. */
  endDate: number;
  initialBalance: number;
  currentBalance: number;
  realizedPnL: number;
  /** Total de trades cerrados (cache para no recomputar). */
  totalTrades: number;
  /** Wins / losses cache. */
  wins: number;
  losses: number;
  /** LEGACY (Wave 18) — índice del cursor en minutos. Reemplazado por
   *  replayCursorMs. Se mantiene para compat de sesiones viejas. */
  replayIndex: number;
  /** LEGACY — total en minutos. */
  replayTotal: number;
  /** Wave 18.5 — cursor de replay como TIMESTAMP (ms). Esta es la fuente de
   *  verdad: el chart muestra toda la historia con time ≤ replayCursorMs y el
   *  replay avanza de a 1 barra del TF actual. Default = startDate. */
  replayCursorMs: number;
  /** TF para visualizar el chart (1m/5m/15m/30m/1h/4h/1d). Cambiable on-the-fly.
   *  Default = "15m". */
  chartTimeframe: Timeframe;
  /** Step size del replay: cuántas velas 1m avanzar por cada ">|" click.
   *  Default 1 (= 1m por step). 5 = 5 minutos, 15 = 15 minutos, etc. */
  replayStepSize: number;
  /** Speed del autoplay: ms entre cada step. Default 1000. */
  replayIntervalMs: number;
  /** §5 — costos de trading. Comisión en USD por unidad POR LADO (el
   *  round-trip cobra el doble). Default 0. */
  commissionPerUnit?: number;
  /** §5 — spread en ticks. Las velas se tratan como "bid": toda compra se
   *  llena `spreadTicks × tickSize` peor. Default 0. */
  spreadTicks?: number;
  /** §5 — tamaño del tick del instrumento, para convertir spreadTicks a
   *  unidades de precio. Default 0.01. */
  tickSize?: number;
  /** §3 — riesgo por trade en % del balance, para el sizing automático del
   *  diálogo de órdenes. Default 0.5. */
  defaultRiskPct?: number;
  /** §11 — cómo avanza el replay. "bar": de vela completa en vela completa
   *  (lo de siempre). "intrabar": la vela en curso se forma minuto a minuto
   *  y el engine evalúa fills en resolución 1m. Default "bar". */
  playbackMode?: PlaybackMode;
  /** Descripción opcional del trader. */
  description?: string;
  /** Tags opcionales para agrupar sesiones (ej. "strategy: ICT", "phase: 1"). */
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

/** Lo que vive en IndexedDB. Lazy-loaded. */
export interface SessionDetail {
  id: string;
  orders: Order[];
  positions: Position[];
  trades: Trade[];
  drawings: Drawing[];
  drawingStyles: Record<string, DrawingStyle>;
  indicators: Record<IndicatorKey, boolean>;
  hidden: Record<IndicatorKey, boolean>;
  config: IndicatorConfig;
  /** Wave 21 — journal entries keyed by tradeId. */
  journals?: Record<string, JournalEntry>;
}

// ─── store ────────────────────────────────────────────────────────────────────

interface TestingState {
  /** META de todas las sesiones (persistida en localStorage). */
  sessions: SessionMeta[];
  /** Sesión actualmente seleccionada (la del chart abierto). */
  activeSessionId: string | null;
  /** Detalle de la sesión activa, cargado de IDB. null si no hay activa o se está cargando. */
  activeDetail: SessionDetail | null;
  /** True mientras IDB está cargando el detail. */
  loadingDetail: boolean;
  /** Día actual de streak (cache local). Se computa de los trades. */
  streakDays: number;

  // selección
  setActiveSession: (id: string | null) => Promise<void>;

  // sesiones (meta)
  createSession: (input: Omit<SessionMeta, "id" | "currentBalance" | "realizedPnL" | "totalTrades" | "wins" | "losses" | "replayIndex" | "replayTotal" | "replayCursorMs" | "createdAt" | "updatedAt" | "tags" | "chartTimeframe" | "replayStepSize" | "replayIntervalMs"> & { tags?: string[] }) => string;
  duplicateSession: (id: string, newName: string) => Promise<string | null>;
  deleteSession: (id: string) => Promise<void>;
  renameSession: (id: string, name: string) => void;
  updateSessionMeta: (id: string, patch: Partial<SessionMeta>) => void;

  // detalle (operan sobre activeDetail)
  setReplayIndex: (idx: number) => void;
  setReplayTotal: (total: number) => void;
  /** Wave 18.5 — setea el cursor de replay (timestamp ms). Fuente de verdad. */
  setReplayCursor: (ms: number) => void;
  /** §11 — alterna entre avance por vela y avance minuto a minuto. */
  setPlaybackMode: (mode: PlaybackMode) => void;
  setChartTimeframe: (tf: Timeframe) => void;
  /** Wave 18.6 — toggle un indicador en la sesión activa. */
  toggleIndicator: (key: IndicatorKey) => Promise<void>;
  /** §9 — ajustar los períodos de los indicadores de la sesión activa. */
  updateIndicatorConfig: (patch: Partial<IndicatorConfig>) => Promise<void>;
  /** Wave 18.6 — drawings sobre el chart de la sesión activa. */
  addDrawingToActive: (drawing: Drawing) => Promise<void>;
  removeDrawingFromActive: (drawingId: string) => Promise<void>;
  clearDrawingsInActive: () => Promise<void>;
  /** §1 — undo/redo de dibujos (snapshot stack, no persiste al recargar). */
  undoDrawings: () => Promise<void>;
  redoDrawings: () => Promise<void>;
  setReplayStepSize: (size: number) => void;
  setReplayIntervalMs: (ms: number) => void;
  // Wave 18 — acciones de engine (operan sobre activeDetail + meta)
  addOrder: (order: Order) => Promise<void>;
  /** Abre una posición inmediatamente al precio actual (market fill). No pasa
   *  por el flujo pending→engine: las market orders se llenan al toque, incluso
   *  con el replay pausado (igual que FXReplay). */
  openPositionNow: (input: {
    side: Side;
    size: number;
    entry: number;
    sl?: number;
    tp?: number;
    tags?: string[];
    notes?: string;
    openedAtMs: number;
    /** §4 — mover el SL al entry al alcanzar 1R. */
    autoBreakeven?: boolean;
  }) => Promise<void>;
  cancelOrderById: (orderId: string) => Promise<void>;
  /** Wave 18.7 — ajustar niveles de una orden pendiente (drag desde el chart). */
  updateOrderLevels: (orderId: string, patch: { entryPrice?: number; sl?: number; tp?: number }) => Promise<void>;
  closePositionManual: (positionId: string, closePrice: number, closedAtMs: number) => Promise<void>;
  /** §6 — cierra `fraction` (0..1) de la posición y deja el resto abierto.
   *  Si lo que queda no llega al mínimo operable, cierra todo. */
  closePositionPartial: (positionId: string, fraction: number, closePrice: number, closedAtMs: number) => Promise<void>;
  updatePositionLevels: (positionId: string, patch: { sl?: number; tp?: number }) => Promise<void>;
  /** Aplica un snapshot del engine al detail activo + persiste a IDB.
   *  Usado por TestingChart al avanzar el replay (después de stepEngine). */
  applyEngineState: (next: { orders: Order[]; positions: Position[]; trades: Trade[]; realizedPnL: number }) => Promise<void>;
  /** Wave 21 — upsert journal entry para un trade. */
  upsertJournal: (tradeId: string, entry: Omit<JournalEntry, "createdAt" | "updatedAt" | "tradeId" | "sessionId" | "id"> & Partial<Pick<JournalEntry, "id">>) => Promise<void>;
  deleteJournal: (tradeId: string) => Promise<void>;
}

// ─── defaults ─────────────────────────────────────────────────────────────────

function freshIndicators(): Record<IndicatorKey, boolean> {
  const keys: IndicatorKey[] = [
    "ema20", "ema50", "ema200", "sma20", "sma50", "bb", "vwap",
    "rsi", "macd", "atr", "obv", "stoch", "volume",
    "cci", "williamsR", "mfi", "adx", "stochRsi", "ao",
    "donchian", "keltner", "supertrend", "psar", "pivots", "ichimoku",
    "vp",
  ];
  return Object.fromEntries(keys.map((k) => [k, false])) as Record<IndicatorKey, boolean>;
}

function freshDetail(id: string, config: IndicatorConfig): SessionDetail {
  return {
    id,
    orders: [],
    positions: [],
    trades: [],
    drawings: [],
    drawingStyles: {},
    indicators: freshIndicators(),
    hidden: freshIndicators(),
    config,
  };
}

/** §6 — cómo queda la meta de sesión después de que el engine cerró un trade.
 *  Lo comparten el cierre total y el parcial: para las estadísticas un parcial
 *  es un trade más. */
function metaAfterTrade(meta: SessionMeta, trade: Trade): SessionMeta {
  return {
    ...meta,
    realizedPnL: meta.realizedPnL + trade.realizedPnL,
    currentBalance: meta.currentBalance + trade.realizedPnL,
    totalTrades: meta.totalTrades + 1,
    wins: meta.wins + (trade.outcome === "win" ? 1 : 0),
    losses: meta.losses + (trade.outcome === "loss" ? 1 : 0),
    updatedAt: Date.now(),
  };
}

function uid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ─── implementación ───────────────────────────────────────────────────────────

export const useTestingStore = create<TestingState>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeSessionId: null,
      activeDetail: null,
      loadingDetail: false,
      streakDays: 0,

      setActiveSession: async (id) => {
        // §1 — el undo no cruza sesiones.
        drawingsHistory.clear();
        if (id === null) {
          set({ activeSessionId: null, activeDetail: null, loadingDetail: false });
          return;
        }
        const meta = get().sessions.find((s) => s.id === id);
        if (!meta) {
          set({ activeSessionId: null, activeDetail: null });
          return;
        }
        set({ activeSessionId: id, loadingDetail: true });
        const detail = (await idbGet<SessionDetail>(sessionDetailKey(id))) ?? null;
        // Si no hay detail aún, crear uno fresh y persistirlo
        if (!detail) {
          // Necesitamos un IndicatorConfig por defecto — lo cogemos del chart-store
          // dinámicamente para no duplicar la fuente de verdad.
          const { DEFAULT_CONFIG } = await import("./chart-store");
          const fresh = freshDetail(id, { ...DEFAULT_CONFIG });
          await idbSet(sessionDetailKey(id), fresh);
          set({ activeDetail: fresh, loadingDetail: false });
          return;
        }
        set({ activeDetail: detail, loadingDetail: false });
      },

      createSession: (input) => {
        const id = uid();
        const now = Date.now();
        const meta: SessionMeta = {
          id,
          name: input.name,
          symbol: input.symbol,
          timeframe: input.timeframe,
          startDate: input.startDate,
          endDate: input.endDate,
          initialBalance: input.initialBalance,
          currentBalance: input.initialBalance,
          realizedPnL: 0,
          totalTrades: 0,
          wins: 0,
          losses: 0,
          replayIndex: 0,
          replayTotal: 0,
          replayCursorMs: input.startDate,
          chartTimeframe: input.timeframe,
          replayStepSize: 1,
          replayIntervalMs: 1000,
          commissionPerUnit: input.commissionPerUnit ?? 0,
          spreadTicks: input.spreadTicks ?? 0,
          tickSize: input.tickSize ?? 0.01,
          defaultRiskPct: input.defaultRiskPct ?? 0.5,
          playbackMode: "bar",
          description: input.description,
          tags: input.tags ?? [],
          createdAt: now,
          updatedAt: now,
        };
        set((s) => ({ sessions: [meta, ...s.sessions] }));
        return id;
      },

      duplicateSession: async (id, newName) => {
        const meta = get().sessions.find((s) => s.id === id);
        if (!meta) return null;
        const newId = uid();
        const now = Date.now();
        const newMeta: SessionMeta = {
          ...meta,
          id: newId,
          name: newName,
          currentBalance: meta.initialBalance,
          realizedPnL: 0,
          totalTrades: 0,
          wins: 0,
          losses: 0,
          replayIndex: 0,
          replayCursorMs: meta.startDate,
          chartTimeframe: meta.chartTimeframe ?? meta.timeframe,
          replayStepSize: meta.replayStepSize ?? 1,
          replayIntervalMs: meta.replayIntervalMs ?? 1000,
          createdAt: now,
          updatedAt: now,
        };
        // Copiar detail también (sin trades — empieza limpio para entrenar el mismo setup)
        const srcDetail = (await idbGet<SessionDetail>(sessionDetailKey(id))) ?? null;
        const { DEFAULT_CONFIG } = await import("./chart-store");
        const newDetail: SessionDetail = srcDetail
          ? {
              ...srcDetail,
              id: newId,
              orders: [],
              positions: [],
              trades: [],
            }
          : freshDetail(newId, { ...DEFAULT_CONFIG });
        await idbSet(sessionDetailKey(newId), newDetail);
        set((s) => ({ sessions: [newMeta, ...s.sessions] }));
        return newId;
      },

      deleteSession: async (id) => {
        set((s) => ({
          sessions: s.sessions.filter((x) => x.id !== id),
          activeSessionId: s.activeSessionId === id ? null : s.activeSessionId,
          activeDetail: s.activeSessionId === id ? null : s.activeDetail,
        }));
        await deleteSessionData(id);
      },

      renameSession: (id, name) => {
        set((s) => ({
          sessions: s.sessions.map((x) =>
            x.id === id ? { ...x, name, updatedAt: Date.now() } : x,
          ),
        }));
      },

      updateSessionMeta: (id, patch) => {
        set((s) => ({
          sessions: s.sessions.map((x) =>
            x.id === id ? { ...x, ...patch, updatedAt: Date.now() } : x,
          ),
        }));
      },

      setReplayIndex: (idx) => {
        const active = get().activeSessionId;
        if (!active) return;
        set((s) => ({
          sessions: s.sessions.map((x) =>
            x.id === active
              ? { ...x, replayIndex: Math.max(0, Math.min(x.replayTotal - 1, idx)) }
              : x,
          ),
        }));
      },

      setReplayTotal: (total) => {
        const active = get().activeSessionId;
        if (!active) return;
        set((s) => ({
          sessions: s.sessions.map((x) =>
            x.id === active ? { ...x, replayTotal: total } : x,
          ),
        }));
      },

      setReplayCursor: (ms) => {
        const active = get().activeSessionId;
        if (!active) return;
        set((s) => ({
          sessions: s.sessions.map((x) => {
            if (x.id !== active) return x;
            const clamped = Math.max(x.startDate, Math.min(x.endDate, ms));
            return { ...x, replayCursorMs: clamped };
          }),
        }));
      },

      setPlaybackMode: (mode) => {
        const active = get().activeSessionId;
        if (!active) return;
        set((s) => ({
          sessions: s.sessions.map((x) =>
            x.id === active ? { ...x, playbackMode: mode, updatedAt: Date.now() } : x,
          ),
        }));
      },

      updateIndicatorConfig: async (patch) => {
        const active = get().activeSessionId;
        const detail = get().activeDetail;
        if (!active || !detail) return;
        const newDetail = { ...detail, config: { ...detail.config, ...patch } };
        set({ activeDetail: newDetail });
        await idbSet(sessionDetailKey(active), newDetail);
      },

      toggleIndicator: async (key) => {
        const active = get().activeSessionId;
        const detail = get().activeDetail;
        if (!active || !detail) return;
        const newDetail = {
          ...detail,
          indicators: {
            ...detail.indicators,
            [key]: !detail.indicators[key],
          },
        };
        set({ activeDetail: newDetail });
        await idbSet(sessionDetailKey(active), newDetail);
      },

      addDrawingToActive: async (drawing) => {
        const active = get().activeSessionId;
        const detail = get().activeDetail;
        if (!active || !detail) return;
        drawingsHistory.push(detail.drawings);
        const newDetail = { ...detail, drawings: [...detail.drawings, drawing] };
        set({ activeDetail: newDetail });
        await idbSet(sessionDetailKey(active), newDetail);
      },

      removeDrawingFromActive: async (drawingId) => {
        const active = get().activeSessionId;
        const detail = get().activeDetail;
        if (!active || !detail) return;
        drawingsHistory.push(detail.drawings);
        const newDetail = {
          ...detail,
          drawings: detail.drawings.filter((d) => d.id !== drawingId),
        };
        set({ activeDetail: newDetail });
        await idbSet(sessionDetailKey(active), newDetail);
      },

      clearDrawingsInActive: async () => {
        const active = get().activeSessionId;
        const detail = get().activeDetail;
        if (!active || !detail) return;
        drawingsHistory.push(detail.drawings);
        const newDetail = { ...detail, drawings: [] };
        set({ activeDetail: newDetail });
        await idbSet(sessionDetailKey(active), newDetail);
      },

      undoDrawings: async () => {
        const active = get().activeSessionId;
        const detail = get().activeDetail;
        if (!active || !detail) return;
        const prev = drawingsHistory.undo(detail.drawings);
        if (!prev) return;
        const newDetail = { ...detail, drawings: prev };
        set({ activeDetail: newDetail });
        await idbSet(sessionDetailKey(active), newDetail);
      },

      redoDrawings: async () => {
        const active = get().activeSessionId;
        const detail = get().activeDetail;
        if (!active || !detail) return;
        const next = drawingsHistory.redo(detail.drawings);
        if (!next) return;
        const newDetail = { ...detail, drawings: next };
        set({ activeDetail: newDetail });
        await idbSet(sessionDetailKey(active), newDetail);
      },

      setChartTimeframe: (tf) => {
        const active = get().activeSessionId;
        if (!active) return;
        set((s) => ({
          sessions: s.sessions.map((x) =>
            x.id === active ? { ...x, chartTimeframe: tf, updatedAt: Date.now() } : x,
          ),
        }));
      },

      setReplayStepSize: (size) => {
        const active = get().activeSessionId;
        if (!active) return;
        set((s) => ({
          sessions: s.sessions.map((x) =>
            x.id === active ? { ...x, replayStepSize: Math.max(1, size) } : x,
          ),
        }));
      },

      setReplayIntervalMs: (ms) => {
        const active = get().activeSessionId;
        if (!active) return;
        set((s) => ({
          sessions: s.sessions.map((x) =>
            x.id === active ? { ...x, replayIntervalMs: Math.max(50, ms) } : x,
          ),
        }));
      },

      addOrder: async (order) => {
        const active = get().activeSessionId;
        const detail = get().activeDetail;
        if (!active || !detail) return;
        const newDetail = { ...detail, orders: [...detail.orders, order] };
        set({ activeDetail: newDetail });
        await idbSet(sessionDetailKey(active), newDetail);
      },

      openPositionNow: async (input) => {
        const active = get().activeSessionId;
        const detail = get().activeDetail;
        const meta = get().sessions.find((s) => s.id === active);
        if (!active || !detail || !meta) return;
        const orderId = uid();
        // §5 — este path no pasa por el engine (fill inmediato), así que
        // aplicamos el spread acá: comprar cuesta, vender no.
        const spread = (meta.spreadTicks ?? 0) * (meta.tickSize ?? 0.01);
        const entry = input.side === "buy" ? input.entry + spread : input.entry;
        // Order sintética "filled" para historial
        const order: Order = {
          id: orderId,
          side: input.side,
          type: "market",
          size: input.size,
          entryPrice: entry,
          sl: input.sl,
          tp: input.tp,
          tags: input.tags ?? [],
          notes: input.notes,
          autoBreakeven: input.autoBreakeven,
          status: "filled",
          createdAt: input.openedAtMs,
          filledAt: input.openedAtMs,
        };
        const position: Position = {
          id: uid(),
          orderId,
          side: input.side,
          size: input.size,
          entry,
          sl: input.sl,
          tp: input.tp,
          openedAt: input.openedAtMs,
          unrealizedPnL: 0,
          tags: input.tags ?? [],
          maxAdverse: 0,
          maxFavorable: 0,
          autoBreakeven: input.autoBreakeven,
          beApplied: false,
        };
        const newDetail = {
          ...detail,
          orders: [...detail.orders, order],
          positions: [...detail.positions, position],
        };
        set({ activeDetail: newDetail });
        await idbSet(sessionDetailKey(active), newDetail);
      },

      updateOrderLevels: async (orderId, patch) => {
        const active = get().activeSessionId;
        const detail = get().activeDetail;
        if (!active || !detail) return;
        const newDetail = {
          ...detail,
          orders: detail.orders.map((o) =>
            o.id === orderId && o.status === "pending" ? { ...o, ...patch } : o,
          ),
        };
        set({ activeDetail: newDetail });
        await idbSet(sessionDetailKey(active), newDetail);
      },

      cancelOrderById: async (orderId) => {
        const active = get().activeSessionId;
        const detail = get().activeDetail;
        if (!active || !detail) return;
        const newDetail = {
          ...detail,
          orders: detail.orders.map((o) =>
            o.id === orderId && o.status === "pending"
              ? { ...o, status: "cancelled" as const, cancelledAt: Date.now() }
              : o,
          ),
        };
        set({ activeDetail: newDetail });
        await idbSet(sessionDetailKey(active), newDetail);
      },

      closePositionManual: async (positionId, closePrice, closedAtMs) => {
        const active = get().activeSessionId;
        const detail = get().activeDetail;
        const meta = get().sessions.find((s) => s.id === active);
        if (!active || !detail || !meta) return;
        // §5 — delegamos al engine en vez de recalcular el PnL a mano: así la
        // comisión, el spread y el R-multiple salen de una sola fuente de
        // verdad (y quedan cubiertos por los tests del engine).
        const before = {
          orders: detail.orders,
          positions: detail.positions,
          trades: detail.trades,
          balance: meta.currentBalance,
          realizedPnL: meta.realizedPnL,
        };
        const after = manualClose(
          before,
          positionId,
          closePrice,
          // El engine sólo usa candle.time para timestampear el cierre.
          { time: Math.floor(closedAtMs / 1000), open: closePrice, high: closePrice, low: closePrice, close: closePrice, volume: 0 },
          engineConfigFor(meta),
        );
        if (after === before) return; // posición inexistente
        const trade = after.trades[after.trades.length - 1];
        const newDetail = {
          ...detail,
          positions: after.positions,
          trades: after.trades,
        };
        set((s) => ({
          activeDetail: newDetail,
          sessions: s.sessions.map((x) =>
            x.id === active ? metaAfterTrade(x, trade) : x,
          ),
        }));
        await idbSet(sessionDetailKey(active), newDetail);
      },

      closePositionPartial: async (positionId, fraction, closePrice, closedAtMs) => {
        const active = get().activeSessionId;
        const detail = get().activeDetail;
        const meta = get().sessions.find((s) => s.id === active);
        if (!active || !detail || !meta) return;
        const before = {
          orders: detail.orders,
          positions: detail.positions,
          trades: detail.trades,
          balance: meta.currentBalance,
          realizedPnL: meta.realizedPnL,
        };
        const after = partialClose(
          before,
          positionId,
          fraction,
          closePrice,
          { time: Math.floor(closedAtMs / 1000), open: closePrice, high: closePrice, low: closePrice, close: closePrice, volume: 0 },
          engineConfigFor(meta),
        );
        // Fracción inválida o posición inexistente: el engine devuelve el mismo
        // objeto y no hay nada que persistir.
        if (after === before) return;
        const trade = after.trades[after.trades.length - 1];
        const newDetail = {
          ...detail,
          positions: after.positions,
          trades: after.trades,
        };
        set((s) => ({
          activeDetail: newDetail,
          sessions: s.sessions.map((x) =>
            x.id === active ? metaAfterTrade(x, trade) : x,
          ),
        }));
        await idbSet(sessionDetailKey(active), newDetail);
      },

      updatePositionLevels: async (positionId, patch) => {
        const active = get().activeSessionId;
        const detail = get().activeDetail;
        if (!active || !detail) return;
        const newDetail = {
          ...detail,
          positions: detail.positions.map((p) =>
            p.id === positionId ? { ...p, ...patch } : p,
          ),
        };
        set({ activeDetail: newDetail });
        await idbSet(sessionDetailKey(active), newDetail);
      },

      upsertJournal: async (tradeId, entry) => {
        const active = get().activeSessionId;
        const detail = get().activeDetail;
        if (!active || !detail) return;
        const now = Date.now();
        const journals = detail.journals ?? {};
        const existing = journals[tradeId];
        const fresh: JournalEntry = {
          id: existing?.id ?? entry.id ?? uid(),
          tradeId,
          sessionId: active,
          notes: entry.notes ?? existing?.notes ?? "",
          tags: entry.tags ?? existing?.tags ?? [],
          confidence: entry.confidence ?? existing?.confidence,
          rating: entry.rating ?? existing?.rating,
          checklist: entry.checklist ?? existing?.checklist ?? [],
          screenshotIds: entry.screenshotIds ?? existing?.screenshotIds ?? [],
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        };
        const newDetail = {
          ...detail,
          journals: { ...journals, [tradeId]: fresh },
          trades: detail.trades.map((t) =>
            t.id === tradeId ? { ...t, journalId: fresh.id } : t,
          ),
        };
        set({ activeDetail: newDetail });
        await idbSet(sessionDetailKey(active), newDetail);
      },

      deleteJournal: async (tradeId) => {
        const active = get().activeSessionId;
        const detail = get().activeDetail;
        if (!active || !detail) return;
        const journals = { ...(detail.journals ?? {}) };
        delete journals[tradeId];
        const newDetail = {
          ...detail,
          journals,
          trades: detail.trades.map((t) =>
            t.id === tradeId ? { ...t, journalId: undefined } : t,
          ),
        };
        set({ activeDetail: newDetail });
        await idbSet(sessionDetailKey(active), newDetail);
      },

      applyEngineState: async (next) => {
        const active = get().activeSessionId;
        const detail = get().activeDetail;
        const meta = get().sessions.find((s) => s.id === active);
        if (!active || !detail || !meta) return;
        const realizedDelta = next.realizedPnL - meta.realizedPnL;
        const newTradesCount = next.trades.length - detail.trades.length;
        let wins = meta.wins;
        let losses = meta.losses;
        if (newTradesCount > 0) {
          const fresh = next.trades.slice(detail.trades.length);
          for (const t of fresh) {
            if (t.outcome === "win") wins++;
            else if (t.outcome === "loss") losses++;
          }
        }
        const newDetail = {
          ...detail,
          orders: next.orders,
          positions: next.positions,
          trades: next.trades,
        };
        set((s) => ({
          activeDetail: newDetail,
          sessions: s.sessions.map((x) =>
            x.id === active
              ? {
                  ...x,
                  realizedPnL: next.realizedPnL,
                  currentBalance: x.initialBalance + next.realizedPnL,
                  totalTrades: next.trades.length,
                  wins,
                  losses,
                  updatedAt: Date.now(),
                }
              : x,
          ),
        }));
        await idbSet(sessionDetailKey(active), newDetail);
      },
    }),
    {
      name: "ether-testing-v1",
      partialize: (s) => ({
        sessions: s.sessions,
        // NO persistimos activeDetail (vive en IDB) ni activeSessionId
        // (vuelve a null al recargar — el usuario re-elige).
      }),
      merge: (persistedRaw, currentState) => {
        // Wave 18 — backfill de campos nuevos en sesiones creadas en Wave 17.
        const p = persistedRaw as { sessions?: SessionMeta[] } | undefined;
        const sessions = (p?.sessions ?? []).map((sess) => ({
          ...sess,
          chartTimeframe: sess.chartTimeframe ?? sess.timeframe,
          replayStepSize: sess.replayStepSize ?? 1,
          replayIntervalMs: sess.replayIntervalMs ?? 1000,
          replayCursorMs: sess.replayCursorMs ?? sess.startDate,
          // §5 — sesiones viejas no tenían costos: default sin fricción.
          commissionPerUnit: sess.commissionPerUnit ?? 0,
          spreadTicks: sess.spreadTicks ?? 0,
          tickSize: sess.tickSize ?? 0.01,
          defaultRiskPct: sess.defaultRiskPct ?? 0.5,
          // §11 — sesiones viejas siguen avanzando por vela completa.
          playbackMode: sess.playbackMode ?? ("bar" as PlaybackMode),
        }));
        return { ...currentState, ...(p ?? {}), sessions };
      },
    },
  ),
);
