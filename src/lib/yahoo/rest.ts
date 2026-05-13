import type { Candle, Timeframe } from "@/lib/binance/types";

const TF_MAP: Record<Timeframe, { interval: string; range: string }> = {
  "1m": { interval: "1m", range: "5d" },
  "3m": { interval: "5m", range: "1mo" },
  "5m": { interval: "5m", range: "1mo" },
  "15m": { interval: "15m", range: "3mo" },
  "30m": { interval: "30m", range: "3mo" },
  "1h": { interval: "60m", range: "6mo" },
  "2h": { interval: "60m", range: "6mo" },
  "4h": { interval: "60m", range: "1y" },
  "6h": { interval: "1d", range: "5y" },
  "8h": { interval: "1d", range: "5y" },
  "12h": { interval: "1d", range: "5y" },
  "1d": { interval: "1d", range: "5y" },
  "3d": { interval: "1d", range: "10y" },
  "1w": { interval: "1wk", range: "10y" },
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
