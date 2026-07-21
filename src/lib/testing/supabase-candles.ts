/**
 * Wave 18.15 — API de lectura/escritura de velas en Supabase.
 *
 * Tabla `candles`:
 *   symbol TEXT, tf TEXT, time_sec BIGINT, o/h/l/c/v NUMERIC
 *   PRIMARY KEY (symbol, tf, time_sec)
 *
 * Lecturas: `getCachedRange` (server-side, usado por el reader).
 * Escrituras: `upsertCandles` (usado por el cron).
 */

import { getServerSupabase } from "@/lib/supabase";
import type { Candle, Timeframe } from "@/lib/binance/types";

interface DBRow {
  symbol: string;
  tf: string;
  time_sec: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

/** Lee velas entre [fromSec, toSec] (segundos UNIX). ASC ordenado. */
export async function getCachedRange(
  symbol: string,
  tf: Timeframe,
  fromSec: number,
  toSec: number,
): Promise<Candle[]> {
  const sb = getServerSupabase();
  // Supabase caps a 1000 rows por request por default; usamos range() para paginar.
  const out: Candle[] = [];
  const chunk = 1000;
  let offset = 0;
  while (true) {
    const { data, error } = await sb
      .from("candles")
      .select("time_sec, o, h, l, c, v")
      .eq("symbol", symbol)
      .eq("tf", tf)
      .gte("time_sec", fromSec)
      .lte("time_sec", toSec)
      .order("time_sec", { ascending: true })
      .range(offset, offset + chunk - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data as Pick<DBRow, "time_sec" | "o" | "h" | "l" | "c" | "v">[]) {
      out.push({
        time: r.time_sec,
        open: Number(r.o),
        high: Number(r.h),
        low: Number(r.l),
        close: Number(r.c),
        volume: Number(r.v),
        isFinal: true,
      });
    }
    if (data.length < chunk) break;
    offset += chunk;
  }
  return out;
}

/** Devuelve el timestamp (segundos UNIX) de la vela más reciente cacheada,
 *  o null si no hay ninguna. Usado por el cron para saber desde dónde traer. */
export async function getMostRecentCachedTime(
  symbol: string,
  tf: Timeframe,
): Promise<number | null> {
  const sb = getServerSupabase();
  const { data, error } = await sb
    .from("candles")
    .select("time_sec")
    .eq("symbol", symbol)
    .eq("tf", tf)
    .order("time_sec", { ascending: false })
    .limit(1);
  if (error) throw error;
  const first = data?.[0] as { time_sec: number } | undefined;
  return first ? first.time_sec : null;
}

/** Upsert velas — sobreescribe si ya existen por (symbol, tf, time_sec). */
export async function upsertCandles(
  symbol: string,
  tf: Timeframe,
  candles: Candle[],
): Promise<{ inserted: number }> {
  if (candles.length === 0) return { inserted: 0 };
  const sb = getServerSupabase();
  const rows: DBRow[] = candles.map((c) => ({
    symbol,
    tf,
    time_sec: c.time,
    o: c.open,
    h: c.high,
    l: c.low,
    c: c.close,
    v: c.volume,
  }));
  // Supabase upsert acepta hasta ~1000 rows por request. Chunkeamos.
  const chunk = 500;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += chunk) {
    const batch = rows.slice(i, i + chunk);
    const { error, count } = await sb
      .from("candles")
      .upsert(batch, { onConflict: "symbol,tf,time_sec", count: "exact" });
    if (error) throw error;
    inserted += count ?? batch.length;
  }
  return { inserted };
}
