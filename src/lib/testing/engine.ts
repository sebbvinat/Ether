/**
 * Wave 18 — backtest engine puro. Funciones de transformación
 * `(state, candle) → newState`. Sin side-effects, fácil de testear.
 *
 * Resuelve, por cada vela 1m:
 *   - Fills de órdenes pendientes (limit/stop) cuando el precio cruza el nivel.
 *   - Hits de SL/TP en posiciones abiertas.
 *   - Actualización de unrealizedPnL en cada posición.
 *   - Tracking de maxAdverse / maxFavorable.
 *
 * Limitación: usa close-cross detection (igual que Wave 14). Una alternativa
 * más estricta es chequear `low` (para SL en long) y `high` (para TP en long),
 * lo cual SÍ implementamos acá porque la vela 1m da info intra-bar
 * (open/high/low/close). Es lo que FXReplay hace por default.
 */

import type { Candle } from "@/lib/binance/types";
import type {
  Order,
  Position,
  Trade,
  Side,
} from "@/lib/store/testing-store";

/** Estado mutable que el engine consume y devuelve modificado. */
export interface EngineState {
  orders: Order[];
  positions: Position[];
  trades: Trade[];
  balance: number;
  realizedPnL: number;
}

export interface EngineConfig {
  /** Comisión por contrato/unidad. Default 0. */
  commissionPerUnit?: number;
  /** ID de la sesión — necesario para etiquetar los Trades. */
  sessionId: string;
  /** Si true, los fills usan high/low intra-bar (más realista).
   *  Si false, sólo close (más conservador). Default true. */
  intraBarFills?: boolean;
}

const uid = (): string => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
};

/**
 * Avanza el engine UNA vela. Devuelve el nuevo estado.
 *
 * Orden de operaciones:
 *  1. Para cada orden pendiente: chequear si su nivel fue tocado por
 *     [open..high..low..close] de la vela. Si sí, fill → crear Position.
 *  2. Para cada posición abierta: chequear SL/TP, actualizar MAE/MFE/PnL.
 *  3. Mantener `balance` actualizado: balance = initialBalance + realizedPnL.
 *     (No tocamos initialBalance, lo deja el caller.)
 */
export function stepEngine(
  state: EngineState,
  candle: Candle,
  config: EngineConfig,
): EngineState {
  const intraBar = config.intraBarFills !== false; // default true
  const commission = config.commissionPerUnit ?? 0;
  const newOrders: Order[] = [];
  const newPositions: Position[] = [];
  const newTrades: Trade[] = [...state.trades];
  let realizedPnL = state.realizedPnL;

  // ── 1. Fills de órdenes pendientes ─────────────────────────────────────
  for (const order of state.orders) {
    if (order.status !== "pending") {
      newOrders.push(order);
      continue;
    }
    const filled = tryFillOrder(order, candle, intraBar);
    if (!filled.fill) {
      newOrders.push(order);
      continue;
    }
    // Order filled at price `filled.price`. Marcar order, crear position.
    newOrders.push({
      ...order,
      status: "filled",
      filledAt: candle.time * 1000,
      entryPrice: filled.price,
    });
    newPositions.push({
      id: uid(),
      orderId: order.id,
      side: order.side,
      size: order.size,
      entry: filled.price,
      sl: order.sl,
      tp: order.tp,
      openedAt: candle.time * 1000,
      unrealizedPnL: 0,
      tags: order.tags,
      maxAdverse: 0,
      maxFavorable: 0,
    });
  }

  // ── 2. Posiciones abiertas: SL/TP + PnL ────────────────────────────────
  for (const pos of state.positions) {
    // El precio actual relevante:
    // - Para PnL en cierre de vela: close
    // - Para detectar hit de SL/TP intra-bar: high/low
    const dir = pos.side === "buy" ? 1 : -1;
    // PnL = (close − entry) × size × dir
    const unrealized = (candle.close - pos.entry) * pos.size * dir;
    // Adverse: precio EN CONTRA del trader. Para long: low; short: high.
    const adversePrice = pos.side === "buy" ? candle.low : candle.high;
    const adverse = (adversePrice - pos.entry) * pos.size * dir; // negativo cuando va en contra
    // Favorable: precio A FAVOR del trader.
    const favorablePrice = pos.side === "buy" ? candle.high : candle.low;
    const favorable = (favorablePrice - pos.entry) * pos.size * dir; // positivo cuando va a favor

    const maxAdverse = Math.min(pos.maxAdverse ?? 0, adverse);
    const maxFavorable = Math.max(pos.maxFavorable ?? 0, favorable);

    // Chequear hits:
    const slHit = hitsSL(pos, candle, intraBar);
    const tpHit = hitsTP(pos, candle, intraBar);

    if (slHit && tpHit) {
      // Ambos en la misma vela: ambigüedad. Resolución conservadora →
      // cuenta como SL (peor caso para el trader).
      const trade = closeTradeAtPrice(pos, pos.sl!, "sl", candle, commission, config.sessionId, maxAdverse, maxFavorable);
      newTrades.push(trade);
      realizedPnL += trade.realizedPnL;
    } else if (slHit) {
      const trade = closeTradeAtPrice(pos, pos.sl!, "sl", candle, commission, config.sessionId, maxAdverse, maxFavorable);
      newTrades.push(trade);
      realizedPnL += trade.realizedPnL;
    } else if (tpHit) {
      const trade = closeTradeAtPrice(pos, pos.tp!, "tp", candle, commission, config.sessionId, maxAdverse, maxFavorable);
      newTrades.push(trade);
      realizedPnL += trade.realizedPnL;
    } else {
      // Sigue abierta
      newPositions.push({
        ...pos,
        unrealizedPnL: unrealized,
        maxAdverse,
        maxFavorable,
      });
    }
  }

  return {
    orders: newOrders,
    positions: newPositions,
    trades: newTrades,
    balance: state.balance, // initial + realized; el caller compone
    realizedPnL,
  };
}

/** Cierre manual de una posición (call cuando el user toca "Close"). */
export function manualClose(
  state: EngineState,
  positionId: string,
  closePrice: number,
  candle: Candle,
  config: EngineConfig,
): EngineState {
  const pos = state.positions.find((p) => p.id === positionId);
  if (!pos) return state;
  const commission = config.commissionPerUnit ?? 0;
  const trade = closeTradeAtPrice(
    pos,
    closePrice,
    "manual",
    candle,
    commission,
    config.sessionId,
    pos.maxAdverse ?? 0,
    pos.maxFavorable ?? 0,
  );
  return {
    ...state,
    positions: state.positions.filter((p) => p.id !== positionId),
    trades: [...state.trades, trade],
    realizedPnL: state.realizedPnL + trade.realizedPnL,
  };
}

/** Cancelar una orden pendiente. */
export function cancelOrder(state: EngineState, orderId: string): EngineState {
  return {
    ...state,
    orders: state.orders.map((o) =>
      o.id === orderId && o.status === "pending"
        ? { ...o, status: "cancelled", cancelledAt: Date.now() }
        : o,
    ),
  };
}

/** Modifica SL/TP de una posición abierta. */
export function updatePositionLevels(
  state: EngineState,
  positionId: string,
  patch: { sl?: number | undefined; tp?: number | undefined },
): EngineState {
  return {
    ...state,
    positions: state.positions.map((p) =>
      p.id === positionId ? { ...p, ...patch } : p,
    ),
  };
}

// ─── helpers ─────────────────────────────────────────────────────────────

function tryFillOrder(
  order: Order,
  candle: Candle,
  intraBar: boolean,
): { fill: false } | { fill: true; price: number } {
  if (order.type === "market") {
    return { fill: true, price: candle.open };
  }
  const lo = intraBar ? candle.low : Math.min(candle.open, candle.close);
  const hi = intraBar ? candle.high : Math.max(candle.open, candle.close);

  if (order.type === "limit") {
    // Buy limit: se llena si price ≤ entry (o sea low ≤ entry)
    // Sell limit: se llena si price ≥ entry (high ≥ entry)
    if (order.side === "buy" && lo <= order.entryPrice) {
      return { fill: true, price: Math.min(order.entryPrice, candle.open) };
    }
    if (order.side === "sell" && hi >= order.entryPrice) {
      return { fill: true, price: Math.max(order.entryPrice, candle.open) };
    }
    return { fill: false };
  }
  if (order.type === "stop") {
    // Buy stop: se llena si price ≥ entry
    // Sell stop: se llena si price ≤ entry
    if (order.side === "buy" && hi >= order.entryPrice) {
      return { fill: true, price: Math.max(order.entryPrice, candle.open) };
    }
    if (order.side === "sell" && lo <= order.entryPrice) {
      return { fill: true, price: Math.min(order.entryPrice, candle.open) };
    }
    return { fill: false };
  }
  return { fill: false };
}

function hitsSL(pos: Position, candle: Candle, intraBar: boolean): boolean {
  if (pos.sl === undefined) return false;
  const lo = intraBar ? candle.low : Math.min(candle.open, candle.close);
  const hi = intraBar ? candle.high : Math.max(candle.open, candle.close);
  // Long SL hit cuando low ≤ sl
  if (pos.side === "buy") return lo <= pos.sl;
  // Short SL hit cuando high ≥ sl
  return hi >= pos.sl;
}

function hitsTP(pos: Position, candle: Candle, intraBar: boolean): boolean {
  if (pos.tp === undefined) return false;
  const lo = intraBar ? candle.low : Math.min(candle.open, candle.close);
  const hi = intraBar ? candle.high : Math.max(candle.open, candle.close);
  // Long TP hit cuando high ≥ tp
  if (pos.side === "buy") return hi >= pos.tp;
  // Short TP hit cuando low ≤ tp
  return lo <= pos.tp;
}

function closeTradeAtPrice(
  pos: Position,
  closePrice: number,
  reason: Trade["closeReason"],
  candle: Candle,
  commission: number,
  sessionId: string,
  maxAdverse: number,
  maxFavorable: number,
): Trade {
  const dir = pos.side === "buy" ? 1 : -1;
  const grossPnL = (closePrice - pos.entry) * pos.size * dir;
  const commissionTotal = commission * pos.size * 2; // ida + vuelta
  const realizedPnL = grossPnL - commissionTotal;
  const outcome: Trade["outcome"] =
    realizedPnL > 0 ? "win" : realizedPnL < 0 ? "loss" : "breakeven";
  // R-multiple: realized / risk. risk = |entry − sl| × size.
  let rMultiple: number | undefined;
  let idealRR: number | undefined;
  if (pos.sl !== undefined) {
    const riskPerUnit = Math.abs(pos.entry - pos.sl);
    const risk = riskPerUnit * pos.size;
    if (risk > 0) {
      rMultiple = realizedPnL / risk;
      idealRR = maxFavorable / risk;
    }
  }
  return {
    id: uid(),
    sessionId,
    side: pos.side,
    size: pos.size,
    entry: pos.entry,
    sl: pos.sl,
    tp: pos.tp,
    closePrice,
    closeReason: reason,
    openedAt: pos.openedAt,
    closedAt: candle.time * 1000,
    realizedPnL,
    commission: commissionTotal,
    outcome,
    rMultiple,
    idealRR,
    maxAdverse,
    maxFavorable,
    tags: pos.tags,
  };
}

/** Computa el unrealized total de una lista de posiciones a un precio dado. */
export function computeUnrealized(positions: Position[], currentPrice: number): number {
  let total = 0;
  for (const p of positions) {
    const dir = p.side === "buy" ? 1 : -1;
    total += (currentPrice - p.entry) * p.size * dir;
  }
  return total;
}

/** Helper: crear una market order (estado inicial). */
export function makeMarketOrder(input: {
  side: Side;
  size: number;
  refPrice: number;
  sl?: number;
  tp?: number;
  tags?: string[];
  notes?: string;
}): Order {
  return {
    id: uid(),
    side: input.side,
    type: "market",
    size: input.size,
    entryPrice: input.refPrice,
    sl: input.sl,
    tp: input.tp,
    tags: input.tags ?? [],
    notes: input.notes,
    status: "pending",
    createdAt: Date.now(),
  };
}

export function makeLimitOrder(input: {
  side: Side;
  size: number;
  entryPrice: number;
  sl?: number;
  tp?: number;
  tags?: string[];
  notes?: string;
}): Order {
  return {
    id: uid(),
    side: input.side,
    type: "limit",
    size: input.size,
    entryPrice: input.entryPrice,
    sl: input.sl,
    tp: input.tp,
    tags: input.tags ?? [],
    notes: input.notes,
    status: "pending",
    createdAt: Date.now(),
  };
}

export function makeStopOrder(input: {
  side: Side;
  size: number;
  entryPrice: number;
  sl?: number;
  tp?: number;
  tags?: string[];
  notes?: string;
}): Order {
  return {
    id: uid(),
    side: input.side,
    type: "stop",
    size: input.size,
    entryPrice: input.entryPrice,
    sl: input.sl,
    tp: input.tp,
    tags: input.tags ?? [],
    notes: input.notes,
    status: "pending",
    createdAt: Date.now(),
  };
}
