import type { Candle, Timeframe } from "@/lib/binance/types";

/**
 * Wave 18.12 — TF_MAP respetando los límites duros de Yahoo:
 *   1m: máx 7 días de historia
 *   2m, 5m, 15m, 30m, 90m: máx 60 días
 *   60m (1h): máx 730 días (~2 años)
 *   1d y arriba: sin límite práctico
 *
 * Antes había 15m/3mo (90d) y 30m/3mo → 422 en varios símbolos.
 */
const TF_MAP: Record<Timeframe, { interval: string; range: string }> = {
  "1m": { interval: "1m", range: "7d" },
  "3m": { interval: "5m", range: "60d" },
  "5m": { interval: "5m", range: "60d" },
  "15m": { interval: "15m", range: "60d" },
  "30m": { interval: "30m", range: "60d" },
  "1h": { interval: "60m", range: "730d" },
  "2h": { interval: "60m", range: "730d" },
  "4h": { interval: "60m", range: "730d" },
  "6h": { interval: "1d", range: "5y" },
  "8h": { interval: "1d", range: "5y" },
  "12h": { interval: "1d", range: "5y" },
  "1d": { interval: "1d", range: "max" },
  "3d": { interval: "1d", range: "max" },
  "1w": { interval: "1wk", range: "max" },
  "1M": { interval: "1mo", range: "max" },
};


interface YahooChartResponse {
  chart: {
    result: Array<{
      meta: {
        regularMarketPrice: number;
        previousClose?: number;
        chartPreviousClose?: number;
      };
      timestamp?: number[];
      indicators: {
        quote: Array<{
          open: (number | null)[];
          high: (number | null)[];
          low: (number | null)[];
          close: (number | null)[];
          volume: (number | null)[];
        }>;
      };
    }> | null;
    error?: { code: string; description: string } | null;
  };
}

export async function fetchYahooKlines(
  yahooSymbol: string,
  tf: Timeframe,
): Promise<Candle[]> {
  const { interval, range } = TF_MAP[tf];
  const url = `/api/yahoo/chart?symbol=${encodeURIComponent(yahooSymbol)}&interval=${interval}&range=${range}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`yahoo chart ${res.status}`);
  const json = (await res.json()) as YahooChartResponse;
  const r = json.chart.result?.[0];
  if (!r) throw new Error(json.chart.error?.description ?? "yahoo: no data");
  const ts = r.timestamp ?? [];
  const q = r.indicators.quote[0];
  const out: Candle[] = [];
  for (let i = 0; i < ts.length; i++) {
    const o = q.open[i];
    const h = q.high[i];
    const l = q.low[i];
    const c = q.close[i];
    const v = q.volume[i];
    if (o == null || h == null || l == null || c == null) continue;
    out.push({
      time: ts[i],
      open: o,
      high: h,
      low: l,
      close: c,
      volume: v ?? 0,
      isFinal: true,
    });
  }
  return out;
}

/**
 * Wave 18.12 — Traer velas de Yahoo por rango arbitrario usando period1/period2.
 * Útil para el chart de Testing que necesita centrar la carga en el cursor.
 *
 * Yahoo tiene límites hard sobre CUÁNTA HISTORIA hay disponible por interval:
 *   - 1m: sólo los últimos 7 días (aunque pidas más atrás)
 *   - 5m/15m/30m: últimos 60 días
 *   - 60m: últimos 730 días
 *   - 1d+: sin límite práctico
 *
 * Si `startMs` cae más atrás del límite, Yahoo igual devuelve lo que tiene
 * (usualmente los datos más recientes que caben). No es un error.
 */
export async function fetchYahooRange(
  yahooSymbol: string,
  tf: Timeframe,
  startMs: number,
  endMs: number,
): Promise<Candle[]> {
  const { interval } = TF_MAP[tf];
  const p1 = Math.floor(startMs / 1000);
  const p2 = Math.floor(endMs / 1000);
  const url = `/api/yahoo/chart?symbol=${encodeURIComponent(yahooSymbol)}&interval=${interval}&period1=${p1}&period2=${p2}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`yahoo chart ${res.status}`);
  const json = (await res.json()) as YahooChartResponse;
  const r = json.chart.result?.[0];
  if (!r) throw new Error(json.chart.error?.description ?? "yahoo: no data");
  const ts = r.timestamp ?? [];
  const q = r.indicators.quote[0];
  const out: Candle[] = [];
  for (let i = 0; i < ts.length; i++) {
    const o = q.open[i];
    const h = q.high[i];
    const l = q.low[i];
    const c = q.close[i];
    const v = q.volume[i];
    if (o == null || h == null || l == null || c == null) continue;
    out.push({
      time: ts[i],
      open: o,
      high: h,
      low: l,
      close: c,
      volume: v ?? 0,
      isFinal: true,
    });
  }
  return out;
}

export interface YahooQuote {
  price: number;
  prevClose: number;
}

export async function fetchYahooQuote(
  yahooSymbol: string,
): Promise<YahooQuote> {
  const url = `/api/yahoo/chart?symbol=${encodeURIComponent(yahooSymbol)}&interval=1m&range=1d`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`yahoo quote ${res.status}`);
  const json = (await res.json()) as YahooChartResponse;
  const r = json.chart.result?.[0];
  if (!r) throw new Error("yahoo: no data");
  return {
    price: r.meta.regularMarketPrice,
    prevClose: r.meta.previousClose ?? r.meta.chartPreviousClose ?? 0,
  };
}
