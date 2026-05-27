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
}

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
  /** Cómo se cerró: sl/tp/manual. */
  closeReason: "sl" | "tp" | "manual" | "session-end";
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
  /** Índice del cursor de replay (cuál es la última vela "vivida"). */
  replayIndex: number;
  /** Cuántas velas tiene la ventana histórica total (se setea al cargar). */
  replayTotal: number;
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
  createSession: (input: Omit<SessionMeta, "id" | "currentBalance" | "realizedPnL" | "totalTrades" | "wins" | "losses" | "replayIndex" | "replayTotal" | "createdAt" | "updatedAt" | "tags"> & { tags?: string[] }) => string;
  duplicateSession: (id: string, newName: string) => Promise<string | null>;
  deleteSession: (id: string) => Promise<void>;
  renameSession: (id: string, name: string) => void;
  updateSessionMeta: (id: string, patch: Partial<SessionMeta>) => void;

  // detalle (operan sobre activeDetail)
  setReplayIndex: (idx: number) => void;
  setReplayTotal: (total: number) => void;
  // (las acciones de órdenes/posiciones/trades llegan en Wave 18; acá sólo
  //  dejamos el shape listo)
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
    }),
    {
      name: "ether-testing-v1",
      partialize: (s) => ({
        sessions: s.sessions,
        // NO persistimos activeDetail (vive en IDB) ni activeSessionId
        // (vuelve a null al recargar — el usuario re-elige).
      }),
    },
  ),
);
