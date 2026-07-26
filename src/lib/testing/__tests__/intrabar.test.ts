/**
 * §11 — tests de la composición de velas para el playback intra-vela.
 *
 * El riesgo grande acá es mostrar una vela como cerrada cuando todavía se está
 * formando (o al revés), que corrompería lo que el engine evalúa.
 */

import { describe, expect, it } from "vitest";
import type { Candle } from "@/lib/binance/types";
import {
  barBoundarySec,
  composeDisplayed,
  hasIntrabarData,
  subCandlesBetween,
} from "../intrabar";

const TF_15M = 900;
/** Un múltiplo redondo de 15m para que los boundaries sean legibles. */
const T0 = 1_700_000_100 - (1_700_000_100 % TF_15M);

function mk(time: number, o: number, h: number, l: number, c: number, v = 10): Candle {
  return { time, open: o, high: h, low: l, close: c, volume: v };
}

/** Tres velas de 15m consecutivas arrancando en T0. */
const TF_CANDLES: Candle[] = [
  mk(T0, 100, 110, 95, 105),
  mk(T0 + TF_15M, 105, 115, 100, 112),
  mk(T0 + 2 * TF_15M, 112, 120, 108, 118),
];

/** Las 15 velas de 1m de la tercera barra, con un pico en el minuto 5. */
const ONE_MIN: Candle[] = Array.from({ length: 15 }, (_, i) =>
  mk(
    T0 + 2 * TF_15M + i * 60,
    112 + i,
    i === 5 ? 200 : 113 + i,
    i === 5 ? 50 : 111 + i,
    112 + i + 0.5,
    2,
  ),
);

describe("barBoundarySec", () => {
  it("devuelve el arranque de la vela que contiene al timestamp", () => {
    expect(barBoundarySec(T0, TF_15M)).toBe(T0);
    expect(barBoundarySec(T0 + 1, TF_15M)).toBe(T0);
    expect(barBoundarySec(T0 + TF_15M - 1, TF_15M)).toBe(T0);
    expect(barBoundarySec(T0 + TF_15M, TF_15M)).toBe(T0 + TF_15M);
  });
});

describe("composeDisplayed", () => {
  it("sin data de 1m sólo muestra las velas ya cerradas", () => {
    // Cursor a mitad de la tercera barra.
    const cursor = T0 + 2 * TF_15M + 300;
    const out = composeDisplayed(TF_CANDLES, null, cursor, TF_15M);

    expect(out).toHaveLength(2);
    expect(out.at(-1)!.time).toBe(T0 + TF_15M);
  });

  it("una vela cuenta como cerrada cuando su CIERRE quedó atrás, no su apertura", () => {
    // Cursor justo en la apertura de la segunda barra: sólo cerró la primera.
    const out = composeDisplayed(TF_CANDLES, null, T0 + TF_15M, TF_15M);
    expect(out).toHaveLength(1);
    expect(out[0].time).toBe(T0);

    // Un segundo antes del cierre de la primera: todavía no cerró ninguna.
    expect(composeDisplayed(TF_CANDLES, null, T0 + TF_15M - 1, TF_15M)).toHaveLength(0);
  });

  it("con el cursor en el boundary no hay parcial", () => {
    const out = composeDisplayed(TF_CANDLES, ONE_MIN, T0 + 2 * TF_15M, TF_15M);

    expect(out).toHaveLength(2);
    expect(out.at(-1)!.time).toBe(T0 + TF_15M);
  });

  it("agrega las velas de 1m del tramo en curso en una sola parcial", () => {
    // Cursor en el minuto 5 de la tercera barra (el del pico).
    const cursor = T0 + 2 * TF_15M + 5 * 60;
    const out = composeDisplayed(TF_CANDLES, ONE_MIN, cursor, TF_15M);
    const partial = out.at(-1)!;

    expect(out).toHaveLength(3);
    // La parcial arranca en el boundary, no en el cursor.
    expect(partial.time).toBe(T0 + 2 * TF_15M);
    expect(partial.open).toBe(ONE_MIN[0].open);
    expect(partial.close).toBe(ONE_MIN[5].close);
    expect(partial.high).toBe(200); // el pico del minuto 5
    expect(partial.low).toBe(50);
    expect(partial.volume).toBe(12); // 6 velas × 2
    expect(partial.isFinal).toBe(false);
  });

  it("la parcial crece minuto a minuto sin adelantarse al cursor", () => {
    const base = T0 + 2 * TF_15M;
    const at2 = composeDisplayed(TF_CANDLES, ONE_MIN, base + 2 * 60, TF_15M).at(-1)!;
    const at9 = composeDisplayed(TF_CANDLES, ONE_MIN, base + 9 * 60, TF_15M).at(-1)!;

    expect(at2.close).toBe(ONE_MIN[2].close);
    expect(at9.close).toBe(ONE_MIN[9].close);
    expect(at9.volume).toBeGreaterThan(at2.volume);
    // Las dos son la MISMA vela del chart: mismo timestamp.
    expect(at9.time).toBe(at2.time);
  });

  it("si hay 1m pero ninguna cae en la barra en curso, no inventa parcial", () => {
    const cursor = T0 + 2 * TF_15M + 300;
    // Data de 1m de otra franja horaria.
    const elsewhere = ONE_MIN.map((c) => ({ ...c, time: c.time - 10 * TF_15M }));
    const out = composeDisplayed(TF_CANDLES, elsewhere, cursor, TF_15M);

    expect(out).toHaveLength(2);
  });
});

describe("subCandlesBetween", () => {
  it("devuelve el tramo (prev, cursor] sin repetir el borde anterior", () => {
    const base = T0 + 2 * TF_15M;
    const out = subCandlesBetween(ONE_MIN, base + 2 * 60, base + 5 * 60);

    expect(out.map((c) => c.time)).toEqual([
      base + 3 * 60,
      base + 4 * 60,
      base + 5 * 60,
    ]);
  });

  it("no devuelve nada si el cursor no avanzó", () => {
    const base = T0 + 2 * TF_15M;
    expect(subCandlesBetween(ONE_MIN, base + 5 * 60, base + 5 * 60)).toHaveLength(0);
  });
});

describe("hasIntrabarData", () => {
  it("detecta si hay 1m utilizable en la barra en curso", () => {
    const cursor = T0 + 2 * TF_15M + 300;

    expect(hasIntrabarData(ONE_MIN, cursor, TF_15M)).toBe(true);
    expect(hasIntrabarData(null, cursor, TF_15M)).toBe(false);
    expect(hasIntrabarData([], cursor, TF_15M)).toBe(false);
    // Data de 1m que existe pero no cubre esta barra.
    expect(hasIntrabarData(ONE_MIN, T0 + 300, TF_15M)).toBe(false);
  });
});
