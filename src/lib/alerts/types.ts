export type AlertDirection = "above" | "below";

export interface Alert {
  id: string;
  symbol: string;
  /** Yahoo symbol if indices, same as symbol if crypto */
  resolvedSymbol: string;
  provider: "binance" | "yahoo";
  direction: AlertDirection;
  price: number;
  note?: string;
  createdAt: number;
  triggeredAt?: number;
}

export interface CreateAlertInput {
  symbol: string;
  resolvedSymbol: string;
  provider: "binance" | "yahoo";
  direction: AlertDirection;
  price: number;
  note?: string;
}
