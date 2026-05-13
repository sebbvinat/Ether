export type Provider = "binance" | "yahoo";
export type InstrumentType = "crypto" | "index";

export interface Instrument {
  symbol: string;
  displayName: string;
  baseAsset?: string;
  quoteAsset?: string;
  provider: Provider;
  yahooSymbol?: string;
  exchange: string;
  type: InstrumentType;
}

export const INDICES: Instrument[] = [
  {
    symbol: "^GSPC",
    yahooSymbol: "^GSPC",
    displayName: "S&P 500",
    provider: "yahoo",
    exchange: "INDEX",
    type: "index",
  },
  {
    symbol: "^IXIC",
    yahooSymbol: "^IXIC",
    displayName: "Nasdaq Composite",
    provider: "yahoo",
    exchange: "INDEX",
    type: "index",
  },
  {
    symbol: "^DJI",
    yahooSymbol: "^DJI",
    displayName: "Dow Jones",
    provider: "yahoo",
    exchange: "INDEX",
    type: "index",
  },
];

const INDEX_MAP = new Map(INDICES.map((i) => [i.symbol, i]));

let _yahooCache: Record<string, Instrument> = {};
export function setYahooSymbolsCache(map: Record<string, Instrument>) {
  _yahooCache = map;
}

export function getInstrument(symbol: string): Instrument {
  const idx = INDEX_MAP.get(symbol);
  if (idx) return idx;
  const cached = _yahooCache[symbol];
  if (cached) return cached;
  return {
    symbol,
    displayName: symbol,
    provider: "binance",
    exchange: "Binance",
    type: "crypto",
  };
}

export function isIndex(symbol: string): boolean {
  return INDEX_MAP.has(symbol);
}

/**
 * Build an Instrument from a Yahoo search result. Used to register
 * arbitrary tickers (stocks, FX, commodities) the user picks at runtime.
 */
export function buildYahooInstrument(input: {
  symbol: string;
  shortname?: string;
  longname?: string;
  exchange?: string;
  exchDisp?: string;
  quoteType?: string;
}): Instrument {
  const displayName = input.shortname || input.longname || input.symbol;
  const exchange = input.exchDisp || input.exchange || "Yahoo";
  const type: InstrumentType = "index";
  return {
    symbol: input.symbol,
    yahooSymbol: input.symbol,
    displayName,
    provider: "yahoo",
    exchange,
    type,
  };
}
