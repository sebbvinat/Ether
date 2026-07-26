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


/**
 * Wave 18.16 — cuánta historia sirve Yahoo por interval, en días. Ausente =
 * sin límite práctico. Pedir más atrás de esto devuelve 422, no una respuesta
 * recortada, así que hay que clampear antes de salir.
 */
const YAHOO_MAX_HISTORY_DAYS: Record<string, number | undefined> = {
  "1m": 7,
  "2m": 60,
  "5m": 60,
  "15m": 60,
  "30m": 60,
  "90m": 60,
  "60m": 730,
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

/**
 * Wave 18.16 — un solo lugar donde se decide CÓMO se llega al chart de Yahoo.
 *
 * Desde el browser hay que pasar por nuestro proxy: Yahoo no manda CORS.
 * Desde el server (route handlers, cron de ingest) el proxy no sirve —
 * `fetch("/api/…")` sin origen es "Invalid URL" en Node— así que vamos
 * directo al upstream. En los dos casos hace falta el User-Agent de
 * navegador: Yahoo responde 4xx a los clientes que no lo mandan.
 */
async function fetchYahooChart(
  yahooSymbol: string,
  interval: string,
  rangeQuery: string,
): Promise<YahooChartResponse> {
  const onServer = typeof window === "undefined";
  const url = onServer
    ? `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
        yahooSymbol,
      )}?interval=${interval}&${rangeQuery}`
    : `/api/yahoo/chart?symbol=${encodeURIComponent(
        yahooSymbol,
      )}&interval=${interval}&${rangeQuery}`;
  const res = await fetch(url, {
    cache: "no-store",
    headers: onServer
      ? {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
          Accept: "application/json",
        }
      : undefined,
  });
  if (!res.ok) throw new Error(`yahoo chart ${res.status}`);
  return (await res.json()) as YahooChartResponse;
}

export async function fetchYahooKlines(
  yahooSymbol: string,
  tf: Timeframe,
): Promise<Candle[]> {
  const { interval, range } = TF_MAP[tf];
  const json = await fetchYahooChart(yahooSymbol, interval, `range=${range}`);
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
 * Wave 18.16 — pedir más atrás del límite NO devuelve "lo que hay": Yahoo
 * contesta 422 y se pierde el rango entero. Por eso clampeamos `period1` al
 * límite del interval y devolvemos la ventana que sí existe. El caller ve
 * menos velas de las que pidió, que es la verdad de lo que Yahoo tiene.
 */
export async function fetchYahooRange(
  yahooSymbol: string,
  tf: Timeframe,
  startMs: number,
  endMs: number,
): Promise<Candle[]> {
  const { interval } = TF_MAP[tf];
  const maxDays = YAHOO_MAX_HISTORY_DAYS[interval];
  const floorMs =
    maxDays === undefined ? -Infinity : Date.now() - maxDays * 86_400_000;
  const p1 = Math.floor(Math.max(startMs, floorMs) / 1000);
  const p2 = Math.floor(endMs / 1000);
  // Si la ventana pedida queda entera fuera del alcance del interval, no hay
  // nada que traer: pedirlo igual es un 422 seguro.
  if (p2 <= p1) return [];
  const json = await fetchYahooChart(
    yahooSymbol,
    interval,
    `period1=${p1}&period2=${p2}`,
  );
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
  const json = await fetchYahooChart(yahooSymbol, "1m", "range=1d");
  const r = json.chart.result?.[0];
  if (!r) throw new Error("yahoo: no data");
  return {
    price: r.meta.regularMarketPrice,
    prevClose: r.meta.previousClose ?? r.meta.chartPreviousClose ?? 0,
  };
}
