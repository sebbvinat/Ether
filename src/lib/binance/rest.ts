import type { Candle, SymbolInfo, Ticker24h, Timeframe } from "./types";

export type BinanceMarket = "spot" | "perp";

function base(market: BinanceMarket): string {
  return market === "perp"
    ? "https://fapi.binance.com/fapi/v1"
    : "https://api.binance.com/api/v3";
}

export async function fetchKlines(
  symbol: string,
  interval: Timeframe,
  limit = 1000,
  market: BinanceMarket = "spot",
): Promise<Candle[]> {
  const url = `${base(market)}/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`klines ${res.status}`);
  const data = (await res.json()) as unknown[][];
  return data.map((k) => ({
    time: Math.floor((k[0] as number) / 1000),
    open: parseFloat(k[1] as string),
    high: parseFloat(k[2] as string),
    low: parseFloat(k[3] as string),
    close: parseFloat(k[4] as string),
    volume: parseFloat(k[5] as string),
    isFinal: true,
  }));
}

export async function fetchTicker24h(
  symbol: string,
  market: BinanceMarket = "spot",
): Promise<Ticker24h> {
  const url = `${base(market)}/ticker/24hr?symbol=${symbol.toUpperCase()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`ticker ${res.status}`);
  const t = await res.json();
  return {
    symbol: t.symbol,
    lastPrice: parseFloat(t.lastPrice),
    priceChange: parseFloat(t.priceChange),
    priceChangePercent: parseFloat(t.priceChangePercent),
    highPrice: parseFloat(t.highPrice),
    lowPrice: parseFloat(t.lowPrice),
    volume: parseFloat(t.volume),
    quoteVolume: parseFloat(t.quoteVolume),
  };
}

export async function fetchTickers24h(
  symbols: string[],
  market: BinanceMarket = "spot",
): Promise<Ticker24h[]> {
  // Futures endpoint doesn't accept multi-symbol array; in that case fetch all and filter.
  if (market === "perp") {
    const url = `${base(market)}/ticker/24hr`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`tickers ${res.status}`);
    const data = (await res.json()) as Record<string, string>[];
    const set = new Set(symbols.map((s) => s.toUpperCase()));
    return data
      .filter((t) => set.has(t.symbol))
      .map((t) => ({
        symbol: t.symbol,
        lastPrice: parseFloat(t.lastPrice),
        priceChange: parseFloat(t.priceChange),
        priceChangePercent: parseFloat(t.priceChangePercent),
        highPrice: parseFloat(t.highPrice),
        lowPrice: parseFloat(t.lowPrice),
        volume: parseFloat(t.volume),
        quoteVolume: parseFloat(t.quoteVolume),
      }));
  }
  const arr = JSON.stringify(symbols.map((s) => s.toUpperCase()));
  const url = `${base(market)}/ticker/24hr?symbols=${encodeURIComponent(arr)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`tickers ${res.status}`);
  const data = await res.json();
  return data.map((t: Record<string, string>) => ({
    symbol: t.symbol,
    lastPrice: parseFloat(t.lastPrice),
    priceChange: parseFloat(t.priceChange),
    priceChangePercent: parseFloat(t.priceChangePercent),
    highPrice: parseFloat(t.highPrice),
    lowPrice: parseFloat(t.lowPrice),
    volume: parseFloat(t.volume),
    quoteVolume: parseFloat(t.quoteVolume),
  }));
}

let cachedSpot: SymbolInfo[] | null = null;
let cachedPerp: SymbolInfo[] | null = null;
export async function fetchExchangeSymbols(
  market: BinanceMarket = "spot",
): Promise<SymbolInfo[]> {
  if (market === "spot" && cachedSpot) return cachedSpot;
  if (market === "perp" && cachedPerp) return cachedPerp;
  const url =
    market === "perp"
      ? "https://fapi.binance.com/fapi/v1/exchangeInfo"
      : "https://api.binance.com/api/v3/exchangeInfo";
  const res = await fetch(url, { cache: "force-cache" });
  if (!res.ok) throw new Error(`exchangeInfo ${res.status}`);
  const data = await res.json();
  const symbols = data.symbols
    .filter(
      (s: { status?: string; contractType?: string; quoteAsset: string }) =>
        ((market === "spot" && s.status === "TRADING") ||
          (market === "perp" && s.contractType === "PERPETUAL")) &&
        s.quoteAsset === "USDT",
    )
    .map(
      (s: {
        symbol: string;
        baseAsset: string;
        quoteAsset: string;
        status?: string;
      }) => ({
        symbol: s.symbol,
        baseAsset: s.baseAsset,
        quoteAsset: s.quoteAsset,
        status: s.status ?? "TRADING",
      }),
    );
  if (market === "spot") cachedSpot = symbols;
  else cachedPerp = symbols;
  return symbols;
}
