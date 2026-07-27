/**
 * C3 — tests del tipo de orden que ofrece el menú contextual.
 *
 * Es lógica de dos líneas, pero invertida manda un buy limit por encima del
 * mercado: se llena al instante, al precio de mercado, y el usuario cree que
 * dejó una orden esperando en un nivel.
 */

import { describe, expect, it } from "vitest";
import { orderKindAt } from "@/components/testing/ChartContextMenu";

const MERCADO = 100;

describe("orderKindAt", () => {
  it("por debajo del mercado: comprar es limit, vender es stop", () => {
    expect(orderKindAt(90, MERCADO)).toEqual({ buy: "limit", sell: "stop" });
  });

  it("por encima del mercado: comprar es stop, vender es limit", () => {
    expect(orderKindAt(110, MERCADO)).toEqual({ buy: "stop", sell: "limit" });
  });

  it("justo en el precio, los dos quedan como limit", () => {
    expect(orderKindAt(MERCADO, MERCADO)).toEqual({ buy: "limit", sell: "limit" });
  });

  it("nunca ofrece un limit que se llenaría al instante", () => {
    // La regla que importa: un buy limit jamás por encima del mercado, un
    // sell limit jamás por debajo.
    for (const price of [1, 50, 99.99, 100, 100.01, 150, 1000]) {
      const k = orderKindAt(price, MERCADO);
      if (k.buy === "limit") expect(price).toBeLessThanOrEqual(MERCADO);
      if (k.sell === "limit") expect(price).toBeGreaterThanOrEqual(MERCADO);
    }
  });
});
