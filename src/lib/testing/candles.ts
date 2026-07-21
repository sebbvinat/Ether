/**
 * Wave 18.5 — candle loader para sesiones de Testing.
 *
 * Cambio de diseño (vs Wave 18): cargamos velas DIRECTO en el TF del chart
 * (no 1m + agregación). Razones:
 *  - 500 barras de 15m/1h/1d = 1 sola request a Binance (vs cientos en 1m).
 *  - El replay de TradingView funciona igual: replay al TF del chart.
 *  - El engine evalúa fills al cierre de cada barra del TF (intra-bar con
 *    high/low de esa barra) — suficientemente preciso para backtest manual.
 *
 * Cuando el usuario cambia de TF, se reconstruye el store y se re-fetchea.
 */

import type { Candle, Timeframe } from "@/lib/binance/types";
import { fetchKlines, type BinanceMarket } from "@/lib/binance/rest";

/** Minutos por vela de cada TF. */
export const TF_MINUTES: Record<Timeframe, number> = {
  "1m": 1,
  "3m": 3,
  "5m": 5,
  "15m": 15,
  "30m": 30,
  "1h": 60,
  "2h": 120,
  "4h": 240,
  "6h": 360,
  "8h": 480,
  "12h": 720,
  "1d": 1440,
  "3d": 4320,
  "1w": 10080,
  "1M": 43200,
};

/** TFs soportados como TF de visualización en Testing. */
export const TESTING_TFS: Timeframe[] = ["1m", "5m", "15m", "30m", "1h", "4h", "1d"];

/**
 * Trae velas de un TF entre `startMs` y `endMs`, paginando de a 1000.
 * Devuelve ordenadas ASC y deduplicadas.
 */
export async function fetchRange(
  symbol: string,
  tf: Timeframe,
  startMs: number,
  endMs: number,
  market: BinanceMarket = "spot",
): Promise<Candle[]> {
  const tfMs = TF_MINUTES[tf] * 60_000;
  const out: Candle[] = [];
  let cursorEnd = endMs;
  const maxRequests = 60; // 60 × 1000 velas = 60k barras del TF (más que suficiente)
  let req = 0;
  // Paginamos hacia ATRÁS desde endMs usando endTime (lo que soporta fetchKlines)
  while (req < maxRequests) {
    req++;
    const chunk = await fetchKlines(symbol, tf, 1000, market, cursorEnd);
    if (chunk.length === 0) break;
    out.unshift(...chunk);
    const first = chunk[0];
    if (first.time * 1000 <= startMs) break; // ya cubrimos el inicio
    // Próxima página: termina justo antes de la primera vela traída
    const nextEnd = first.time * 1000 - tfMs;
    if (nextEnd <= startMs) {
      // una request más para cubrir el borde
      const tail = await fetchKlines(symbol, tf, 1000, market, nextEnd);
      out.unshift(...tail);
      break;
    }
    cursorEnd = nextEnd;
  }
  // Filtrar al rango + dedupe
  const seen = new Set<number>();
  return out
    .filter((c) => {
      const ms = c.time * 1000;
      if (ms < startMs || ms > endMs) return false;
      if (seen.has(c.time)) return false;
      seen.add(c.time);
      return true;
    })
    .sort((a, b) => a.time - b.time);
}

/**
 * Store lazy de velas en un TF dado. Carga chunks alrededor del cursor.
 */
export class LazyCandleStore {
  private candles: Candle[] = [];
  private minTime = Infinity;
  private maxTime = -Infinity;
  private pending: Promise<void> | null = null;

  constructor(
    private readonly symbol: string,
    private readonly tf: Timeframe,
    private readonly loadableStartMs: number,
    private readonly loadableEndMs: number,
    private readonly market: BinanceMarket = "spot",
  ) {}

  get all(): Candle[] {
    return this.candles;
  }

  get length(): number {
    return this.candles.length;
  }

  hasRange(fromMs: number, toMs: number): boolean {
    if (this.candles.length === 0) return false;
    const tfMs = TF_MINUTES[this.tf] * 60_000;
    return this.minTime * 1000 <= fromMs && (this.maxTime + TF_MINUTES[this.tf] * 60) * 1000 >= toMs - tfMs;
  }

  /**
   * Garantiza tener velas alrededor de `centerMs` (±N barras). Descarga el gap
   * si falta. `beforeBars`/`afterBars` en cantidad de barras del TF.
   */
  async ensureLoaded(centerMs: number, beforeBars = 400, afterBars = 200): Promise<Candle[]> {
    const tfMs = TF_MINUTES[this.tf] * 60_000;
    // Wave 18.9 — NO clampeamos por loadableStartMs. El usuario debe poder
    // panear hacia atrás indefinidamente hasta que Binance corte con []. El
    // constructor deja `loadableStartMs` como hint pero no restringe.
    const from = centerMs - beforeBars * tfMs;
    const to = Math.min(this.loadableEndMs, centerMs + afterBars * tfMs);
    if (this.hasRange(from, to)) return this.candles;
    if (this.pending) {
      await this.pending;
      if (this.hasRange(from, to)) return this.candles;
    }
    this.pending = (async () => {
      const fetchFrom = Math.min(from, this.minTime === Infinity ? from : this.minTime * 1000);
      const fetchTo = Math.max(to, this.maxTime === -Infinity ? to : (this.maxTime + 60) * 1000);
      const fresh = await fetchRange(this.symbol, this.tf, fetchFrom, fetchTo, this.market);
      this.merge(fresh);
    })();
    try {
      await this.pending;
    } finally {
      this.pending = null;
    }
    return this.candles;
  }

  private merge(fresh: Candle[]) {
    if (fresh.length === 0) return;
    const map = new Map<number, Candle>();
    for (const c of this.candles) map.set(c.time, c);
    for (const c of fresh) map.set(c.time, c);
    const arr = Array.from(map.values()).sort((a, b) => a.time - b.time);
    this.candles = arr;
    this.minTime = arr[0].time;
    this.maxTime = arr[arr.length - 1].time;
  }
}

/**
 * Agrega velas de un TF base a uno más grueso (se mantiene por compat — ya no
 * lo usa TestingChart porque carga directo al TF, pero otros lugares podrían).
 */
export function aggregateCandles(base: Candle[], targetTf: Timeframe): Candle[] {
  if (base.length === 0) return [];
  const bucketSec = TF_MINUTES[targetTf] * 60;
  if (bucketSec <= 60) return base;
  const out: Candle[] = [];
  let cur: Candle | null = null;
  let curBucket = -1;
  for (const c of base) {
    const bucket = Math.floor(c.time / bucketSec) * bucketSec;
    if (bucket !== curBucket) {
      if (cur) out.push(cur);
      cur = { time: bucket, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume, isFinal: true };
      curBucket = bucket;
    } else if (cur) {
      cur.high = Math.max(cur.high, c.high);
      cur.low = Math.min(cur.low, c.low);
      cur.close = c.close;
      cur.volume += c.volume;
    }
  }
  if (cur) out.push(cur);
  return out;
}
