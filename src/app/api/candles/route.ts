/**
 * Wave 18.15 — lectura pública de velas (server-side cache).
 *
 * El client-side LazyCandleStore llama a este endpoint para pedir velas
 * de un rango. Nosotros:
 *  1. Intentamos servir desde Supabase (0 latencia con Binance/Yahoo).
 *  2. Si el rango incluye timestamps "recientes" (>= última vela cacheada),
 *     fetcheamos el gap y upserteamos.
 *  3. Devolvemos las velas del rango.
 *
 * Ventaja: la app se hace más rápida en frío (Supabase ya tiene la data
 * gracias al cron), y trabaja con menos rate-limit a Binance/Yahoo.
 * Fallback: si Supabase no está configurado, va directo a Binance/Yahoo.
 */

import { NextResponse } from "next/server";
import type { Timeframe } from "@/lib/binance/types";
import { fetchRange } from "@/lib/testing/candles";
import {
  getCachedRange,
  getMostRecentCachedTime,
  upsertCandles,
} from "@/lib/testing/supabase-candles";
import { serverSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 30;

const VALID_TFS: Timeframe[] = [
  "1m", "3m", "5m", "15m", "30m",
  "1h", "2h", "4h", "6h", "8h", "12h",
  "1d", "3d", "1w", "1M",
];

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  const tf = searchParams.get("tf") as Timeframe | null;
  const from = Number(searchParams.get("from"));
  const to = Number(searchParams.get("to"));

  if (!symbol || !tf || !VALID_TFS.includes(tf) || !Number.isFinite(from) || !Number.isFinite(to)) {
    return NextResponse.json(
      { error: "invalid params — need symbol, tf, from, to (ms)" },
      { status: 400 },
    );
  }

  // Si Supabase no está configurado, fetch directo (comportamiento previo).
  if (!serverSupabaseConfigured()) {
    const fresh = await fetchRange(symbol, tf, from, to);
    return NextResponse.json({ candles: fresh, source: "direct" });
  }

  // 1. Traer lo que Supabase ya tenga.
  const fromSec = Math.floor(from / 1000);
  const toSec = Math.floor(to / 1000);
  const cached = await getCachedRange(symbol, tf, fromSec, toSec);

  // 2. Si el rango pedido incluye timestamps recientes (>= última cacheada),
  //    hay que fetchear el gap y upsertear.
  const lastCached = await getMostRecentCachedTime(symbol, tf);
  const now = Date.now();
  const gapStart = lastCached
    ? Math.max(from, (lastCached + 1) * 1000)
    : from;
  const gapEnd = Math.min(to, now);
  let freshFetched = 0;
  if (gapStart < gapEnd) {
    try {
      const fresh = await fetchRange(symbol, tf, gapStart, gapEnd);
      if (fresh.length > 0) {
        await upsertCandles(symbol, tf, fresh);
        freshFetched = fresh.length;
        // Mergear el nuevo con lo cacheado
        const seen = new Set(cached.map((c) => c.time));
        for (const c of fresh) {
          if (!seen.has(c.time) && c.time >= fromSec && c.time <= toSec) {
            cached.push(c);
            seen.add(c.time);
          }
        }
        cached.sort((a, b) => a.time - b.time);
      }
    } catch (e) {
      // Si el fetch externo falla, servimos lo que tengamos.
      console.warn("[api/candles] gap fetch failed", e);
    }
  }

  return NextResponse.json({
    candles: cached,
    source: "supabase",
    cached: cached.length - freshFetched,
    fresh: freshFetched,
  });
}
