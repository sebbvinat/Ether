/**
 * Wave 20 — métricas puras computadas a partir de `Trade[]`.
 *
 * Todas las funciones son puras: dado el mismo input, mismo output. No tocan
 * stores. Se llaman desde la session summary y desde /testing/analytics.
 */

import type { Trade } from "@/lib/store/testing-store";

export interface EquityPoint {
  /** ms del cierre del trade que produjo este punto. */
  time: number;
  /** Equity acumulada después de este trade. */
  equity: number;
  /** PnL de este trade. */
  delta: number;
}

/** Equity curve: una serie de puntos {time, equity} a partir de `initialBalance`. */
export function equityCurve(trades: Trade[], initialBalance: number): EquityPoint[] {
  const sorted = [...trades].sort((a, b) => a.closedAt - b.closedAt);
  let eq = initialBalance;
  const out: EquityPoint[] = [{ time: sorted[0]?.openedAt ?? Date.now(), equity: eq, delta: 0 }];
  for (const t of sorted) {
    eq += t.realizedPnL;
    out.push({ time: t.closedAt, equity: eq, delta: t.realizedPnL });
  }
  return out;
}

export interface KPIStats {
  totalTrades: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number; // 0-100
  totalRealized: number;
  /** PnL promedio por trade. */
  avgPnL: number;
  /** Mejor / peor trade. */
  bestWin: number;
  worstLoss: number;
  /** Suma de wins / suma de losses (en valor absoluto). */
  profitFactor: number;
  /** Expectancy = winRate × avgWin − lossRate × avgLoss. */
  expectancy: number;
  avgWin: number;
  avgLoss: number;
  avgRR: number;
  maxRR: number;
  /** Max drawdown de la equity curve (en $). */
  maxDrawdown: number;
  /** Max drawdown en % del peak. */
  maxDrawdownPct: number;
  /** Comisiones totales. */
  totalCommission: number;
  /** Duración promedio de un trade (en ms). */
  avgDurationMs: number;
  /** Streak más largo de wins consecutivos. */
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
}

export function computeKPIs(trades: Trade[], initialBalance: number): KPIStats {
  if (trades.length === 0) {
    return {
      totalTrades: 0,
      wins: 0,
      losses: 0,
      breakeven: 0,
      winRate: 0,
      totalRealized: 0,
      avgPnL: 0,
      bestWin: 0,
      worstLoss: 0,
      profitFactor: 0,
      expectancy: 0,
      avgWin: 0,
      avgLoss: 0,
      avgRR: 0,
      maxRR: 0,
      maxDrawdown: 0,
      maxDrawdownPct: 0,
      totalCommission: 0,
      avgDurationMs: 0,
      maxConsecutiveWins: 0,
      maxConsecutiveLosses: 0,
    };
  }
  const wins = trades.filter((t) => t.outcome === "win");
  const losses = trades.filter((t) => t.outcome === "loss");
  const breakeven = trades.filter((t) => t.outcome === "breakeven");
  const totalRealized = trades.reduce((acc, t) => acc + t.realizedPnL, 0);
  const sumWins = wins.reduce((acc, t) => acc + t.realizedPnL, 0);
  const sumLosses = Math.abs(losses.reduce((acc, t) => acc + t.realizedPnL, 0));
  const profitFactor = sumLosses > 0 ? sumWins / sumLosses : sumWins > 0 ? Infinity : 0;
  const avgWin = wins.length > 0 ? sumWins / wins.length : 0;
  const avgLoss = losses.length > 0 ? sumLosses / losses.length : 0;
  const winRate = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
  const lossRate = trades.length > 0 ? (losses.length / trades.length) * 100 : 0;
  const expectancy = (winRate / 100) * avgWin - (lossRate / 100) * avgLoss;

  const rrs = trades.filter((t) => t.rMultiple !== undefined).map((t) => t.rMultiple!);
  const avgRR = rrs.length > 0 ? rrs.reduce((a, b) => a + b, 0) / rrs.length : 0;
  const maxRR = rrs.length > 0 ? Math.max(...rrs) : 0;

  // Max DD from equity curve
  const curve = equityCurve(trades, initialBalance);
  let peak = -Infinity;
  let maxDD = 0;
  let maxDDPct = 0;
  for (const p of curve) {
    if (p.equity > peak) peak = p.equity;
    const dd = peak - p.equity;
    if (dd > maxDD) maxDD = dd;
    const ddPct = peak > 0 ? (dd / peak) * 100 : 0;
    if (ddPct > maxDDPct) maxDDPct = ddPct;
  }

  // Consecutive streaks
  const sorted = [...trades].sort((a, b) => a.closedAt - b.closedAt);
  let curW = 0,
    curL = 0,
    maxW = 0,
    maxL = 0;
  for (const t of sorted) {
    if (t.outcome === "win") {
      curW++;
      curL = 0;
      if (curW > maxW) maxW = curW;
    } else if (t.outcome === "loss") {
      curL++;
      curW = 0;
      if (curL > maxL) maxL = curL;
    } else {
      curW = 0;
      curL = 0;
    }
  }

  const totalCommission = trades.reduce((acc, t) => acc + t.commission, 0);
  const durations = trades.map((t) => t.closedAt - t.openedAt);
  const avgDurationMs =
    durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

  return {
    totalTrades: trades.length,
    wins: wins.length,
    losses: losses.length,
    breakeven: breakeven.length,
    winRate,
    totalRealized,
    avgPnL: totalRealized / trades.length,
    bestWin: wins.length > 0 ? Math.max(...wins.map((t) => t.realizedPnL)) : 0,
    worstLoss: losses.length > 0 ? Math.min(...losses.map((t) => t.realizedPnL)) : 0,
    profitFactor,
    expectancy,
    avgWin,
    avgLoss,
    avgRR,
    maxRR,
    maxDrawdown: maxDD,
    maxDrawdownPct: maxDDPct,
    totalCommission,
    avgDurationMs,
    maxConsecutiveWins: maxW,
    maxConsecutiveLosses: maxL,
  };
}

/** Performance por mes (year-month → totalPnL + winRate). */
export interface MonthlyPerformanceEntry {
  yearMonth: string; // YYYY-MM
  totalPnL: number;
  winRate: number;
  totalTrades: number;
}

export function performanceByMonth(trades: Trade[]): MonthlyPerformanceEntry[] {
  const buckets = new Map<string, Trade[]>();
  for (const t of trades) {
    const d = new Date(t.closedAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const arr = buckets.get(key) ?? [];
    arr.push(t);
    buckets.set(key, arr);
  }
  return Array.from(buckets.entries())
    .map(([key, arr]) => {
      const wins = arr.filter((t) => t.outcome === "win").length;
      return {
        yearMonth: key,
        totalPnL: arr.reduce((acc, t) => acc + t.realizedPnL, 0),
        winRate: arr.length > 0 ? (wins / arr.length) * 100 : 0,
        totalTrades: arr.length,
      };
    })
    .sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));
}

/** Performance por día de la semana. */
export interface WeekdayPerformanceEntry {
  weekday: number; // 0=Sun .. 6=Sat
  weekdayLabel: string;
  totalPnL: number;
  winRate: number;
  totalTrades: number;
}

const WEEKDAY_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export function performanceByWeekday(trades: Trade[]): WeekdayPerformanceEntry[] {
  const buckets: Trade[][] = Array.from({ length: 7 }, () => []);
  for (const t of trades) {
    const d = new Date(t.closedAt);
    buckets[d.getDay()].push(t);
  }
  return buckets.map((arr, i) => {
    const wins = arr.filter((t) => t.outcome === "win").length;
    return {
      weekday: i,
      weekdayLabel: WEEKDAY_LABELS[i],
      totalPnL: arr.reduce((acc, t) => acc + t.realizedPnL, 0),
      winRate: arr.length > 0 ? (wins / arr.length) * 100 : 0,
      totalTrades: arr.length,
    };
  });
}

/** Performance por hora del día (0-23). */
export interface HourPerformanceEntry {
  hour: number;
  totalPnL: number;
  totalTrades: number;
}

export function performanceByHour(trades: Trade[]): HourPerformanceEntry[] {
  const buckets: Trade[][] = Array.from({ length: 24 }, () => []);
  for (const t of trades) {
    const d = new Date(t.openedAt);
    buckets[d.getHours()].push(t);
  }
  return buckets.map((arr, h) => ({
    hour: h,
    totalPnL: arr.reduce((acc, t) => acc + t.realizedPnL, 0),
    totalTrades: arr.length,
  }));
}

/** Sesión: clasifica cada trade en Asia / London / NY / Out (en NY time). */
export type TradeSession = "asia" | "london" | "ny" | "out";

export function classifyTradeSession(openedAtMs: number): TradeSession {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date(openedAtMs));
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  // Approximate: Asia 19-02 NY, London 02-07 NY, NY 07-17 NY, Out resto.
  if (hour >= 19 || hour < 2) return "asia";
  if (hour >= 2 && hour < 7) return "london";
  if (hour >= 7 && hour < 17) return "ny";
  return "out";
}

export interface SessionPerformanceEntry {
  session: TradeSession;
  label: string;
  totalPnL: number;
  totalTrades: number;
  winRate: number;
  avgRR: number;
}

export function performanceBySession(trades: Trade[]): SessionPerformanceEntry[] {
  const labels: Record<TradeSession, string> = {
    asia: "Asia",
    london: "Londres",
    ny: "Nueva York",
    out: "Fuera de sesión",
  };
  const buckets: Record<TradeSession, Trade[]> = {
    asia: [],
    london: [],
    ny: [],
    out: [],
  };
  for (const t of trades) {
    buckets[classifyTradeSession(t.openedAt)].push(t);
  }
  return (Object.keys(buckets) as TradeSession[]).map((k) => {
    const arr = buckets[k];
    const wins = arr.filter((t) => t.outcome === "win").length;
    const rrs = arr.filter((t) => t.rMultiple !== undefined).map((t) => t.rMultiple!);
    return {
      session: k,
      label: labels[k],
      totalPnL: arr.reduce((acc, t) => acc + t.realizedPnL, 0),
      totalTrades: arr.length,
      winRate: arr.length > 0 ? (wins / arr.length) * 100 : 0,
      avgRR: rrs.length > 0 ? rrs.reduce((a, b) => a + b, 0) / rrs.length : 0,
    };
  });
}

/** Trade count por símbolo (cross-session). */
export function tradesBySymbol(trades: Trade[]): { symbol: string; count: number; pnl: number }[] {
  // Trade no tiene symbol directamente. Se infiere del sessionId. Quien llame
  // este helper debe filtrar antes por sesión. Para "global" (cross-session)
  // la analytics page hace el lookup.
  // Acá lo dejamos para uso interno con un sessionId→symbol map externo.
  return [];
}
