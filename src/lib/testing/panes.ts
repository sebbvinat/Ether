/**
 * Wave 23 — a qué sub-panel va cada indicador del chart de testing.
 *
 * Antes cada indicador tenía un índice fijo (RSI=1, MACD=2, Stochastic=3), así
 * que prender sólo el Stochastic dejaba dos franjas vacías comiéndose media
 * pantalla. Acá los paneles se reparten por orden de activación: el primero
 * que esté prendido va al 1, el segundo al 2, y los que sobran se eliminan.
 *
 * Vive separado de TestingChart porque es la parte que puede estar mal sin que
 * se note a simple vista, y así se puede testear sin un chart de por medio.
 */

import type { IndicatorKey } from "@/lib/store/chart-store";

/**
 * Los indicadores que van abajo del precio, en el orden en que se les asigna
 * lugar. No es el orden de activación del usuario: si prende ADX y después
 * RSI, el RSI igual va arriba. Que sea estable importa para no reacomodar los
 * paneles cada vez que se toca un toggle.
 */
export const SUBPANE_ORDER: IndicatorKey[] = [
  "rsi",
  "macd",
  "stoch",
  "atr",
  "obv",
  "cci",
  "williamsR",
  "mfi",
  "adx",
  "stochRsi",
  "ao",
];

export interface PaneLayout {
  /** Índice de panel de cada indicador activo. El 0 es el del precio. */
  paneOf: Map<IndicatorKey, number>;
  /** Cuántos paneles debería tener el chart, contando el del precio. */
  paneCount: number;
}

export function computePaneLayout(
  active: Partial<Record<IndicatorKey, boolean>> | undefined,
): PaneLayout {
  const paneOf = new Map<IndicatorKey, number>();
  let next = 1;
  for (const key of SUBPANE_ORDER) {
    if (active?.[key]) paneOf.set(key, next++);
  }
  return { paneOf, paneCount: next };
}
