/**
 * Wave 18.15 — endpoint del cron que ingesta velas nuevas a Supabase.
 *
 * Vercel Cron lo llama según `vercel.json` (cada 1h). El endpoint:
 *  1. Chequea CRON_SECRET para evitar que cualquiera lo dispare.
 *  2. Para cada (symbol, tf) popular: pregunta a Supabase por la última vela
 *     cacheada, fetchea desde ese punto en adelante a Binance/Yahoo, upsertea.
 *  3. Devuelve un summary por (symbol, tf).
 *
 * Idempotente: si se llama 2 veces seguidas, la 2da no agrega nada nuevo.
 */

import { NextResponse } from "next/server";
import type { Timeframe } from "@/lib/binance/types";
import { fetchRange } from "@/lib/testing/candles";
import {
  getMostRecentCachedTime,
  upsertCandles,
} from "@/lib/testing/supabase-candles";
import { serverSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 60; // Vercel Hobby cap

/** Lo que cacheamos globalmente en el server. */
const SYMBOLS: { symbol: string; provider: "binance" | "yahoo" }[] = [
  { symbol: "BTCUSDT", provider: "binance" },
  { symbol: "ETHUSDT", provider: "binance" },
  { symbol: "SOLUSDT", provider: "binance" },
  { symbol: "^GSPC", provider: "yahoo" },
  { symbol: "^IXIC", provider: "yahoo" },
  { symbol: "^DJI", provider: "yahoo" },
];

const TFS: Timeframe[] = ["1d", "4h", "1h", "15m"];

/** Cuánto atrás traer si el cache está vacío (primera vez). */
const INITIAL_HISTORY_MS: Record<Timeframe, number> = {
  "1m": 3 * 24 * 60 * 60 * 1000, // 3 días
  "3m": 7 * 24 * 60 * 60 * 1000,
  "5m": 14 * 24 * 60 * 60 * 1000,
  "15m": 60 * 24 * 60 * 60 * 1000, // 2 meses
  "30m": 90 * 24 * 60 * 60 * 1000,
  "1h": 365 * 24 * 60 * 60 * 1000, // 1 año
  "2h": 365 * 24 * 60 * 60 * 1000,
  "4h": 3 * 365 * 24 * 60 * 60 * 1000, // 3 años
  "6h": 3 * 365 * 24 * 60 * 60 * 1000,
  "8h": 3 * 365 * 24 * 60 * 60 * 1000,
  "12h": 5 * 365 * 24 * 60 * 60 * 1000,
  "1d": 10 * 365 * 24 * 60 * 60 * 1000, // 10 años
  "3d": 10 * 365 * 24 * 60 * 60 * 1000,
  "1w": 10 * 365 * 24 * 60 * 60 * 1000,
  "1M": 10 * 365 * 24 * 60 * 60 * 1000,
};

export async function GET(req: Request) {
  // 1. Auth
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }
  if (!serverSupabaseConfigured()) {
    return NextResponse.json(
      { error: "supabase not configured (missing SUPABASE_URL / SUPABASE_SERVICE_KEY)" },
      { status: 500 },
    );
  }

  const now = Date.now();
  const results: Array<{
    symbol: string;
    tf: Timeframe;
    fromSec: number;
    fetched: number;
    inserted: number;
    error?: string;
  }> = [];

  for (const s of SYMBOLS) {
    for (const tf of TFS) {
      try {
        const lastCached = await getMostRecentCachedTime(s.symbol, tf);
        // Si hay cache, arrancamos desde la última vela (por si estaba forming).
        // Si no, agarramos INITIAL_HISTORY_MS.
        const startMs = lastCached
          ? lastCached * 1000
          : now - INITIAL_HISTORY_MS[tf];
        const endMs = now;
        const fresh = await fetchRange(
          s.symbol,
          tf,
          startMs,
          endMs,
          s.provider === "binance" ? "spot" : "spot",
        );
        const { inserted } = await upsertCandles(s.symbol, tf, fresh);
        results.push({
          symbol: s.symbol,
          tf,
          fromSec: Math.floor(startMs / 1000),
          fetched: fresh.length,
          inserted,
        });
      } catch (e) {
        results.push({
          symbol: s.symbol,
          tf,
          fromSec: 0,
          fetched: 0,
          inserted: 0,
          error: (e as Error).message ?? "unknown",
        });
      }
    }
  }

  return NextResponse.json({
    ok: true,
    runAt: new Date(now).toISOString(),
    totalRuns: results.length,
    results,
  });
}
