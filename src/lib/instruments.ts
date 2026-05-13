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

export function getInstrument(symbol: string): Instrument {
  const idx = INDEX_MAP.get(symbol);
  if (idx) return idx;
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
