/**
 * Wave 23 — tests del reparto de sub-paneles.
 *
 * El bug que esto previene: dejar franjas vacías (o pisar dos indicadores en
 * el mismo panel) según qué combinación esté prendida.
 */

import { describe, expect, it } from "vitest";
import type { IndicatorKey } from "@/lib/store/chart-store";
import { computePaneLayout, SUBPANE_ORDER } from "../panes";

function on(...keys: IndicatorKey[]): Partial<Record<IndicatorKey, boolean>> {
  return Object.fromEntries(keys.map((k) => [k, true]));
}

describe("computePaneLayout", () => {
  it("sin nada prendido sólo existe el panel del precio", () => {
    const { paneOf, paneCount } = computePaneLayout(undefined);
    expect(paneCount).toBe(1);
    expect(paneOf.size).toBe(0);
  });

  it("un solo indicador va al panel 1, sea cual sea", () => {
    // El Awesome Oscillator es el último del orden: con índices fijos habría
    // caído en el panel 11 y dejado 10 franjas vacías.
    const solo = computePaneLayout(on("ao"));
    expect(solo.paneOf.get("ao")).toBe(1);
    expect(solo.paneCount).toBe(2);

    const otro = computePaneLayout(on("rsi"));
    expect(otro.paneOf.get("rsi")).toBe(1);
    expect(otro.paneCount).toBe(2);
  });

  it("los paneles se reparten sin huecos ni repetidos", () => {
    const { paneOf, paneCount } = computePaneLayout(on("ao", "adx", "rsi"));
    const asignados = [...paneOf.values()].sort();

    expect(asignados).toEqual([1, 2, 3]);
    expect(paneCount).toBe(4);
  });

  it("el orden es el del catálogo, no el de activación", () => {
    // Prender ADX y después RSI tiene que dar lo mismo que al revés.
    const a = computePaneLayout(on("adx", "rsi"));
    const b = computePaneLayout(on("rsi", "adx"));

    expect(a.paneOf.get("rsi")).toBe(1);
    expect(a.paneOf.get("adx")).toBe(2);
    expect([...b.paneOf.entries()]).toEqual([...a.paneOf.entries()]);
  });

  it("apagar el del medio corre los de abajo", () => {
    const antes = computePaneLayout(on("rsi", "macd", "ao"));
    expect(antes.paneOf.get("ao")).toBe(3);

    const despues = computePaneLayout(on("rsi", "ao"));
    expect(despues.paneOf.get("ao")).toBe(2);
    expect(despues.paneCount).toBe(3);
  });

  it("los overlays del precio no ocupan panel", () => {
    const { paneOf, paneCount } = computePaneLayout(
      on("ema20", "bb", "vwap", "ichimoku", "supertrend"),
    );
    expect(paneOf.size).toBe(0);
    expect(paneCount).toBe(1);
  });

  it("con todos prendidos hay un panel por indicador", () => {
    const { paneOf, paneCount } = computePaneLayout(on(...SUBPANE_ORDER));
    expect(paneOf.size).toBe(SUBPANE_ORDER.length);
    expect(paneCount).toBe(SUBPANE_ORDER.length + 1);
    expect([...paneOf.values()]).toEqual(
      SUBPANE_ORDER.map((_, i) => i + 1),
    );
  });
});
