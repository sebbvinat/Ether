/**
 * §3 — tests del sizing por riesgo.
 *
 * Lo que importa: que el riesgo real nunca supere el pedido (por eso trunca
 * en vez de redondear) y que los casos imposibles devuelvan un motivo en vez
 * de un número inventado.
 */

import { describe, expect, it } from "vitest";
import { sizeFromRisk } from "../sizing";

describe("sizeFromRisk", () => {
  it("calcula el caso canónico: 100k al 1% con stop a 10 → 100 unidades", () => {
    const r = sizeFromRisk({ equity: 100_000, riskPct: 1, entry: 100, sl: 90 });
    expect(r).toEqual({ ok: true, size: 100, riskAmount: 1000 });
  });

  it("acercar el stop agranda la posición, alejarlo la achica", () => {
    const base = { equity: 100_000, riskPct: 1, entry: 100 };
    const cerca = sizeFromRisk({ ...base, sl: 99 });
    const lejos = sizeFromRisk({ ...base, sl: 80 });
    expect(cerca.ok && cerca.size).toBe(1000); // riesgo 1000 / distancia 1
    expect(lejos.ok && lejos.size).toBe(50); // riesgo 1000 / distancia 20
  });

  it("funciona igual con el stop arriba del entry (short)", () => {
    const r = sizeFromRisk({ equity: 50_000, riskPct: 2, entry: 100, sl: 105 });
    // riesgo 1000 / distancia 5 = 200
    expect(r).toEqual({ ok: true, size: 200, riskAmount: 1000 });
  });

  it("trunca a 3 decimales para no pasarse del riesgo pedido", () => {
    // riesgo 100 / distancia 3 = 33.3333... → 33.333, nunca 33.334
    const r = sizeFromRisk({ equity: 10_000, riskPct: 1, entry: 100, sl: 97 });
    expect(r.ok && r.size).toBe(33.333);
    // El riesgo efectivo queda por debajo del pedido, no por encima.
    expect(r.ok && r.size * 3).toBeLessThanOrEqual(100);
  });

  it("sin stop no hay cálculo posible", () => {
    expect(sizeFromRisk({ equity: 100_000, riskPct: 1, entry: 100 })).toEqual({
      ok: false,
      reason: "no-sl",
    });
    expect(
      sizeFromRisk({ equity: 100_000, riskPct: 1, entry: 100, sl: NaN }),
    ).toEqual({ ok: false, reason: "no-sl" });
  });

  it("rechaza entradas sin sentido en vez de devolver Infinity o NaN", () => {
    // Stop pegado al entry → distancia 0.
    expect(
      sizeFromRisk({ equity: 100_000, riskPct: 1, entry: 100, sl: 100 }),
    ).toEqual({ ok: false, reason: "invalid" });
    // Cuenta vacía o riesgo nulo.
    expect(sizeFromRisk({ equity: 0, riskPct: 1, entry: 100, sl: 90 })).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(
      sizeFromRisk({ equity: 100_000, riskPct: 0, entry: 100, sl: 90 }),
    ).toEqual({ ok: false, reason: "invalid" });
  });

  it("avisa cuando el resultado sería una posición impracticable", () => {
    // Cuenta chica + stop lejísimos → menos de 0.001 unidades.
    const r = sizeFromRisk({ equity: 100, riskPct: 0.1, entry: 100_000, sl: 1 });
    expect(r).toEqual({ ok: false, reason: "too-small" });
  });
});
