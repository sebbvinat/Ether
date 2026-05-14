import {
  fetchKlines,
  fetchTickers24h,
  fetchExchangeSymbols,
} from "./binance/rest";
import { getBinanceWS } from "./binance/ws";
import { fetchYahooKlines } from "./yahoo/rest";
import { pollYahooKline, pollYahooQuotes } from "./yahoo/poll";
import { getInstrument, INDICES, type Instrument } from "./instruments";
import type { Candle, Timeframe } from "./binance/types";
import { useChartStore } from "./store/chart-store";

function currentBinanceMarket() {
  try {
    return useChartStore.getState().binanceMarket;
  } catch {
    return "spot" as const;
  }
}

export async function fetchCandles(
  symbol: string,
  tf: Timeframe,
): Promise<Candle[]> {
  const inst = getInstrument(symbol);
  if (inst.provider === "yahoo") {
    return fetchYahooKlines(inst.yahooSymbol!, tf);
  }
  return fetchKlines(symbol, tf, 1000, currentBinanceMarket());
}

/**
 * Fetch a chunk of historical candles older than `beforeTimeSec`.
 * Only supported for Binance (Yahoo's range param already pulls deep history).
 * Returns [] for Yahoo (no-op).
 */
export async function fetchOlderCandles(
  symbol: string,
  tf: Timeframe,
  beforeTimeSec: number,
): Promise<Candle[]> {
  const inst = getInstrument(symbol);
  if (inst.provider === "yahoo") return [];
  // Binance endTime is exclusive — pass the first known candle's time
  const candles = await fetchKlines(
    symbol,
    tf,
    1000,
    currentBinanceMarket(),
    beforeTimeSec * 1000,
  );
  // Exclude the boundary candle if it matches (avoid duplicate)
  return candles.filter((c) => c.time < beforeTimeSec);
}

export interface MarketSubscription {
  onInit: (candles: Candle[]) => void;
  onCandle: (c: Candle) => void;
  onError?: (e: Error) => void;
}

export function subscribeMarket(
  symbol: string,
  tf: Timeframe,
  sub: MarketSubscription,
): () => void {
  const inst = getInstrument(symbol);

  if (inst.provider === "yahoo") {
    return pollYahooKline(
      inst.yahooSymbol!,
      tf,
      sub.onCandle,
      sub.onInit,
    );
  }

  let cancelled = false;
  let unsub: (() => void) | null = null;
  const market = currentBinanceMarket();
  fetchKlines(symbol, tf, 1000, market)
    .then((candles) => {
      if (cancelled) return;
      sub.onInit(candles);
      const ws = getBinanceWS(market);
      unsub = ws.subscribeKline({
        symbol,
        interval: tf,
        onCandle: sub.onCandle,
      });
    })
    .catch((e) => sub.onError?.(e as Error));

  return () => {
    cancelled = true;
    unsub?.();
  };
}

export interface QuoteTick {
  symbol: string;
  close: number;
  open: number;
  pct: number;
}

export function subscribeQuotes(
  symbols: string[],
  onTick: (t: QuoteTick) => void,
): () => void {
  const indices = symbols.filter(
    (s) => getInstrument(s).provider === "yahoo",
  );
  const cryptos = symbols.filter(
    (s) => getInstrument(s).provider === "binance",
  );
  const unsubs: Array<() => void> = [];

  if (cryptos.length > 0) {
    const market = currentBinanceMarket();
    fetchTickers24h(cryptos, market)
      .then((tickers) => {
        tickers.forEach((t) =>
          onTick({
            symbol: t.symbol,
            close: t.lastPrice,
            open: t.lastPrice - t.priceChange,
            pct: t.priceChangePercent,
          }),
        );
      })
      .catch(console.error);

    const ws = getBinanceWS(market);
    unsubs.push(ws.subscribeMiniTickers(cryptos, onTick));
  }

  if (indices.length > 0) {
    const symbolMap = new Map<string, string>();
    const ySymbols = indices.map((s) => {
      const y = getInstrument(s).yahooSymbol!;
      symbolMap.set(y, s);
      return y;
    });
    unsubs.push(
      pollYahooQuotes(ySymbols, (data) => {
        const orig = symbolMap.get(data.symbol);
        if (!orig) return;
        onTick({
          symbol: orig,
          close: data.close,
          open: data.prevClose,
          pct: data.pct,
        });
      }),
    );
  }

  return () => unsubs.forEach((u) => u());
}

export async function searchInstruments(query: string): Promise<Instrument[]> {
  const q = query.trim().toUpperCase();
  const idx = INDICES.filter(
    (i) =>
      !q ||
      i.symbol.toUpperCase().includes(q) ||
      i.displayName.toUpperCase().includes(q),
  );
  const crypto = await fetchExchangeSymbols();
  const cryptoFiltered = crypto
    .filter(
      (s) =>
        !q ||
        s.symbol.includes(q) ||
        s.baseAsset.includes(q) ||
        s.quoteAsset.includes(q),
    )
    .slice(0, 100)
    .map<Instrument>((s) => ({
      symbol: s.symbol,
      displayName: `${s.baseAsset}/${s.quoteAsset}`,
      baseAsset: s.baseAsset,
      quoteAsset: s.quoteAsset,
      provider: "binance",
      exchange: "Binance",
      type: "crypto",
    }));
  return [...idx, ...cryptoFiltered];
}
