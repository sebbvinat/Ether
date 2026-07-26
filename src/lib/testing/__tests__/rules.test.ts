/**
 * §16 — tests de los límites diarios.
 *
 * Lo que importa: que el "día" sea el del cursor de replay y no el del reloj,
 * y que el bloqueo se levante solo al pasar al día siguiente.
 */

import { describe, expect, it } from "vitest";
import type { Trade } from "@/lib/store/testing-store";
import type { SessionRules } from "../rules";
import { dayStats, evaluateRules, nyDateString, tradesOfCursorDay } from "../rules";

/** 2024-03-05 15:00 UTC = 10:00 en Nueva York. */
const DAY1_NOON = Date.UTC(2024, 2, 5, 15, 0);
const DAY2_NOON = Date.UTC(2024, 2, 6, 15, 0);

function mkTrade(closedAt: number, realizedPnL: number): Trade {
  return {
    id: `t-${closedAt}-${realizedPnL}`,
    sessionId: "s1",
    side: "buy",
    size: 1,
    entry: 100,
    closePrice: 100 + realizedPnL,
    closeReason: "manual",
    openedAt: closedAt - 60_000,
    closedAt,
    realizedPnL,
    commission: 0,
    outcome: realizedPnL > 0 ? "win" : realizedPnL < 0 ? "loss" : "breakeven",
    maxAdverse: 0,
    maxFavorable: 0,
    tags: [],
  };
}

function withRules(rules: SessionRules) {
  return { rules };
}

describe("nyDateString", () => {
  it("usa el día de Nueva York, no el UTC", () => {
    // 2024-03-06 02:00 UTC son las 21:00 del 5 en NY.
    expect(nyDateString(Date.UTC(2024, 2, 6, 2, 0))).toBe("2024-03-05");
    expect(nyDateString(DAY1_NOON)).toBe("2024-03-05");
  });
});

describe("tradesOfCursorDay", () => {
  it("filtra por el día del cursor, no por el de hoy", () => {
    const trades = [
      mkTrade(DAY1_NOON, 10),
      mkTrade(DAY1_NOON + 3600_000, -5),
      mkTrade(DAY2_NOON, 20),
    ];

    expect(tradesOfCursorDay(trades, DAY1_NOON).map((t) => t.realizedPnL)).toEqual([
      10, -5,
    ]);
    expect(tradesOfCursorDay(trades, DAY2_NOON)).toHaveLength(1);
  });

  it("suma el resultado del día", () => {
    const trades = [mkTrade(DAY1_NOON, 10), mkTrade(DAY1_NOON, -30), mkTrade(DAY2_NOON, 999)];
    expect(dayStats(trades, DAY1_NOON)).toEqual({ count: 2, pnl: -20 });
  });
});

describe("evaluateRules", () => {
  it("sin reglas no bloquea nada", () => {
    const v = evaluateRules({ rules: undefined }, [mkTrade(DAY1_NOON, -9999)], DAY1_NOON);
    expect(v.blocked).toBeUndefined();
    expect(v.targetReached).toBe(false);
  });

  it("bloquea al alcanzar el máximo de trades del día", () => {
    const trades = [1, 2, 3].map((n) => mkTrade(DAY1_NOON + n * 1000, 1));
    const v = evaluateRules(withRules({ maxTradesPerDay: 3 }), trades, DAY1_NOON);

    expect(v.blocked).toBe("max-trades");
    expect(v.blockedMessage).toContain("3/3");
  });

  it("con 2 de 3 trades todavía deja operar", () => {
    const trades = [1, 2].map((n) => mkTrade(DAY1_NOON + n * 1000, 1));
    expect(evaluateRules(withRules({ maxTradesPerDay: 3 }), trades, DAY1_NOON).blocked)
      .toBeUndefined();
  });

  it("avanzar al día siguiente levanta el bloqueo", () => {
    const trades = [1, 2, 3].map((n) => mkTrade(DAY1_NOON + n * 1000, 1));
    const rules = withRules({ maxTradesPerDay: 3 });

    expect(evaluateRules(rules, trades, DAY1_NOON).blocked).toBe("max-trades");
    expect(evaluateRules(rules, trades, DAY2_NOON).blocked).toBeUndefined();
  });

  it("dos pérdidas de 300 bloquean con un tope de 500", () => {
    const rules = withRules({ maxDailyLoss: 500 });
    const una = [mkTrade(DAY1_NOON, -300)];
    const dos = [...una, mkTrade(DAY1_NOON + 1000, -300)];

    expect(evaluateRules(rules, una, DAY1_NOON).blocked).toBeUndefined();
    const v = evaluateRules(rules, dos, DAY1_NOON);
    expect(v.blocked).toBe("max-loss");
    expect(v.stats.pnl).toBe(-600);
  });

  it("el tope de pérdida se mide exacto, no con margen", () => {
    const rules = withRules({ maxDailyLoss: 500 });
    expect(evaluateRules(rules, [mkTrade(DAY1_NOON, -499.99)], DAY1_NOON).blocked)
      .toBeUndefined();
    expect(evaluateRules(rules, [mkTrade(DAY1_NOON, -500)], DAY1_NOON).blocked)
      .toBe("max-loss");
  });

  it("el objetivo de ganancia avisa pero no bloquea", () => {
    const v = evaluateRules(
      withRules({ profitTarget: 1000 }),
      [mkTrade(DAY1_NOON, 1200)],
      DAY1_NOON,
    );

    expect(v.targetReached).toBe(true);
    expect(v.blocked).toBeUndefined();
  });

  it("las pérdidas de ayer no cuentan para el tope de hoy", () => {
    const trades = [mkTrade(DAY1_NOON, -900)];
    expect(evaluateRules(withRules({ maxDailyLoss: 500 }), trades, DAY2_NOON).blocked)
      .toBeUndefined();
  });
});
