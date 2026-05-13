import type { Candle, Timeframe } from "@/lib/binance/types";
import { fetchYahooKlines, fetchYahooQuote } from "./rest";

const QUOTE_POLL_MS = 5_000;
const KLINE_POLL_MS = 60_000;

export function pollYahooKline(
  yahooSymbol: string,
  tf: Timeframe,
  onCandle: (c: Candle) => void,
  onInit: (candles: Candle[]) => void,
): () => void {
  let cancelled = false;
  let last: Candle | undefined;
  let quoteTimer: ReturnType<typeof setInterval> | null = null;
  let klineTimer: ReturnType<typeof setInterval> | null = null;

  fetchYahooKlines(yahooSymbol, tf)
    .then((arr) => {
      if (cancelled) return;
      onInit(arr);
      last = arr[arr.length - 1];

      quoteTimer = setInterval(async () => {
        if (cancelled || !last) return;
        try {
          const q = await fetchYahooQuote(yahooSymbol);
          if (!isFinite(q.price)) return;
          const updated: Candle = {
            ...last,
            close: q.price,
            high: Math.max(last.high, q.price),
            low: Math.min(last.low, q.price),
            isFinal: false,
          };
          last = updated;
          onCandle(updated);
        } catch (e) {
          console.error("yahoo quote poll", e);
        }
      }, QUOTE_POLL_MS);

      klineTimer = setInterval(async () => {
        if (cancelled) return;
        try {
          const arr = await fetchYahooKlines(yahooSymbol, tf);
          const newLast = arr[arr.length - 1];
          if (!newLast) return;
          if (!last || newLast.time > last.time) {
            for (const c of arr) {
              if (!last || c.time >= last.time) onCandle({ ...c, isFinal: true });
            }
          }
          last = newLast;
        } catch (e) {
          console.error("yahoo kline poll", e);
        }
      }, KLINE_POLL_MS);
    })
    .catch((e) => {
      console.error("yahoo kline init", e);
    });

  return () => {
    cancelled = true;
    if (quoteTimer) clearInterval(quoteTimer);
    if (klineTimer) clearInterval(klineTimer);
  };
}

export interface YahooTick {
  symbol: string;
  close: number;
  prevClose: number;
  pct: number;
}

export function pollYahooQuotes(
  yahooSymbols: string[],
  onTick: (data: YahooTick) => void,
): () => void {
  if (yahooSymbols.length === 0) return () => {};
  let cancelled = false;

  async function tick() {
    if (cancelled) return;
    await Promise.all(
      yahooSymbols.map(async (s) => {
        try {
          const q = await fetchYahooQuote(s);
          if (cancelled || !isFinite(q.price)) return;
          onTick({
            symbol: s,
            close: q.price,
            prevClose: q.prevClose,
            pct:
              q.prevClose > 0
                ? ((q.price - q.prevClose) / q.prevClose) * 100
                : 0,
          });
        } catch (e) {
          console.error("yahoo quotes poll", s, e);
        }
      }),
    );
  }

  tick();
  const id = setInterval(tick, QUOTE_POLL_MS);
  return () => {
    cancelled = true;
    clearInterval(id);
  };
}
