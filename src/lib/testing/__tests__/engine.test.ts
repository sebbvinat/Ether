/**
 * §8 — tests del engine de backtest.
 *
 * El engine es puro (state, candle) → state, así que estos tests no necesitan
 * DOM, red ni IDB. Son la red de seguridad de toda la lógica financiera:
 * cualquier cambio en fills, SL/TP o PnL tiene que pasar por acá.
 *
 * Convención de fixtures: precios alrededor de 100 y size 1 salvo que el caso
 * necesite otra cosa, así los números esperados se leen de un vistazo.
 */

import { describe, expect, it } from "vitest";
import type { Candle } from "@/lib/binance/types";
import type { Order, Position, Side } from "@/lib/store/testing-store";
import {
  computeUnrealized,
  makeLimitOrder,
  makeMarketOrder,
  makeStopOrder,
  manualClose,
  stepEngine,
  type EngineConfig,
  type EngineState,
} from "../engine";

// ─── fixtures ──────────────────────────────────────────────────────────────

const SESSION_ID = "test-session";
const T0 = 1_700_000_000; // segundos UNIX — el engine multiplica ×1000

function mkCandle(
  time: number,
  o: number,
  h: number,
  l: number,
  c: number,
  v = 1000,
): Candle {
  return { time, open: o, high: h, low: l, close: c, volume: v, isFinal: true };
}

function mkState(over: Partial<EngineState> = {}): EngineState {
  return {
    orders: [],
    positions: [],
    trades: [],
    balance: 100_000,
    realizedPnL: 0,
    ...over,
  };
}

function mkPosition(over: Partial<Position> & { side: Side; entry: number }): Position {
  return {
    id: "pos-1",
    orderId: "ord-1",
    size: 1,
    openedAt: T0 * 1000,
    unrealizedPnL: 0,
    tags: [],
    maxAdverse: 0,
    maxFavorable: 0,
    // Como lo dejan los dos caminos reales de creación (fill del engine y
    // openPositionNow): el BE todavía no se aplicó.
    beApplied: false,
    ...over,
  };
}

const cfg: EngineConfig = { sessionId: SESSION_ID };

/** Corre una vela con una única orden pendiente y devuelve el estado nuevo. */
function stepWithOrder(order: Order, candle: Candle, config = cfg): EngineState {
  return stepEngine(mkState({ orders: [order] }), candle, config);
}

/** Corre una vela con una única posición abierta y devuelve el estado nuevo. */
function stepWithPosition(
  pos: Position,
  candle: Candle,
  config = cfg,
): EngineState {
  return stepEngine(mkState({ positions: [pos] }), candle, config);
}

// ─── 1-6: fills de órdenes ─────────────────────────────────────────────────

describe("fills de órdenes", () => {
  it("1. market buy se llena al open de la vela y abre posición", () => {
    const order = makeMarketOrder({ side: "buy", size: 1, refPrice: 99 });
    const next = stepWithOrder(order, mkCandle(T0, 100, 102, 98, 101));

    expect(next.orders).toHaveLength(1);
    expect(next.orders[0].status).toBe("filled");
    expect(next.orders[0].entryPrice).toBe(100);
    expect(next.orders[0].filledAt).toBe(T0 * 1000);

    expect(next.positions).toHaveLength(1);
    expect(next.positions[0].entry).toBe(100);
    expect(next.positions[0].side).toBe("buy");
    expect(next.positions[0].orderId).toBe(order.id);
  });

  it("2. buy limit 95 NO se llena si el low es 96", () => {
    const order = makeLimitOrder({ side: "buy", size: 1, entryPrice: 95 });
    const next = stepWithOrder(order, mkCandle(T0, 98, 99, 96, 97));

    expect(next.orders[0].status).toBe("pending");
    expect(next.positions).toHaveLength(0);
  });

  it("3. buy limit 95 se llena a 95 cuando el low lo perfora (open 97)", () => {
    const order = makeLimitOrder({ side: "buy", size: 1, entryPrice: 95 });
    const next = stepWithOrder(order, mkCandle(T0, 97, 98, 94, 96));

    expect(next.orders[0].status).toBe("filled");
    expect(next.positions[0].entry).toBe(95); // min(limit, open)
  });

  it("4. buy limit 95 con gap down (open 93) se llena al mejor precio: 93", () => {
    const order = makeLimitOrder({ side: "buy", size: 1, entryPrice: 95 });
    const next = stepWithOrder(order, mkCandle(T0, 93, 94, 92, 93.5));

    expect(next.orders[0].status).toBe("filled");
    expect(next.positions[0].entry).toBe(93); // gap a favor del comprador
  });

  it("5. sell limit 105 se llena a 105 cuando el high lo alcanza (open 103)", () => {
    const order = makeLimitOrder({ side: "sell", size: 1, entryPrice: 105 });
    const next = stepWithOrder(order, mkCandle(T0, 103, 106, 102, 104));

    expect(next.orders[0].status).toBe("filled");
    expect(next.positions[0].entry).toBe(105); // max(limit, open)
    expect(next.positions[0].side).toBe("sell");
  });

  it("6. buy stop 105 se llena a 105 cuando el high rompe (open 103)", () => {
    const order = makeStopOrder({ side: "buy", size: 1, entryPrice: 105 });
    const next = stepWithOrder(order, mkCandle(T0, 103, 106, 102, 105.5));

    expect(next.orders[0].status).toBe("filled");
    expect(next.positions[0].entry).toBe(105); // max(stop, open)
  });
});

// ─── 7-11: cierres por SL / TP ─────────────────────────────────────────────

describe("cierres por SL / TP", () => {
  it("7. long con SL 95 cierra en SL cuando el low es 94", () => {
    const pos = mkPosition({ side: "buy", entry: 100, sl: 95 });
    const next = stepWithPosition(pos, mkCandle(T0, 99, 99.5, 94, 96));

    expect(next.positions).toHaveLength(0);
    expect(next.trades).toHaveLength(1);
    expect(next.trades[0].closeReason).toBe("sl");
    expect(next.trades[0].closePrice).toBe(95);
    expect(next.trades[0].realizedPnL).toBe(-5); // (95−100)×1, sin comisión
    expect(next.trades[0].outcome).toBe("loss");
    expect(next.realizedPnL).toBe(-5);
  });

  it("8. long con TP 110 cierra en TP cuando el high es 111", () => {
    const pos = mkPosition({ side: "buy", entry: 100, tp: 110 });
    const next = stepWithPosition(pos, mkCandle(T0, 105, 111, 104, 109));

    expect(next.positions).toHaveLength(0);
    expect(next.trades[0].closeReason).toBe("tp");
    expect(next.trades[0].closePrice).toBe(110);
    expect(next.trades[0].realizedPnL).toBe(10); // (110−100)×1
    expect(next.trades[0].outcome).toBe("win");
  });

  it("9. si SL y TP se tocan en la misma vela gana el SL (conservador)", () => {
    const pos = mkPosition({ side: "buy", entry: 100, sl: 95, tp: 110 });
    const next = stepWithPosition(pos, mkCandle(T0, 100, 111, 94, 105));

    expect(next.trades).toHaveLength(1);
    expect(next.trades[0].closeReason).toBe("sl");
    expect(next.trades[0].realizedPnL).toBe(-5);
  });

  it("10. short con SL 105 cierra en SL cuando el high es 106", () => {
    const pos = mkPosition({ side: "sell", entry: 100, sl: 105 });
    const next = stepWithPosition(pos, mkCandle(T0, 101, 106, 100, 104));

    expect(next.trades[0].closeReason).toBe("sl");
    expect(next.trades[0].closePrice).toBe(105);
    expect(next.trades[0].realizedPnL).toBe(-5); // (105−100)×1×(−1)
  });

  it("11. short con TP 90 cierra en TP cuando el low es 89", () => {
    const pos = mkPosition({ side: "sell", entry: 100, tp: 90 });
    const next = stepWithPosition(pos, mkCandle(T0, 95, 96, 89, 91));

    expect(next.trades[0].closeReason).toBe("tp");
    expect(next.trades[0].closePrice).toBe(90);
    expect(next.trades[0].realizedPnL).toBe(10); // (90−100)×1×(−1)
    expect(next.trades[0].outcome).toBe("win");
  });
});

// ─── 12-15: métricas, comisión, spread, modo conservador ───────────────────

describe("métricas y config", () => {
  it("12. rMultiple = realized / (|entry−sl| × size)", () => {
    const pos = mkPosition({ side: "buy", entry: 100, sl: 95, tp: 110 });
    const next = stepWithPosition(pos, mkCandle(T0, 105, 111, 104, 109));

    const trade = next.trades[0];
    expect(trade.realizedPnL).toBe(10);
    expect(trade.rMultiple).toBeCloseTo(10 / 5, 10); // riesgo 5 → 2R
  });

  it("13. commissionPerUnit=2 con size=3 cobra 12 en el round-trip", () => {
    const pos = mkPosition({ side: "buy", entry: 100, size: 3, tp: 110 });
    const next = stepWithPosition(pos, mkCandle(T0, 105, 111, 104, 109), {
      sessionId: SESSION_ID,
      commissionPerUnit: 2,
    });

    const trade = next.trades[0];
    expect(trade.commission).toBe(12); // 2 × 3 unidades × 2 lados
    expect(trade.realizedPnL).toBe(30 - 12); // bruto (110−100)×3 menos comisión
  });

  it("14. spreadAmount=0.5 hace que un buy market se llene a 100.5", () => {
    const cfgSpread: EngineConfig = { sessionId: SESSION_ID, spreadAmount: 0.5 };
    const buy = makeMarketOrder({ side: "buy", size: 1, refPrice: 100 });
    const nextBuy = stepWithOrder(buy, mkCandle(T0, 100, 102, 98, 101), cfgSpread);
    expect(nextBuy.positions[0].entry).toBe(100.5); // comprar paga el spread

    // Vender va al precio de la vela: las velas son "bid".
    const sell = makeMarketOrder({ side: "sell", size: 1, refPrice: 100 });
    const nextSell = stepWithOrder(sell, mkCandle(T0, 100, 102, 98, 101), cfgSpread);
    expect(nextSell.positions[0].entry).toBe(100);
  });

  it("14b. cerrar un SHORT paga el spread (es una compra); cerrar un long no", () => {
    const cfgSpread: EngineConfig = { sessionId: SESSION_ID, spreadAmount: 0.5 };

    // Short con TP en 90: cierra comprando → 90.5, así que gana menos.
    const short = mkPosition({ side: "sell", entry: 100, tp: 90 });
    const nShort = stepWithPosition(short, mkCandle(T0, 95, 96, 89, 91), cfgSpread);
    expect(nShort.trades[0].closePrice).toBe(90.5);
    expect(nShort.trades[0].realizedPnL).toBe(9.5); // (90.5−100)×(−1)

    // Long con TP en 110: cierra vendiendo → sin spread.
    const long = mkPosition({ side: "buy", entry: 100, tp: 110 });
    const nLong = stepWithPosition(long, mkCandle(T0, 105, 111, 104, 109), cfgSpread);
    expect(nLong.trades[0].closePrice).toBe(110);
    expect(nLong.trades[0].realizedPnL).toBe(10);
  });

  it("14c. sin costos configurados el PnL es idéntico (regresión cero)", () => {
    const pos = mkPosition({ side: "buy", entry: 100, tp: 110 });
    const candle = mkCandle(T0, 105, 111, 104, 109);
    const sinCostos = stepWithPosition(pos, candle);
    const conCeros = stepWithPosition(pos, candle, {
      sessionId: SESSION_ID,
      commissionPerUnit: 0,
      spreadAmount: 0,
    });
    expect(conCeros.trades[0].realizedPnL).toBe(sinCostos.trades[0].realizedPnL);
    expect(conCeros.trades[0].closePrice).toBe(sinCostos.trades[0].closePrice);
  });

  it("15. con intraBarFills=false el SL no se dispara por la mecha", () => {
    const pos = mkPosition({ side: "buy", entry: 100, sl: 95 });
    // low 94 perfora el SL, pero el cuerpo (open 97 → close 96) no.
    const candle = mkCandle(T0, 97, 98, 94, 96);

    const conservative = stepEngine(mkState({ positions: [pos] }), candle, {
      sessionId: SESSION_ID,
      intraBarFills: false,
    });
    expect(conservative.trades).toHaveLength(0);
    expect(conservative.positions).toHaveLength(1);

    // Contraste: en modo intra-bar (default) sí cierra.
    const intraBar = stepWithPosition(pos, candle);
    expect(intraBar.trades).toHaveLength(1);
    expect(intraBar.trades[0].closeReason).toBe("sl");
  });

  it("16. autoBreakeven mueve el SL al entry tras alcanzar 1R", () => {
    // Long 100 con stop en 95 → riesgo 5 por unidad. 1R a favor = 105.
    const pos = mkPosition({
      side: "buy",
      entry: 100,
      sl: 95,
      autoBreakeven: true,
    });

    // Vela que llega a 104: todavía no alcanza 1R, el stop no se mueve.
    const casi = stepWithPosition(pos, mkCandle(T0, 101, 104, 100, 103));
    expect(casi.positions[0].sl).toBe(95);
    expect(casi.positions[0].beApplied).toBe(false);

    // Vela que toca 105: alcanza 1R → el stop se muda al entry.
    const alcanza = stepWithPosition(pos, mkCandle(T0, 101, 105, 100, 104));
    expect(alcanza.positions[0].sl).toBe(100);
    expect(alcanza.positions[0].beApplied).toBe(true);
  });

  it("16b. el BE recién protege desde la vela siguiente, no en la misma", () => {
    const pos = mkPosition({ side: "buy", entry: 100, sl: 95, autoBreakeven: true });

    // Una vela que toca 1R (105) y vuelve a 99 NO cierra: el BE se evalúa
    // después de los hits, así que en esta vela el stop seguía en 95.
    const mismaVela = stepWithPosition(pos, mkCandle(T0, 101, 105, 99, 99.5));
    expect(mismaVela.trades).toHaveLength(0);
    expect(mismaVela.positions[0].sl).toBe(100); // ya movido para la próxima

    // En la vela siguiente, con el stop ya en el entry, un retroceso cierra
    // en breakeven en vez de perder 1R.
    const siguiente = stepWithPosition(
      mismaVela.positions[0],
      mkCandle(T0 + 60, 100.5, 101, 99, 99.5),
    );
    expect(siguiente.trades).toHaveLength(1);
    expect(siguiente.trades[0].closeReason).toBe("sl");
    expect(siguiente.trades[0].closePrice).toBe(100);
    expect(siguiente.trades[0].realizedPnL).toBe(0); // salvado
  });

  it("16c. sin el flag el stop no se mueve solo", () => {
    const pos = mkPosition({ side: "buy", entry: 100, sl: 95 });
    const next = stepWithPosition(pos, mkCandle(T0, 101, 110, 100, 108));
    expect(next.positions[0].sl).toBe(95);
  });

  it("16d. funciona igual en short y no se reaplica una vez puesto", () => {
    // Short 100 con stop en 105 → 1R a favor = 95.
    const pos = mkPosition({
      side: "sell",
      entry: 100,
      sl: 105,
      autoBreakeven: true,
    });
    const first = stepWithPosition(pos, mkCandle(T0, 99, 100, 95, 96));
    expect(first.positions[0].sl).toBe(100);
    expect(first.positions[0].beApplied).toBe(true);

    // Con beApplied ya en true, el stop queda donde el usuario lo deje —
    // el auto-BE no vuelve a pisarlo.
    const moved = { ...first.positions[0], sl: 98 };
    const second = stepWithPosition(moved, mkCandle(T0 + 60, 96, 97, 90, 91));
    expect(second.positions[0].sl).toBe(98);
  });
});

// ─── 17-18: cierre manual y unrealized ─────────────────────────────────────

describe("cierre manual y PnL no realizado", () => {
  it("17. manualClose cierra la posición al precio dado y la saca del estado", () => {
    const pos = mkPosition({ side: "buy", entry: 100 });
    const state = mkState({ positions: [pos] });
    const next = manualClose(state, pos.id, 110, mkCandle(T0, 109, 111, 108, 110), cfg);

    expect(next.positions).toHaveLength(0);
    expect(next.trades).toHaveLength(1);
    expect(next.trades[0].closeReason).toBe("manual");
    expect(next.trades[0].realizedPnL).toBe(10);
    expect(next.realizedPnL).toBe(10);
  });

  it("17b. manualClose con un id inexistente no cambia nada", () => {
    const state = mkState({ positions: [mkPosition({ side: "buy", entry: 100 })] });
    const next = manualClose(state, "no-existe", 110, mkCandle(T0, 109, 111, 108, 110), cfg);

    expect(next).toBe(state);
  });

  it("18. computeUnrealized suma long y short respetando la dirección", () => {
    const long = mkPosition({ id: "p1", side: "buy", entry: 100, size: 2 });
    const short = mkPosition({ id: "p2", side: "sell", entry: 120, size: 1 });

    // A 110 ambos ganan: long (110−100)×2 = +20, short (110−120)×1×(−1) = +10.
    expect(computeUnrealized([long, short], 110)).toBe(30);
    // A 100: long plano, short gana (100−120)×(−1) = +20.
    expect(computeUnrealized([long, short], 100)).toBe(20);
    // A 130 se separan: long +60, short (130−120)×(−1) = −10.
    expect(computeUnrealized([long, short], 130)).toBe(50);
    expect(computeUnrealized([], 100)).toBe(0);
  });
});
