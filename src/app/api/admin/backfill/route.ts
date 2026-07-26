/**
 * §13 — backfill de historia a Supabase.
 *
 * El cron horario mantiene la punta al día pero nunca va hacia atrás. Esta
 * ruta trae el pasado, de a un chunk acotado por llamada:
 *
 *   GET /api/admin/backfill?symbol=BTCUSDT&tf=1h&fromMs=…&toMs=…
 *   → { done, nextToMs, fetched, inserted, oldestSec }
 *
 * Cada llamada pagina HACIA ATRÁS desde `toMs` y responde dónde quedó. El
 * runner (workflow de GitHub Actions) vuelve a llamar con `toMs=nextToMs`
 * hasta que `done` sea true. Está partido así porque una request de Vercel
 * corta a los 60s: un símbolo entero en 1m son horas de ingesta.
 *
 * Idempotente: `upsertCandles` usa la PK (symbol, tf, time_sec), así que
 * re-correr el mismo rango no duplica nada.
 */

import { NextResponse } from "next/server";
import type { Timeframe } from "@/lib/binance/types";
import { fetchKlines } from "@/lib/binance/rest";
import { fetchYahooRange } from "@/lib/yahoo/rest";
import { getInstrument } from "@/lib/instruments";
import { collectBackfillChunk } from "@/lib/testing/backfill";
import { TF_MINUTES } from "@/lib/testing/candles";
import { upsertCandles } from "@/lib/testing/supabase-candles";
import { serverSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Cuántas requests a Binance como máximo por llamada (1000 velas c/u).
 *  30k velas entran cómodas en los 60s de Vercel. */
const MAX_REQUESTS = 30;

const VALID_TFS = new Set<string>(Object.keys(TF_MINUTES));

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    if (req.headers.get("authorization") !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }
  if (!serverSupabaseConfigured()) {
    return NextResponse.json(
      { error: "supabase not configured (missing SUPABASE_URL / SUPABASE_SERVICE_KEY)" },
      { status: 500 },
    );
  }

  const url = new URL(req.url);
  const symbol = url.searchParams.get("symbol");
  const tf = url.searchParams.get("tf") as Timeframe | null;
  const fromMsRaw = url.searchParams.get("fromMs");
  const toMsRaw = url.searchParams.get("toMs");

  if (!symbol || !tf || !VALID_TFS.has(tf)) {
    return NextResponse.json(
      { error: "symbol y tf son obligatorios (tf debe ser un timeframe válido)" },
      { status: 400 },
    );
  }
  const fromMs = Number(fromMsRaw);
  if (!Number.isFinite(fromMs)) {
    return NextResponse.json(
      { error: "fromMs es obligatorio (epoch ms)" },
      { status: 400 },
    );
  }
  const toMs = Number.isFinite(Number(toMsRaw)) ? Number(toMsRaw) : Date.now();
  if (toMs <= fromMs) {
    return NextResponse.json({
      ok: true,
      done: true,
      reason: "rango vacío (toMs <= fromMs)",
      fetched: 0,
      inserted: 0,
      nextToMs: fromMs,
    });
  }

  const inst = getInstrument(symbol);

  try {
    // Yahoo no pagina: period1/period2 cubre todo el rango en una request y
    // clampea solo a lo que tiene. Un chunk y listo.
    const isYahoo = inst.provider === "yahoo";
    const { candles, requests, done, nextToMs } = await collectBackfillChunk(
      isYahoo
        ? () => fetchYahooRange(inst.yahooSymbol ?? symbol, tf, fromMs, toMs)
        : (endTimeMs) => fetchKlines(symbol, tf, 1000, "spot", endTimeMs),
      tf,
      fromMs,
      toMs,
      isYahoo ? 1 : MAX_REQUESTS,
    );

    const { inserted } = candles.length
      ? await upsertCandles(symbol, tf, candles)
      : { inserted: 0 };

    return NextResponse.json({
      ok: true,
      symbol,
      tf,
      // Con Yahoo una sola pasada es todo lo que hay: no tiene sentido que el
      // runner vuelva a pedir el mismo rango.
      done: isYahoo ? true : done,
      requests,
      fetched: candles.length,
      inserted,
      oldestSec: candles[0]?.time ?? null,
      nextToMs,
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message ?? "unknown", symbol, tf },
      { status: 500 },
    );
  }
}
