/**
 * §13 — el paginado hacia atrás del backfill, sin Supabase ni HTTP de por medio.
 *
 * Vive separado de la ruta porque es la única parte con lógica delicada
 * (dónde arranca el próximo chunk, cuándo se terminó la historia) y así se
 * puede testear con un fetcher de mentira.
 */

import type { Candle, Timeframe } from "@/lib/binance/types";
import { TF_MINUTES } from "./candles";

/** Trae hasta 1000 velas que terminan en `endTimeMs`. Lo implementa Binance;
 *  en los tests, un stub. */
export type ChunkFetcher = (endTimeMs: number) => Promise<Candle[]>;

export interface BackfillChunk {
  /** Velas del rango pedido, ordenadas ASC y sin repetidas. */
  candles: Candle[];
  /** Cuántas veces se llamó al fetcher. */
  requests: number;
  /** No queda más historia por traer en este rango. */
  done: boolean;
  /** `toMs` con el que hay que llamar de nuevo si `done` es false. */
  nextToMs: number;
}

/**
 * Pagina hacia atrás desde `toMs` hasta cubrir `fromMs` o agotar
 * `maxRequests`, lo que pase primero.
 *
 * El corte por `maxRequests` es lo que hace que esto entre en los 60s de una
 * request de Vercel: el runner vuelve a llamar con `nextToMs` y sigue donde
 * quedó.
 */
export async function collectBackfillChunk(
  fetchChunk: ChunkFetcher,
  tf: Timeframe,
  fromMs: number,
  toMs: number,
  maxRequests: number,
): Promise<BackfillChunk> {
  const tfMs = TF_MINUTES[tf] * 60_000;
  const raw: Candle[] = [];
  let requests = 0;
  let exhausted = false;
  let cursorEnd = toMs;

  while (requests < maxRequests) {
    requests++;
    const chunk = await fetchChunk(cursorEnd);
    if (chunk.length === 0) {
      // El exchange no tiene nada más viejo: llegamos al inicio del símbolo.
      exhausted = true;
      break;
    }
    raw.unshift(...chunk);
    const oldestMs = chunk[0].time * 1000;
    if (oldestMs <= fromMs) {
      exhausted = true;
      break;
    }
    cursorEnd = oldestMs - tfMs;
  }

  // Las páginas se solapan en los bordes y pueden traer velas fuera del rango.
  const seen = new Set<number>();
  const candles = raw
    .filter((c) => {
      const ms = c.time * 1000;
      if (ms < fromMs || ms > toMs) return false;
      if (seen.has(c.time)) return false;
      seen.add(c.time);
      return true;
    })
    .sort((a, b) => a.time - b.time);

  const oldest = candles[0]?.time;
  // El próximo chunk termina justo antes de la vela más vieja que trajimos.
  const nextToMs = oldest !== undefined ? oldest * 1000 - tfMs : fromMs;
  const done = exhausted || candles.length === 0 || nextToMs <= fromMs;

  return { candles, requests, done, nextToMs };
}
