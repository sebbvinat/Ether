/**
 * §16 — límites diarios estilo prop firm.
 *
 * Las mesas de fondeo evalúan por DÍA: máximo de trades, pérdida máxima
 * diaria, objetivo de ganancia. Entrenar sin esos límites es entrenar otro
 * juego, así que la sesión los puede declarar y la UI los hace cumplir.
 *
 * El "día" es el del CURSOR DE REPLAY, no el del reloj: si estás
 * backtesteando marzo de 2024, el límite corre sobre marzo de 2024. Y se mide
 * en horario de Nueva York, que es como cierran las mesas (y consistente con
 * el Go To del chart).
 */

import type { SessionMeta, Trade } from "@/lib/store/testing-store";

/** Reglas declaradas por la sesión. Todo opcional: sin nada, no hay límites. */
export interface SessionRules {
  /** Máximo de trades cerrados por día. */
  maxTradesPerDay?: number;
  /** Pérdida máxima diaria, en positivo (500 = se bloquea en −$500). */
  maxDailyLoss?: number;
  /** Objetivo diario, en positivo. No bloquea: sólo avisa. */
  profitTarget?: number;
  /** Exigir el checklist antes de confirmar cada orden. */
  enforceChecklist?: boolean;
}

/** YYYY-MM-DD del timestamp en horario de Nueva York. */
export function nyDateString(ms: number): string {
  // en-CA da directo el formato ISO, sin tener que rearmar las partes.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

/** Los trades cerrados el mismo día (NY) en que está parado el cursor. */
export function tradesOfCursorDay(trades: Trade[], cursorMs: number): Trade[] {
  const day = nyDateString(cursorMs);
  return trades.filter((t) => nyDateString(t.closedAt) === day);
}

export interface DayStats {
  /** Trades cerrados hoy (día del cursor). */
  count: number;
  /** Resultado realizado del día. */
  pnl: number;
}

export function dayStats(trades: Trade[], cursorMs: number): DayStats {
  const todays = tradesOfCursorDay(trades, cursorMs);
  return {
    count: todays.length,
    pnl: todays.reduce((acc, t) => acc + t.realizedPnL, 0),
  };
}

export type BlockReason = "max-trades" | "max-loss";

export interface RulesVerdict {
  /** Si está, no se pueden abrir órdenes nuevas. Cerrar y modificar
   *  posiciones abiertas SIEMPRE se puede: un límite que te deja atrapado en
   *  una posición sería peor que no tenerlo. */
  blocked?: BlockReason;
  /** Texto del banner de bloqueo. */
  blockedMessage?: string;
  /** El objetivo del día ya está cumplido. No bloquea. */
  targetReached: boolean;
  stats: DayStats;
}

export function evaluateRules(
  meta: Pick<SessionMeta, "rules">,
  trades: Trade[],
  cursorMs: number,
): RulesVerdict {
  const rules = meta.rules ?? {};
  const stats = dayStats(trades, cursorMs);

  let blocked: BlockReason | undefined;
  let blockedMessage: string | undefined;

  if (rules.maxTradesPerDay !== undefined && stats.count >= rules.maxTradesPerDay) {
    blocked = "max-trades";
    blockedMessage = `Límite de trades diario alcanzado (${stats.count}/${rules.maxTradesPerDay})`;
  } else if (rules.maxDailyLoss !== undefined && stats.pnl <= -rules.maxDailyLoss) {
    // El de pérdida se chequea después: si los dos aplican, el de trades es el
    // que primero se topa en la práctica y el mensaje es más claro.
    blocked = "max-loss";
    blockedMessage = `Pérdida máxima diaria alcanzada ($${stats.pnl.toFixed(2)} de −$${rules.maxDailyLoss})`;
  }

  return {
    blocked,
    blockedMessage,
    targetReached:
      rules.profitTarget !== undefined && stats.pnl >= rules.profitTarget,
    stats,
  };
}
