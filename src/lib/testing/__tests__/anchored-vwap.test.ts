/**
 * D5 — tests del VWAP anclado.
 *
 * La matemática la comparten el chart en vivo y el de testing. Antes estaba
 * duplicada inline en el layer del live; si las dos versiones divergían, el
 * mismo setup daba curvas distintas según dónde lo mirabas.
 */

import { describe, expect, it } from "vitest";
import type { Candle } from "@/lib/binance/types";
import { anchoredVwap } from "@/lib/indicators";

const T0 = 1_700_000_000;

function mk(i: number, h: number, l: number, c: number, v: number): Candle {
  return { time: T0 + i * 60, open: c, high: h, low: l, close: c, volume: v };
}

/** Cuatro velas con precio típico 10, 20, 30 y 40. */
const CANDLES: Candle[] = [
  mk(0, 12, 8, 10, 100),
  mk(1, 22, 18, 20, 100),
  mk(2, 32, 28, 30, 100),
  mk(3, 42, 38, 40, 100),
];

describe("anchoredVwap", () => {
  it("el primer punto es el precio típico de la vela ancla", () => {
    const out = anchoredVwap(CANDLES, CANDLES[0].time);
    // (12 + 8 + 10) / 3 = 10
    expect(out[0].value).toBeCloseTo(10, 6);
  });

  it("acumula desde el ancla, no desde el inicio de la serie", () => {
    const desdeCero = anchoredVwap(CANDLES, CANDLES[0].time);
    const desdeLaTercera = anchoredVwap(CANDLES, CANDLES[2].time);

    // Anclado en la 1ª: promedio de 10, 20, 30, 40 = 25.
    expect(desdeCero.at(-1)!.value).toBeCloseTo(25, 6);
    // Anclado en la 3ª: promedio de 30 y 40 = 35.
    expect(desdeLaTercera.at(-1)!.value).toBeCloseTo(35, 6);
    expect(desdeLaTercera).toHaveLength(2);
  });

  it("pondera por volumen", () => {
    const pesadas: Candle[] = [mk(0, 12, 8, 10, 300), mk(1, 22, 18, 20, 100)];
    // (10×300 + 20×100) / 400 = 12.5, no 15.
    expect(anchoredVwap(pesadas, pesadas[0].time).at(-1)!.value).toBeCloseTo(12.5, 6);
  });

  it("se ancla a la vela MÁS CERCANA, no a la siguiente", () => {
    // Un segundo antes y un segundo después de la tercera vela dan lo mismo:
    // clickear un pixel al lado no debería cambiar la curva.
    const antes = anchoredVwap(CANDLES, CANDLES[2].time - 1);
    const despues = anchoredVwap(CANDLES, CANDLES[2].time + 1);

    expect(antes).toHaveLength(2);
    expect(despues).toHaveLength(2);
    expect(antes.at(-1)!.value).toBeCloseTo(despues.at(-1)!.value, 6);
  });

  it("un ancla más allá de la última vela cae en la última", () => {
    const out = anchoredVwap(CANDLES, CANDLES[3].time + 999_999);
    expect(out).toHaveLength(1);
    expect(out[0].value).toBeCloseTo(40, 6);
  });

  it("las velas sin volumen pesan igual en vez de desaparecer", () => {
    // Varios índices de Yahoo reportan volumen 0; con peso 0 el promedio las
    // ignoraría y la curva mentiría.
    const sinVolumen: Candle[] = [mk(0, 12, 8, 10, 0), mk(1, 22, 18, 20, 0)];
    const out = anchoredVwap(sinVolumen, sinVolumen[0].time);

    expect(out.at(-1)!.value).toBeCloseTo(15, 6);
    expect(Number.isFinite(out[0].value)).toBe(true);
  });

  it("sin velas devuelve una serie vacía en vez de romper", () => {
    expect(anchoredVwap([], T0)).toEqual([]);
  });
});
