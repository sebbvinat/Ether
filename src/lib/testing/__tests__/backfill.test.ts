/**
 * §13 — tests del paginado del backfill.
 *
 * Lo que importa acá es que el cursor avance siempre hacia atrás y que `done`
 * sea honesto: si dice false, el runner vuelve a llamar; si miente, loopea
 * para siempre o corta la historia a la mitad.
 */

import { describe, expect, it, vi } from "vitest";
import type { Candle } from "@/lib/binance/types";
import { collectBackfillChunk } from "../backfill";

const HOUR_MS = 3_600_000;

function mkCandle(timeSec: number): Candle {
  return { time: timeSec, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 };
}

/**
 * Un exchange de mentira con historia acotada: devuelve hasta `pageSize` velas
 * horarias que terminan en `endTimeMs`, y nada más viejo que `originSec`.
 */
function fakeExchange(originSec: number, pageSize = 1000) {
  return async (endTimeMs: number): Promise<Candle[]> => {
    const endSec = Math.floor(endTimeMs / 1000);
    const out: Candle[] = [];
    for (let t = endSec; t >= originSec && out.length < pageSize; t -= 3600) {
      out.unshift(mkCandle(t));
    }
    return out;
  };
}

describe("collectBackfillChunk", () => {
  it("cubre el rango en una pasada cuando entra en una página", () => {
    const to = 1_700_000_000_000;
    const from = to - 10 * HOUR_MS;
    return collectBackfillChunk(
      fakeExchange(0),
      "1h",
      from,
      to,
      30,
    ).then((r) => {
      expect(r.requests).toBe(1);
      expect(r.done).toBe(true);
      expect(r.candles.length).toBeGreaterThan(0);
      // Todo lo devuelto cae dentro del rango pedido.
      for (const c of r.candles) {
        expect(c.time * 1000).toBeGreaterThanOrEqual(from);
        expect(c.time * 1000).toBeLessThanOrEqual(to);
      }
    });
  });

  it("corta en maxRequests y deja un nextToMs válido para seguir", async () => {
    const to = 1_700_000_000_000;
    const from = to - 5000 * HOUR_MS; // más de lo que entra en 2 páginas
    const r = await collectBackfillChunk(fakeExchange(0), "1h", from, to, 2);

    expect(r.requests).toBe(2);
    expect(r.done).toBe(false);
    // El próximo chunk arranca antes de lo ya traído y todavía sobre el rango.
    expect(r.nextToMs).toBeLessThan(r.candles[0].time * 1000);
    expect(r.nextToMs).toBeGreaterThan(from);
  });

  it("un segundo chunk arrancado en nextToMs no repite velas", async () => {
    const to = 1_700_000_000_000;
    const from = to - 5000 * HOUR_MS;
    const first = await collectBackfillChunk(fakeExchange(0), "1h", from, to, 2);
    const second = await collectBackfillChunk(
      fakeExchange(0),
      "1h",
      from,
      first.nextToMs,
      2,
    );

    const firstTimes = new Set(first.candles.map((c) => c.time));
    const overlap = second.candles.filter((c) => firstTimes.has(c.time));
    expect(overlap).toHaveLength(0);
  });

  it("termina cuando el exchange se queda sin historia", async () => {
    const to = 1_700_000_000_000;
    const originSec = Math.floor(to / 1000) - 5 * 3600;
    // Pedimos mucho más atrás del inicio del símbolo.
    const r = await collectBackfillChunk(
      fakeExchange(originSec),
      "1h",
      to - 5000 * HOUR_MS,
      to,
      30,
    );

    expect(r.done).toBe(true);
    // La segunda request cae entera antes del origen y vuelve vacía.
    expect(r.requests).toBe(2);
    expect(r.candles[0].time).toBe(originSec);
  });

  it("una respuesta vacía corta al toque y marca done", async () => {
    const fetcher = vi.fn(async () => [] as Candle[]);
    const to = 1_700_000_000_000;
    const r = await collectBackfillChunk(fetcher, "1h", to - 100 * HOUR_MS, to, 30);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(r.done).toBe(true);
    expect(r.candles).toHaveLength(0);
  });

  it("descarta duplicados y velas fuera del rango", async () => {
    const to = 1_700_000_000_000;
    const from = to - 3 * HOUR_MS;
    const inRange = Math.floor(to / 1000);
    const fetcher = async () => [
      mkCandle(inRange - 100 * 3600), // demasiado vieja
      mkCandle(inRange - 3600),
      mkCandle(inRange - 3600), // repetida
      mkCandle(inRange + 100 * 3600), // futura
    ];
    const r = await collectBackfillChunk(fetcher, "1h", from, to, 30);

    expect(r.candles).toHaveLength(1);
    expect(r.candles[0].time).toBe(inRange - 3600);
  });
});
