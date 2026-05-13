export type AlertDirection = "above" | "below";

export type AlertCondition =
  | {
      type: "price";
      direction: AlertDirection;
      price: number;
    }
  | {
      type: "ema-cross";
      /** EMA period of the faster line */
      fast: number;
      /** EMA period of the slower line */
      slow: number;
      /** Direction: faster crossing 'above' / 'below' slower */
      direction: AlertDirection;
    }
  | {
      type: "rsi-threshold";
      period: number;
      threshold: number;
      direction: AlertDirection;
    }
  | {
      type: "macd-cross";
      fast: number;
      slow: number;
      signal: number;
      direction: AlertDirection;
    };

export type Timeframe =
  | "1m"
  | "5m"
  | "15m"
  | "30m"
  | "1h"
  | "4h"
  | "1d";

export interface Alert {
  id: string;
  symbol: string;
  resolvedSymbol: string;
  provider: "binance" | "yahoo";
  timeframe?: Timeframe;
  condition: AlertCondition;
  note?: string;
  createdAt: number;
  triggeredAt?: number;
}

export interface CreateAlertInput {
  symbol: string;
  resolvedSymbol: string;
  provider: "binance" | "yahoo";
  timeframe?: Timeframe;
  condition: AlertCondition;
  note?: string;
}

export function describeCondition(c: AlertCondition): string {
  const arrow = c.direction === "above" ? "≥" : "≤";
  if (c.type === "price") {
    return `Precio ${arrow} ${c.price}`;
  }
  if (c.type === "ema-cross") {
    return `EMA(${c.fast}) cruza ${arrow === "≥" ? "↗ sobre" : "↘ bajo"} EMA(${c.slow})`;
  }
  if (c.type === "rsi-threshold") {
    return `RSI(${c.period}) ${arrow} ${c.threshold}`;
  }
  if (c.type === "macd-cross") {
    return `MACD ${arrow === "≥" ? "↗ cruza" : "↘ cruza bajo"} signal`;
  }
  return JSON.stringify(c);
}
