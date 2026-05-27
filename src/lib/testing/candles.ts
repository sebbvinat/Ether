/**
 * Wave 18 — lazy candle loader + aggregator para sesiones de Testing.
 *
 * Concepto:
 * - La sesión SIEMPRE se guarda y evalúa en velas de 1m (base resolution).
 *   Esto da precisión máxima al backtest engine: SL/TP se chequean vela a vela.
 * - Para mostrar TFs más altos (5m, 15m, 1h, 4h, 1d) agregamos en cliente
 *   sin re-fetchear. Es el mismo patrón que usan TradingView/FXReplay.
 * - Lazy loading: en vez de descargar 3 años de 1m de una (~1.5M velas, 100MB),
 *   traemos chunks de 1000 velas alrededor del cursor del replay.
 */

import type { Candle, Timeframe } from "@/lib/binance/types";
import { fetchKlines } from "@/lib/binance/rest";

/** Cuántos minutos contiene una vela de cada TF. */
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

/** TFs que soportamos como "chart visualization TF" en el área Testing. */
export const TESTING_TFS: Timeframe[] = ["1m", "5m", "15m", "30m", "1h", "4h", "1d"];

/**
 * Agrega velas de la base 1m a un TF más grueso.
 *
 * Las velas resultantes tienen `time` alineado al inicio del bucket (en
 * segundos UNIX). open = open de la 1ra · close = close de la última ·
 * high/low = extremos · volume = suma.
 *
 * Si baseTf === targetTf, devuelve la misma lista (no-op).
 */
export function aggregateCandles(base: Candle[], targetTf: Timeframe): Candle[] {
  if (base.length === 0) return [];
  const bucketSec = TF_MINUTES[targetTf] * 60;
  if (bucketSec <= 60) return base; // ya es 1m o más fino
  const out: Candle[] = [];
  let cur: Candle | null = null;
  let curBucket = -1;
  for (const c of base) {
    const bucket = Math.floor(c.time / bucketSec) * bucketSec;
    if (bucket !== curBucket) {
      if (cur) out.push(cur);
      cur = {
        time: bucket,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
        isFinal: true,
      };
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

/**
 * Trae el rango completo de velas 1m entre `startMs` y `endMs` paginando.
 *
 * Binance permite hasta 1000 velas por request y soporta `startTime` y
 * `endTime`. Iteramos hacia adelante desde startMs hasta cubrir todo el rango.
 *
 * USAR CON CUIDADO: para rangos largos en 1m (varios meses+) puede ser
 * decenas de requests. Para sesiones largas conviene `LazyCandleStore` (más
 * abajo) que sólo trae chunks alrededor del cursor.
 */
export async function fetchRangeCandles1m(
  symbol: string,
  startMs: number,
  endMs: number,
  market: "spot" | "perp" = "spot",
  onProgress?: (loaded: number, total: number) => void,
): Promise<Candle[]> {
  const out: Candle[] = [];
  let cursor = startMs;
  const totalEstimate = Math.ceil((endMs - startMs) / 60_000); // velas 1m totales
  // Safety cap: máximo ~3000 requests = 3M velas (~5.7 años de 1m)
  const maxRequests = 3000;
  let requests = 0;
  while (cursor < endMs && requests < maxRequests) {
    requests++;
    const chunk = await fetchKlines(
      symbol,
      "1m",
      1000,
      market,
      // Binance: endTime es el corte derecho. Para paginar forward, usamos
      // startTime via URLSearchParams en una función custom — pero fetchKlines
      // sólo expone endTime. Por eso acá pasamos endTime = cursor + 1000m
      // y filtramos lo nuevo. Más eficiente que reescribir fetchKlines.
      Math.min(cursor + 1000 * 60_000, endMs),
    );
    if (chunk.length === 0) break;
    // Filtramos lo que esté >= cursor (puede que el endTime nos haya traído
    // velas anteriores a cursor en chunks chicos).
    const fresh = chunk.filter((c) => c.time * 1000 >= cursor && c.time * 1000 <= endMs);
    if (fresh.length === 0) break;
    out.push(...fresh);
    onProgress?.(out.length, totalEstimate);
    // Avanzamos: la última vela traída + 1 minuto
    const last = fresh[fresh.length - 1];
    const nextCursor = (last.time + 60) * 1000;
    if (nextCursor <= cursor) break; // sin progreso, evitar loop infinito
    cursor = nextCursor;
    // Si la última vela ya pasó endMs, terminamos
    if (last.time * 1000 >= endMs) break;
  }
  // Dedupe por si vinieron solapadas
  const seen = new Set<number>();
  return out.filter((c) => {
    if (seen.has(c.time)) return false;
    seen.add(c.time);
    return true;
  });
}

/**
 * Lazy candle store: cachea velas 1m por rango y trae chunks on-demand.
 *
 * Política:
 * - `getAround(centerMs, before, after)`: devuelve las velas entre
 *   centerMs − before*60000 y centerMs + after*60000. Si faltan, descarga.
 * - Mantiene un cache contiguo desde minTimeMs hasta maxTimeMs (los extremos
 *   conocidos). Para chunks no-contiguos no hace nada raro: descarga el gap.
 * - Disparable con prefetch para tener buffer adelante del cursor del replay.
 */
export class LazyCandleStore {
  private candles: Candle[] = []; // sorted by time ASC, todos 1m
  private minTime = Infinity;
  private maxTime = -Infinity;
  private pending: Promise<void> | null = null;
  private readonly market: "spot" | "perp";

  constructor(
    private readonly symbol: string,
    private readonly sessionStartMs: number,
    private readonly sessionEndMs: number,
    market: "spot" | "perp" = "spot",
  ) {
    this.market = market;
  }

  get all(): Candle[] {
    return this.candles;
  }

  get isLoading(): boolean {
    return this.pending !== null;
  }

  /** True si tenemos todas las velas entre `fromMs` y `toMs`. */
  hasRange(fromMs: number, toMs: number): boolean {
    if (this.candles.length === 0) return false;
    return this.minTime <= fromMs / 1000 && this.maxTime + 60 >= toMs / 1000;
  }

  /**
   * Garantiza que tengamos las velas alrededor del timestamp `centerMs`
   * (en ms). Si no, descarga el chunk faltante. Devuelve el array completo
   * actualmente cacheado (no sólo el rango pedido).
   */
  async ensureLoaded(centerMs: number, beforeMin = 500, afterMin = 500): Promise<Candle[]> {
    const from = Math.max(this.sessionStartMs, centerMs - beforeMin * 60_000);
    const to = Math.min(this.sessionEndMs, centerMs + afterMin * 60_000);
    if (this.hasRange(from, to)) return this.candles;
    // Si ya hay otro fetch en curso, esperalo (no encolamos múltiples)
    if (this.pending) {
      await this.pending;
      if (this.hasRange(from, to)) return this.candles;
    }
    this.pending = (async () => {
      // Decidimos qué rango fetchear: el más amplio que cubra from..to
      // y que extienda los extremos actuales (para mantener contiguidad).
      const fetchFrom = Math.min(from, this.minTime === Infinity ? from : this.minTime * 1000);
      const fetchTo = Math.max(to, this.maxTime === -Infinity ? to : (this.maxTime + 60) * 1000);
      const fresh = await fetchRangeCandles1m(this.symbol, fetchFrom, fetchTo, this.market);
      this.mergeCandles(fresh);
    })();
    try {
      await this.pending;
    } finally {
      this.pending = null;
    }
    return this.candles;
  }

  /** Merge un set nuevo respetando orden y dedupes. */
  private mergeCandles(fresh: Candle[]) {
    if (fresh.length === 0) return;
    const map = new Map<number, Candle>();
    for (const c of this.candles) map.set(c.time, c);
    for (const c of fresh) map.set(c.time, c);
    const arr = Array.from(map.values()).sort((a, b) => a.time - b.time);
    this.candles = arr;
    this.minTime = arr[0].time;
    this.maxTime = arr[arr.length - 1].time;
  }

  /**
   * Devuelve las velas hasta el índice `n` (clipped por lo que tengamos).
   * Si pedimos más de lo cacheado, devolvemos lo que hay (sin esperar fetch).
   * El caller usa ensureLoaded() para prefetch.
   */
  upToIndex(n: number): Candle[] {
    return this.candles.slice(0, Math.min(n + 1, this.candles.length));
  }

  /** Vela en índice n (puede ser null si n out of range). */
  at(n: number): Candle | null {
    return this.candles[n] ?? null;
  }

  /** Total de velas cacheadas. */
  get length(): number {
    return this.candles.length;
  }
}
